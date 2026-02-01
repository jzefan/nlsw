const User = require('../../models/User');

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
