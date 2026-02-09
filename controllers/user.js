var _ = require('underscore');
// var async = require('async'); // Removed as we use async/await
var crypto = require('crypto');
// var nodemailer = require('nodemailer'); // Removed - not used
var passport = require('passport');
var User = require('../models/User');
var Tenant = require('../models/Tenant');
var secrets = require('../config/secrets');
var { isAdmin } = require('../utils/permissions');

/**
 * GET /login
 * Login page.
 */

exports.getLogin = function (req, res) {
  if (req.user) {
    // udpateUserNo(req.user); // user variable was not defined here in original code, assuming req.user
    // However, keeping original logic strict to not break 'user' reference if it was global (unlikely)
    // The original code passed 'user' which seems like a bug (ReferenceError). 
    // I will assume it meant req.user
    udpateUserNo(req.user);
    return res.redirect('/');
  }

  res.render('account/login', {
    title: 'Login'
  });
};

/**
 * POST /login
 * Sign in using user id and password.
 * @param userid
 * @param password
 */

exports.postLogin = function (req, res, next) {

  req.assert('userid', '用户名不能为空').notEmpty();

  req.assert('password', '密码不能为空').notEmpty();



  var errors = req.validationErrors();

  if (errors) {

    req.flash('errors', errors);

    return res.redirect('/login');

  }



  console.log('postLogin: calling passport.authenticate for', req.body.userid);



  passport.authenticate('local', function (err, user, info) {

    if (err) {

        console.error('postLogin: passport error', err);

        return next(err);

    }

    if (!user) {

      console.log('postLogin: user login failed', info);

      return res.json({ ok: false, msg: info.message });

    }

    req.logIn(user, function (err) {

      if (err) {

          console.error('postLogin: req.logIn error', err);

          return next(err);

      }

      

            console.log('postLogin: success, return to = ' + req.session.returnTo);

      

            udpateUserNo(user);

      

            

      

                  // Check if it's an AJAX/API request

      

            

      

                              const isApi = req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') > -1);

      

            

      

                  

      

            

      

                              if (isApi) {
                                  req.session.save(async function(err) {
                                      if (err) console.error('Session save error:', err);

                                      // Build user response with role
                                      var userRole = user.role || 'member';
                                      var userData = {
                                          userid: user.userid,
                                          name: user.profile.name,
                                          privilege: user.privilege,
                                          role: userRole
                                      };

                                      // Look up tenant for non-platform users
                                      var tenantData = null;
                                      if (userRole !== 'platform' && user.tenantId) {
                                          try {
                                              var t = await Tenant.findById(user.tenantId).lean();
                                              if (t) {
                                                  tenantData = {
                                                      id: t._id,
                                                      code: t.code,
                                                      name: t.name,
                                                      plan: t.plan,
                                                      maxUsers: t.maxUsers
                                                  };
                                              }
                                          } catch (e) {
                                              console.error('Login tenant lookup error:', e);
                                          }
                                      }

                                      return res.json({ ok: true, user: userData, tenant: tenantData });

      

            

      

                                  });

      

            

      

                              } else {

      

            

      

                                  req.session.save(function(err) {

      

            

      

                                      if (err) console.error('Session save error:', err);

      

            

      

                                      return res.redirect(req.session.returnTo || '/');

      

            

      

                                  });

      

            

      

                              }

      

          });

      

        })(req, res, next);

      

      };

async function udpateUserNo(user) {
  if (!user.no) {
    try {
      const users = await User.find({}).sort({ no: 'desc' }).exec();
      let max = 0;
      if (!users || users.length === 0 || isNaN(users[0].no)) {
        max = (users ? users.length : 0) + 1;
      } else {
        max = users[0].no + 1;
      }
      
      await User.updateOne({ userid: user.userid }, { $set: { no: max } });
      console.log('更新顺序号成功!');
    } catch (err) {
      console.log('UpdateUserNo: 错误' + err);
    }
  }
}

/**
 * GET /logout
 * Log out.
 */

exports.logout = function (req, res) {
  req.logout();
  
  const isApi = req.xhr || (req.headers.accept && req.headers.accept.indexOf('application/json') > -1);
  if (isApi) {
    res.json({ ok: true });
  } else {
    res.redirect('/login');
  }
};

/**
 * GET /signup
 * Signup page.
 */

exports.getSignup = function (req, res) {
  if (req.user) return res.redirect('/');
  res.render('account/signup', {
    title: '创建账号'
  });
};

/**
 * POST /signup
 * Create a new local account.
 * @param email
 * @param password
 */

