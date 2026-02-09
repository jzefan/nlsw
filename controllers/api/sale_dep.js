const SaleDep = require('../../models/SaleDep');
const { buildTenantQuery } = require('../../utils/tenant');

exports.getSaleDeps = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';

    const baseQuery = {};
    if (search) {
      baseQuery.name = { $regex: search, $options: 'i' };
    }

    const query = buildTenantQuery(req, baseQuery);

    const count = await SaleDep.countDocuments(query);
    const saleDeps = await SaleDep.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ name: 1 })
      .select('name')
      .lean();

    res.json({
      ok: true,
      data: saleDeps,
      total: count,
      page: page,
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    console.error('getSaleDeps error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};
