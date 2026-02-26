var _ = require('underscore');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var User = require('../models/User');
var Tenant = require('../models/Tenant');
var secrets = require('./secrets');
var { decryptPassword, isEncryptedPassword } = require('../utils/crypto');
var { isStandalone } = require('../utils/deploy-mode');

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(async function(id, done) {
  try {
    const user = await User.findById(id).populate('tenantId');
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// Sign in using userid and Password.
// SaaS: 支持租户代码登录
passport.use(new LocalStrategy(
  { usernameField: 'userid', passReqToCallback: true },
  async function(req, userid, password, done) {
    try {
      const tenantCode = req.body.tenantCode ? req.body.tenantCode.toUpperCase().trim() : null;
      console.log('Passport Strategy: Attempting login for userid:', userid, 'tenantCode:', tenantCode || '(platform)');

      let user;

      if (isStandalone()) {
        // 独立模式：所有用户在默认租户中查找，忽略 tenantCode
        const tenant = await Tenant.findOne({ code: 'DEFAULT' });
        if (!tenant) {
          return done(null, false, { message: '系统尚未初始化' });
        }
        user = await User.findOne({ tenantId: tenant._id, userid: userid });
        if (!user) {
          return done(null, false, { message: '用户名 ' + userid + ' 不存在' });
        }
        if (user.status === 'disabled') {
          return done(null, false, { message: '该账号已被禁用' });
        }
      } else if (!tenantCode) {
        // 无租户代码：查找平台用户
        user = await User.findOne({ userid: userid, role: 'platform' });
        if (!user) {
          console.log('Passport Strategy: Platform user not found');
          return done(null, false, { message: '平台管理员账号不存在，请输入公司代码后再试' });
        }
      } else {
        // 有租户代码：先查租户，再查用户
        const tenant = await Tenant.findOne({ code: tenantCode });
        if (!tenant) {
          console.log('Passport Strategy: Tenant not found:', tenantCode);
          return done(null, false, { message: '公司代码 ' + tenantCode + ' 不存在' });
        }

        if (tenant.status !== 'active') {
          const statusMessages = {
            suspended: '该公司账号已被暂停，请联系平台管理员',
            deleted: '该公司账号已被删除'
          };
          return done(null, false, { message: statusMessages[tenant.status] || '公司账号状态异常' });
        }

        if (tenant.expireDate && new Date() > tenant.expireDate) {
          return done(null, false, { message: '该公司账号已过期，请联系平台管理员续费' });
        }

        // 通过租户ID和用户名查找用户
        user = await User.findOne({ tenantId: tenant._id, userid: userid });
        if (!user) {
          console.log('Passport Strategy: User not found in tenant:', tenantCode);
          return done(null, false, { message: '用户名 ' + userid + ' 在公司 ' + tenantCode + ' 中不存在' });
        }

        // 检查用户状态
        if (user.status === 'disabled') {
          return done(null, false, { message: '该账号已被禁用，请联系公司管理员' });
        }
      }

      console.log('Passport Strategy: User found:', user.userid, 'role:', user.role);

      // Decrypt password if encrypted, otherwise use as-is (backward compatible)
      let plainPassword = password;
      if (isEncryptedPassword(password)) {
        try {
          plainPassword = decryptPassword(password);
          console.log('Passport Strategy: Password decrypted successfully');
        } catch (decryptError) {
          console.error('Passport Strategy: Password decryption failed:', decryptError.message);
          return done(null, false, { message: '密码解密失败' });
        }
      }

      const isMatch = await user.comparePassword(plainPassword);
      console.log('Passport Strategy: Password match:', isMatch);

      if (isMatch) {
        // 更新最后登录时间
        user.lastLoginAt = new Date();
        await user.save();
        return done(null, user);
      } else {
        return done(null, false, { message: '密码不正确' });
      }
    } catch (err) {
      console.error('Passport Strategy Error:', err);
      return done(err);
    }
  }
));

// Sign in using phone and Password.
// 通过手机号登录，不需要租户代码
passport.use('phone-local', new LocalStrategy(
  { usernameField: 'phone', passwordField: 'password', passReqToCallback: true },
  async function(req, phone, password, done) {
    try {
      const phoneNumber = phone ? phone.trim() : null;
      console.log('Phone Login Strategy: Attempting login for phone:', phoneNumber);

      if (!phoneNumber) {
        return done(null, false, { message: '请输入手机号' });
      }

      // 通过手机号查找用户（跨租户），先查顶层phone，再查profile.phone
      var user = await User.findOne({ phone: phoneNumber }).populate('tenantId');
      if (!user) {
        user = await User.findOne({ 'profile.phone': phoneNumber }).populate('tenantId');
      }

      if (!user) {
        console.log('Phone Login Strategy: User not found for phone:', phoneNumber);
        return done(null, false, { message: '手机号未注册' });
      }

      // 检查租户状态（平台用户无租户，跳过）
      if (user.tenantId) {
        const tenant = user.tenantId;
        if (tenant.status !== 'active') {
          const statusMessages = {
            suspended: '该公司账号已被暂停，请联系平台管理员',
            deleted: '该公司账号已被删除'
          };
          return done(null, false, { message: statusMessages[tenant.status] || '公司账号状态异常' });
        }

        if (tenant.expireDate && new Date() > tenant.expireDate) {
          return done(null, false, { message: '该公司账号已过期，请联系平台管理员续费' });
        }
      }

      // 检查用户状态
      if (user.status === 'disabled') {
        return done(null, false, { message: '该账号已被禁用，请联系公司管理员' });
      }

      console.log('Phone Login Strategy: User found:', user.userid, 'role:', user.role);

      // Decrypt password if encrypted, otherwise use as-is (backward compatible)
      let plainPassword = password;
      if (isEncryptedPassword(password)) {
        try {
          plainPassword = decryptPassword(password);
          console.log('Phone Login Strategy: Password decrypted successfully');
        } catch (decryptError) {
          console.error('Phone Login Strategy: Password decryption failed:', decryptError.message);
          return done(null, false, { message: '密码解密失败' });
        }
      }

      const isMatch = await user.comparePassword(plainPassword);
      console.log('Phone Login Strategy: Password match:', isMatch);

      if (isMatch) {
        // 更新最后登录时间
        user.lastLoginAt = new Date();
        await user.save();
        return done(null, user);
      } else {
        return done(null, false, { message: '密码不正确' });
      }
    } catch (err) {
      console.error('Phone Login Strategy Error:', err);
      return done(err);
    }
  }
));


// Login Required middleware.
exports.isAuthenticated = function(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
};

// Authorization Required middleware.
exports.isAuthorized = function(req, res, next) {
  var provider = req.path.split('/').slice(-1)[0];

  if (_.findWhere(req.user.tokens, { kind: provider })) {
    next();
  } else {
    res.redirect('/auth/' + provider);
  }
};
