const { migrateBinaryToArray } = require('./privilege-migration');
const { hasLinkedEmployee } = require('./attendance-permissions');
const { isGeneralManagerTitle, isChairmanTitle } = require('./user-title');

function hasPayrollAccess(user) {
  return Array.isArray(user?.payrollRoles) && user.payrollRoles.length > 0;
}

function hasProtectedPrivileges(user) {
  const privilege = Array.isArray(user?.privilege) ? user.privilege : migrateBinaryToArray(user?.privilege);
  return Boolean(
    hasPayrollAccess(user) ||
    String(user?.employeeNo || '').trim() ||
    (Array.isArray(user?.attendanceRoles) && user.attendanceRoles.length > 0) ||
    isGeneralManagerTitle(user?.title) ||
    isChairmanTitle(user?.title) ||
    user?.role === 'owner' ||
    privilege.includes('admin')
  );
}

function hasProtectedIdentity(user) {
  // Employee identity survives disabled status and exclusion from attendance tracking.
  // The optional employee number and module roles do not decide whose credentials are protected.
  return Boolean(
    (user?.role !== 'platform' && hasLinkedEmployee(user)) ||
    hasProtectedPrivileges(user) ||
    user?.role === 'platform'
  );
}

function hasAdminPrivilege(user) {
  const privilege = Array.isArray(user?.privilege) ? user.privilege : migrateBinaryToArray(user?.privilege);
  return privilege.includes('admin');
}

// 重置密码专用判据：只保护「能动用他人数据或具备管理权」的账号。
// 普通员工即使已登记工号也允许主账号/平台管理员重置，用于本人忘记密码时恢复入口
// （工号在本项目里已全员回填，不能再作为「此账号受保护」的信号）。
function hasProtectedCredentials(user) {
  return Boolean(
    user?.role === 'platform' ||
    user?.role === 'owner' ||
    isGeneralManagerTitle(user?.title) ||
    isChairmanTitle(user?.title) ||
    (Array.isArray(user?.payrollRoles) && user.payrollRoles.length > 0) ||
    (Array.isArray(user?.attendanceRoles) && user.attendanceRoles.length > 0) ||
    hasAdminPrivilege(user)
  );
}

function bumpSessionVersion(user) {
  if (typeof user?.$inc === 'function') {
    user.$inc('sessionVersion', 1);
    return;
  }
  user.sessionVersion = (Number.isInteger(user?.sessionVersion) && user.sessionVersion >= 0 ? user.sessionVersion : 0) + 1;
}

function bumpSecurityIdentityVersion(user) {
  if (typeof user?.$inc === 'function') {
    user.$inc('securityIdentityVersion', 1);
    return;
  }
  user.securityIdentityVersion = (Number.isInteger(user?.securityIdentityVersion) && user.securityIdentityVersion >= 0 ? user.securityIdentityVersion : 0) + 1;
}

function identityVersionFilter(user, scope = {}) {
  const version = Number.isInteger(user?.securityIdentityVersion) && user.securityIdentityVersion >= 0 ? user.securityIdentityVersion : 0;
  const versionMatch = version === 0
    ? [{ securityIdentityVersion: 0 }, { securityIdentityVersion: { $exists: false } }]
    : [{ securityIdentityVersion: version }];
  return { ...scope, _id: user._id, $or: versionMatch };
}

async function changePasswordWithCas(User, user, password, scope = {}, { mustChangePassword = false, unset = {} } = {}) {
  const hashed = await User.hashPassword(password);
  const filter = identityVersionFilter(user, scope);
  const result = await User.updateOne(filter, {
    $set: { password: hashed, mustChangePassword },
    $unset: unset,
    $inc: { sessionVersion: 1, securityIdentityVersion: 1 }
  });
  if (result.modifiedCount !== 1) return false;
  user.sessionVersion = (Number.isInteger(user.sessionVersion) ? user.sessionVersion : 0) + 1;
  user.securityIdentityVersion = (Number.isInteger(user.securityIdentityVersion) ? user.securityIdentityVersion : 0) + 1;
  return true;
}

module.exports = { hasPayrollAccess, hasProtectedPrivileges, hasProtectedIdentity, hasProtectedCredentials, hasAdminPrivilege, bumpSessionVersion, bumpSecurityIdentityVersion, identityVersionFilter, changePasswordWithCas };
