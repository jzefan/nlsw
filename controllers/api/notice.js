const Notice = require('../../models/Notice');

/**
 * 获取当前用户的站内通知列表
 * GET /notices?unreadOnly=true&page=1&limit=20
 */
exports.getNotices = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const query = {
      tenantId: req.tenantId,
      userId: req.user._id
    };

    if (req.query.unreadOnly === 'true' || req.query.unreadOnly === true) {
      query.readAt = null;
    }

    const [items, total, unreadCount] = await Promise.all([
      Notice.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notice.countDocuments(query),
      Notice.countDocuments({ tenantId: req.tenantId, userId: req.user._id, readAt: null })
    ]);

    return res.json({
      ok: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      unreadCount
    });
  } catch (error) {
    console.error('getNotices error:', error);
    return res.status(500).json({ ok: false, error: '获取通知列表失败' });
  }
};

/**
 * 获取当前用户未读通知数（高频轮询用）
 * GET /notices/unread-count
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Notice.countDocuments({
      tenantId: req.tenantId,
      userId: req.user._id,
      readAt: null
    });
    return res.json({ ok: true, count });
  } catch (error) {
    console.error('getUnreadCount error:', error);
    return res.status(500).json({ ok: false, error: '获取未读通知数失败' });
  }
};

/**
 * 标记单条通知为已读
 * POST /notices/:id/read
 */
exports.markAsRead = async (req, res) => {
  try {
    const notice = await Notice.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId, userId: req.user._id },
      { $set: { readAt: new Date() } },
      { new: true }
    );
    if (!notice) {
      return res.status(404).json({ ok: false, error: '通知不存在或无权操作' });
    }
    return res.json({ ok: true, data: notice });
  } catch (error) {
    console.error('markAsRead error:', error);
    return res.status(500).json({ ok: false, error: '标记已读失败' });
  }
};

/**
 * 标记所有通知为已读
 * POST /notices/read-all
 */
exports.markAllAsRead = async (req, res) => {
  try {
    await Notice.updateMany(
      { tenantId: req.tenantId, userId: req.user._id, readAt: null },
      { $set: { readAt: new Date() } }
    );
    return res.json({ ok: true, message: '已全部标记为已读' });
  } catch (error) {
    console.error('markAllAsRead error:', error);
    return res.status(500).json({ ok: false, error: '全部标记已读失败' });
  }
};
