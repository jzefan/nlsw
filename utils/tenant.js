/**
 * 租户工具函数
 * Tenant utility functions for multi-tenancy support
 */

/**
 * 检查是否为平台用户
 * @param {Object} req - Express request object
 * @returns {boolean}
 */
function isPlatformUser(req) {
  return req.user && req.user.role === 'platform';
}

/**
 * 构建租户查询条件
 * 平台用户可以跨租户查询，普通用户只能查询自己租户的数据
 * @param {Object} req - Express request object
 * @param {Object} baseQuery - 基础查询条件
 * @returns {Object} 包含租户过滤的查询条件
 */
function buildTenantQuery(req, baseQuery = {}) {
  // 平台用户跳过租户过滤
  if (isPlatformUser(req)) {
    return baseQuery;
  }

  // 普通用户必须有 tenantId
  if (!req.tenantId) {
    throw new Error('租户信息缺失');
  }

  return {
    ...baseQuery,
    tenantId: req.tenantId
  };
}

/**
 * 为新建数据注入租户ID
 * @param {Object} req - Express request object
 * @param {Object} data - 待创建的数据对象
 * @returns {Object} 包含租户ID的数据对象
 */
function injectTenantId(req, data) {
  // 平台用户创建数据时，可以指定 tenantId，如果没有指定则不注入
  if (isPlatformUser(req)) {
    return data.tenantId ? data : data;
  }

  // 普通用户必须有 tenantId
  if (!req.tenantId) {
    throw new Error('租户信息缺失');
  }

  return {
    ...data,
    tenantId: req.tenantId
  };
}

/**
 * 验证用户是否属于指定租户
 * @param {Object} req - Express request object
 * @param {string} tenantId - 目标租户ID
 * @returns {boolean}
 */
function belongsToTenant(req, tenantId) {
  if (isPlatformUser(req)) {
    return true; // 平台用户可以访问任何租户
  }
  return req.tenantId && req.tenantId.toString() === tenantId.toString();
}

/**
 * 获取当前租户ID
 * @param {Object} req - Express request object
 * @returns {string|null}
 */
function getTenantId(req) {
  return req.tenantId || null;
}

/**
 * 获取当前租户代码
 * @param {Object} req - Express request object
 * @returns {string|null}
 */
function getTenantCode(req) {
  return req.tenantCode || null;
}

/**
 * 检查是否为公司主账号
 * @param {Object} req - Express request object
 * @returns {boolean}
 */
function isOwner(req) {
  return req.user && req.user.role === 'owner';
}

/**
 * 检查是否为子账号（普通成员）
 * @param {Object} req - Express request object
 * @returns {boolean}
 */
function isMember(req) {
  return req.user && req.user.role === 'member';
}

/**
 * 检查用户是否有管理权限（平台用户或公司主账号）
 * @param {Object} req - Express request object
 * @returns {boolean}
 */
function hasAdminPrivilege(req) {
  return isPlatformUser(req) || isOwner(req);
}

module.exports = {
  isPlatformUser,
  buildTenantQuery,
  injectTenantId,
  belongsToTenant,
  getTenantId,
  getTenantCode,
  isOwner,
  isMember,
  hasAdminPrivilege
};
