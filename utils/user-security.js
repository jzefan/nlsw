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

module.exports = { hasPayrollAccess, hasProtectedPrivileges, hasProtectedIdentity, bumpSessionVersion, bumpSecurityIdentityVersion, identityVersionFilter, changePasswordWithCas };
