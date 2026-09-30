var _ = require("underscore");
var crypto = require("crypto");
var passport = require("passport");
var { body, validationResult } = require("express-validator");
var User = require("../models/User");
var Tenant = require("../models/Tenant");
var secrets = require("../config/secrets");
var { isAdmin } = require("../utils/permissions");
var { isStandalone, getDeployMode, getStandaloneCompany } = require("../utils/deploy-mode");
var { getBillImportCarrierRule } = require("../utils/tenant-settings");
var { hasProtectedIdentity, bumpSessionVersion, changePasswordWithCas, identityVersionFilter } = require("../utils/user-security");
var { migrateBinaryToArray } = require("../utils/privilege-migration");

function canUseLegacyUserManagement(req) {
  return Boolean(req.user && (req.user.role === 'owner' || req.user.role === 'platform' || isAdmin(req.user.privilege)));
}

function legacyUserQuery(req, criteria) {
  return req.user?.role === 'platform' ? criteria : { ...criteria, tenantId: req.tenantId || req.user?.tenantId?._id || req.user?.tenantId };
}

function refreshLoginSession(req, user) {
  return new Promise((resolve, reject) => {
    req.logIn(user, err => err ? reject(err) : resolve());
  });
}

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
    return res.redirect("/");
  }

  res.render("account/login", {
    title: "Login",
  });
};

/**
 * POST /login
 * Sign in using user id and password.
 * @param userid
 * @param password
 */

exports.postLogin = async function (req, res, next) {
  await body("userid").notEmpty().withMessage("用户名不能为空").run(req);
  await body("password").notEmpty().withMessage("密码不能为空").run(req);

  var errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.flash("errors", errors.array());
    return res.redirect("/login");
  }

  console.log("postLogin: calling passport.authenticate for", req.body.userid);

  passport.authenticate("local", function (err, user, info) {
    if (err) {
      console.error("postLogin: passport error", err);

      return next(err);
    }

    if (!user) {
      console.log("postLogin: user login failed", info);

      return res.json({ ok: false, msg: info.message });
    }

    req.logIn(user, function (err) {
      if (err) {
        console.error("postLogin: req.logIn error", err);

        return next(err);
      }

      console.log("postLogin: success, return to = " + req.session.returnTo);

      udpateUserNo(user);

      // Check if it's an AJAX/API request

      const isApi =
        req.xhr ||
        (req.headers.accept &&
          req.headers.accept.indexOf("application/json") > -1);

      if (isApi) {
        req.session.save(async function (err) {
          if (err) console.error("Session save error:", err);

          // Build user response with role
          var userRole = user.role || "member";
          var userData = {
            id: user._id,
            userid: user.userid,
            name: user.profile.name,
            privilege: user.privilege,
            role: userRole,
            employeeNo: user.employeeNo || '',
            department: user.department || '',
            attendanceRoles: Array.isArray(user.attendanceRoles) ? user.attendanceRoles : [],
            payrollRoles: Array.isArray(user.payrollRoles) ? user.payrollRoles : [],
            mustChangePassword: user.mustChangePassword === true,
            preferences: user.preferences || {},
          };

          // Look up tenant for non-platform users
          var tenantData = null;
          if (userRole !== "platform" && user.tenantId) {
            try {
              var t = await Tenant.findById(user.tenantId).lean();
              if (t) {
                tenantData = {
                  id: t._id,
                  code: t.code,
                  name: t.name,
                  fullName: t.fullName || "",
                  plan: t.plan,
                  maxUsers: t.maxUsers,
                  expireDate: t.expireDate || null,
                  billImportCarrierRule: getBillImportCarrierRule(t.settings || {}),
                  attendanceEnabled: t.settings?.attendanceEnabled === true,
                  sealEnabled: t.settings?.sealEnabled === true,
                  sealCustodianId: t.settings?.sealCustodianId || null,
                  sealCustodianIds: (t.settings?.sealCustodianIds || []).map(String),
                  requireReceiptForSettle: t.settings?.requireReceiptForSettle === true,
                  drayageRate: Number(t.settings?.drayageRate) || 0,
                };
                userData.isSealCustodian = Boolean(
                  (Array.isArray(t.settings?.sealCustodianIds) && t.settings.sealCustodianIds.some(id => String(id) === String(user._id))) ||
                  (t.settings?.sealCustodianId && String(t.settings.sealCustodianId) === String(user._id))
                );
              }
            } catch (e) {
              console.error("Login tenant lookup error:", e);
            }
          }

          return res.json({
            ok: true,
            user: userData,
            tenant: tenantData,
            features: {
              attendance: isStandalone() ? secrets.enableAttendance === true : tenantData?.attendanceEnabled === true,
              seal: isStandalone() ? secrets.enableSeal === true : tenantData?.sealEnabled === true,
              selfVehicle: secrets.enableSelfVehicle,
              publicBasket: secrets.enablePublicBasket,
              requireReceiptForSettle: tenantData?.requireReceiptForSettle || false,
              drayageRate: tenantData?.drayageRate || 0,
            },
            deployMode: getDeployMode(),
            standaloneCompany: getStandaloneCompany(),
          });
        });
      } else {
        req.session.save(function (err) {
          if (err) console.error("Session save error:", err);

          return res.redirect(req.session.returnTo || "/");
        });
      }
    });
  })(req, res, next);
};

