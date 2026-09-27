var mongoose = require('mongoose');
var bcrypt = require('bcryptjs');
var crypto = require('crypto');

var userSchema = new mongoose.Schema({
  // === SaaS 多租户字段 ===
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true
  },
  tenantCode: {
    type: String,
    uppercase: true,
    index: true
  },
  role: {
    type: String,
    enum: ['platform', 'owner', 'member'],
    default: 'member'
  },

  // === 原有字段 ===
  userid: { type: String, required: true },
  password: String,
  // 是否需要先完成本人密码设置（改密）后才能被分配薪资角色。
  // true = 管理员下发的初始密码尚未更换；false / undefined = 正常账号。
  // 历史存量账号没有这个字段 → 解析为 undefined → 守卫 `mustChangePassword !== true` 放行，
  // 即不因启用考勤/薪资功能而强制老账号改密；只有显式写入 true 才会被拦。
  mustChangePassword: { type: Boolean, default: undefined },
  phone: { type: String, sparse: true }, // 手机号，用于登录（可选，跨租户唯一）
  no: Number,    // 顺序号
  title: String, // 职务
  // 考勤员工关联信息。审批角色必须显式配置，不能由 admin 等系统权限推断。
  employeeNo: { type: String, trim: true, default: '' },
  department: { type: String, trim: true, default: '' },
  managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  attendanceRoles: {
    type: [{ type: String, enum: ['manager', 'general_manager', 'attendance_admin'] }],
    default: []
  },
  // 是否纳入考勤台账与统计（默认纳入）。平台账号不适用，由 role 判定，与开关无关。
  attendanceTracked: { type: Boolean, default: true },
  // Payroll access is independent of legacy system privileges such as admin.
  payrollRoles: {
    type: [{ type: String, enum: ['finance', 'general_manager'] }],
    default: []
  },
  payrollGeneralManagerTenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: undefined, select: false },
  payrollRoleAudit: [{
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    previousRoles: [{ type: String, enum: ['finance', 'general_manager'] }],
    nextRoles: [{ type: String, enum: ['finance', 'general_manager'] }],
    reason: { type: String, trim: true, maxlength: 2000, default: '' },
    changedAt: { type: Date, default: Date.now }
  }],
  // Passport sessions carry this value; incrementing it revokes all older sessions.
  sessionVersion: { type: Number, default: 0 },
  // CAS token for role, employee-link, and login-identity changes.
  securityIdentityVersion: { type: Number, default: 0 },
  // Internal uniqueness key populated only for the tenant's configured general manager.
  attendanceGeneralManagerTenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: undefined, select: false },
  privilege: { type: mongoose.Schema.Types.Mixed, default: [] }, // ['admin'] or ['operator', 'account', ...]
  profile: {
    name: { type: String, default: '' },
    gender: { type: String, default: '' },
    location: { type: String, default: '' },
    phone: { type: String, default: '' }, // 保留用于向后兼容
    picture: { type: String, default: '' }
  },

  tokens: Array,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  createDate: { type: Date, default: Date.now() },

  // 状态
  status: {
    type: String,
    enum: ['active', 'disabled'],
    default: 'active'
  },
  lastLoginAt: Date,
  lastLoginIp: String,
  lastLoginDevice: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // 用户界面偏好（持久化到服务端）
  preferences: {
    theme: { type: String, default: '' },
    radius: { type: Number, default: -1 },
    contentLayout: { type: String, default: '' },
  }
});

// 复合唯一索引：同一租户内 userid 唯一
// 平台用户 (tenantCode 为空) userid 全局唯一
userSchema.index({ tenantCode: 1, userid: 1 }, { unique: true });

// 手机号全局唯一索引（如果存在）
userSchema.index({ phone: 1 }, { unique: true, sparse: true });

// 工号在公司内唯一；空值不参与约束，兼容尚未启用考勤的旧员工档案。
userSchema.index({ tenantId: 1, employeeNo: 1 }, {
  unique: true,
  partialFilterExpression: { employeeNo: { $type: 'string', $gt: '' } }
});
// MongoDB arbitrates concurrent attempts to assign two general managers in one tenant.
userSchema.index({ attendanceGeneralManagerTenantId: 1 }, { unique: true, sparse: true });
userSchema.index({ payrollGeneralManagerTenantId: 1 }, { unique: true, sparse: true });

/**
 * Hash the password for security.
 * "Pre" is a Mongoose middleware that executes before each user.save() call.
 */
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    var salt = await bcrypt.genSalt(5);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

/**
 * Validate user's password.
 * Used by Passport-Local Strategy for password validation.
 */

userSchema.methods.comparePassword = function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.statics.hashPassword = async function(password) {
  const salt = await bcrypt.genSalt(5);
  return bcrypt.hash(password, salt);
};

/**
 * Get URL to a user's gravatar.
 * Used in Navbar and Account Management page.
 */
userSchema.methods.gravatar = function(size, defaults) {
  if (!size) size = 200;
  if (!defaults) defaults = 'retro';

  if (!this.email) {
    return 'https://gravatar.com/avatar/?s=' + size + '&d=' + defaults;
  }

  var md5 = crypto.createHash('md5').update(this.email);
  return 'https://gravatar.com/avatar/' + md5.digest('hex').toString() + '?s=' + size + '&d=' + defaults;
};

module.exports = mongoose.model('User', userSchema);
