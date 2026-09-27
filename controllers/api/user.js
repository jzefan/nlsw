const User = require('../../models/User');
const Tenant = require('../../models/Tenant');
const { getPublicKey } = require('../../utils/crypto');
const { isAdmin } = require('../../utils/permissions');
const { buildTenantQuery, isPlatformUser, isOwner } = require('../../utils/tenant');
const { isStandalone, getDeployMode, getStandaloneCompany } = require('../../utils/deploy-mode');
const { migrateBinaryToArray } = require('../../utils/privilege-migration');
const { getBillImportCarrierRule, sanitizeBillImportCarrierRule } = require('../../utils/tenant-settings');
const secrets = require('../../config/secrets');
const { hasProtectedIdentity, bumpSessionVersion, identityVersionFilter, changePasswordWithCas } = require('../../utils/user-security');
const mongoose = require('mongoose');
const { isAllowedOrigin } = require('../../middleware/requireSameOrigin');
const { buildPersonLabels } = require('../../utils/person-label');
const { isGeneralManagerTitle } = require('../../utils/user-title');
const PayrollRoleMutationLock = require('../../models/PayrollRoleMutationLock');
const os = require('os');
const { randomUUID } = require('crypto');
const activePayrollRoleTokens = new Set();
const PAYROLL_ROLE_LOCK_RECOVERY_MIN_AGE_MS = 10 * 60 * 1000;
const GENERAL_MANAGER_TITLE = 'gm';

/** 有权维护财务角色：公司主账号、管理员、在职总经理。 */
function canManageFinanceRoles(user) {
  if (!user) return false;
  if (user.role === 'owner') return true;
  const privilege = Array.isArray(user.privilege) ? user.privilege : migrateBinaryToArray(user.privilege);
  if (privilege.includes('admin')) return true;
  return Array.isArray(user.payrollRoles) && user.payrollRoles.includes('general_manager');
}

/**
 * 同步总经理身份：职位是唯一来源，同一租户始终只有一名总经理。
 * 换人时先收回原持有人的角色与唯一标记（含已停用账号占用的标记），再写入新任。
 */
async function syncGeneralManagerIdentity(user, tenantId, actorId) {
  if (!tenantId) return;
  const makingGeneralManager = isGeneralManagerTitle(user.title);
  const currentPayrollRoles = Array.isArray(user.payrollRoles) ? user.payrollRoles : [];
  const currentAttendanceRoles = Array.isArray(user.attendanceRoles) ? user.attendanceRoles : [];
  const wasGeneralManager = currentPayrollRoles.includes('general_manager') || currentAttendanceRoles.includes('general_manager');
  if (!makingGeneralManager && !wasGeneralManager) return;

  if (makingGeneralManager) {
    const otherHolders = await User.find({
      tenantId,
      _id: { $ne: user._id },
      $or: [
        { payrollRoles: 'general_manager' },
        { attendanceRoles: 'general_manager' },
        { payrollGeneralManagerTenantId: tenantId },
        { attendanceGeneralManagerTenantId: tenantId }
      ]
    }).select('_id payrollRoles attendanceRoles securityIdentityVersion').limit(5).lean();
    for (const holder of otherHolders) {
      const previousRoles = Array.isArray(holder.payrollRoles) ? holder.payrollRoles : [];
      const nextRoles = previousRoles.filter(role => role !== 'general_manager');
      await User.updateOne(identityVersionFilter(holder, { tenantId, _id: holder._id }), {
        $set: { payrollRoles: nextRoles, attendanceRoles: (holder.attendanceRoles || []).filter(role => role !== 'general_manager') },
        $unset: { payrollGeneralManagerTenantId: 1, attendanceGeneralManagerTenantId: 1 },
        $push: { payrollRoleAudit: { actorId, tenantId, previousRoles: [...previousRoles], nextRoles, reason: '总经理改由他人担任（职位变更）', changedAt: new Date() } },
        $inc: { sessionVersion: 1, securityIdentityVersion: 1 }
      });
    }
  }

  const nextPayrollRoles = makingGeneralManager
    ? [...new Set([...currentPayrollRoles, 'general_manager'])]
    : currentPayrollRoles.filter(role => role !== 'general_manager');
  const nextAttendanceRoles = makingGeneralManager
    ? [...new Set([...currentAttendanceRoles, 'general_manager'])]
    : currentAttendanceRoles.filter(role => role !== 'general_manager');
  const update = {
    $set: { payrollRoles: nextPayrollRoles, attendanceRoles: nextAttendanceRoles },
    $push: { payrollRoleAudit: { actorId, tenantId, previousRoles: [...currentPayrollRoles], nextRoles: nextPayrollRoles, reason: makingGeneralManager ? '职位设为总经理' : '职位不再是总经理', changedAt: new Date() } },
    $inc: { sessionVersion: 1, securityIdentityVersion: 1 }
  };
  if (makingGeneralManager) {
    update.$set.payrollGeneralManagerTenantId = tenantId;
    update.$set.attendanceGeneralManagerTenantId = tenantId;
  } else {
    update.$unset = { payrollGeneralManagerTenantId: 1, attendanceGeneralManagerTenantId: 1 };
  }
  const write = await User.updateOne(identityVersionFilter(user, { tenantId, _id: user._id }), update);
  if ((write.modifiedCount ?? write.nModified) !== 1) throw Object.assign(new Error('总经理身份正在变更，请刷新后重试'), { status: 409 });
  user.payrollRoles = nextPayrollRoles;
  user.attendanceRoles = nextAttendanceRoles;
}

