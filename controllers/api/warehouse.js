const Warehouse = require('../../models/Warehouse');

exports.getWarehouses = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';

    const query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const count = await Warehouse.countDocuments(query);
    const warehouses = await Warehouse.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ name: 1 })
      .select('name')
      .lean();

    res.json({
      ok: true,
      data: warehouses,
      total: count,
      page: page,
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    console.error('getWarehouses error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};
