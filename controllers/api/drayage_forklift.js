const DrayageForklift = require('../../models/DrayageForklift');
const { buildTenantQuery, injectTenantId } = require('../../utils/tenant');

/**
 * Get all Drayage Forklift records
 */
exports.getList = async function (req, res) {
  try {
    const query = buildTenantQuery(req, {});
    const list = await DrayageForklift.find(query).sort({ month: 'desc' }).lean().exec();
    res.json({ ok: true, data: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

/**
 * Get one record by month
 */
exports.getByMonth = async function (req, res) {
  try {
    const { month } = req.params;
    const query = buildTenantQuery(req, { month });
    const item = await DrayageForklift.findOne(query).lean().exec();
    if (item) {
      res.json({ ok: true, data: item });
    } else {
      res.json({ ok: false, message: 'Record not found' });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

/**
 * Create or Update record
 */
exports.upsert = async function (req, res) {
  try {
    const { month, drayage, forklift } = req.body;
    const query = buildTenantQuery(req, { month });
    let item = await DrayageForklift.findOne(query).exec();

    if (item) {
      item.drayage = drayage;
      item.forklift = forklift;
    } else {
      const data = injectTenantId(req, {
        month,
        drayage,
        forklift
      });
      item = new DrayageForklift(data);
    }

    await item.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

/**
 * Delete record
 */
exports.delete = async function (req, res) {
  try {
    const { month } = req.params;
    const query = buildTenantQuery(req, { month });
    await DrayageForklift.deleteMany(query).exec();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};