async function udpateUserNo(user) {
  if (!user.no) {
    try {
      const users = await User.find({}).sort({ no: "desc" }).exec();
      let max = 0;
      if (!users || users.length === 0 || isNaN(users[0].no)) {
        max = (users ? users.length : 0) + 1;
      } else {
        max = users[0].no + 1;
      }

      await User.updateOne({ userid: user.userid }, { $set: { no: max } });
    } catch (err) {
      console.log("UpdateUserNo: 错误" + err);
    }
  }
}

/**
 * GET /logout
 * Log out.
 */

exports.logout = function (req, res, next) {
  req.logout(function (err) {
    if (err) return next(err);
    const isApi =
      req.xhr ||
      (req.headers.accept &&
        req.headers.accept.indexOf("application/json") > -1);
    if (isApi) {
      res.json({ ok: true });
    } else {
      res.redirect("/login");
    }
  });
};

/**
 * GET /signup
 * Signup page.
 */

exports.getSignup = function (req, res) {
  if (req.user) return res.redirect("/");
  res.render("account/signup", {
    title: "创建账号",
  });
};

/**
 * POST /signup
 * Create a new local account.
 * @param email
 * @param password
 */

exports.postSignup = async function (req, res, next) {
  await body("userid").notEmpty().withMessage("用户名不能为空").run(req);
  await body("password")
    .isLength({ min: 8 })
    .withMessage("密码长度至少8位")
    .run(req);
  await body("confirmPassword")
    .equals(req.body.password)
    .withMessage("两次输入的密码不一样")
    .run(req);
  await body("employee_title").notEmpty().withMessage("职务不能为空").run(req);

  var errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.flash("errors", errors.array());
    return res.redirect("/signup");
  }

  try {
    const users = await User.find({}).sort({ no: "desc" }).exec();

    // Safety check if users is empty
    let maxNo = 1;
    if (users && users.length > 0 && users[0].no) {
      maxNo = users[0].no + 1;
    }

    var title = "业务员";
    var employeeTitle = req.body.employee_title;
    var privilege = ["operator"];

    if (employeeTitle === "account") {
      title = "会计";
      privilege = ["account"];
    } else if (employeeTitle === "operator") {
      title = "业务员";
      privilege = ["operator"];
    } else if (employeeTitle === "statistician") {
      title = "统计员";
      privilege = ["statistics"];
    }

    var user = new User({
      userid: req.body.userid,
      password: req.body.password,
      mustChangePassword: false,
      no: maxNo,
      title: title,
      privilege: privilege,
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
      return res.json({ ok: false, msg: "Username already exists." });
    }
    return res.json({ ok: false, msg: "Error saving user: " + err.message });
  }
};

/**
 * GET /account
 * Profile page.
 */

