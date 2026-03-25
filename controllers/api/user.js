const User = require('../../models/User');
const Tenant = require('../../models/Tenant');
const { getPublicKey } = require('../../utils/crypto');
const { isAdmin } = require('../../utils/permissions');
const { buildTenantQuery, isPlatformUser, isOwner } = require('../../utils/tenant');
const { isStandalone, getDeployMode, getStandaloneCompany } = require('../../utils/deploy-mode');
const { migrateBinaryToArray } = require('../../utils/privilege-migration');
const secrets = require('../../config/secrets');

// 是否有用户管理权限：平台用户、公司主账号、或 admin 权限
function canManageUsers(req) {
  if (!req.user) return false;
  return isPlatformUser(req) || isOwner(req) || isAdmin(req.user.privilege);
}

// 获取 RSA 公钥 (用于密码加密传输)
exports.getPublicKey = (req, res) => {
  try {
    const publicKey = getPublicKey();
    res.json({
      ok: true,
      publicKey
    });
  } catch (error) {
    console.error('获取公钥失败:', error);
    res.status(500).json({
      ok: false,
      message: '获取公钥失败'
    });
  }
};

exports.getMe = async (req, res) => {
  try {
    // 检查用户是否已登录
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        message: '未登录'
      });
    }

    // 返回当前用户信息
    // 如果 privilege 不是数组格式，进行迁移转换（兼容旧数据）
    const privilege = Array.isArray(req.user.privilege)
      ? req.user.privilege
      : migrateBinaryToArray(req.user.privilege);

    const user = {
      userid: req.user.userid,
      name: req.user.profile?.name || '',
      email: req.user.email || '',
      title: req.user.title || '',
      phone: req.user.profile?.phone || '',
      privilege,
      role: req.user.role || 'member',
      preferences: req.user.preferences || {},
    };

    // 租户上下文 (平台用户返回 null)
    const tenant = req.isPlatformUser ? null : (
      req.tenant ? {
        id: req.tenant._id,
        code: req.tenant.code,
        name: req.tenant.name,
        fullName: req.tenant.fullName || '',
        plan: req.tenant.plan,
        maxUsers: req.tenant.maxUsers,
        expireDate: req.tenant.expireDate || null
      } : null
    );

    res.json({
      ok: true,
      user,
      tenant,
      deployMode: getDeployMode(),
      standaloneCompany: getStandaloneCompany(),
      features: {
        selfVehicle: secrets.enableSelfVehicle,
        publicBasket: secrets.enablePublicBasket,
        requireReceiptForSettle: req.tenant?.settings?.requireReceiptForSettle || false,
        drayageRate: req.tenant?.settings?.drayageRate || 0,
      }
    });
  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.status(500).json({
      ok: false,
      message: '获取用户信息失败',
      error: error.message
    });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const query = buildTenantQuery(req, { role: { $ne: 'platform' } });
    const users = await User.find(query).select('userid profile.name role').lean().exec();
    const names = users
      .map(u => u.profile?.name || u.userid)
      .filter(Boolean);
    res.json({ ok: true, data: names });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