exports.postSignup = async function (req, res, next) {
  req.assert('userid', '用户名不能为空').notEmpty();
  req.assert('password', '密码长度至少2位长').len(2);
  req.assert('confirmPassword', '两次输入的密码不一样').equals(req.body.password);
  req.assert('employee_title', '职务不能为空').notEmpty();

  var errors = req.validationErrors();
  if (errors) {
    req.flash('errors', errors);
    return res.redirect('/signup');
  }

  try {
    const users = await User.find({}).sort({ no: 'desc' }).exec();
    
    // Safety check if users is empty
    let maxNo = 1;
    if (users && users.length > 0 && users[0].no) {
      maxNo = users[0].no + 1;
    }

    var title = '业务员';
    var employeeTitle = req.body.employee_title;
    var privilege = ['operator'];

    if (employeeTitle === 'account') {
      title = '会计';
      privilege = ['account'];
    } else if (employeeTitle === 'operator') {
      title = '业务员';
      privilege = ['operator'];
    } else if (employeeTitle === 'statistician') {
      title = '统计员';
      privilege = ['statistics'];
    }

    var user = new User({
      userid: req.body.userid,
      password: req.body.password,
      no: maxNo,
      title: title,
      privilege: privilege
    });

    await user.save();
    
    req.logIn(user, function (err) {
      if (err) {
        return res.json({ ok: false, msg: err.message });
      }
      return res.json({ ok: true });
    });

  } catch (err) {
    if (err.code === 11000) {
      return res.json({ ok: false, msg: 'Username already exists.' });
    }
    return res.json({ ok: false, msg: 'Error saving user: ' + err.message });
  }
};

/**
 * GET /account
 * Profile page.
 */

exports.getAccount = function (req, res) {
  res.render('account/profile', {
    title: '用户设置',
    curr_page: '用户账号设置',
    curr_page_name: '用户设置'
  });
};

/**
 * POST /account/profile
 * Update profile information.
 */

