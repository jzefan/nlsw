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

const SEAL_TYPE_ORDER = ['official', 'finance', 'contract', 'invoice', 'legal'];

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
 * 确定用章单的**兜底**审批人（总经理或 owner）。
 * 只有在某一印章类别没有配置专属审批人、或配置的审批人不可用时才走这里。
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

/** 该用户在租户里是否担任用章审批人（用于 /me 下发 isSealApprover，前端据此显示「用章审批」入口）。 */
function isSealApproverFlag(tenantSettings, userId) {
  if (!userId || !tenantSettings) return false;
  return (tenantSettings.sealApprovers || []).some(a => a?.userId && String(a.userId) === String(userId));
}

/**
 * 把「以人为中心」的审批人配置压成「印章类别 → 审批人」的查找表。
 * 一个人负责多类时天然归并到同一个 id；重复配置同一类别时**先出现的赢**。
 */
function sealApproverLookup(settings) {
  const map = {};
  for (const entry of settings?.sealApprovers || []) {
    if (!entry?.userId) continue;
    for (const type of entry.sealTypes || []) {
      if (!map[type]) map[type] = entry.userId;
    }
  }
  return map;
}

/**
 * 解析用章单的审批人列表（会签：涉及的类别分属不同人时，一人都要通过）。
 *
 * 规则（每个印章类别独立判定）：
 * 1. 该类别在 Tenant.settings.sealApprovers 里配了人，且该人仍在职、且不是申请人本人
 *    → 用他，role = seal_type_approver
 * 2. 否则（未配置 / 人已停用 / 指向申请人自己）→ 走 resolveSealApprover 兜底（总经理 → 代理 → 主账号）
 * 3. 解析结果里同一个人出现多次 → 合并成一条审批步骤，sealTypes 汇总（避免重复通知与重复点通过）
 *
 * @returns {Promise<Array<{approver: object, role: string, sealTypes: string[]}>>}
 */
async function resolveSealApprovers(tenantId, sealTypes, applicantUser, tenantSettings = null) {
  let settings = tenantSettings;
  if (!settings) {
    const t = await Tenant.findById(tenantId).select('settings').lean();
    settings = t?.settings || {};
  }

  const map = sealApproverLookup(settings);
  const types = Array.isArray(sealTypes) && sealTypes.length > 0 ? sealTypes : SEAL_TYPE_ORDER;

  // 收集所有配置里指向的候选人，一次性查库（最多 5 个），避免逐类别查
  const configuredIds = [...new Set(types.map(t => map[t]).filter(Boolean).map(String))];
  const configuredUsers = new Map();
  if (configuredIds.length > 0) {
    const users = await User.find({
      _id: { $in: configuredIds },
      tenantId,
      status: { $ne: 'disabled' }
    }).select('_id profile.name userid employeeNo department title attendanceRoles privilege role').lean();
    for (const u of users) configuredUsers.set(String(u._id), u);
  }

  const steps = [];
  for (const sealType of types) {
    let resolved = null;
    const configured = configuredUsers.get(String(map[sealType] || ''));
    // 自审无效：配置的人就是申请人本人时，回落到兜底链
    if (configured && String(configured._id) !== String(applicantUser._id)) {
      resolved = { approver: configured, role: 'seal_type_approver' };
    } else {
      const fallback = await resolveSealApprover(tenantId, applicantUser, settings);
      resolved = { approver: fallback.approver, role: fallback.role };
    }

    const existing = steps.find(s => String(s.approver._id) === String(resolved.approver._id));
    if (existing) {
      if (!existing.sealTypes.includes(sealType)) existing.sealTypes.push(sealType);
    } else {
      steps.push({ approver: resolved.approver, role: resolved.role, sealTypes: [sealType] });
    }
  }

  return steps;
}

/**
 * 校验用户是否对指定用章申请具有审批权限。
 *
 * 会签口径：只要该用户是 approvals 里某个 **pending** 步骤的审批人就有权；
 * 全部通过/驳回后不再有权（避免重复提交同一单）。
 * 公司主账号(owner) / 管理员(admin) / 总经理保留全公司兜底代审权。
 * 注意：专职保管员(sealCustodianId)若非上述角色，仅负责发章/收章，无权业务审批。
 */
function canApproveSealRequest(user, tenant, request) {
  if (!user) return false;
  const approvals = Array.isArray(request?.approvals) ? request.approvals : [];
  const mine = approvals.find(a =>
    a.status === 'pending' && String(a.approverId) === String(user._id)
  );
  if (mine) return true;

  // 兜底代审只在单据还处于待审批状态时有效
  if (request?.status && request.status !== 'pending') return false;

  if (user.role === 'owner' || isAdmin(user.privilege)) return true;
  const roles = Array.isArray(user.attendanceRoles) ? user.attendanceRoles : [];
  if (roles.includes('general_manager')) return true;
  if (isGeneralManagerTitle(user.title) || isChairmanTitle(user.title)) return true;
  return false;
}

/** 用章审批的「全公司视角」：主账号 / 管理员 / 总经理职务或角色。列表与待办计数共用同一判据。 */
function hasGlobalSealApprovalView(user) {
  if (!user) return false;
  if (user.role === 'owner' || isAdmin(user.privilege)) return true;
  const roles = Array.isArray(user.attendanceRoles) ? user.attendanceRoles : [];
  if (roles.includes('general_manager')) return true;
  return isGeneralManagerTitle(user.title) || isChairmanTitle(user.title);
}

module.exports = {
  requireSealEnabled,
  canManageSeals,
  canApproveSealRequest,
  hasGlobalSealApprovalView,
  isSealApproverFlag,
  sealApproverLookup,
  requireSealManager,
  requireSealAdmin,
  resolveSealApprover,
  resolveSealApprovers,
  SEAL_TYPE_ORDER
};
