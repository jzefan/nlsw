var _ = require('underscore');
var async = require('async');
var crypto = require('crypto');
var nodemailer = require('nodemailer');
var passport = require('passport');
var User = require('../models/User');
var secrets = require('../config/secrets');

/**
 * GET /login
 * Login page.
 */

exports.getLogin = function(req, res) {
  if (req.user) {
    udpateUserNo(user);
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

exports.postLogin = function(req, res, next) {
  req.assert('userid', '用户名不能为空').notEmpty();
  req.assert('password', '密码不能为空').notEmpty();

  var errors = req.validationErrors();
  if (errors) {
    req.flash('errors', errors);
    return res.redirect('/login');
  }

  passport.authenticate('local', function(err, user, info) {
    if (err) return next(err);
    if (!user) {
      req.flash('errors', { msg: info.message });
      return res.redirect('/login');
    }
    req.logIn(user, function(err) {
      if (err) return next(err);
      //req.flash('success', { msg: 'Success! You are logged in.' });
      console.log('return to = ' + req.session.returnTo);
      res.redirect(req.session.returnTo || '/');

      udpateUserNo(user);
    });
 })(req, res, next);
};

function udpateUserNo(user) {
  if (!user.no) {
    User.find({}).sort({no: 'desc'}).exec(function( err, users){
      if (!err) {
        var max = 0;
        if (isNaN(users[0].no)) {
          max = users.length + 1;
        } else {
          max = users[0].no + 1;
        }
        User.update({userid: user.userid}, { $set: {no : max}}, function(update_err, result) {
          if (update_err) {
            console.log('更新顺序号出错!' + update_err);
          } else {
            console.log('更新顺序号成功!');
          }
        });
      } else {
        console.log('UpdateUserNo: 错误' + err);
      }
    });
  }
}

/**
 * GET /logout
 * Log out.
 */

exports.logout = function(req, res) {
  req.logout();
  res.redirect('/');
};

/**
 * GET /signup
 * Signup page.
 */

exports.getSignup = function(req, res) {
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

exports.postSignup = function(req, res, next) {
  req.assert('userid', '用户名不能为空').notEmpty();
  req.assert('password', '密码长度至少2位长').len(2);
  req.assert('confirmPassword', '两次输入的密码不一样').equals(req.body.password);
  req.assert('employee_title', '职务不能为空').notEmpty();

  var errors = req.validationErrors();
  if (errors) {
    req.flash('errors', errors);
    return res.redirect('/signup');
  }

  User.find({}).sort({no: 'desc'}).exec(function( err, users){
    if (err) {
      req.flash('用户表查找错', err);
      return res.redirect('/signup');
    }

    var maxNo = users[0].no + 1;
    var title = '业务员';
    var privilege = req.body.employee_title;

    if (privilege === 'account') {
      title = '会计';
      privilege = '00100000';
    } else if (privilege === 'operator') {
      title = '业务员';
      privilege = '10000000';
    } else if (privilege === 'statistician') {
      title = '统计员';
      privilege = '01000000';
    } else {
      privilege = '10000000';
    }

    var user = new User({
      userid: req.body.userid,
      password: req.body.password,
      no: maxNo,
      title: title,
      privilege: privilege
    });

    user.save(function(err) {
      if (err) {
        if (err.code === 11000) {
          req.flash('errors', { msg: '用户名已经存在.' });
        }

        res.redirect('/signup');
      }
      else {
        req.logIn(user, function(err) {
          if (err) {
            return next(err);
          }

          res.redirect('/');
        })
      }
    });
  });
};

/**
 * GET /account
 * Profile page.
 */

exports.getAccount = function(req, res) {
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

exports.postUpdateProfile = function(req, res, next) {
  console.log('postUpdateProfile');
  User.findById(req.user.id, function(err, user) {
    if (err) return next(err);
    if (!req.body.userid) return next(err);
    user.userid = req.body.userid || '';
    user.profile.name = req.body.name || '';
    user.profile.gender = req.body.gender || '';
    user.profile.location = req.body.location || '';
    user.profile.phone = req.body.phone || '';

    user.save(function(err) {
      if (err) return next(err);
      req.flash('success', { msg: '用户信息已更新.' });
      res.redirect('/account');
    });
  });
};

/**
 * POST /account/password
 * Update current password.
 * @param password
 */

exports.postUpdatePassword = function(req, res, next) {
  req.assert('password', '密码长度至少2位长').len(2);
  req.assert('confirmPassword', '两次输入的密码不一致').equals(req.body.password);

  var errors = req.validationErrors();

  if (errors) {
    req.flash('errors', errors);
    return res.redirect('/account');
  }

  console.log('postUpdatePassword');
  User.findById(req.user.id, function(err, user) {
    if (err) return next(err);

    user.password = req.body.password;

    user.save(function(err) {
      if (err) return next(err);
      req.flash('success', { msg: '密码修改成功.' });
      res.redirect('/account');
    });
  });
};

/**
 * POST /account/delete
 * Delete user account.
 * @param id - User ObjectId
 */

exports.postDeleteAccount = function(req, res, next) {
  User.remove({ _id: req.user.id }, function(err) {
    if (err) return next(err);
    req.logout();
    res.redirect('/');
  });
};

/**
 * GET /account/unlink/:provider
 * Unlink OAuth2 provider from the current user.
 * @param provider
 * @param id - User ObjectId
 */

exports.getOauthUnlink = function(req, res, next) {
  var provider = req.params.provider;
  console.log('getOauthUnlink');
  User.findById(req.user.id, function(err, user) {
    if (err) return next(err);

    user[provider] = undefined;
    user.tokens = _.reject(user.tokens, function(token) { return token.kind === provider; });

    user.save(function(err) {
      if (err) return next(err);
      req.flash('info', { msg: provider + ' account has been unlinked.' });
      res.redirect('/account');
    });
  });
};

/**
 * GET /reset/:token
 * Reset Password page.
 */

exports.getReset = function(req, res) {
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }

  console.log('getReset');

  User
    .findOne({ resetPasswordToken: req.params.token })
    .where('resetPasswordExpires').gt(Date.now())
    .exec(function(err, user) {
      if (!user) {
        req.flash('errors', { msg: 'Password reset token is invalid or has expired.' });
        return res.redirect('/forgot');
      }
      res.render('account/reset', {
        title: 'Password Reset'
      });
    });
};

/**
 * POST /reset/:token
 * Process the reset password request.
 */

exports.postReset = function(req, res, next) {
  req.assert('password', 'Password must be at least 4 characters long.').len(4);
  req.assert('confirm', 'Passwords must match.').equals(req.body.password);

  var errors = req.validationErrors();

  if (errors) {
    req.flash('errors', errors);
    return res.redirect('back');
  }

  async.waterfall([
    function(done) {
      User
        .findOne({ resetPasswordToken: req.params.token })
        .where('resetPasswordExpires').gt(Date.now())
        .exec(function(err, user) {
          if (!user) {
            req.flash('errors', { msg: 'Password reset token is invalid or has expired.' });
            return res.redirect('back');
          }

          user.password = req.body.password;
          user.resetPasswordToken = undefined;
          user.resetPasswordExpires = undefined;

          user.save(function(err) {
            if (err) return next(err);
            req.logIn(user, function(err) {
              done(err, user);
            });
          });
        });
    },
    function(user, done) {
      var smtpTransport = nodemailer.createTransport('SMTP', {
        service: 'SendGrid',
        auth: {
          user: secrets.sendgrid.user,
          pass: secrets.sendgrid.password
        }
      });
      var mailOptions = {
        to: user.email,
        from: 'hackathon@starter.com',
        subject: 'Your Hackathon Starter password has been changed',
        text: 'Hello,\n\n' +
          'This is a confirmation that the password for your account ' + user.email + ' has just been changed.\n'
      };
      smtpTransport.sendMail(mailOptions, function(err) {
        req.flash('success', { msg: 'Success! Your password has been changed.' });
        done(err);
      });
    }
  ], function(err) {
    if (err) return next(err);
    res.redirect('/');
  });
};

/**
 * GET /forgot
 * Forgot Password page.
 */

exports.getForgot = function(req, res) {
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

exports.postForgot = function(req, res, next) {
  req.assert('email', 'Please enter a valid email address.').isEmail();

  var errors = req.validationErrors();

  if (errors) {
    req.flash('errors', errors);
    return res.redirect('/forgot');
  }

  async.waterfall([
    function(done) {
      crypto.randomBytes(16, function(err, buf) {
        var token = buf.toString('hex');
        done(err, token);
      });
    },
    function(token, done) {
      User.findOne({ email: req.body.email.toLowerCase() }, function(err, user) {
        if (!user) {
          req.flash('errors', { msg: 'No account with that email address exists.' });
          return res.redirect('/forgot');
        }

        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

        user.save(function(err) {
          done(err, token, user);
        });
      });
    },
    function(token, user, done) {
      var smtpTransport = nodemailer.createTransport('SMTP', {
        service: 'SendGrid',
        auth: {
          user: secrets.sendgrid.user,
          pass: secrets.sendgrid.password
        }
      });
      var mailOptions = {
        to: user.email,
        from: 'hackathon@starter.com',
        subject: 'Reset your password on Hackathon Starter',
        text: 'You are receiving this email because you (or someone else) have requested the reset of the password for your account.\n\n' +
          'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
          'http://' + req.headers.host + '/reset/' + token + '\n\n' +
          'If you did not request this, please ignore this email and your password will remain unchanged.\n'
      };
      smtpTransport.sendMail(mailOptions, function(err) {
        req.flash('info', { msg: 'An e-mail has been sent to ' + user.email + ' with further instructions.' });
        done(err, 'done');
      });
    }
  ], function(err) {
    if (err) return next(err);
    res.redirect('/forgot');
  });
};

exports.getUserMgr = function(req, res) {
  if (req.user.privilege != '11111111') {
    res.status(404);
    res.render('404');
  }
  else {
    User.find({}).exec(function(err, users) {
      var uData = [];
      if (!err) {
        users.forEach(function(u) {
          uData.push( {
            userid: u.userid,
            name: u.profile.name,
            title: u.title,
            phone: u.profile.phone,
            privilege: u.privilege
          })
        })
      }

      res.render('account/user_mgr', {
        page_header_right: 'notneeded',
        curr_page: '用户管理',
        dbUsers: uData,
        scripts: [
          '/js/user_mgt.js'
        ]
      });
    })
  }
};

exports.postUserMgr = function(req, res) {
  var action = req.body.act;
  if (action === 'add') {
    var data = req.body.data;
    User.find({}).sort({no: 'desc'}).exec(function( err, users) {
      if (err) {
        res.end(JSON.stringify({ok: false, response: '用户表查找错' + err}));
      } else {
        var maxNo = users[0].no + 1;
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

        user.save(function (err) {
          if (err) {
            res.end(JSON.stringify({ok: false, response: err}));
          }
          else {
            res.end(JSON.stringify({ok: true}));
          }
        });
      }
    });
  } else if (action === 'delete') {
    var uid = req.body.userid;
    User.remove({ userid: uid }, function(remove_err, user) {
      if (remove_err) {
        console.error('remove user error! %s', remove_err);
        res.end(JSON.stringify({ ok: false, response: '删除用户出错:' + remove_err }));
      } else {
        res.end(JSON.stringify({ ok: true }));
      }
    });
  } else if (action === 'modify') {
    var mod_data = req.body.data;
    User.findOne({ userid: mod_data.userid }).exec(function( err, user) {
      if (err) {
        res.end(JSON.stringify({ok: false, response: '用户表查找错' + err}));
      } else {
        user.title = mod_data.title;
        user.privilege = mod_data.privilege;
        user.profile.name = mod_data.name;
        user.profile.phone = mod_data.phone;

        user.save(function (err) {
          if (err) {
            res.end(JSON.stringify({ok: false, response: err}));
          }
          else {
            res.end(JSON.stringify({ok: true}));
          }
        });
      }
    });
  }
};