async function acquirePayrollRoleLock(tenantId) {
  const token = randomUUID();
  activePayrollRoleTokens.add(token);
  try {
    await PayrollRoleMutationLock.findOneAndUpdate({ tenantId, token: { $exists: false } }, {
      $set: { token, acquiredAt: new Date(), ownerPid: process.pid, ownerHost: os.hostname() }, $setOnInsert: { tenantId }
    }, { upsert: true, new: true });
    return token;
  } catch (error) {
    activePayrollRoleTokens.delete(token);
    if (error?.code === 11000) throw Object.assign(new Error('薪资权限正在更新，请稍后再试'), { status: 409 });
    throw error;
  }
}

async function releasePayrollRoleLock(tenantId, token) {
  if (!token) return;
  try { await PayrollRoleMutationLock.deleteOne({ tenantId, token }); }
  finally { activePayrollRoleTokens.delete(token); }
}

function payrollLockOwnerAlive(lock) {
  if (!lock.ownerHost || lock.ownerHost !== os.hostname()) return null;
  if (!Number.isInteger(lock.ownerPid) || lock.ownerPid <= 0) return null;
  if (lock.ownerPid === process.pid) return false;
  try { process.kill(lock.ownerPid, 0); return true; }
  catch (error) { return error?.code === 'ESRCH' ? false : true; }
}

function payrollLockRecoveryState(lock, now = Date.now()) {
  const acquired = lock.acquiredAt ? new Date(lock.acquiredAt).getTime() : NaN;
  const ageMs = Number.isFinite(acquired) ? Math.max(0, now - acquired) : null;
  const activeHere = Boolean(lock.token && activePayrollRoleTokens.has(lock.token));
  const ownerAlive = payrollLockOwnerAlive(lock);
  const oldEnough = ageMs !== null && ageMs >= PAYROLL_ROLE_LOCK_RECOVERY_MIN_AGE_MS;
  return { ageMs, activeHere, ownerAlive, oldEnough, recoverable: oldEnough && !activeHere && ownerAlive === false };
}

// 是否有用户管理权限：平台用户、公司主账号、或 admin 权限
function canManageUsers(req) {
  if (!req.user) return false;
  return isPlatformUser(req) || isOwner(req) || isAdmin(req.user.privilege);
}

function refreshSession(req, user) {
  return new Promise((resolve, reject) => req.logIn(user, error => error ? reject(error) : resolve()));
}

// 获取 RSA 公钥 (用于密码加密传输)
exports.getPublicKey = (req, res) => {
  try {
    const publicKey = getPublicKey();
    res.json({
      ok: true,
      publicKey
    });
  } catch (error) {
    console.error('获取公钥失败:', error);
    res.status(500).json({
      ok: false,
      message: '获取公钥失败'
    });
  }
};

