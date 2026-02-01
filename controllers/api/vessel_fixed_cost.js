const VehVesCost = require('../../models/VesselCost');
const utils = require('../../controllers/utils');

/**
 * Get Vessel Fixed Cost list with filtering
 */
exports.getList = async function (req, res) {
  try {
    const { name, startDate, endDate, type } = req.query;
    const query = {};

    if (type) {
      query.vv_type = type; // 'che' or 'chuan'
    }

    if (name) {
      // Support multiple names if needed, but simple string for now
      query.name = name; 
    }

    if (startDate && endDate) {
      query.month = { $gte: startDate, $lte: endDate };
    }

    const list = await VehVesCost.find(query).sort({ month: 'desc' }).lean().exec();
    res.json({ ok: true, data: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

/**
 * Get one record
 */
exports.getOne = async function (req, res) {
  try {
    const { name, month } = req.query;
    if (!name || !month) {
      return res.status(400).json({ ok: false, message: 'Name and month are required' });
    }
    const item = await VehVesCost.findOne({ name, month }).lean().exec();
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
    const data = req.body;
    let item = await VehVesCost.findOne({ name: data.name, month: data.month }).exec();
    
    if (item) {
      // Update fields
      item.ic = data.ic;
      item.hc = data.hc;
      item.pcc = data.pcc;
      item.aux = data.aux;
      item.fittings = data.fittings;
      item.repair = data.repair;
      item.annual_survey = data.annual_survey;
      item.salary = data.salary;
      item.oil = data.oil;
      item.toll = data.toll;
      item.fine = data.fine;
      item.other = data.other;
      item.total = data.total;
      item.vv_type = data.vv_type;
    } else {
      item = new VehVesCost(data);
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
    const { name, month } = req.body;
    if (!name || !month) {
      return res.status(400).json({ ok: false, message: 'Name and month are required' });
    }
    await VehVesCost.deleteMany({ name, month }).exec();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};
