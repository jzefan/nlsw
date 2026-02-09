const mongoose = require('mongoose');
const Tenant = require('../../models/Tenant');
const User = require('../../models/User');
const Bill = require('../../models/Bill');
const Invoice = require('../../models/Invoice');

/**
 * GET /platform/tenants
 * 获取所有公司列表（含用户数、最近活跃时间）
 */
exports.getTenants = async (req, res) => {
  try {
    const tenants = await Tenant.find({ status: { $ne: 'deleted' } })
      .sort({ createDate: -1 })
      .lean();

    // 按 tenantId 分组统计用户数和最近活跃时间
    const userStats = await User.aggregate([
      { $match: { tenantId: { $exists: true, $ne: null }, role: { $ne: 'platform' } } },
      {
        $group: {
          _id: '$tenantId',
          userCount: { $sum: 1 },
          lastActiveAt: { $max: '$lastLoginAt' },
        },
      },
    ]);

    const statsMap = {};
    for (const stat of userStats) {
      statsMap[stat._id.toString()] = {
        userCount: stat.userCount,
        lastActiveAt: stat.lastActiveAt,
      };
    }

    const data = tenants.map((t) => {
      const stats = statsMap[t._id.toString()] || { userCount: 0, lastActiveAt: null };
      return {
        _id: t._id,
        code: t.code,
        name: t.name,
        fullName: t.fullName,
        status: t.status,
        plan: t.plan,
        maxUsers: t.maxUsers,
        contact: t.contact,
        createDate: t.createDate,
        expireDate: t.expireDate,
        userCount: stats.userCount,
        lastActiveAt: stats.lastActiveAt,
      };
    });

    res.json({ ok: true, data });
  } catch (err) {
    console.error('getTenants error:', err);
    res.status(500).json({ ok: false, msg: '获取公司列表失败' });
  }
};

/**
 * POST /platform/tenants/status
 * 启用/禁用公司
 * body: { tenantId, status: 'active' | 'suspended' }
 */
exports.updateTenantStatus = async (req, res) => {
  try {
    const { tenantId, status } = req.body;

    if (!tenantId || !['active', 'suspended'].includes(status)) {
      return res.status(400).json({ ok: false, msg: '参数错误' });
    }

    const tenant = await Tenant.findById(tenantId);
    if (!tenant || tenant.status === 'deleted') {
      return res.status(404).json({ ok: false, msg: '公司不存在' });
    }

    tenant.status = status;
    await tenant.save();

    res.json({ ok: true, data: { _id: tenant._id, status: tenant.status } });
  } catch (err) {
    console.error('updateTenantStatus error:', err);
    res.status(500).json({ ok: false, msg: '更新公司状态失败' });
  }
};

/**
 * GET /platform/tenants/:tenantId/users
 * 公司子账号列表
 */
exports.getTenantUsers = async (req, res) => {
  try {
    const { tenantId } = req.params;

    const users = await User.find({ tenantId, role: { $ne: 'platform' } })
      .select('userid profile.name profile.phone title privilege role status lastLoginAt createDate')
      .sort({ createDate: -1 })
      .lean();

    res.json({ ok: true, data: users });
  } catch (err) {
    console.error('getTenantUsers error:', err);
    res.status(500).json({ ok: false, msg: '获取用户列表失败' });
  }
};

/**
 * GET /platform/tenants/:tenantId/bills
 * 公司提单列表（分页）
 */
