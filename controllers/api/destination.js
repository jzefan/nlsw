const Destination = require('../../models/Destination');

exports.getDestinations = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';

    const query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const count = await Destination.countDocuments(query);
    const destinations = await Destination.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ name: 1 })
      .select('name')
      .lean();

    res.json({
      ok: true,
      data: destinations,
      total: count,
      page: page,
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    console.error('getDestinations error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};