exports.getMe = async (req, res) => {
  try {
    // 检查用户是否已登录
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        message: '未登录'
      });
    }

    // 返回当前用户信息
    // 如果 privilege 不是数组格式，进行迁移转换（兼容旧数据）
    const privilege = Array.isArray(req.user.privilege)
      ? req.user.privilege
      : migrateBinaryToArray(req.user.privilege);

    const user = {
      id: req.user._id,
      userid: req.user.userid,
      name: req.user.profile?.name || '',
      email: req.user.email || '',
      title: req.user.title || '',
      phone: req.user.profile?.phone || '',
      privilege,
      role: req.user.role || 'member',
      payrollRoles: Array.isArray(req.user.payrollRoles) ? req.user.payrollRoles : [],
      employeeNo: req.user.employeeNo || '',
      department: req.user.department || '',
      attendanceRoles: Array.isArray(req.user.attendanceRoles) ? req.user.attendanceRoles : [],
      mustChangePassword: req.user.mustChangePassword === true,
      preferences: req.user.preferences || {},
    };

    // 租户上下文 (平台用户返回 null)
    const tenant = req.isPlatformUser ? null : (
      req.tenant ? {
        id: req.tenant._id,
        code: req.tenant.code,
        name: req.tenant.name,
        fullName: req.tenant.fullName || '',
        plan: req.tenant.plan,
        maxUsers: req.tenant.maxUsers,
        expireDate: req.tenant.expireDate || null,
        billImportCarrierRule: getBillImportCarrierRule(req.tenant.settings || {}),
      } : null
    );

    res.json({
      ok: true,
      user,
      tenant,
      deployMode: getDeployMode(),
      standaloneCompany: getStandaloneCompany(),
      features: {
        attendance: isStandalone()
          ? secrets.enableAttendance
          : req.tenant?.settings?.attendanceEnabled === true,
        selfVehicle: secrets.enableSelfVehicle,
        publicBasket: secrets.enablePublicBasket,
        requireReceiptForSettle: req.tenant?.settings?.requireReceiptForSettle || false,
        drayageRate: req.tenant?.settings?.drayageRate || 0,
      }
    });
  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.status(500).json({
      ok: false,
      message: '获取用户信息失败',
      error: error.message
    });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const query = buildTenantQuery(req, { role: { $ne: 'platform' } });
    const users = await User.find(query).select('userid profile.name role').lean().exec();
    const names = users
      .map(u => u.profile?.name || u.userid)
      .filter(Boolean);
    res.json({ ok: true, data: names });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

