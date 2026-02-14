'use strict';

const { isAdmin, hasPermission, hasAnyPermission } = require('../shared/permissions');

/**
 * Middleware: require the user to have a specific permission.
 * Admin users are always allowed.
 */
function requirePermission(permName) {
  return function (req, res, next) {
    if (!req.user || !hasPermission(req.user.privilege, permName)) {
      return res.status(403).json({ ok: false, message: '无权限访问' });
    }
    next();
  };
}

/**
 * Middleware: require the user to have any of the specified permissions.
 * Admin users are always allowed.
 */
function requireAnyPermission(...permNames) {
  return function (req, res, next) {
    if (!req.user || !hasAnyPermission(req.user.privilege, ...permNames)) {
      return res.status(403).json({ ok: false, message: '无权限访问' });
    }
    next();
  };
}

/**
 * Middleware: require the user to be an admin.
 */
function requireAdmin(req, res, next) {
  if (!req.user || !isAdmin(req.user.privilege)) {
    return res.status(403).json({ ok: false, message: '无权限访问' });
  }
  next();
}

module.exports = {
  requirePermission,
  requireAnyPermission,
  requireAdmin,
};
