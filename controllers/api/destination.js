const Destination = require('../../models/Destination');
const { buildTenantQuery } = require('../../utils/tenant');

// 快速搜索接口 - 使用聚合管道优化性能
exports.searchDestinations = async (req, res) => {
  try {
    const search = req.query.search || '';
    const limit = parseInt(req.query.limit) || 20;

    const pipeline = [];

    const matchStage = {};
    if (req.tenantId) {
      matchStage.tenantId = req.tenantId;
    }

    if (search) {
      matchStage.name = { $regex: `^${search}`, $options: 'i' };
    }

    pipeline.push({ $match: matchStage });
    pipeline.push({ $group: { _id: '$name' } });
    pipeline.push({ $sort: { _id: 1 } });
    pipeline.push({ $limit: limit });
    pipeline.push({ $project: { _id: 0, name: '$_id' } });

    const destinations = await Destination.aggregate(pipeline);

    res.json({
      ok: true,
      data: destinations
    });
  } catch (error) {
    console.error('searchDestinations error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

exports.getDestinations = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const skipCount = req.query.skipCount === 'true';

    const baseQuery = {};
    if (search) {
      baseQuery.name = { $regex: search, $options: 'i' };
    }

    const query = buildTenantQuery(req, baseQuery);

    // 对于搜索场景（如下拉列表），跳过耗时的 countDocuments 查询
    // 可通过 skipCount=true 参数显式跳过，或在搜索模式下自动跳过
    const shouldSkipCount = skipCount || (search && limit <= 50);

    let count = 0;
    if (!shouldSkipCount) {
      count = await Destination.countDocuments(query);
    }

    const destinations = await Destination.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ name: 1 })
      .select('name')
      .lean();

    res.json({
      ok: true,
      data: destinations,
      total: shouldSkipCount ? -1 : count,
      page: page,
      totalPages: shouldSkipCount ? -1 : Math.ceil(count / limit)
    });
  } catch (error) {
    console.error('getDestinations error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};