exports.getAccount = function (req, res) {
  res.render("account/profile", {
    title: "用户设置",
    curr_page: "用户账号设置",
    curr_page_name: "用户设置",
  });
};

/**
 * POST /account/profile
 * Update profile information.
 */

exports.postUpdateProfile = async function (req, res, next) {
  console.log("postUpdateProfile");
  try {
    const user = await User.findById(req.user.id);
    if (!req.body.userid) return next(new Error("Userid missing")); // slightly adapted error handling

    const profilePhone = req.body.phone || "";
    const loginIdentityChanged = user.userid !== (req.body.userid || "") || (user.profile?.phone || "") !== profilePhone;
    if (loginIdentityChanged && hasProtectedIdentity(user)) {
      req.flash("errors", { msg: "员工、管理员或薪资账号暂不支持直接修改登录身份" });
      return res.redirect("/account");
    }

    const update = { $set: {
      userid: req.body.userid || "",
      'profile.name': req.body.name || "",
      'profile.gender': req.body.gender || "",
      'profile.location': req.body.location || "",
      'profile.phone': profilePhone
    }, $inc: { securityIdentityVersion: 1 } };
    if (loginIdentityChanged) update.$inc.sessionVersion = 1;
    const write = await User.updateOne(identityVersionFilter(user, { _id: user._id }), update);
    if ((write.modifiedCount ?? write.nModified) !== 1) {
      req.flash("errors", { msg: "账号资料刚发生变化，请刷新后重试" });
      return res.redirect("/account");
    }
    if (loginIdentityChanged) await refreshLoginSession(req, await User.findById(user._id));
    req.flash("success", { msg: "用户信息已更新." });
    res.redirect("/account");
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
    await body("password")
    .isLength({ min: 8 })
    .withMessage("新密码长度至少8位")
    .run(req);
  await body("currentPassword")
    .notEmpty()
    .withMessage("请输入当前密码")
    .run(req);
  await body("confirmPassword")
    .equals(req.body.password)
    .withMessage("两次输入的密码不一致")
    .run(req);

  var errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.flash("errors", errors.array());
    return res.redirect("/account");
  }

  try {
    const user = await User.findById(req.user.id);
    const currentPasswordMatches = await user.comparePassword(req.body.currentPassword);
    if (!currentPasswordMatches) {
      req.flash("errors", [{ msg: "当前密码不正确" }]);
      return res.redirect("/account");
    }
    const changed = await changePasswordWithCas(User, user, req.body.password, {}, { mustChangePassword: false, unset: { resetPasswordToken: 1, resetPasswordExpires: 1 } });
    if (!changed) {
      req.flash("errors", [{ msg: "账号资料刚发生变化，请刷新后重试" }]);
      return res.redirect("/account");
    }
    const freshUser = await User.findById(user._id);
    await refreshLoginSession(req, freshUser);
    req.flash("success", { msg: "密码修改成功." });
    res.redirect("/account");
  } catch (err) {
    return next(err);
  }
};