// 获取用户管理列表 (需要管理权限)
exports.getUserMgr = async (req, res) => {
  try {
    if (!canManageUsers(req)) {
      return res.status(403).json({ ok: false, message: '无权限访问' });
    }

    const query = buildTenantQuery(req, {});
    // 独立部署：始终隐藏 saas-admin；SaaS 模式：仅平台用户可见 saas-admin
    const hideSaasAdmin = isStandalone() || !isPlatformUser(req);
    if (hideSaasAdmin) {
      query.userid = { ...query.userid, $ne: 'saas-admin' };
    }
    const users = await User.find(query).exec();
    const uData = users.map(u => ({
      userid: u.userid,
      name: u.profile?.name || '',
      title: u.title || '',
      phone: u.profile?.phone || '',
      privilege: Array.isArray(u.privilege) ? u.privilege : migrateBinaryToArray(u.privilege),
      role: u.role || 'member',
      payrollRoles: Array.isArray(u.payrollRoles) ? u.payrollRoles : [],
    }));

    res.json({ ok: true, data: uData });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
};

// 用户管理操作 (添加/修改/删除)
exports.postUserMgr = async (req, res) => {
  try {
    if (!canManageUsers(req)) {
      return res.status(403).json({ ok: false, message: '无权限操作' });
    }

    const action = req.body.act;
    const tenantQuery = buildTenantQuery(req, {});

    if (action === 'add') {
      const data = req.body.data;
      if (data?.payrollRoles !== undefined) return res.status(400).json({ ok: false, message: '薪资角色只能由公司主账号单独配置' });
      const users = await User.find(tenantQuery).sort({ no: 'desc' }).exec();

      let maxNo = 1;
      if (users && users.length > 0 && users[0].no) {
        maxNo = users[0].no + 1;
      }

      const userData = {
        userid: data.userid,
        password: '123456',
        mustChangePassword: true,
        no: maxNo,
        title: data.title,
        privilege: data.privilege,
        role: 'member',
      };

      // 注入租户信息（非平台用户自动绑定当前租户）
      if (!isPlatformUser(req) && req.tenantId) {
        userData.tenantId = req.tenantId;
        userData.tenantCode = req.tenantCode;
      }

      const user = new User(userData);
      user.profile.name = data.name;
      user.profile.gender = '';
      user.profile.location = '';
      user.profile.phone = data.phone;
      user.phone = data.phone ? data.phone.trim() : undefined;

      await user.save();
      if (isGeneralManagerTitle(user.title)) await syncGeneralManagerIdentity(user, userData.tenantId, req.user?._id);
      res.json({ ok: true });

    } else if (action === 'delete') {
      const uid = req.body.userid;
      const target = await User.findOne({ ...tenantQuery, userid: uid }).exec();
      if (target && hasProtectedIdentity(target)) {
        return res.status(403).json({ ok: false, message: '不能删除受保护的员工、管理员或薪资用户' });
      }
      if (target) {
        const deleted = await User.deleteOne(identityVersionFilter(target, tenantQuery));
        if ((deleted.deletedCount ?? deleted.n) !== 1) return res.status(409).json({ ok: false, message: '用户身份已变化，请刷新后重试' });
      }
      res.json({ ok: true });

    } else if (action === 'modify') {
      const modData = req.body.data;
      if (modData?.payrollRoles !== undefined) return res.status(400).json({ ok: false, message: '薪资角色只能由公司主账号单独配置' });
      const user = await User.findOne({ ...tenantQuery, userid: modData.userid }).exec();

      if (!user) {
        return res.json({ ok: false, message: '用户未找到' });
      }
      const phone = modData.phone ? modData.phone.trim() : undefined;
      const loginIdentityChanged = user.phone !== phone || (user.profile?.phone || '') !== (modData.phone || '');
      if (loginIdentityChanged && hasProtectedIdentity(user)) {
        return res.status(403).json({ ok: false, message: '员工、管理员或薪资账号暂不支持直接修改登录手机号' });
      }

      const previousTitle = user.title || '';
      const previousPrivilege = Array.isArray(user.privilege) ? user.privilege : migrateBinaryToArray(user.privilege);
      const nextPrivilege = Array.isArray(modData.privilege) ? modData.privilege : migrateBinaryToArray(modData.privilege);
      const privilegeChanged = JSON.stringify(previousPrivilege) !== JSON.stringify(nextPrivilege);
      const actorIsTenantOwner = req.user?.role === 'owner' || isPlatformUser(req);
      if (privilegeChanged && hasProtectedIdentity(user) && !actorIsTenantOwner && String(user._id) !== String(req.user._id)) {
        return res.status(403).json({ ok: false, message: '不能通过通用用户管理变更受保护账号的系统权限' });
      }
      const update = { $set: {
        title: modData.title,
        privilege: modData.privilege,
        'profile.name': modData.name,
        'profile.phone': modData.phone,
        phone
      }, $inc: { securityIdentityVersion: 1 } };
      if (loginIdentityChanged || privilegeChanged) update.$inc.sessionVersion = 1;
      const write = await User.updateOne(identityVersionFilter(user, tenantQuery), update);
      if ((write.modifiedCount ?? write.nModified) !== 1) return res.status(409).json({ ok: false, message: '用户资料已被并发修改，请刷新后重试' });
      Object.assign(user, { title: modData.title, privilege: modData.privilege, phone });
      user.profile.name = modData.name;
      user.profile.phone = modData.phone;
      if (loginIdentityChanged || privilegeChanged) bumpSessionVersion(user);
      if (previousTitle !== (modData.title || '')) await syncGeneralManagerIdentity(user, req.tenantId, req.user?._id);
      if (String(user._id) === String(req.user._id)) await refreshSession(req, user);
      res.json({ ok: true });

    } else {
      res.json({ ok: false, message: '未知操作' });
    }
  } catch (error) {
    console.error('用户管理操作失败:', error);
    res.json({ ok: false, message: error.message });
  }
};

// 总经理身份由用户管理的「职位」决定；这里只维护「财务」角色。
exports.updatePayrollRoles = async (req, res) => {
  let lockToken;
  try {
    if (!isAllowedOrigin(req)) {
      return res.status(403).json({ ok: false, message: '薪资角色变更必须来自本站' });
    }
    if (!req.user || !req.tenantId || req.user.role === 'platform') {
      return res.status(403).json({ ok: false, message: '无权配置薪资角色' });
    }
    if (!canManageFinanceRoles(req.user)) {
      return res.status(403).json({ ok: false, message: '只有公司主账号、管理员或总经理可以维护财务权限' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) return res.status(400).json({ ok: false, message: '用户编号无效' });
    const roles = req.body?.payrollRoles;
    if (!Array.isArray(roles) || roles.some(role => role !== 'finance')) {
      return res.status(400).json({ ok: false, message: '这里只能配置财务角色；总经理身份请在用户管理里修改职位' });
    }
    lockToken = await acquirePayrollRoleLock(req.tenantId);
    const target = await User.findOne({ _id: req.params.userId, tenantId: req.tenantId, role: { $ne: 'platform' } });
    if (!target) return res.status(404).json({ ok: false, message: '用户不存在' });
    if (String(target._id) === String(req.user._id)) return res.status(403).json({ ok: false, message: '不能为本人授予或变更薪资角色' });
    if (roles.length > 0 && target.status === 'disabled') return res.status(409).json({ ok: false, message: '不能向已停用用户授予薪资角色' });

    const previousRoles = Array.isArray(target.payrollRoles) ? target.payrollRoles : [];
    // 只增删 finance，保留由职位同步来的 general_manager
    const nextRoles = roles.length > 0
      ? [...new Set([...previousRoles.filter(role => role !== 'finance'), 'finance'])]
      : previousRoles.filter(role => role !== 'finance');
    const changed = previousRoles.length !== nextRoles.length || previousRoles.some((role, index) => role !== nextRoles[index]);
    if (changed) {
      const update = {
        $set: { payrollRoles: nextRoles },
        $push: { payrollRoleAudit: { actorId: req.user._id, tenantId: req.tenantId, previousRoles: [...previousRoles], nextRoles: [...nextRoles], reason: roles.length > 0 ? '设置财务权限' : '取消财务权限', changedAt: new Date() } },
        $inc: { sessionVersion: 1, securityIdentityVersion: 1 }
      };
      const write = await User.updateOne(identityVersionFilter(target, { tenantId: req.tenantId }), update);
      if ((write.modifiedCount ?? write.nModified) !== 1) return res.status(409).json({ ok: false, message: '员工资料已被并发修改，请刷新后重试' });
      target.payrollRoles = nextRoles;
    }
    return res.json({ ok: true, data: { userId: target._id, payrollRoles: target.payrollRoles } });
  } catch (error) {
    console.error('配置薪资角色失败:', error);
    if (error?.status === 409 || error?.code === 11000) return res.status(409).json({ ok: false, message: error.message || '薪资权限正在更新，请刷新重试' });
    return res.status(500).json({ ok: false, message: '配置薪资角色失败' });
  } finally {
    if (lockToken) await releasePayrollRoleLock(req.tenantId, lockToken).catch(() => {});
  }
};

// Current GM initiates a reasoned handover. A tenant lock plus unique reservation
// keeps this safe on standalone MongoDB deployments that do not support transactions.
exports.handoverPayrollGeneralManager = async (req, res) => {
  if (!isAllowedOrigin(req)) return res.status(403).json({ ok: false, message: '总经理交接必须来自本站' });
  if (!req.user?._id || !req.tenantId || req.user.role === 'platform') return res.status(403).json({ ok: false, message: '无权办理总经理交接' });
  if (!mongoose.Types.ObjectId.isValid(req.body?.targetUserId)) return res.status(400).json({ ok: false, message: '接任员工编号无效' });
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason || reason.length > 2000) return res.status(400).json({ ok: false, message: '总经理交接必须填写原因' });
  if (String(req.body.targetUserId) === String(req.user._id)) return res.status(400).json({ ok: false, message: '接任人必须是另一名员工' });

  let lockToken;
  let source;
  try {
    lockToken = await acquirePayrollRoleLock(req.tenantId);
    const currentManagers = await User.find({ tenantId: req.tenantId, status: { $ne: 'disabled' }, payrollRoles: 'general_manager' })
      .select('_id tenantId employeeNo payrollRoles mustChangePassword securityIdentityVersion sessionVersion +payrollGeneralManagerTenantId').limit(2).lean();
    if (currentManagers.length !== 1 || String(currentManagers[0]._id) !== String(req.user._id) || String(currentManagers[0].payrollGeneralManagerTenantId || '') !== String(req.tenantId)) {
      throw Object.assign(new Error('当前账号不是本公司的有效总经理，或总经理唯一标记需修复'), { status: 409 });
    }
    source = currentManagers[0];
    const target = await User.findOne({ _id: req.body.targetUserId, tenantId: req.tenantId, status: { $ne: 'disabled' }, role: { $ne: 'platform' } });
    if (!target) throw Object.assign(new Error('接任人必须是本租户已关联的在职员工'), { status: 400 });
    const previousSourceRoles = [...(source.payrollRoles || [])];
    const nextSourceRoles = previousSourceRoles.filter(role => role !== 'general_manager');
    const previousTargetRoles = [...(target.payrollRoles || [])];
    const nextTargetRoles = [...new Set([...previousTargetRoles, 'general_manager'])];
    const changedAt = new Date();
    const sourceWrite = await User.updateOne(identityVersionFilter(source, { tenantId: req.tenantId, status: { $ne: 'disabled' }, payrollRoles: 'general_manager', payrollGeneralManagerTenantId: req.tenantId }), {
      $set: { payrollRoles: nextSourceRoles },
      $unset: { payrollGeneralManagerTenantId: 1 },
      $push: { payrollRoleAudit: { actorId: req.user._id, tenantId: req.tenantId, previousRoles: previousSourceRoles, nextRoles: nextSourceRoles, reason, changedAt } },
      $inc: { sessionVersion: 1, securityIdentityVersion: 1 }
    });
    if ((sourceWrite.modifiedCount ?? sourceWrite.nModified) !== 1) throw Object.assign(new Error('现任总经理资料已变化，请刷新后重试'), { status: 409 });
    try {
      const targetWrite = await User.updateOne(identityVersionFilter(target, { tenantId: req.tenantId, status: { $ne: 'disabled' }, payrollGeneralManagerTenantId: { $exists: false } }), {
        $set: { payrollRoles: nextTargetRoles, payrollGeneralManagerTenantId: req.tenantId },
        $push: { payrollRoleAudit: { actorId: req.user._id, tenantId: req.tenantId, previousRoles: previousTargetRoles, nextRoles: nextTargetRoles, reason, changedAt } },
        $inc: { sessionVersion: 1, securityIdentityVersion: 1 }
      });
      if ((targetWrite.modifiedCount ?? targetWrite.nModified) !== 1) throw Object.assign(new Error('接任人资料已变化或唯一总经理约束冲突'), { status: 409 });
    } catch (targetError) {
      // Restore the old holder if the second CAS or unique reservation fails.
      const restoreVersion = (Number.isInteger(source.securityIdentityVersion) ? source.securityIdentityVersion : 0) + 1;
      const rollback = await User.updateOne({ _id: source._id, tenantId: req.tenantId, status: { $ne: 'disabled' }, payrollGeneralManagerTenantId: { $exists: false }, securityIdentityVersion: restoreVersion }, {
        $set: { payrollRoles: previousSourceRoles, payrollGeneralManagerTenantId: req.tenantId },
        $push: { payrollRoleAudit: { actorId: req.user._id, tenantId: req.tenantId, previousRoles: nextSourceRoles, nextRoles: previousSourceRoles, reason: `交接回滚：${reason}`, changedAt: new Date() } },
        $inc: { sessionVersion: 1, securityIdentityVersion: 1 }
      });
      if ((rollback.modifiedCount ?? rollback.nModified) !== 1) {
        console.error('总经理交接回滚失败，需要人工恢复唯一总经理身份', { tenantId: String(req.tenantId), sourceId: String(source._id), targetId: String(target._id) });
        throw Object.assign(new Error('交接未完成且自动恢复失败，请联系管理员处理'), { status: 500 });
      }
      throw targetError;
    }
    // 职位是总经理身份的唯一来源，交接后同步两人的职位，避免与角色口径脱节。
    await User.updateOne({ _id: target._id, tenantId: req.tenantId }, { $set: { title: GENERAL_MANAGER_TITLE } });
    await User.updateOne({ _id: source._id, tenantId: req.tenantId, title: GENERAL_MANAGER_TITLE }, { $set: { title: '' } });
    return res.json({ ok: true, data: { previousGeneralManagerId: source._id, generalManagerId: target._id, reason } });
  } catch (error) {
    console.error('总经理交接失败:', error);
    if (error?.status) return res.status(error.status).json({ ok: false, message: error.message });
    if (error?.code === 11000) return res.status(409).json({ ok: false, message: '本公司已有其他总经理，请刷新后重试' });
    return res.status(500).json({ ok: false, message: '总经理交接失败' });
  } finally {
    if (lockToken) await releasePayrollRoleLock(req.tenantId, lockToken).catch(() => {});
  }
};

// 财务权限页面的人员清单：公司主账号、管理员、总经理都可以查看。
exports.getPayrollRoleCandidates = async (req, res) => {
  try {
    if (!req.user || !req.tenantId || req.user.role === 'platform') return res.status(403).json({ ok: false, message: '无权查看薪资角色候选人' });
    if (!canManageFinanceRoles(req.user)) return res.status(403).json({ ok: false, message: '只有公司主账号、管理员或总经理可以维护财务权限' });
    const users = await User.find({ tenantId: req.tenantId, role: { $ne: 'platform' } })
      .select('_id userid phone profile.name profile.phone employeeNo department managerId payrollRoles status mustChangePassword').sort({ 'profile.name': 1 }).lean();
    const rows = users.map(user => ({
      userId: user._id,
      userid: user.userid || '',
      name: user.profile?.name || user.userid || '',
      employeeNo: user.employeeNo || '',
      phone: user.phone || user.profile?.phone || '',
      department: user.department || '',
      payrollRoles: Array.isArray(user.payrollRoles) ? user.payrollRoles : [],
      // 未设置 status 的历史账号视为在职，只有显式 disabled 才算停用
      status: user.status === 'disabled' ? 'disabled' : 'active',
      mustChangePassword: user.mustChangePassword === true
    }));
    const labels = buildPersonLabels(rows);
    return res.json({ ok: true, data: rows.map(row => ({ ...row, displayName: labels.get(String(row.userId)) || row.name })) });
  } catch (error) {
    console.error('获取薪资角色候选人失败:', error);
    return res.status(500).json({ ok: false, message: '获取薪资角色候选人失败' });
  }
};

exports.listPayrollRoleLocks = async (req, res) => {
  try {
    if (req.user?.role !== 'owner' || req.user.status === 'disabled' || !req.tenantId || String(req.user.tenantId?._id || req.user.tenantId) !== String(req.tenantId)) {
      return res.status(403).json({ ok: false, message: '仅本公司在职主账号可查看薪资角色锁' });
    }
    const locks = await PayrollRoleMutationLock.find({ tenantId: req.tenantId })
      .select('acquiredAt ownerPid ownerHost +token').lean();
    const now = Date.now();
    return res.json({ ok: true, data: locks.filter(lock => lock.token).map(lock => {
      const state = payrollLockRecoveryState(lock, now);
      return { acquiredAt: lock.acquiredAt, ageMinutes: state.ageMs === null ? null : Math.floor(state.ageMs / 60000), minimumRecoveryAgeMinutes: PAYROLL_ROLE_LOCK_RECOVERY_MIN_AGE_MS / 60000, mutationActive: state.activeHere || state.ownerAlive !== false, recoverable: state.recoverable };
    }) });
  } catch (error) {
    console.error('读取薪资角色锁失败:', error);
    return res.status(500).json({ ok: false, message: '读取薪资角色锁失败' });
  }
};

exports.releaseStalePayrollRoleLock = async (req, res) => {
  try {
    if (!isAllowedOrigin(req)) return res.status(403).json({ ok: false, message: '薪资角色锁恢复必须来自本站' });
    if (req.user?.role !== 'owner' || req.user.status === 'disabled' || !req.tenantId || String(req.user.tenantId?._id || req.user.tenantId) !== String(req.tenantId)) {
      return res.status(403).json({ ok: false, message: '仅本公司在职主账号可恢复薪资角色锁' });
    }
    if (req.body?.confirmNoLiveMutation !== true) return res.status(400).json({ ok: false, message: '请明确确认当前没有进行中的薪资角色变更' });
    const lock = await PayrollRoleMutationLock.findOne({ tenantId: req.tenantId }).select('acquiredAt ownerPid ownerHost +token').lean();
    if (!lock?.token) return res.status(404).json({ ok: false, message: '薪资角色锁不存在' });
    const state = payrollLockRecoveryState(lock);
    if (!state.oldEnough) return res.status(409).json({ ok: false, message: `薪资角色锁需至少保留 ${PAYROLL_ROLE_LOCK_RECOVERY_MIN_AGE_MS / 60000} 分钟后才能恢复` });
    if (state.activeHere || state.ownerAlive !== false) return res.status(409).json({ ok: false, message: '无法确认原进程已停止，未解除薪资角色锁' });
    const result = await PayrollRoleMutationLock.deleteOne({ tenantId: req.tenantId, token: lock.token, acquiredAt: lock.acquiredAt });
    if (result.deletedCount !== 1) return res.status(409).json({ ok: false, message: '薪资角色锁状态已变化，请刷新后重试' });
    return res.json({ ok: true, data: { released: true } });
  } catch (error) {
    console.error('恢复薪资角色锁失败:', error);
    return res.status(500).json({ ok: false, message: '恢复薪资角色锁失败' });
  }
};

// 更新用户界面偏好
const VALID_THEMES = ['zinc', 'red', 'rose', 'orange', 'green', 'blue', 'yellow', 'violet'];
const VALID_RADII = [0, 0.25, 0.5, 0.75, 1];
const VALID_LAYOUTS = ['full', 'centered'];

exports.updatePreferences = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ ok: false, message: '未登录' });
    }

    const { theme, radius, contentLayout } = req.body;
    const update = {};

    if (theme !== undefined) {
      if (theme !== '' && !VALID_THEMES.includes(theme)) {
        return res.status(400).json({ ok: false, message: '无效的主题' });
      }
      update['preferences.theme'] = theme;
    }

    if (radius !== undefined) {
      if (radius !== -1 && !VALID_RADII.includes(radius)) {
        return res.status(400).json({ ok: false, message: '无效的圆角值' });
      }
      update['preferences.radius'] = radius;
    }

    if (contentLayout !== undefined) {
      if (contentLayout !== '' && !VALID_LAYOUTS.includes(contentLayout)) {
        return res.status(400).json({ ok: false, message: '无效的布局' });
      }
      update['preferences.contentLayout'] = contentLayout;
    }

    if (Object.keys(update).length === 0) {
      return res.json({ ok: true });
    }

    await User.updateOne({ _id: req.user._id }, { $set: update });
    res.json({ ok: true });
  } catch (error) {
    console.error('更新用户偏好失败:', error);
    res.status(500).json({ ok: false, message: '更新偏好失败' });
  }
};