exports.postUpdateProfile = async function (req, res, next) {
  console.log('postUpdateProfile');
  try {
    const user = await User.findById(req.user.id);
    if (!req.body.userid) return next(new Error('Userid missing')); // slightly adapted error handling
    
    user.userid = req.body.userid || '';
    user.profile.name = req.body.name || '';
    user.profile.gender = req.body.gender || '';
    user.profile.location = req.body.location || '';
    user.profile.phone = req.body.phone || '';

    await user.save();
    req.flash('success', { msg: '用户信息已更新.' });
    res.redirect('/account');
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /account/password
 * Update current password.
 * @param password
 */

exports.postUpdatePassword = async function (req, res, next) {
  req.assert('password', '密码长度至少2位长').len(2);
  req.assert('confirmPassword', '两次输入的密码不一致').equals(req.body.password);

  var errors = req.validationErrors();

  if (errors) {
    req.flash('errors', errors);
    return res.redirect('/account');
  }

  try {
    const user = await User.findById(req.user.id);
    user.password = req.body.password;
    console.log('postUpdatePassword:' + req.body.password);

    await user.save();
    req.flash('success', { msg: '密码修改成功.' });
    res.redirect('/account');
  } catch (err) {
    return next(err);
  }
};

exports.postResetPassword = async function (req, res, next) {
  console.log('postResetPassword', req.body.user);
  try {
    const user = await User.findOne({ userid: req.body.user.userid });
    if (!user) {
        // Handle case where user is not found, though original code implied it would exist or error out
        return res.json({ ok: false, msg: 'User not found' });
    }
    user.password = '123456';

    await user.save();
    res.json({ ok: true, msg: '密码重置成功!' });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /account/delete
 * Delete user account.
 * @param id - User ObjectId
 */

exports.postDeleteAccount = async function (req, res, next) {
  try {
    await User.deleteOne({ _id: req.user.id });
    req.logout();
    res.redirect('/');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /account/unlink/:provider
 * Unlink OAuth2 provider from the current user.
 * @param provider
 * @param id - User ObjectId
 */

exports.getOauthUnlink = async function (req, res, next) {
  var provider = req.params.provider;
  console.log('getOauthUnlink');
  try {
    const user = await User.findById(req.user.id);
    user[provider] = undefined;
    user.tokens = _.reject(user.tokens, function (token) { return token.kind === provider; });

    await user.save();
    req.flash('info', { msg: provider + ' account has been unlinked.' });
    res.redirect('/account');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /reset/:token
 * Reset Password page.
 */

exports.getReset = async function (req, res) {
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }

  console.log('getReset');

  try {
    const user = await User
      .findOne({ resetPasswordToken: req.params.token })
      .where('resetPasswordExpires').gt(Date.now())
      .exec();

    if (!user) {
      req.flash('errors', { msg: 'Password reset token is invalid or has expired.' });
      return res.redirect('/forgot');
    }
    res.render('account/reset', {
      title: 'Password Reset'
    });
  } catch (err) {
    // In original code, error handling was implicit or missing for the query itself
    // We should probably redirect to forgot or show error
    console.error(err);
    req.flash('errors', { msg: 'Error processing request.' });
    return res.redirect('/forgot');
  }
};

/**
 * POST /reset/:token
 * Process the reset password request.
 */

exports.postReset = async function (req, res, next) {
  req.assert('password', 'Password must be at least 4 characters long.').len(4);
  req.assert('confirm', 'Passwords must match.').equals(req.body.password);

  var errors = req.validationErrors();

  if (errors) {
    req.flash('errors', errors);
    return res.redirect('back');
  }

  try {
    const user = await User
      .findOne({ resetPasswordToken: req.params.token })
      .where('resetPasswordExpires').gt(Date.now())
      .exec();

    if (!user) {
      req.flash('errors', { msg: 'Password reset token is invalid or has expired.' });
      return res.redirect('back');
    }

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();
    
    // Login the user
    await new Promise((resolve, reject) => {
        req.logIn(user, function (err) { 
            if (err) reject(err);
            else resolve();
        });
    });

    // Email notification removed - nodemailer not in use
    // TODO: Implement email notification if needed in the future

    req.flash('success', { msg: 'Success! Your password has been changed.' });
    res.redirect('/');

  } catch (err) {
    return next(err);
  }
};

/**
 * GET /forgot
 * Forgot Password page.
 */

exports.getForgot = function (req, res) {
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }
  res.render('account/forgot', {
    title: 'Forgot Password'
  });
};

/**
 * POST /forgot
 * Create a random token, then the send user an email with a reset link.
 * @param email
 */

exports.postForgot = async function (req, res, next) {
  req.assert('email', 'Please enter a valid email address.').isEmail();

  var errors = req.validationErrors();

  if (errors) {
    req.flash('errors', errors);
    return res.redirect('/forgot');
  }

  try {
    // Generate token
    const token = await new Promise((resolve, reject) => {
        crypto.randomBytes(16, function (err, buf) {
            if (err) reject(err);
            else resolve(buf.toString('hex'));
        });
    });

    const user = await User.findOne({ email: req.body.email.toLowerCase() });
    if (!user) {
      req.flash('errors', { msg: 'No account with that email address exists.' });
      return res.redirect('/forgot');
    }

    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

    await user.save();

    // Email notification removed - nodemailer not in use
    // TODO: Implement password reset email if needed in the future
    // Reset token is: http://' + req.headers.host + '/reset/' + token

    req.flash('info', { msg: 'Password reset requested. Please contact administrator for the reset link.' });
    res.redirect('/forgot');

  } catch (err) {
    return next(err);
  }
};

exports.getUserMgr = async function (req, res) {
  if (!isAdmin(req.user.privilege)) {
    res.status(404);
    res.render('404');
    return;
  }
  
  try {
    const users = await User.find({}).exec();
    var uData = [];
    if (users) {
      users.forEach(function (u) {
        uData.push({
          userid: u.userid,
          name: u.profile.name,
          title: u.title,
          phone: u.profile.phone,
          privilege: u.privilege
        })
      });
    }

    res.render('account/user_mgr', {
      page_header_right: 'notneeded',
      curr_page: '用户管理',
      dbUsers: uData,
      scripts: [
        '/js/user_mgt_02.js'
      ]
    });
  } catch (err) {
      // Handle error gracefully, maybe render error page or empty list
      console.error(err);
      res.render('account/user_mgr', {
          page_header_right: 'notneeded',
          curr_page: '用户管理',
          dbUsers: [],
          scripts: ['/js/user_mgt_02.js']
      });
  }
};

exports.postUserMgr = async function (req, res) {
  var action = req.body.act;
  if (action === 'add') {
    var data = req.body.data;
    try {
        const users = await User.find({}).sort({ no: 'desc' }).exec();
        
        let maxNo = 1;
        if (users && users.length > 0 && users[0].no) {
             maxNo = users[0].no + 1;
        }

        var user = new User({
          userid: data.userid,
          password: '123456',
          no: maxNo,
          title: data.title,
          privilege: data.privilege
        });

        user.profile.name = data.name;
        user.profile.gender = '';
        user.profile.location = '';
        user.profile.phone = data.phone;

        await user.save();
        res.end(JSON.stringify({ ok: true }));
    } catch (err) {
        res.end(JSON.stringify({ ok: false, response: 'Error: ' + err }));
    }

  } else if (action === 'delete') {
    var uid = req.body.userid;
    try {
        await User.deleteOne({ userid: uid });
        res.end(JSON.stringify({ ok: true }));
    } catch (remove_err) {
        console.error('remove user error! %s', remove_err);
        res.end(JSON.stringify({ ok: false, response: '删除用户出错:' + remove_err }));
    }

  } else if (action === 'modify') {
    var mod_data = req.body.data;
    try {
        const user = await User.findOne({ userid: mod_data.userid }).exec();
        if (!user) {
            res.end(JSON.stringify({ ok: false, response: '用户未找到' }));
            return;
        }
        user.title = mod_data.title;
        user.privilege = mod_data.privilege;
        user.profile.name = mod_data.name;
        user.profile.phone = mod_data.phone;

        await user.save();
        res.end(JSON.stringify({ ok: true }));
    } catch (err) {
        res.end(JSON.stringify({ ok: false, response: err.message }));
    }
  }
};
