/**
 * 后端权限常量 + 工具函数
 *
 * 权限用命名字符串数组表示，如 ['operator', 'account', 'seePrice']
 * 管理员为 ['admin']
 */

const PERMISSIONS = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
  STATISTICS: 'statistics',
  ACCOUNT: 'account',
  CUST_REVENUE: 'custRevenue',
  VESSEL_REVENUE: 'vesselRevenue',
  SELF_VEHICLE: 'selfVehicle',
  SEE_PRICE: 'seePrice',
};

function isAdmin(privilege) {
  return Array.isArray(privilege) && privilege.includes(PERMISSIONS.ADMIN);
}

function hasPermission(privilege, perm) {
  if (!Array.isArray(privilege)) return false;
  return privilege.includes(PERMISSIONS.ADMIN) || privilege.includes(perm);
}

module.exports = { PERMISSIONS, isAdmin, hasPermission };
