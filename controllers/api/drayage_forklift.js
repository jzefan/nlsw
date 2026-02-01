const DrayageForklift = require('../../models/DrayageForklift');

/**
 * Get all Drayage Forklift records
 */
exports.getList = async function (req, res) {
  try {
    const list = await DrayageForklift.find({}).sort({ month: 'desc' }).lean().exec();
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
    const item = await DrayageForklift.findOne({ month }).lean().exec();
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
    let item = await DrayageForklift.findOne({ month }).exec();
    
    if (item) {
      item.drayage = drayage;
      item.forklift = forklift;
    } else {
      item = new DrayageForklift({
        month,
        drayage,
        forklift
      });
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
    await DrayageForklift.deleteMany({ month }).exec();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};
