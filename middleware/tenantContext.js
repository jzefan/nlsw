/**
 * 租户上下文中间件
 * Tenant context middleware for multi-tenancy support
 *
 * 功能：
 * 1. 从 req.user 提取租户信息
 * 2. 验证租户状态 (active)
 * 3. 平台用户跳过租户检查
 * 4. 设置 req.tenantId, req.tenantCode, req.tenant, req.isPlatformUser
 */

const Tenant = require('../models/Tenant');
const { tenantStore } = require('../utils/tenant-context');

/**
 * 租户上下文中间件
 * 在 passport.session() 之后使用
 */
async function tenantContext(req, res, next) {
  // 未登录用户跳过
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return next();
  }

  const user = req.user;

  // 设置平台用户标记
  req.isPlatformUser = user.role === 'platform';

  // 平台用户跳过租户检查
  if (req.isPlatformUser) {
    req.tenantId = null;
    req.tenantCode = null;
    req.tenant = null;
    return tenantStore.run({ tenantId: null, isPlatform: true }, next);
  }

  // 普通用户必须有租户信息
  if (!user.tenantId) {
    return res.status(403).json({
      success: false,
      error: '用户缺少租户信息，请联系管理员'
    });
  }

  try {
    // 查询租户信息并验证状态
    const tenant = await Tenant.findById(user.tenantId);

    if (!tenant) {
      return res.status(403).json({
        success: false,
        error: '租户不存在'
      });
    }

    if (tenant.status !== 'active') {
      const statusMessages = {
        suspended: '租户已被暂停，请联系平台管理员',
        deleted: '租户已被删除'
      };
      return res.status(403).json({
        success: false,
        error: statusMessages[tenant.status] || '租户状态异常'
      });
    }

    // 检查租户是否过期
    if (tenant.expireDate && new Date() > tenant.expireDate) {
      return res.status(403).json({
        success: false,
        error: '租户已过期，请联系平台管理员续费'
      });
    }

    // 设置租户上下文
    req.tenantId = tenant._id;
    req.tenantCode = tenant.code;
    req.tenant = tenant;

    // Wrap downstream middleware so Mongoose hooks can read tenant context
    tenantStore.run({ tenantId: tenant._id, isPlatform: false }, next);
  } catch (error) {
    console.error('租户上下文中间件错误:', error);
    return res.status(500).json({
      success: false,
      error: '服务器内部错误'
    });
  }
}

/**
 * 要求租户上下文的中间件
 * 用于必须有租户信息才能访问的路由
 */
function requireTenant(req, res, next) {
  // 平台用户可以访问
  if (req.isPlatformUser) {
    return next();
  }

  // 检查是否有租户上下文
  if (!req.tenantId) {
    return res.status(403).json({
      success: false,
      error: '需要租户上下文才能访问此资源'
    });
  }

  next();
}

/**
 * 要求平台用户权限的中间件
 */
function requirePlatformUser(req, res, next) {
  if (!req.isPlatformUser) {
    return res.status(403).json({
      success: false,
      error: '需要平台管理员权限'
    });
  }
  next();
}

/**
 * 要求公司主账号或平台用户权限的中间件
 */
function requireOwnerOrPlatform(req, res, next) {
  if (req.isPlatformUser) {
    return next();
  }

  if (req.user && req.user.role === 'owner') {
    return next();
  }

  return res.status(403).json({
    success: false,
    error: '需要公司管理员或平台管理员权限'
  });
}

module.exports = {
  tenantContext,
  requireTenant,
  requirePlatformUser,
  requireOwnerOrPlatform
};
