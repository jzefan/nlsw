const mongoose = require('mongoose');
const ShipmentDetail = require('../../models/ShipmentDetail');
const { buildTenantQuery, injectTenantId } = require('../../utils/tenant');

/**
 * 批量保存发运明细
 * POST /data-process/shipment/save
 * Body: { productType, rows: [...] }
 */
exports.saveShipmentDetail = async (req, res) => {
  try {
    const { productType, rows } = req.body;

    if (!productType || !rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ ok: false, error: '参数不完整：需要 productType 和 rows' });
    }

    if (!['round-steel', 'plate'].includes(productType)) {
      return res.status(400).json({ ok: false, error: 'productType 必须为 round-steel 或 plate' });
    }

    const batchId = new mongoose.Types.ObjectId().toString();
    const createdBy = req.user ? req.user.username : 'unknown';

    const docs = rows.map(row => injectTenantId(req, {
      batchId,
      productType,
      bundleNo: row.bundleNo || '',
      orderNo: row.orderNo || '',
      orderItemNo: row.orderItemNo || '',
      quantity: row.quantity || 0,
      weight: row.weight || 0,
      thickness: row.thickness || 0,
      width: row.width || 0,
      length: row.length || 0,
      brandNo: row.brandNo || '',
      fixedLength: row.fixedLength || 0,
      customerName: row.customerName || '',
      loadingListNo: row.loadingListNo || '',
      vehicleNo: row.vehicleNo || '',
      contractNo: row.contractNo || '',
      createdBy,
    }));

    await ShipmentDetail.insertMany(docs);

    res.json({
      ok: true,
      data: { batchId, count: docs.length }
    });
  } catch (error) {
    console.error('saveShipmentDetail error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * 查询发运明细
 * GET /data-process/shipment/list
 * Query: batchId, loadingListNo, orderNo, productType, page, limit
 */
exports.getShipmentDetails = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const baseQuery = {};

    if (req.query.batchId) {
      baseQuery.batchId = req.query.batchId;
    }
    if (req.query.loadingListNo) {
      baseQuery.loadingListNo = { $regex: req.query.loadingListNo, $options: 'i' };
    }
    if (req.query.orderNo) {
      baseQuery.orderNo = { $regex: req.query.orderNo, $options: 'i' };
    }
    if (req.query.productType) {
      baseQuery.productType = req.query.productType;
    }

    const query = buildTenantQuery(req, baseQuery);

    const count = await ShipmentDetail.countDocuments(query);
    const items = await ShipmentDetail.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      ok: true,
      data: items,
      total: count,
      page,
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    console.error('getShipmentDetails error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};
