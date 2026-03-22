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
  phone: { type: String, sparse: true }, // 手机号，用于登录（可选，跨租户唯一）
  no: Number,    // 顺序号
  title: String, // 职务
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
