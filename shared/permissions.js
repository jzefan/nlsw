'use strict';

/**
 * Permission bit positions in the 8-character binary privilege string.
 * Example: '10010110' — each character is '0' or '1'.
 */
const PERMISSIONS = {
  operator: 0,        // 业务
  statistics: 1,      // 统计
  account: 2,         // 会计
  reserved: 3,        // 保留位（custRevenue && vesselRevenue 时为 '1'）
  custRevenue: 4,     // 客户营业额
  vesselRevenue: 5,   // 车船营业额
  selfVehicle: 6,     // 自有车管理
  seePrice: 7,        // 查看价格
};

const PERMISSION_LABELS = {
  operator: '业务',
  statistics: '统计',
  account: '会计',
  custRevenue: '客户营业额',
  vesselRevenue: '车船营业额',
  selfVehicle: '自有车管理',
  seePrice: '查看价格',
};

const ADMIN_PRIVILEGE = '11111111';

// Privilege strings that represent account-only users (cannot manage bills)
const ACCOUNT_ONLY_PRIVILEGES = [
  '00100000', '00010000', '00101000', '00100100', '00111100', '00011100',
];

/**
 * Check if a privilege string represents an admin user.
 */
function isAdmin(privilege) {
  return privilege === ADMIN_PRIVILEGE;
}

/**
 * Check if a user has a specific permission.
 * Admin users always return true.
 */
function hasPermission(privilege, permName) {
  if (!privilege) return false;
  if (isAdmin(privilege)) return true;
  const index = PERMISSIONS[permName];
  if (index === undefined) return false;
  return privilege[index] === '1';
}

/**
 * Check if a user has any of the specified permissions.
 * Admin users always return true.
 */
function hasAnyPermission(privilege, ...permNames) {
  if (!privilege) return false;
  if (isAdmin(privilege)) return true;
  return permNames.some(name => {
    const index = PERMISSIONS[name];
    return index !== undefined && privilege[index] === '1';
  });
}

/**
 * Check if a user can manage bills (non-account-only users).
 */
function canManageBill(privilege) {
  if (!privilege) return false;
  if (isAdmin(privilege)) return true;
  return !ACCOUNT_ONLY_PRIVILEGES.includes(privilege);
}

/**
 * Parse a privilege string into a permission map object.
 */
function parsePrivilege(privilege) {
  const result = {
    admin: false,
    operator: false,
    statistics: false,
    account: false,
    custRevenue: false,
    vesselRevenue: false,
    selfVehicle: false,
    seePrice: false,
  };

  if (isAdmin(privilege)) {
    result.admin = true;
    return result;
  }

  if (privilege) {
    result.operator = privilege[PERMISSIONS.operator] === '1';
    result.statistics = privilege[PERMISSIONS.statistics] === '1';
    result.account = privilege[PERMISSIONS.account] === '1';
    result.custRevenue = privilege[PERMISSIONS.custRevenue] === '1';
    result.vesselRevenue = privilege[PERMISSIONS.vesselRevenue] === '1';
    result.selfVehicle = privilege[PERMISSIONS.selfVehicle] === '1';
    result.seePrice = privilege[PERMISSIONS.seePrice] === '1';
  }

  return result;
}

/**
 * Generate a privilege string from a permission map object.
 */
function generatePrivilege(permMap) {
  if (permMap.admin) {
    return ADMIN_PRIVILEGE;
  }

  let p = '';
  p += permMap.operator ? '1' : '0';
  p += permMap.statistics ? '1' : '0';
  p += permMap.account ? '1' : '0';
  p += (permMap.custRevenue && permMap.vesselRevenue) ? '1' : '0';
  p += permMap.custRevenue ? '1' : '0';
  p += permMap.vesselRevenue ? '1' : '0';
  p += permMap.selfVehicle ? '1' : '0';
  p += permMap.seePrice ? '1' : '0';

  return p;
}

/**
 * Convert a privilege string to a human-readable Chinese display string.
 */
function getPrivilegeDisplay(privilege) {
  if (isAdmin(privilege)) {
    return '管理';
  }

  if (!privilege) {
    return '';
  }

  const parts = [];
  for (const [name, label] of Object.entries(PERMISSION_LABELS)) {
    if (privilege[PERMISSIONS[name]] === '1') {
      parts.push(label);
    }
  }

  return parts.join(',');
}

module.exports = {
  PERMISSIONS,
  PERMISSION_LABELS,
  ADMIN_PRIVILEGE,
  ACCOUNT_ONLY_PRIVILEGES,
  isAdmin,
  hasPermission,
  hasAnyPermission,
  canManageBill,
  parsePrivilege,
  generatePrivilege,
  getPrivilegeDisplay,
};