// 获取用户管理列表 (需要管理权限)
exports.getUserMgr = async (req, res) => {
  try {
    if (!canManageUsers(req)) {
      return res.status(403).json({ ok: false, message: '无权限访问' });
    }

    const query = buildTenantQuery(req, {});
    // 独立部署：始终隐藏 saas-admin；SaaS 模式：仅平台用户可见 saas-admin
    const hideSaasAdmin = isStandalone() || !isPlatformUser(req);
    if (hideSaasAdmin) {
      query.userid = { ...query.userid, $ne: 'saas-admin' };
    }
    const users = await User.find(query).exec();
    const uData = users.map(u => ({
      userid: u.userid,
      name: u.profile?.name || '',
      title: u.title || '',
      phone: u.profile?.phone || '',
      privilege: Array.isArray(u.privilege) ? u.privilege : migrateBinaryToArray(u.privilege),
      role: u.role || 'member',
    }));

    res.json({ ok: true, data: uData });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
};

// 用户管理操作 (添加/修改/删除)
exports.postUserMgr = async (req, res) => {
  try {
    if (!canManageUsers(req)) {
      return res.status(403).json({ ok: false, message: '无权限操作' });
    }

    const action = req.body.act;
    const tenantQuery = buildTenantQuery(req, {});

    if (action === 'add') {
      const data = req.body.data;
      const users = await User.find(tenantQuery).sort({ no: 'desc' }).exec();

      let maxNo = 1;
      if (users && users.length > 0 && users[0].no) {
        maxNo = users[0].no + 1;
      }

      const userData = {
        userid: data.userid,
        password: '123456',
        no: maxNo,
        title: data.title,
        privilege: data.privilege,
        role: 'member',
      };

      // 注入租户信息（非平台用户自动绑定当前租户）
      if (!isPlatformUser(req) && req.tenantId) {
        userData.tenantId = req.tenantId;
        userData.tenantCode = req.tenantCode;
      }

      const user = new User(userData);
      user.profile.name = data.name;
      user.profile.gender = '';
      user.profile.location = '';
      user.profile.phone = data.phone;
      user.phone = data.phone ? data.phone.trim() : undefined;

      await user.save();
      res.json({ ok: true });

    } else if (action === 'delete') {
      const uid = req.body.userid;
      await User.deleteOne({ ...tenantQuery, userid: uid });
      res.json({ ok: true });

    } else if (action === 'modify') {
      const modData = req.body.data;
      const user = await User.findOne({ ...tenantQuery, userid: modData.userid }).exec();

      if (!user) {
        return res.json({ ok: false, message: '用户未找到' });
      }

      user.title = modData.title;
      user.privilege = modData.privilege;
      user.profile.name = modData.name;
      user.profile.phone = modData.phone;
      user.phone = modData.phone ? modData.phone.trim() : undefined;

      await user.save();
      res.json({ ok: true });

    } else {
      res.json({ ok: false, message: '未知操作' });
    }
  } catch (error) {
    console.error('用户管理操作失败:', error);
    res.json({ ok: false, message: error.message });
  }
};

// 更新用户界面偏好
const VALID_THEMES = ['zinc', 'red', 'rose', 'orange', 'green', 'blue', 'yellow', 'violet'];
const VALID_RADII = [0, 0.25, 0.5, 0.75, 1];
const VALID_LAYOUTS = ['full', 'centered'];

exports.updatePreferences = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ ok: false, message: '未登录' });
    }

    const { theme, radius, contentLayout } = req.body;
    const update = {};

    if (theme !== undefined) {
      if (theme !== '' && !VALID_THEMES.includes(theme)) {
        return res.status(400).json({ ok: false, message: '无效的主题' });
      }
      update['preferences.theme'] = theme;
    }

    if (radius !== undefined) {
      if (radius !== -1 && !VALID_RADII.includes(radius)) {
        return res.status(400).json({ ok: false, message: '无效的圆角值' });
      }
      update['preferences.radius'] = radius;
    }

    if (contentLayout !== undefined) {
      if (contentLayout !== '' && !VALID_LAYOUTS.includes(contentLayout)) {
        return res.status(400).json({ ok: false, message: '无效的布局' });
      }
      update['preferences.contentLayout'] = contentLayout;
    }

    if (Object.keys(update).length === 0) {
      return res.json({ ok: true });
    }

    await User.updateOne({ _id: req.user._id }, { $set: update });
    res.json({ ok: true });
  } catch (error) {
    console.error('更新用户偏好失败:', error);
    res.status(500).json({ ok: false, message: '更新偏好失败' });
  }
};

// 重置密码
exports.resetPassword = async (req, res) => {
  try {
    if (!canManageUsers(req)) {
      return res.status(403).json({ ok: false, message: '无权限操作' });
    }

    const tenantQuery = buildTenantQuery(req, {});
    const user = await User.findOne({ ...tenantQuery, userid: req.body.user.userid });
    if (!user) {
      return res.json({ ok: false, message: '用户未找到' });
    }

    user.password = '123456';
    await user.save();

    res.json({ ok: true, message: '密码重置成功!' });
  } catch (error) {
    console.error('重置密码失败:', error);
    res.json({ ok: false, message: error.message });
  }
};

// 获取租户设置
exports.getTenantSettings = async (req, res) => {
  try {
    if (!isOwner(req) && !isPlatformUser(req)) {
      return res.status(403).json({ ok: false, message: '无权限操作' });
    }
    const tenant = await Tenant.findById(req.tenantId).lean();
    if (!tenant) {
      return res.json({ ok: false, message: '租户不存在' });
    }
    res.json({ ok: true, settings: tenant.settings || {} });
  } catch (error) {
    console.error('获取租户设置失败:', error);
    res.json({ ok: false, message: error.message });
  }
};

// 更新租户设置
exports.updateTenantSettings = async (req, res) => {
  try {
    if (!isOwner(req) && !isPlatformUser(req)) {
      return res.status(403).json({ ok: false, message: '无权限操作' });
    }
    const { drayageRate, ownVehicleDeductPayable } = req.body;
    const update = {};
    if (drayageRate !== undefined) {
      update['settings.drayageRate'] = Math.max(0, Number(drayageRate) || 0);
    }
    if (ownVehicleDeductPayable !== undefined) {
      update['settings.ownVehicleDeductPayable'] = !!ownVehicleDeductPayable;
    }
    await Tenant.findByIdAndUpdate(req.tenantId, { $set: update });
    res.json({ ok: true, message: '设置已保存' });
  } catch (error) {
    console.error('更新租户设置失败:', error);
    res.json({ ok: false, message: error.message });
  }
};