exports.postResetPassword = async function (req, res, next) {
  try {
    if (!canUseLegacyUserManagement(req)) return res.status(403).json({ ok: false, msg: "无权限操作" });
    const targetUserId = req.body?.user?.userid;
    const user = await User.findOne(legacyUserQuery(req, { userid: targetUserId }));
    if (!user) {
      // Handle case where user is not found, though original code implied it would exist or error out
      return res.json({ ok: false, msg: "User not found" });
    }
    if (hasProtectedIdentity(user)) {
      return res.status(403).json({ ok: false, msg: "员工、管理员或薪资账号只能通过本人凭据或身份核验流程改密" });
    }
    const changed = await changePasswordWithCas(User, user, "123456", legacyUserQuery(req, {}), { mustChangePassword: true, unset: { resetPasswordToken: 1, resetPasswordExpires: 1 } });
    if (!changed) return res.status(409).json({ ok: false, msg: "用户身份已变化，请刷新后重试" });
    if (String(user._id) === String(req.user._id)) await refreshLoginSession(req, await User.findById(user._id));
    res.json({ ok: true, msg: "密码重置成功!" });
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
    const user = await User.findById(req.user.id);
    if (!user) return res.redirect("/");
    if (hasProtectedIdentity(user)) return res.status(403).send("员工、管理员或薪资账号不可直接删除，请联系公司主账号处理");
    const deleted = await User.deleteOne(identityVersionFilter(user, {}));
    if ((deleted.deletedCount ?? deleted.n) !== 1) return res.status(409).send("账号资料已变化，请刷新后重试");
    req.logout(function (err) {
      if (err) return next(err);
      res.redirect("/");
    });
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
  console.log("getOauthUnlink");
  try {
    const user = await User.findById(req.user.id);
    user[provider] = undefined;
    user.tokens = _.reject(user.tokens, function (token) {
      return token.kind === provider;
    });

    await user.save();
    req.flash("info", { msg: provider + " account has been unlinked." });
    res.redirect("/account");
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
    return res.redirect("/");
  }

  console.log("getReset");

  try {
    const user = await User.findOne({ resetPasswordToken: req.params.token })
      .where("resetPasswordExpires")
      .gt(Date.now())
      .exec();

    if (!user) {
      req.flash("errors", {
        msg: "Password reset token is invalid or has expired.",
      });
      return res.redirect("/forgot");
    }
    res.render("account/reset", {
      title: "Password Reset",
    });
  } catch (err) {
    // In original code, error handling was implicit or missing for the query itself
    // We should probably redirect to forgot or show error
    console.error(err);
    req.flash("errors", { msg: "Error processing request." });
    return res.redirect("/forgot");
  }
};

/**
 * POST /reset/:token
 * Process the reset password request.
 */

exports.postReset = async function (req, res, next) {
  await body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long.")
    .run(req);
  await body("confirm")
    .equals(req.body.password)
    .withMessage("Passwords must match.")
    .run(req);

  var errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.flash("errors", errors.array());
    return res.redirect("back");
  }

  try {
    const user = await User.findOne({ resetPasswordToken: req.params.token })
      .where("resetPasswordExpires")
      .gt(Date.now())
      .exec();

    if (!user) {
      req.flash("errors", {
        msg: "Password reset token is invalid or has expired.",
      });
      return res.redirect("back");
    }

    const changed = await changePasswordWithCas(User, user, req.body.password, { resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: new Date() } }, { mustChangePassword: false, unset: { resetPasswordToken: 1, resetPasswordExpires: 1 } });
    if (!changed) {
      req.flash("errors", { msg: "Password reset token is invalid or has expired." });
      return res.redirect("back");
    }

    // Login the user
    await new Promise((resolve, reject) => {
      User.findById(user._id).then(freshUser => req.logIn(freshUser, function (err) {
        if (err) reject(err);
        else resolve();
      })).catch(reject);
    });

    // Email notification removed - nodemailer not in use
    // TODO: Implement email notification if needed in the future

    req.flash("success", { msg: "Success! Your password has been changed." });
    res.redirect("/");
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
    return res.redirect("/");
  }
  res.render("account/forgot", {
    title: "Forgot Password",
  });
};

/**
 * POST /forgot
 * Create a random token, then the send user an email with a reset link.
 * @param email
 */

exports.postForgot = async function (req, res, next) {
  await body("email")
    .isEmail()
    .withMessage("Please enter a valid email address.")
    .run(req);

  var errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.flash("errors", errors.array());
    return res.redirect("/forgot");
  }

  try {
    // Generate token
    const token = await new Promise((resolve, reject) => {
      crypto.randomBytes(16, function (err, buf) {
        if (err) reject(err);
        else resolve(buf.toString("hex"));
      });
    });

    const user = await User.findOne({ email: req.body.email.toLowerCase() });
    if (!user) {
      req.flash("errors", {
        msg: "No account with that email address exists.",
      });
      return res.redirect("/forgot");
    }

    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

    await user.save();

    // Email notification removed - nodemailer not in use
    // TODO: Implement password reset email if needed in the future
    // Reset token is: http://' + req.headers.host + '/reset/' + token

    req.flash("info", {
      msg: "Password reset requested. Please contact administrator for the reset link.",
    });
    res.redirect("/forgot");
  } catch (err) {
    return next(err);
  }
};

