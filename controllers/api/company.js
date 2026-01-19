const Company = require('../../models/Company');

exports.getCompanies = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';

    const query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const count = await Company.countDocuments(query);
    const companies = await Company.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ name: 1 })
      .select('name') // Only select the name field
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
