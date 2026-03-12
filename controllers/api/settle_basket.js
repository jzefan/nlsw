const SettleBasket = require('../../models/SettleBasket');
const { buildTenantQuery, injectTenantId } = require('../../utils/tenant');

// GET /settle/basket?type=vessel|bill
exports.getBasket = async (req, res) => {
  try {
    const { type } = req.query;
    if (!type || !['vessel', 'bill'].includes(type)) {
      return res.json({ ok: false, message: '无效的篮类型' });
    }

    const query = buildTenantQuery(req, { userId: req.user.userid, basketType: type });
    const basket = await SettleBasket.findOne(query).lean();

    res.json({
      ok: true,
      data: basket
        ? { items: basket.items, isPublic: !!basket.isPublic }
        : { items: [], isPublic: false },
    });
  } catch (error) {
    console.error('获取结算篮失败:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
};

// POST /settle/basket  body: { type, items, isPublic }
exports.saveBasket = async (req, res) => {
  try {
    const { type, items, isPublic } = req.body;
    if (!type || !['vessel', 'bill'].includes(type)) {
      return res.json({ ok: false, message: '无效的篮类型' });
    }

    const filter = buildTenantQuery(req, { userId: req.user.userid, basketType: type });
    const update = injectTenantId(req, {
      userId: req.user.userid,
      basketType: type,
      items: items || [],
      isPublic: !!isPublic,
      updatedAt: new Date(),
    });

    await SettleBasket.findOneAndUpdate(filter, { $set: update }, { upsert: true });

    res.json({ ok: true });
  } catch (error) {
    console.error('保存结算篮失败:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
};

// GET /settle/basket/public?type=vessel|bill  获取租户内所有公开的结算篮
exports.getPublicBaskets = async (req, res) => {
  try {
    const { type } = req.query;
    if (!type || !['vessel', 'bill'].includes(type)) {
      return res.json({ ok: false, message: '无效的篮类型' });
    }

    const query = buildTenantQuery(req, {
      basketType: type,
      isPublic: true,
      userId: { $ne: req.user.userid },
    });
    const baskets = await SettleBasket.find(query).lean();

    // 合并所有公开篮的 items，附带 userId
    const allItems = [];
    for (const basket of baskets) {
      for (const item of (basket.items || [])) {
        allItems.push({ ...item, _basketOwner: basket.userId });
      }
    }

    res.json({
      ok: true,
      data: {
        items: allItems,
        baskets: baskets.map(b => ({
          userId: b.userId,
          count: (b.items || []).length,
          updatedAt: b.updatedAt,
        })),
      },
    });
  } catch (error) {
    console.error('获取公开结算篮失败:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
};

// GET /settle/basket/shared?type=vessel|bill (保留兼容)
exports.getSharedBasket = async (req, res) => {
  try {
    const { type } = req.query;
    if (!type || !['vessel', 'bill'].includes(type)) {
      return res.json({ ok: false, message: '无效的篮类型' });
    }

    const query = buildTenantQuery(req, { userId: '_shared_', basketType: type });
    const basket = await SettleBasket.findOne(query).lean();

    res.json({
      ok: true,
      data: basket ? { items: basket.items } : { items: [] },
    });
  } catch (error) {
    console.error('获取共享结算篮失败:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
};

// POST /settle/basket/shared  body: { type, items } (保留兼容)
exports.saveSharedBasket = async (req, res) => {
  try {
    const { type, items } = req.body;
    if (!type || !['vessel', 'bill'].includes(type)) {
      return res.json({ ok: false, message: '无效的篮类型' });
    }

    const filter = buildTenantQuery(req, { userId: '_shared_', basketType: type });
    const update = injectTenantId(req, {
      userId: '_shared_',
      basketType: type,
      items: items || [],
      updatedAt: new Date(),
    });

    await SettleBasket.findOneAndUpdate(filter, { $set: update }, { upsert: true });

    res.json({ ok: true });
  } catch (error) {
    console.error('保存共享结算篮失败:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
};
