const Tenant = require('../models/Tenant');
const User = require('../models/User');
const { isStandalone } = require('./deploy-mode');
const secrets = require('../config/secrets');
const { isAdmin } = require('./permissions');
const { isGeneralManagerTitle, isChairmanTitle } = require('./user-title');

function requireAuthenticated(req, res) {
  if (!req.user?._id) {
    res.status(401).json({ ok: false, error: '请先登录' });
    return false;
  }
  return true;
}

/**
 * 验证用章模块是否对当前租户/环境启用
 * Standalone: 读取 secrets.enableSeal / process.env.ENABLE_SEAL
 * SaaS: 读取 req.tenant.settings.sealEnabled
 */
async function requireSealEnabled(req, res, next) {
  try {
    if (!requireAuthenticated(req, res)) return;
    if (req.user.status === 'disabled') {
      return res.status(403).json({ ok: false, error: '账号已停用，无法访问用章功能' });
    }
    if (req.user.role === 'platform' || !req.tenantId) {
      return res.status(403).json({ ok: false, error: '用章功能仅限公司成员访问' });
    }

    let enabled = false;
    if (isStandalone()) {
      enabled = secrets.enableSeal === true || process.env.ENABLE_SEAL === 'true';
    } else {
      const tenant = req.tenant || await Tenant.findById(req.tenantId).select('settings.sealEnabled').lean();
      enabled = tenant?.settings?.sealEnabled === true;
    }

    if (!enabled) {
      return res.status(404).json({ ok: false, error: '用章功能未启用' });
    }
    return next();
  } catch (error) {
    console.error('seal feature check failed:', error);
    return res.status(500).json({ ok: false, error: '无法验证用章功能状态' });
  }
}

/**
 * 判断用户是否有权发章/收章/催还/管理印章台账（集中保管）
 * 包含：专职印章保管员、总经理/董事长、公司主账号(owner)、管理员(admin)
 */
function canManageSeals(user, tenant) {
  if (!user) return false;
  if (user.role === 'owner') return true;
  if (isAdmin(user.privilege)) return true;

  const custodianIds = tenant?.settings?.sealCustodianIds;
  if (Array.isArray(custodianIds) && custodianIds.some(id => String(id) === String(user._id))) {
    return true;
  }
  const custodianId = tenant?.settings?.sealCustodianId;
  if (custodianId && String(custodianId) === String(user._id)) {
    return true;
  }

  // 考勤角色或职位代码是总经理/董事长
  const roles = Array.isArray(user.attendanceRoles) ? user.attendanceRoles : [];
  if (roles.includes('general_manager')) return true;
  if (isGeneralManagerTitle(user.title) || isChairmanTitle(user.title)) return true;

  return false;
}

/**
 * 中间件：要求具有发章/收章/台账管理权限
 */
async function requireSealManager(req, res, next) {
  try {
    if (!requireAuthenticated(req, res)) return;
    const tenant = req.tenant || await Tenant.findById(req.tenantId).select('settings.sealCustodianId settings.sealCustodianIds').lean();
    if (!canManageSeals(req.user, tenant)) {
      return res.status(403).json({ ok: false, error: '无权操作印章管理' });
    }
    return next();
  } catch (error) {
    console.error('requireSealManager check failed:', error);
    return res.status(500).json({ ok: false, error: '鉴权异常' });
  }
}

/**
 * 中间件：用章设置读写权限（owner 或 admin）
 */
function requireSealAdmin(req, res, next) {
  if (!requireAuthenticated(req, res)) return;
  if (req.user.role === 'owner' || isAdmin(req.user.privilege)) {
    return next();
  }
  return res.status(403).json({ ok: false, error: '仅公司主账号或管理员可配置用章设置' });
}

/**
 * 确定用章单级审批人（总经理或 owner 兜底）
 */
async function resolveSealApprover(tenantId, applicantUser, tenantSettings = null) {
  let settings = tenantSettings;
  if (!settings) {
    const t = await Tenant.findById(tenantId).select('settings').lean();
    settings = t?.settings || {};
  }

  const applicantRoles = Array.isArray(applicantUser.attendanceRoles) ? applicantUser.attendanceRoles : [];
  const applicantIsGM = applicantRoles.includes('general_manager') || isGeneralManagerTitle(applicantUser.title);

  // 1. 如果申请人本人是总经理，走总经理代理审批人
  if (applicantIsGM) {
    if (settings.attendanceGeneralManagerDelegateId) {
      const delegate = await User.findOne({
        _id: settings.attendanceGeneralManagerDelegateId,
        tenantId,
        status: { $ne: 'disabled' }
      }).select('_id profile.name userid employeeNo department').lean();
      if (delegate && String(delegate._id) !== String(applicantUser._id)) {
        return { approver: delegate, role: 'delegate' };
      }
    }
    // 若无有效代理人，回退到主账号 owner
    const owner = await User.findOne({ tenantId, role: 'owner', status: { $ne: 'disabled' } })
      .select('_id profile.name userid employeeNo department').lean();
    if (owner && String(owner._id) !== String(applicantUser._id)) {
      return { approver: owner, role: 'owner' };
    }
    // 若主账号就是总经理本人，由平台或自身审批记录，兜底返回
    return { approver: applicantUser, role: 'owner' };
  }

  // 2. 正常情况：寻找有效的在职总经理
  const gm = await User.findOne({
    tenantId,
    status: { $ne: 'disabled' },
    attendanceRoles: 'general_manager'
  }).select('_id profile.name userid employeeNo department').lean();

  if (gm && String(gm._id) !== String(applicantUser._id)) {
    return { approver: gm, role: 'general_manager' };
  }

  // 3. 兜底：若未配置总经理角色或未启用考勤，由公司主账号 owner 兜底
  const owner = await User.findOne({ tenantId, role: 'owner', status: { $ne: 'disabled' } })
    .select('_id profile.name userid employeeNo department').lean();
  if (owner) {
    return { approver: owner, role: 'owner' };
  }

  throw new Error('未找到有效的审批人（总经理或公司管理员），请先联系管理员配置');
}

/**
 * 校验用户是否对指定用章申请具有审批权限
 * 规则：
 * 1. 单据指派的 currentApproverId 是当前用户
 * 2. 公司主账号(owner) 或 管理员(admin) 具有审批兜底与代审权限
 * 3. 具有总经理角色(general_manager)或总经理/董事长职务
 * 注意：专职保管员(sealCustodianId)若非上述角色，仅负责发章/收章，无权进行业务审批！
 */
function canApproveSealRequest(user, tenant, request) {
  if (!user) return false;
  if (request?.currentApproverId && String(request.currentApproverId) === String(user._id)) {
    return true;
  }
  if (user.role === 'owner' || isAdmin(user.privilege)) {
    return true;
  }
  const roles = Array.isArray(user.attendanceRoles) ? user.attendanceRoles : [];
  if (roles.includes('general_manager')) return true;
  if (isGeneralManagerTitle(user.title) || isChairmanTitle(user.title)) return true;
  return false;
}

module.exports = {
  requireSealEnabled,
  canManageSeals,
  canApproveSealRequest,
  requireSealManager,
  requireSealAdmin,
  resolveSealApprover
};