exports.getTenantBills = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = { tenantId };

    const [data, total] = await Promise.all([
      Bill.find(query)
        .select('bill_no order_no billing_name customer_price total_weight status create_date')
        .sort({ create_date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Bill.countDocuments(query),
    ]);

    res.json({
      ok: true,
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('getTenantBills error:', err);
    res.status(500).json({ ok: false, msg: '获取提单列表失败' });
  }
};

/**
 * GET /platform/tenants/:tenantId/invoices
 * 公司运单列表（分页）
 */
exports.getTenantInvoices = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = { tenantId };

    const [data, total] = await Promise.all([
      Invoice.find(query)
        .select('waybill_no vehicle_vessel_name total_weight vessel_price state ship_date')
        .sort({ ship_date: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Invoice.countDocuments(query),
    ]);

    res.json({
      ok: true,
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('getTenantInvoices error:', err);
    res.status(500).json({ ok: false, msg: '获取运单列表失败' });
  }
};

/**
 * GET /platform/statistics
 * 平台统计数据
 */
exports.getPlatformStats = async (req, res) => {
  try {
    const [
      activeTenants,
      suspendedTenants,
      totalUsers,
      totalBills,
      totalInvoices,
      tenantDistribution,
    ] = await Promise.all([
      Tenant.countDocuments({ status: 'active' }),
      Tenant.countDocuments({ status: 'suspended' }),
      User.countDocuments({ role: { $ne: 'platform' } }),
      Bill.countDocuments({}),
      Invoice.countDocuments({}),
      // 每公司分布统计
      Bill.aggregate([
        {
          $group: {
            _id: '$tenantId',
            billCount: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: 'tenants',
            localField: '_id',
            foreignField: '_id',
            as: 'tenant',
          },
        },
        { $unwind: { path: '$tenant', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            tenantId: '$_id',
            tenantName: '$tenant.name',
            tenantCode: '$tenant.code',
            billCount: 1,
          },
        },
        { $sort: { billCount: -1 } },
      ]),
    ]);

    // 补充每公司的运单数
    const invoiceDistribution = await Invoice.aggregate([
      {
        $group: {
          _id: '$tenantId',
          invoiceCount: { $sum: 1 },
        },
      },
    ]);

    const invoiceMap = {};
    for (const item of invoiceDistribution) {
      if (item._id) {
        invoiceMap[item._id.toString()] = item.invoiceCount;
      }
    }

    const distribution = tenantDistribution.map((item) => ({
      tenantId: item.tenantId,
      tenantName: item.tenantName || '未知',
      tenantCode: item.tenantCode || '',
      billCount: item.billCount,
      invoiceCount: item.tenantId ? (invoiceMap[item.tenantId.toString()] || 0) : 0,
    }));

    res.json({
      ok: true,
      data: {
        activeTenants,
        suspendedTenants,
        totalUsers,
        totalBills,
        totalInvoices,
        distribution,
      },
    });
  } catch (err) {
    console.error('getPlatformStats error:', err);
    res.status(500).json({ ok: false, msg: '获取平台统计失败' });
  }
};

/**
 * POST /platform/tenants
 * 新建公司 + 主账号
 * body: { tenant: { code, name, fullName?, contact?, plan?, maxUsers? }, owner: { userid, name, phone? } }
 */
exports.createTenant = async (req, res) => {
  const { tenant: tenantData, owner: ownerData } = req.body;

  // 输入校验（在事务之前）
  if (!tenantData || !tenantData.code || !tenantData.name) {
    return res.status(400).json({ ok: false, msg: '公司编码和名称为必填项' });
  }
  if (!ownerData || !ownerData.userid || !ownerData.name) {
    return res.status(400).json({ ok: false, msg: '主账号用户名和姓名为必填项' });
  }

  const code = String(tenantData.code).trim().toUpperCase();
  if (code.length > 20 || !/^[A-Z0-9]+$/.test(code)) {
    return res.status(400).json({ ok: false, msg: '公司编码只能包含字母和数字，最长20位' });
  }
  if (String(tenantData.name).length > 100) {
    return res.status(400).json({ ok: false, msg: '公司名称不能超过100个字符' });
  }
  if (String(ownerData.userid).length > 50) {
    return res.status(400).json({ ok: false, msg: '用户名不能超过50个字符' });
  }

  const maxUsers = tenantData.maxUsers ? Number(tenantData.maxUsers) : 5;
  if (maxUsers < 1 || maxUsers > 1000) {
    return res.status(400).json({ ok: false, msg: '最大用户数须在1-1000之间' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // 检查公司编码是否已存在
    const existingTenant = await Tenant.findOne({ code }).session(session);
    if (existingTenant) {
      await session.abortTransaction();
      return res.status(400).json({ ok: false, msg: '公司编码已存在' });
    }

    // 创建租户
    const contact = tenantData.contact || {};
    const tenant = new Tenant({
      code,
      name: String(tenantData.name).trim(),
      fullName: tenantData.fullName ? String(tenantData.fullName).trim() : '',
      contact: {
        name: String(contact.name || '').slice(0, 50),
        phone: String(contact.phone || '').slice(0, 30),
        email: String(contact.email || '').slice(0, 100),
        address: String(contact.address || '').slice(0, 200),
      },
      plan: tenantData.plan || 'basic',
      maxUsers,
      creator: req.user.userid,
    });
    await tenant.save({ session });

    // 创建主账号 (owner)
    const owner = new User({
      userid: String(ownerData.userid).trim(),
      password: '123456',
      no: 1,
      title: 'ceo',
      privilege: ['admin'],
      role: 'owner',
      tenantId: tenant._id,
      tenantCode: tenant.code,
    });
    owner.profile.name = String(ownerData.name).trim();
    owner.profile.phone = ownerData.phone ? String(ownerData.phone).trim() : '';
    owner.profile.gender = '';
    owner.profile.location = '';
    await owner.save({ session });

    await session.commitTransaction();

    res.json({
      ok: true,
      data: {
        tenant: { _id: tenant._id, code: tenant.code, name: tenant.name },
        owner: { userid: owner.userid, name: owner.profile.name },
      },
    });
  } catch (err) {
    await session.abortTransaction();
    console.error('createTenant error:', err);
    if (err.code === 11000) {
      return res.status(400).json({ ok: false, msg: '公司编码或用户名已存在' });
    }
    res.status(500).json({ ok: false, msg: '创建公司失败' });
  } finally {
    session.endSession();
  }
};

/**
 * POST /platform/tenants/update
 * 修改公司信息 + 主账号信息
 * body: { tenantId, tenant?: { name, fullName, contact, plan, maxUsers }, owner?: { userid, name, phone } }
 */
exports.updateTenant = async (req, res) => {
  const { tenantId, tenant: tenantData, owner: ownerData } = req.body;

  if (!tenantId) {
    return res.status(400).json({ ok: false, msg: '缺少公司 ID' });
  }

  // 输入长度校验
  if (tenantData) {
    if (tenantData.name !== undefined && String(tenantData.name).length > 100) {
      return res.status(400).json({ ok: false, msg: '公司名称不能超过100个字符' });
    }
    if (tenantData.maxUsers !== undefined) {
      const mu = Number(tenantData.maxUsers);
      if (mu < 1 || mu > 1000) {
        return res.status(400).json({ ok: false, msg: '最大用户数须在1-1000之间' });
      }
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const tenant = await Tenant.findById(tenantId).session(session);
    if (!tenant || tenant.status === 'deleted') {
      await session.abortTransaction();
      return res.status(404).json({ ok: false, msg: '公司不存在' });
    }

    // 更新租户信息
    if (tenantData) {
      if (tenantData.name !== undefined) tenant.name = String(tenantData.name).trim();
      if (tenantData.fullName !== undefined) tenant.fullName = String(tenantData.fullName).trim();
      if (tenantData.contact !== undefined) {
        const c = tenantData.contact;
        tenant.contact = {
          name: String(c.name || '').slice(0, 50),
          phone: String(c.phone || '').slice(0, 30),
          email: String(c.email || '').slice(0, 100),
          address: String(c.address || '').slice(0, 200),
        };
      }
      if (tenantData.plan !== undefined) tenant.plan = tenantData.plan;
      if (tenantData.maxUsers !== undefined) tenant.maxUsers = Number(tenantData.maxUsers);
      await tenant.save({ session });
    }

    // 更新主账号信息
    if (ownerData && ownerData.userid) {
      const owner = await User.findOne({
        tenantId: tenant._id,
        userid: ownerData.userid,
        role: 'owner',
      }).session(session);
      if (owner) {
        if (ownerData.name !== undefined) owner.profile.name = String(ownerData.name).trim();
        if (ownerData.phone !== undefined) owner.profile.phone = String(ownerData.phone).trim();
        await owner.save({ session });
      }
    }

    await session.commitTransaction();
    res.json({ ok: true });
  } catch (err) {
    await session.abortTransaction();
    console.error('updateTenant error:', err);
    res.status(500).json({ ok: false, msg: '修改公司失败' });
  } finally {
    session.endSession();
  }
};

/**
 * POST /platform/tenants/delete
 * 删除公司（软删除）+ 禁用所有子账号
 * body: { tenantId }
 */
exports.deleteTenant = async (req, res) => {
  const { tenantId } = req.body;

  if (!tenantId) {
    return res.status(400).json({ ok: false, msg: '缺少公司 ID' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const tenant = await Tenant.findById(tenantId).session(session);
    if (!tenant || tenant.status === 'deleted') {
      await session.abortTransaction();
      return res.status(404).json({ ok: false, msg: '公司不存在' });
    }

    // 软删除租户
    tenant.status = 'deleted';
    await tenant.save({ session });

    // 禁用该公司所有用户
    await User.updateMany(
      { tenantId: tenant._id },
      { $set: { status: 'disabled' } },
      { session }
    );

    await session.commitTransaction();
    res.json({ ok: true });
  } catch (err) {
    await session.abortTransaction();
    console.error('deleteTenant error:', err);
    res.status(500).json({ ok: false, msg: '删除公司失败' });
  } finally {
    session.endSession();
  }
};