// 重置密码
exports.resetPassword = async (req, res) => {
  try {
    if (!canManageUsers(req)) {
      return res.status(403).json({ ok: false, message: '无权限操作' });
    }

    const tenantQuery = buildTenantQuery(req, {});
    const user = await User.findOne({ ...tenantQuery, userid: req.body.user.userid });
    if (!user) {
      return res.json({ ok: false, message: '用户未找到' });
    }

    if (hasProtectedIdentity(user)) {
      return res.status(403).json({ ok: false, message: '员工、管理员或薪资账号只能通过本人凭据或身份核验流程改密' });
    }

    const changed = await changePasswordWithCas(User, user, '123456', tenantQuery, { mustChangePassword: true, unset: { resetPasswordToken: 1, resetPasswordExpires: 1 } });
    if (!changed) return res.status(409).json({ ok: false, message: '用户身份刚发生变化，请刷新后重试' });
    if (String(user._id) === String(req.user._id)) await refreshSession(req, user);

    res.json({ ok: true, message: '密码重置成功!' });
  } catch (error) {
    console.error('重置密码失败:', error);
    res.json({ ok: false, message: error.message });
  }
};

// 获取租户设置
exports.getTenantSettings = async (req, res) => {
  try {
    if (!isOwner(req) && !isPlatformUser(req)) {
      return res.status(403).json({ ok: false, message: '无权限操作' });
    }
    const tenant = await Tenant.findById(req.tenantId).lean();
    if (!tenant) {
      return res.json({ ok: false, message: '租户不存在' });
    }
    res.json({
      ok: true,
      settings: {
        ...(tenant.settings || {}),
        billImportCarrierRule: getBillImportCarrierRule(tenant.settings || {}),
      },
    });
  } catch (error) {
    console.error('获取租户设置失败:', error);
    res.json({ ok: false, message: error.message });
  }
};

