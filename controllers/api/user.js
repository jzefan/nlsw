const User = require('../../models/User');
const { getPublicKey } = require('../../utils/crypto');
const { isAdmin } = require('../../utils/permissions');
const { buildTenantQuery, isPlatformUser, isOwner } = require('../../utils/tenant');

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
    const user = {
      userid: req.user.userid,
      name: req.user.profile?.name || '',
      email: req.user.email || '',
      title: req.user.title || '',
      phone: req.user.profile?.phone || '',
      privilege: Array.isArray(req.user.privilege) ? req.user.privilege : [],
      role: req.user.role || 'member',
    };

    // 租户上下文 (平台用户返回 null)
    const tenant = req.isPlatformUser ? null : (
      req.tenant ? {
        id: req.tenant._id,
        code: req.tenant.code,
        name: req.tenant.name,
        fullName: req.tenant.fullName || '',
        plan: req.tenant.plan,
        maxUsers: req.tenant.maxUsers
      } : null
    );

    res.json({
      ok: true,
      user,
      tenant
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
    const query = buildTenantQuery(req, {});
    const users = await User.find(query).select('userid profile.name').lean().exec();
    res.json({ ok: true, data: users });
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
    const users = await User.find(query).exec();
    const uData = users.map(u => ({
      userid: u.userid,
      name: u.profile?.name || '',
      title: u.title || '',
      phone: u.profile?.phone || '',
      privilege: Array.isArray(u.privilege) ? u.privilege : [],
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
