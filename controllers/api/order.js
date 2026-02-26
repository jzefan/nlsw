const mongoose = require('mongoose');
const Order = require('../../models/Order');
const Tenant = require('../../models/Tenant');

const VALID_STATUSES = ['pending', 'paid', 'cancelled', 'refunded'];
const VALID_PLANS = ['basic', 'enterprise'];

function isValidObjectId(id) {
  return typeof id === 'string' && mongoose.Types.ObjectId.isValid(id);
}

/**
 * Generate order number: ORD-YYYYMMDD-XXXX
 * Retries on duplicate key conflict (race condition safe).
 */
async function generateOrderNo(retries = 3) {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `ORD-${dateStr}-`;

  const lastOrder = await Order.findOne({ orderNo: { $regex: `^${prefix}` } })
    .sort({ orderNo: -1 })
    .lean();

  let seq = 1;
  if (lastOrder) {
    const lastSeq = parseInt(lastOrder.orderNo.slice(-4), 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/**
 * Sync tenant subscription: find latest paid order's endDate -> update tenant.expireDate.
 * Uses $unset when no paid orders exist to properly clear the field.
 */
async function syncTenantSubscription(tenantId) {
  const latestPaid = await Order.findOne({ tenantId, status: 'paid' })
    .sort({ endDate: -1 })
    .lean();

  if (latestPaid?.endDate) {
    await Tenant.findByIdAndUpdate(tenantId, { $set: { expireDate: latestPaid.endDate } });
  } else {
    await Tenant.findByIdAndUpdate(tenantId, { $unset: { expireDate: 1 } });
  }
}

/**
 * GET /platform/orders
 * List orders with pagination + optional filters
 */
exports.getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.tenantId) {
      if (!isValidObjectId(req.query.tenantId)) {
        return res.status(400).json({ ok: false, msg: '无效的公司ID' });
      }
      query.tenantId = req.query.tenantId;
    }
    if (req.query.status) {
      if (!VALID_STATUSES.includes(req.query.status)) {
        return res.status(400).json({ ok: false, msg: '无效的订单状态' });
      }
      query.status = req.query.status;
    }

    const [data, total] = await Promise.all([
      Order.find(query)
        .sort({ createDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(query),
    ]);

    // Enrich with tenant names
    const tenantIds = [...new Set(data.map(o => o.tenantId?.toString()).filter(Boolean))];
    const tenants = await Tenant.find({ _id: { $in: tenantIds } }).select('name code').lean();
    const tenantMap = {};
    for (const t of tenants) {
      tenantMap[t._id.toString()] = { name: t.name, code: t.code };
    }

    const enriched = data.map(o => ({
      ...o,
      tenantName: tenantMap[o.tenantId?.toString()]?.name || '',
      tenantCode: tenantMap[o.tenantId?.toString()]?.code || '',
    }));

    res.json({ ok: true, data: enriched, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('getOrders error:', err);
    res.status(500).json({ ok: false, msg: '获取订单列表失败' });
  }
};

/**
 * POST /platform/orders
 * Create order + auto-sync tenant if paid.
 * Retries once on duplicate orderNo (race condition).
 */
exports.createOrder = async (req, res) => {
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const { tenantId, plan, amount, startDate, endDate, status, paymentMethod, paidAt, notes } = req.body;

      if (!isValidObjectId(tenantId)) {
        return res.status(400).json({ ok: false, msg: '无效的公司ID' });
      }
      if (status && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ ok: false, msg: '无效的订单状态' });
      }
      if (plan && !VALID_PLANS.includes(plan)) {
        return res.status(400).json({ ok: false, msg: '无效的套餐类型' });
      }

      const tenant = await Tenant.findById(tenantId);
      if (!tenant || tenant.status === 'deleted') {
        return res.status(404).json({ ok: false, msg: '公司不存在' });
      }

      const orderNo = await generateOrderNo();

      const order = new Order({
        tenantId,
        orderNo,
        plan: plan || 'basic',
        amount: Math.max(0, Number(amount) || 0),
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        status: status || 'pending',
        paymentMethod: String(paymentMethod || '').slice(0, 50),
        paidAt: paidAt ? new Date(paidAt) : (status === 'paid' ? new Date() : undefined),
        notes: String(notes || '').slice(0, 500),
        creator: req.user.userid,
      });

      await order.save();

      // Sync tenant subscription if paid
      if (order.status === 'paid') {
        await syncTenantSubscription(tenantId);
      }

      return res.json({ ok: true, data: order });
    } catch (err) {
      // Retry on duplicate key error (race condition on orderNo)
      if (err.code === 11000 && attempt < MAX_RETRIES - 1) {
        continue;
      }
      console.error('createOrder error:', err);
      return res.status(500).json({ ok: false, msg: '创建订单失败' });
    }
  }
};

/**
 * POST /platform/orders/update
 * Update order fields + sync tenant subscription
 */
exports.updateOrder = async (req, res) => {
  try {
    const { orderId, plan, amount, startDate, endDate, status, paymentMethod, paidAt, notes } = req.body;

    if (!isValidObjectId(orderId)) {
      return res.status(400).json({ ok: false, msg: '无效的订单ID' });
    }
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ ok: false, msg: '无效的订单状态' });
    }
    if (plan !== undefined && !VALID_PLANS.includes(plan)) {
      return res.status(400).json({ ok: false, msg: '无效的套餐类型' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ ok: false, msg: '订单不存在' });
    }

    if (plan !== undefined) order.plan = plan;
    if (amount !== undefined) order.amount = Math.max(0, Number(amount) || 0);
    if (startDate !== undefined) order.startDate = startDate ? new Date(startDate) : undefined;
    if (endDate !== undefined) order.endDate = endDate ? new Date(endDate) : undefined;
    if (status !== undefined) {
      order.status = status;
      if (status === 'paid' && !order.paidAt) {
        order.paidAt = new Date();
      }
    }
    if (paymentMethod !== undefined) order.paymentMethod = String(paymentMethod).slice(0, 50);
    if (paidAt !== undefined) order.paidAt = paidAt ? new Date(paidAt) : undefined;
    if (notes !== undefined) order.notes = String(notes).slice(0, 500);

    await order.save();
    await syncTenantSubscription(order.tenantId);

    res.json({ ok: true, data: order });
  } catch (err) {
    console.error('updateOrder error:', err);
    res.status(500).json({ ok: false, msg: '更新订单失败' });
  }
};

/**
 * POST /platform/orders/delete
 * Delete order + re-sync tenant
 */
exports.deleteOrder = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!isValidObjectId(orderId)) {
      return res.status(400).json({ ok: false, msg: '无效的订单ID' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ ok: false, msg: '订单不存在' });
    }

    const tenantId = order.tenantId;
    await Order.deleteOne({ _id: orderId });
    await syncTenantSubscription(tenantId);

    res.json({ ok: true });
  } catch (err) {
    console.error('deleteOrder error:', err);
    res.status(500).json({ ok: false, msg: '删除订单失败' });
  }
};
