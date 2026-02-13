const Company = require('../../models/Company');
const { buildTenantQuery } = require('../../utils/tenant');

exports.getCompanies = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';

    const baseQuery = {};
    if (search) {
      baseQuery.name = { $regex: search, $options: 'i' };
    }

    const query = buildTenantQuery(req, baseQuery);

    const count = await Company.countDocuments(query);
    const companies = await Company.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ create_time: -1 })
      .select('name customers contact_name phone address')
      .lean();

    res.json({
      ok: true,
      data: companies,
      total: count,
      page: page,
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    console.error('getCompanies error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};
