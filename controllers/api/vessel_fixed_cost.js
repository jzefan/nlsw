const VehVesCost = require('../../models/VesselCost');
const utils = require('../../controllers/utils');
const { buildTenantQuery, injectTenantId } = require('../../utils/tenant');

/**
 * Get Vessel Fixed Cost list with filtering
 */
exports.getList = async function (req, res) {
  try {
    const { name, startDate, endDate, type } = req.query;
    const baseQuery = {};

    if (type) {
      baseQuery.vv_type = type; // 'che' or 'chuan'
    }

    if (name) {
      // Support multiple names if needed, but simple string for now
      baseQuery.name = name;
    }

    if (startDate && endDate) {
      baseQuery.month = { $gte: startDate, $lte: endDate };
    }

    const query = buildTenantQuery(req, baseQuery);
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
    const query = buildTenantQuery(req, { name, month });
    const item = await VehVesCost.findOne(query).lean().exec();
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
    const query = buildTenantQuery(req, { name: data.name, month: data.month });
    let item = await VehVesCost.findOne(query).exec();

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
      const newData = injectTenantId(req, data);
      item = new VehVesCost(newData);
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
    const query = buildTenantQuery(req, { name, month });
    await VehVesCost.deleteMany(query).exec();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};