exports.getUserMgr = async function (req, res) {
  if (!canUseLegacyUserManagement(req)) return res.status(403).render("404");

  try {
    const users = await User.find(legacyUserQuery(req, {})).exec();
    var uData = [];
    if (users) {
      users.forEach(function (u) {
        uData.push({
          userid: u.userid,
          name: u.profile.name,
          title: u.title,
          phone: u.profile.phone,
          privilege: u.privilege,
        });
      });
    }

    res.render("account/user_mgr", {
      page_header_right: "notneeded",
      curr_page: "用户管理",
      dbUsers: uData,
      scripts: ["/js/user_mgt_02.js"],
    });
  } catch (err) {
    // Handle error gracefully, maybe render error page or empty list
    console.error(err);
    res.render("account/user_mgr", {
      page_header_right: "notneeded",
      curr_page: "用户管理",
      dbUsers: [],
      scripts: ["/js/user_mgt_02.js"],
    });
  }
};

exports.postUserMgr = async function (req, res) {
  if (!canUseLegacyUserManagement(req)) return res.status(403).json({ ok: false, response: "无权限操作" });
  var action = req.body.act;
  if (action === "add") {
    var data = req.body.data;
    try {
      const users = await User.find(legacyUserQuery(req, {})).sort({ no: "desc" }).exec();

      let maxNo = 1;
      if (users && users.length > 0 && users[0].no) {
        maxNo = users[0].no + 1;
      }

      var user = new User({
        userid: data.userid,
        password: "123456",
        mustChangePassword: true,
        no: maxNo,
        title: data.title,
        privilege: data.privilege,
      });

      user.profile.name = data.name;
      user.profile.gender = "";
      user.profile.location = "";
      user.profile.phone = data.phone;

      await user.save();
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.end(JSON.stringify({ ok: false, response: "Error: " + err }));
    }
  } else if (action === "delete") {
    var uid = req.body.userid;
    try {
      const target = await User.findOne(legacyUserQuery(req, { userid: uid }));
      if (target && hasProtectedIdentity(target)) {
        return res.status(403).json({ ok: false, response: "不能删除受保护的员工、管理员或薪资用户" });
      }
      if (target) {
        const deleted = await User.deleteOne(identityVersionFilter(target, legacyUserQuery(req, {})));
        if ((deleted.deletedCount ?? deleted.n) !== 1) return res.status(409).json({ ok: false, response: "用户身份已变化，请刷新后重试" });
      }
      res.end(JSON.stringify({ ok: true }));
    } catch (remove_err) {
      console.error("remove user error! %s", remove_err);
      res.end(
        JSON.stringify({ ok: false, response: "删除用户出错:" + remove_err }),
      );
    }
  } else if (action === "modify") {
    var mod_data = req.body.data;
    try {
      const user = await User.findOne(legacyUserQuery(req, { userid: mod_data.userid })).exec();
      if (!user) {
        res.end(JSON.stringify({ ok: false, response: "用户未找到" }));
        return;
      }
      const profilePhone = mod_data.phone || "";
      if ((user.profile?.phone || "") !== profilePhone && hasProtectedIdentity(user)) {
        return res.status(403).json({ ok: false, response: "员工、管理员或薪资账号暂不支持直接修改登录手机号" });
      }
      const previousPrivilege = Array.isArray(user.privilege) ? user.privilege : migrateBinaryToArray(user.privilege);
      const nextPrivilege = Array.isArray(mod_data.privilege) ? mod_data.privilege : migrateBinaryToArray(mod_data.privilege);
      const privilegeChanged = JSON.stringify(previousPrivilege) !== JSON.stringify(nextPrivilege);
      if (privilegeChanged && hasProtectedIdentity(user) && String(user._id) !== String(req.user._id)) {
        return res.status(403).json({ ok: false, response: "不能通过通用用户管理变更受保护账号的系统权限" });
      }
      const identityChanged = (user.profile?.phone || "") !== profilePhone || privilegeChanged;
      const update = { $set: { title: mod_data.title, privilege: mod_data.privilege, 'profile.name': mod_data.name, 'profile.phone': profilePhone }, $inc: { securityIdentityVersion: 1 } };
      if (identityChanged) update.$inc.sessionVersion = 1;
      const write = await User.updateOne(identityVersionFilter(user, legacyUserQuery(req, {})), update);
      if ((write.modifiedCount ?? write.nModified) !== 1) return res.status(409).json({ ok: false, response: "用户身份已变化，请刷新后重试" });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.end(JSON.stringify({ ok: false, response: err.message }));
    }
  }
};

