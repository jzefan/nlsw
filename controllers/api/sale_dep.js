const SaleDep = require('../../models/SaleDep');

exports.getSaleDeps = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';

    const query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

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
