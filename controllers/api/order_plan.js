const OrderPlan = require('../../models/OrderPlan');
const utils = require('../../controllers/utils');
const { buildTenantQuery, isPlatformUser } = require('../../utils/tenant');

exports.getPlanByOrderNo = async (req, res) => {
  try {
    const { orderNo } = req.params;
    if (!orderNo) {
      return res.json({ ok: true, data: null });
    }
    const query = buildTenantQuery(req, { order_no: orderNo });
    const plan = await OrderPlan.findOne(query).select('order_no order_weight left_weight').lean();
    res.json({ ok: true, data: plan });
  } catch (error) {
    console.error('getPlanByOrderNo error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

exports.getPlans = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    // Filters
    const baseQuery = {};
    if (req.query.orderNo) {
      baseQuery.order_no = { $regex: req.query.orderNo, $options: 'i' };
    }
    if (req.query.customerName) {
      baseQuery.customer_name = req.query.customerName;
    }
    if (req.query.transportMode) {
      baseQuery.transport_mode = req.query.transportMode;
    }
    if (req.query.status) {
      baseQuery.status = (req.query.status === '生效') ? 0 : 1;
    }
    if (req.query.startDate && req.query.endDate) {
      const start = utils.parseLocalDate(req.query.startDate);
      const end = utils.parseLocalDate(req.query.endDate);
      // Adjust end date to end of day if it's just a date string
      end.setHours(23, 59, 59, 999);
      baseQuery.entry_time = { $gte: start, $lte: end };
    }

    const query = buildTenantQuery(req, baseQuery);

    const count = await OrderPlan.countDocuments(query);

    // Aggregation for summary stats (total weight, left weight) based on *filtered* query
    // CRITICAL: Add tenant filter as first stage to prevent cross-tenant data leakage
    const pipeline = [];
    if (!isPlatformUser(req)) {
      pipeline.push({ $match: { tenantId: req.tenantId } });
    }
    pipeline.push(
      { $match: baseQuery },
      {
        $group: {
          _id: null,
          totalWeight: { $sum: "$order_weight" },
          leftWeight: { $sum: "$left_weight" }
        }
      }
    );

    const stats = await OrderPlan.aggregate(pipeline);

    const totalWeight = stats.length > 0 ? stats[0].totalWeight : 0;
    const leftWeight = stats.length > 0 ? stats[0].leftWeight : 0;
    const sentWeight = totalWeight - leftWeight;

    const plans = await OrderPlan.find(query)
      .sort({ entry_time: -1 }) // 按录入时间降序
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      ok: true,
      data: plans,
      total: count,
      page: page,
      totalPages: Math.ceil(count / limit),
      summary: {
        totalWeight,
        leftWeight,
        sentWeight
      }
    });
  } catch (error) {
    console.error('getPlans error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};