/**
 * POST /login/phone
 * 手机号登录（不需要公司编码）
 */
exports.postPhoneLogin = async function (req, res, next) {
  await body("phone").notEmpty().withMessage("手机号不能为空").run(req);
  await body("password").notEmpty().withMessage("密码不能为空").run(req);

  var errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.json({ ok: false, msg: errors.array()[0].msg });
  }

  console.log(
    "postPhoneLogin: calling passport.authenticate for",
    req.body.phone,
  );

  passport.authenticate("phone-local", function (err, user, info) {
    if (err) {
      console.error("postPhoneLogin: passport error", err);
      return next(err);
    }

    if (!user) {
      console.log("postPhoneLogin: user login failed", info);
      return res.json({ ok: false, msg: info.message });
    }

    req.logIn(user, function (err) {
      if (err) {
        console.error("postPhoneLogin: req.logIn error", err);
        return next(err);
      }

      console.log("postPhoneLogin: success for phone:", req.body.phone);
      udpateUserNo(user);

      req.session.save(async function (err) {
        if (err) console.error("Session save error:", err);

        // Build user response with role
        var userRole = user.role || "member";
        var userData = {
          id: user._id,
          userid: user.userid,
          name: user.profile.name,
          privilege: user.privilege,
          role: userRole,
          employeeNo: user.employeeNo || '',
          department: user.department || '',
          attendanceRoles: Array.isArray(user.attendanceRoles) ? user.attendanceRoles : [],
          payrollRoles: Array.isArray(user.payrollRoles) ? user.payrollRoles : [],
          mustChangePassword: user.mustChangePassword === true,
          preferences: user.preferences || {},
        };

        // Look up tenant for non-platform users
        var tenantData = null;
        if (userRole !== "platform" && user.tenantId) {
          try {
            var t = await Tenant.findById(user.tenantId).lean();
            if (t) {
              tenantData = {
                id: t._id,
                code: t.code,
                name: t.name,
                fullName: t.fullName || "",
                plan: t.plan,
                maxUsers: t.maxUsers,
                expireDate: t.expireDate || null,
                  billImportCarrierRule: getBillImportCarrierRule(t.settings || {}),
                  attendanceEnabled: t.settings?.attendanceEnabled === true,
                  sealEnabled: t.settings?.sealEnabled === true,
                  requireReceiptForSettle: t.settings?.requireReceiptForSettle === true,
                  drayageRate: Number(t.settings?.drayageRate) || 0,
              };
            }
          } catch (e) {
            console.error("Phone login tenant lookup error:", e);
          }
        }

        return res.json({
          ok: true,
          user: userData,
          tenant: tenantData,
          features: {
            attendance: isStandalone() ? secrets.enableAttendance === true : tenantData?.attendanceEnabled === true,
            seal: isStandalone() ? secrets.enableSeal === true : tenantData?.sealEnabled === true,
            selfVehicle: secrets.enableSelfVehicle,
            publicBasket: secrets.enablePublicBasket,
            requireReceiptForSettle: tenantData?.requireReceiptForSettle || false,
            drayageRate: tenantData?.drayageRate || 0,
          },
          deployMode: getDeployMode(),
          standaloneCompany: getStandaloneCompany(),
        });
      });
    });
  })(req, res, next);
};
