const OrderPlan = require('../../models/OrderPlan');
const utils = require('../../controllers/utils');

exports.getPlans = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    // Filters
    const query = {};
    if (req.query.orderNo) {
      query.order_no = { $regex: req.query.orderNo, $options: 'i' };
    }
    if (req.query.customerName) {
      query.customer_name = req.query.customerName;
    }
    if (req.query.transportMode) {
      query.transport_mode = req.query.transportMode;
    }
    if (req.query.status) {
      query.status = (req.query.status === '生效') ? 0 : 1;
    }
    if (req.query.startDate && req.query.endDate) {
      const start = new Date(req.query.startDate);
      const end = new Date(req.query.endDate);
      // Adjust end date to end of day if it's just a date string
      end.setHours(23, 59, 59, 999);
      query.entry_time = { $gte: start, $lte: end };
    }

    const count = await OrderPlan.countDocuments(query);
    
    // Aggregation for summary stats (total weight, left weight) based on *filtered* query
    // Note: This might be expensive on large datasets, but essential for the requested summary features.
    const stats = await OrderPlan.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalWeight: { $sum: "$order_weight" },
          leftWeight: { $sum: "$left_weight" }
        }
      }
    ]);

    const totalWeight = stats.length > 0 ? stats[0].totalWeight : 0;
    const leftWeight = stats.length > 0 ? stats[0].leftWeight : 0;
    const sentWeight = totalWeight - leftWeight;

    const plans = await OrderPlan.find(query)
      .sort({ order_no: -1 }) // Default sort
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
