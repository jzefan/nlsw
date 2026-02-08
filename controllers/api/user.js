const User = require('../../models/User');
const { getPublicKey } = require('../../utils/crypto');

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
      privilege: req.user.privilege || '00000000',
    };

    res.json({
      ok: true,
      user
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
    const users = await User.find({}).select('userid profile.name').lean().exec();
    res.json({ ok: true, data: users });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

// 获取用户管理列表 (需要管理员权限)
exports.getUserMgr = async (req, res) => {
  try {
    if (!req.user || req.user.privilege !== '11111111') {
      return res.status(403).json({ ok: false, message: '无权限访问' });
    }

    const users = await User.find({}).exec();
    const uData = users.map(u => ({
      userid: u.userid,
      name: u.profile?.name || '',
      title: u.title || '',
      phone: u.profile?.phone || '',
      privilege: u.privilege || ''
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
    if (!req.user || req.user.privilege !== '11111111') {
      return res.status(403).json({ ok: false, message: '无权限操作' });
    }

    const action = req.body.act;

    if (action === 'add') {
      const data = req.body.data;
      const users = await User.find({}).sort({ no: 'desc' }).exec();

      let maxNo = 1;
      if (users && users.length > 0 && users[0].no) {
        maxNo = users[0].no + 1;
      }

      const user = new User({
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
      res.json({ ok: true });

    } else if (action === 'delete') {
      const uid = req.body.userid;
      await User.deleteOne({ userid: uid });
      res.json({ ok: true });

    } else if (action === 'modify') {
      const modData = req.body.data;
      const user = await User.findOne({ userid: modData.userid }).exec();

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
    if (!req.user || req.user.privilege !== '11111111') {
      return res.status(403).json({ ok: false, message: '无权限操作' });
    }

    const user = await User.findOne({ userid: req.body.user.userid });
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