// 更新租户设置
exports.updateTenantSettings = async (req, res) => {
  try {
    if (!isOwner(req) && !isPlatformUser(req)) {
      return res.status(403).json({ ok: false, message: '无权限操作' });
    }
    const { drayageRate, ownVehicleDeductPayable, receiptStorage, requireReceiptForSettle, billImportCarrierRule } = req.body;
    const update = {};
    if (drayageRate !== undefined) {
      update['settings.drayageRate'] = Math.max(0, Number(drayageRate) || 0);
    }
    if (ownVehicleDeductPayable !== undefined) {
      update['settings.ownVehicleDeductPayable'] = !!ownVehicleDeductPayable;
    }
    if (receiptStorage !== undefined) {
      const valid = ['local', 'minio'];
      update['settings.receiptStorage'] = valid.includes(receiptStorage) ? receiptStorage : 'local';
    }
    if (requireReceiptForSettle !== undefined) {
      update['settings.requireReceiptForSettle'] = !!requireReceiptForSettle;
    }
    if (billImportCarrierRule !== undefined) {
      update['settings.billImportCarrierRule'] = sanitizeBillImportCarrierRule(billImportCarrierRule);
    }
    await Tenant.findByIdAndUpdate(req.tenantId, { $set: update });
    res.json({ ok: true, message: '设置已保存' });
  } catch (error) {
    console.error('更新租户设置失败:', error);
    res.json({ ok: false, message: error.message });
  }
};
