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
    const createdBy = req.user ? (req.user.profile?.name || req.user.userid) : 'unknown';

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
 * 查询批次列表（按 batchId 分组聚合）
 * GET /data-process/shipment/batches
 * Query: productType, page, limit
 */
exports.getShipmentBatches = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const matchStage = buildTenantQuery(req, {});
    if (req.query.productType) {
      matchStage.productType = req.query.productType;
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$batchId',
          productType: { $first: '$productType' },
          createdBy: { $first: '$createdBy' },
          createdAt: { $first: '$createdAt' },
          rowCount: { $sum: 1 },
          totalWeight: { $sum: '$weight' },
          loadingListNos: { $addToSet: '$loadingListNo' },
          vehicleNos: { $addToSet: '$vehicleNo' },
          loadingVehiclePairs: {
            $addToSet: {
              $cond: [
                { $or: [{ $ne: ['$loadingListNo', ''] }, { $ne: ['$vehicleNo', ''] }] },
                { $concat: [{ $ifNull: ['$loadingListNo', ''] }, '/', { $ifNull: ['$vehicleNo', ''] }] },
                null,
              ],
            },
          },
        },
      },
      { $sort: { createdAt: -1 } },
    ];

    // Get total count
    const countResult = await ShipmentDetail.aggregate([...pipeline, { $count: 'total' }]);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    // Get paginated results
    const items = await ShipmentDetail.aggregate([
      ...pipeline,
      { $skip: (page - 1) * limit },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          batchId: '$_id',
          productType: 1,
          createdBy: 1,
          createdAt: 1,
          rowCount: 1,
          totalWeight: 1,
          loadingListNos: {
            $filter: { input: '$loadingListNos', as: 'v', cond: { $ne: ['$$v', ''] } },
          },
          vehicleNos: {
            $filter: { input: '$vehicleNos', as: 'v', cond: { $ne: ['$$v', ''] } },
          },
          loadingVehiclePairs: {
            $filter: { input: '$loadingVehiclePairs', as: 'v', cond: { $ne: ['$$v', null] } },
          },
        },
      },
    ]);

    res.json({
      ok: true,
      data: items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('getShipmentBatches error:', error);
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

/**
 * 删除整个批次
 * POST /data-process/shipment/delete-batch
 * Body: { batchId }
 */
exports.deleteShipmentBatch = async (req, res) => {
  try {
    const { batchId } = req.body;
    if (!batchId) {
      return res.status(400).json({ ok: false, error: '缺少 batchId' });
    }

    const query = buildTenantQuery(req, { batchId });
    const result = await ShipmentDetail.deleteMany(query);

    res.json({ ok: true, data: { deletedCount: result.deletedCount } });
  } catch (error) {
    console.error('deleteShipmentBatch error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * 更新单条发运明细
 * POST /data-process/shipment/update
 * Body: { id, updates: { vehicleNo, contractNo, ... } }
 */
exports.updateShipmentDetail = async (req, res) => {
  try {
    const { id, updates } = req.body;
    if (!id || !updates) {
      return res.status(400).json({ ok: false, error: '缺少 id 或 updates' });
    }

    // Only allow updating specific fields
    const allowedFields = [
      'vehicleNo', 'contractNo', 'bundleNo', 'orderNo', 'orderItemNo',
      'quantity', 'weight', 'thickness', 'width', 'length',
      'brandNo', 'fixedLength', 'customerName', 'loadingListNo',
    ];
    const safeUpdates = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        safeUpdates[key] = updates[key];
      }
    }

    const query = buildTenantQuery(req, { _id: id });
    const doc = await ShipmentDetail.findOneAndUpdate(query, { $set: safeUpdates }, { new: true }).lean();

    if (!doc) {
      return res.status(404).json({ ok: false, error: '记录不存在' });
    }

    res.json({ ok: true, data: doc });
  } catch (error) {
    console.error('updateShipmentDetail error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};
