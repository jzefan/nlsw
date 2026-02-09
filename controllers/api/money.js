const Settle = require('../../models/Settle');
const { buildTenantQuery } = require('../../utils/tenant');

/**
 * 获取回款列表
 * GET /api/money/list
 */
exports.getMoneyList = async (req, res) => {
  try {
    const { display_mode, selfOwned } = req.query;

    let status_list = [];
    if (display_mode === 'ticket') {
      status_list = ['已开票'];
    } else if (display_mode === 'money') {
      status_list = ['已回款'];
    }

    // 构建查询条件
    let baseQuery = {
      status: { $in: status_list }
    };

    // 只有当selfOwned为'1'或1时，才作为查询条件
    if (selfOwned === '1' || selfOwned === 1) {
      baseQuery.selfOwned = 1;
    }

    const query = buildTenantQuery(req, baseQuery);
    const settles = await Settle.find(query, { bills: 0 })
      .sort({ settle_date: -1 })
      .lean()
      .exec();

    res.json({ ok: true, settles });
  } catch (error) {
    console.error('getMoneyList error:', error);
    res.json({ ok: false, message: '获取回款列表失败: ' + error.message });
  }
};

/**
 * 更新回款状态（回款或回款取消）
 * POST /api/money/update
 */
exports.updateMoney = async (req, res) => {
  try {
    const settles = req.body;

    if (!Array.isArray(settles) || settles.length === 0) {
      return res.json({ ok: false, message: '无效的请求数据' });
    }

    for (const settle of settles) {
      const query = buildTenantQuery(req, { _id: settle._id });
      const dbSettle = await Settle.findOne(query).exec();
      if (dbSettle) {
        dbSettle.status = settle.status;
        dbSettle.return_money_date = settle.return_money_date;
        dbSettle.return_person = settle.return_person;
        await dbSettle.save();
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('updateMoney error:', error);
    res.json({ ok: false, message: '更新回款状态失败: ' + error.message });
  }
};

/**
 * 更新实收价格
 * POST /api/money/real-price
 */
exports.updateRealPrice = async (req, res) => {
  try {
    const { sno, price } = req.body;

    if (!sno || !price) {
      return res.json({ ok: false, message: '缺少必要参数' });
    }

    const query = buildTenantQuery(req, { serial_number: sno });
    const settle = await Settle.findOne(query).exec();
    if (!settle) {
      return res.json({ ok: false, message: '未找到结算记录或无权限' });
    }

    settle.real_price = parseFloat(price);
    await settle.save();

    res.json({ ok: true });
  } catch (error) {
    console.error('updateRealPrice error:', error);
    res.json({ ok: false, message: '更新实收价格失败: ' + error.message });
  }
};
