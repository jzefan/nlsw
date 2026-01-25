exports.getMe = (req, res) => {
  if (req.isAuthenticated()) {
    return res.json({
      ok: true,
      user: {
        userid: req.user.userid,
        name: req.user.profile.name,
        title: req.user.title,
        privilege: req.user.privilege
      }
    });
  }
  res.status(401).json({ ok: false, msg: 'Not authenticated' });
};
