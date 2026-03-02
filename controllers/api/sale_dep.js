const SaleDep = require('../../models/SaleDep');
const { buildTenantQuery } = require('../../utils/tenant');

exports.getSaleDeps = async (req, res) => {
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
    const shouldSkipCount = skipCount || (search && limit <= 50);

    let count = 0;
    if (!shouldSkipCount) {
      count = await SaleDep.countDocuments(query);
    }

    const saleDeps = await SaleDep.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ name: 1 })
      .select('name')
      .lean();

    res.json({
      ok: true,
      data: saleDeps,
      total: shouldSkipCount ? -1 : count,
      page: page,
      totalPages: shouldSkipCount ? -1 : Math.ceil(count / limit)
    });
  } catch (error) {
    console.error('getSaleDeps error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};
