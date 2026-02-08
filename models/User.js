var mongoose = require('mongoose');
var bcrypt = require('bcrypt-nodejs');
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
  no: Number,    // 顺序号
  title: String, // 职务
  privilege: String, // admin, account, statistician, operator
  profile: {
    name: { type: String, default: '' },
    gender: { type: String, default: '' },
    location: { type: String, default: '' },
    phone: { type: String, default: '' },
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
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

// 复合唯一索引：同一租户内 userid 唯一
// 平台用户 (tenantCode 为空) userid 全局唯一
userSchema.index({ tenantCode: 1, userid: 1 }, { unique: true });

/**
 * Hash the password for security.
 * "Pre" is a Mongoose middleware that executes before each user.save() call.
 */
userSchema.pre('save', function(next) {
  var user = this;

  if (!user.isModified('password')) return next();

  bcrypt.genSalt(5, function(err, salt) {
    if (err) return next(err);

    bcrypt.hash(user.password, salt, null, function(err, hash) {
      if (err) return next(err);
      user.password = hash;
      next();
    });
  });
});

/**
 * Validate user's password.
 * Used by Passport-Local Strategy for password validation.
 */

userSchema.methods.comparePassword = function(candidatePassword) {
  return new Promise((resolve, reject) => {
    bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
      if (err) return reject(err);
      resolve(isMatch);
    });
  });
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
