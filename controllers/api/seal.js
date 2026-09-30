const mongoose = require('mongoose');
const SealItem = require('../../models/SealItem');
const SealCounter = require('../../models/SealCounter');
const SealRequest = require('../../models/SealRequest');
const SealWatch = require('../../models/SealWatch');
const SealUsageLog = require('../../models/SealUsageLog');
const Notice = require('../../models/Notice');
const Tenant = require('../../models/Tenant');
const User = require('../../models/User');
const { canManageSeals, canApproveSealRequest, resolveSealApprover } = require('../../utils/seal-permissions');
const { isAdmin } = require('../../utils/permissions');
const { isGeneralManagerTitle } = require('../../utils/user-title');

const SEAL_TYPE_NAMES = {
  official: '公章',
  finance: '财务专用章',
  contract: '合同专用章',
  invoice: '发票专用章',
  legal: '法人章'
};

const ALL_SEAL_TYPES = ['official', 'finance', 'contract', 'invoice', 'legal'];

/**
 * 首次访问或租户开启时，幂等预置 5 类各 1 枚实体章
 */
async function ensureDefaultSealItems(tenantId) {
  const count = await SealItem.countDocuments({ tenantId });
  if (count > 0) return;

  const docs = ALL_SEAL_TYPES.map(type => ({
    tenantId,
    sealType: type,
    code: `${SEAL_TYPE_NAMES[type]}-1`,
    status: 'active',
    physicalOut: false,
    note: '系统默认预置'
  }));

  try {
    await SealItem.insertMany(docs, { ordered: false });
  } catch (err) {
    // 忽略并发插入可能带来的重复键错误
  }
}

/**
 * 扫描线算法判定指定时段在用印章的可用容量
 */
async function evaluateAvailability(tenantId, sealType, from, to, excludeId = null, statuses = ['pending', 'approved', 'checked_out', 'overdue']) {
  const fromDate = new Date(from);
  const toDate = new Date(to);

  const M = await SealItem.countDocuments({ tenantId, sealType, status: 'active' });
  if (M === 0) {
    return { available: false, reason: 'no_active_seal', active: 0, freeNow: 0, maxConcurrent: 0 };
  }

  const now = new Date();
  // 查找所有可能重叠的记录（包括逾期记录）
  const requests = await SealRequest.find({
    tenantId,
    status: { $in: statuses },
    sealTypes: sealType,
    useAt: { $lt: toDate },
    ...(excludeId ? { _id: { $ne: excludeId } } : {})
  }).select('useAt expectedReturnAt status applicant.name serialNo').lean();

  const events = [];
  let initialOverlap = 0;

  for (const req of requests) {
    // 逾期持续占用：对于处于 overdue 或超期未归还的单据，因实体章仍未归还，持续占用直至未来（覆盖至查询区间终点以后）
    const isOverdue = req.status === 'overdue' || (req.status === 'checked_out' && req.expectedReturnAt < now);
    const effectiveEnd = isOverdue
      ? new Date(Math.max(req.expectedReturnAt.getTime(), toDate.getTime() + 1000))
      : req.expectedReturnAt;

    if (effectiveEnd <= fromDate) continue; // 在目标区间开始前已结束

    if (req.useAt <= fromDate) {
      initialOverlap += 1;
    } else {
      events.push({ time: new Date(req.useAt).getTime(), delta: +1, name: req.applicant?.name, serialNo: req.serialNo });
    }

    if (effectiveEnd < toDate) {
      events.push({ time: new Date(effectiveEnd).getTime(), delta: -1, name: req.applicant?.name, serialNo: req.serialNo });
    }
  }

  // 排序：时间早的排前面；时间相同时释放事件(-1)优先于占用事件(+1)以保持半开区间 [from, to) 语义
  events.sort((a, b) => (a.time !== b.time ? a.time - b.time : a.delta - b.delta));

  let current = initialOverlap;
  let maxConcurrent = current;

  for (const ev of events) {
    current += ev.delta;
    if (current > maxConcurrent) {
      maxConcurrent = current;
    }
  }

  const available = maxConcurrent < M;
  return {
    available,
    active: M,
    freeNow: Math.max(0, M - maxConcurrent),
    maxConcurrent
  };
}

/**
 * 触发候补广播通知（当释放名额时）
 */
async function triggerSealWatchCheck(tenantId, sealType) {
  try {
    const now = new Date();
    const watches = await SealWatch.find({
      tenantId,
      sealType,
      status: 'waiting',
      desiredTo: { $gt: now }
    }).lean();

    if (!watches.length) return;

    for (const watch of watches) {
      const { available } = await evaluateAvailability(tenantId, sealType, watch.desiredFrom, watch.desiredTo);
      if (available) {
        await SealWatch.updateOne(
          { _id: watch._id, status: 'waiting' },
          { $set: { status: 'notified', notifiedAt: new Date() } }
        );

        const typeName = SEAL_TYPE_NAMES[sealType] || sealType;
        const fromStr = new Date(watch.desiredFrom).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        const toStr = new Date(watch.desiredTo).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

        await Notice.create({
          tenantId,
          userId: watch.userId,
          kind: 'seal_returned',
          title: `你关注的${typeName}时段现已可用`,
          body: `你关注的 ${typeName}（${fromStr} 至 ${toStr}）时段现有名额释放，名额有限，请尽快提交用章申请。`,
          link: '/seal/requests'
        });

        // 记一条台账候补通知日志
        await SealUsageLog.create({
          tenantId,
          sealType,
          requestId: new mongoose.Types.ObjectId(), // 占位
          action: 'watch_notified',
          operatorName: '系统',
          snapshot: { userId: watch.userId, userName: watch.userName, desiredFrom: watch.desiredFrom, desiredTo: watch.desiredTo },
          note: `候补人 ${watch.userName} 收到时段可用通知`
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('triggerSealWatchCheck error:', err);
  }
}

/**
 * 查询指定时段各印章类别的可用性
 * GET /seal/availability?from=...&to=...
 */
exports.getAvailability = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ ok: false, error: '请提供用章开始时间与结束时间' });
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()) || fromDate >= toDate) {
      return res.status(400).json({ ok: false, error: '预计归还时间必须晚于用章时间' });
    }

    await ensureDefaultSealItems(req.tenantId);

    const results = {};
    for (const type of ALL_SEAL_TYPES) {
      const resItem = await evaluateAvailability(req.tenantId, type, fromDate, toDate);
      const physicalOutCount = await SealItem.countDocuments({
        tenantId: req.tenantId,
        sealType: type,
        status: 'active',
        physicalOut: true
      });

      results[type] = {
        name: SEAL_TYPE_NAMES[type],
        ...resItem,
        physicalOutCount
      };
    }

    return res.json({ ok: true, data: results });
  } catch (error) {
    console.error('getAvailability error:', error);
    return res.status(500).json({ ok: false, error: '查询印章可用性失败' });
  }
};

/**
 * 实体章列表
 * GET /seal/items?status=active|disabled|scrapped
 */
exports.getItems = async (req, res) => {
  try {
    await ensureDefaultSealItems(req.tenantId);

    const query = { tenantId: req.tenantId };
    if (req.query.status) {
      query.status = req.query.status;
    } else {
      query.status = { $in: ['active', 'disabled'] }; // 默认不查 scrapped
    }
    if (req.query.sealType) {
      query.sealType = req.query.sealType;
    }

    const items = await SealItem.find(query).sort({ sealType: 1, code: 1 }).lean();
    return res.json({ ok: true, data: items });
  } catch (error) {
    console.error('getItems error:', error);
    return res.status(500).json({ ok: false, error: '获取实体章列表失败' });
  }
};

/**
 * 新增实体章
 * POST /seal/items
 */
exports.createItem = async (req, res) => {
  try {
    const { sealType, code, note } = req.body;
    if (!ALL_SEAL_TYPES.includes(sealType)) {
      return res.status(400).json({ ok: false, error: '印章类别无效' });
    }

    let finalCode = (code || '').trim();
    if (!finalCode) {
      const count = await SealItem.countDocuments({ tenantId: req.tenantId, sealType });
      finalCode = `${SEAL_TYPE_NAMES[sealType]}-${count + 1}`;
    }

    const exists = await SealItem.findOne({ tenantId: req.tenantId, sealType, code: finalCode });
    if (exists) {
      return res.status(409).json({ ok: false, error: `编号 ${finalCode} 已存在，请更换` });
    }

    const item = await SealItem.create({
      tenantId: req.tenantId,
      sealType,
      code: finalCode,
      status: 'active',
      physicalOut: false,
      note: (note || '').trim()
    });

    // 容量增加，触发候补广播
    triggerSealWatchCheck(req.tenantId, sealType).catch(() => {});

    return res.json({ ok: true, data: item });
  } catch (error) {
    console.error('createItem error:', error);
    return res.status(500).json({ ok: false, error: '新增实体章失败' });
  }
};

/**
 * 修改实体章状态 / 备注 / 编号
 * PATCH /seal/items/:id
 */
exports.updateItem = async (req, res) => {
  try {
    const item = await SealItem.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!item) {
      return res.status(404).json({ ok: false, error: '实体章不存在' });
    }

    const { code, note, status } = req.body;

    // 安全约束：在借中禁止停用或报废
    if (status && ['disabled', 'scrapped'].includes(status) && item.physicalOut) {
      return res.status(409).json({ ok: false, error: '该实体章当前正处于在借状态，归还前严禁停用或报废' });
    }

    if (code && code.trim() !== item.code) {
      const exists = await SealItem.findOne({
        tenantId: req.tenantId,
        sealType: item.sealType,
        code: code.trim(),
        _id: { $ne: item._id }
      });
      if (exists) {
        return res.status(409).json({ ok: false, error: `编号 ${code.trim()} 已存在` });
      }
      item.code = code.trim();
    }

    if (note !== undefined) item.note = note.trim();

    const oldStatus = item.status;
    if (status && ['active', 'disabled', 'scrapped'].includes(status)) {
      item.status = status;
    }
    item.updatedAt = new Date();
    await item.save();

    // 若从停用变更为在用，触发候补通知
    if (oldStatus !== 'active' && item.status === 'active') {
      triggerSealWatchCheck(req.tenantId, item.sealType).catch(() => {});
    }

    return res.json({ ok: true, data: item });
  } catch (error) {
    console.error('updateItem error:', error);
    return res.status(500).json({ ok: false, error: '更新实体章失败' });
  }
};

/**
 * 提交用章申请
 * POST /seal/requests
 */
exports.createRequest = async (req, res) => {
  try {
    const {
      useDepartment,
      useAt,
      expectedReturnAt,
      sealTypes,
      documentName,
      copies,
      reason,
      remark
    } = req.body;

    if (!Array.isArray(sealTypes) || sealTypes.length === 0) {
      return res.status(400).json({ ok: false, error: '请至少选择一种申请用章类别' });
    }
    for (const t of sealTypes) {
      if (!ALL_SEAL_TYPES.includes(t)) {
        return res.status(400).json({ ok: false, error: `无效的用章类别: ${t}` });
      }
    }

    if (!documentName || !documentName.trim()) {
      return res.status(400).json({ ok: false, error: '用章文件名称不能为空' });
    }
    const numCopies = parseInt(copies, 10);
    if (isNaN(numCopies) || numCopies <= 0) {
      return res.status(400).json({ ok: false, error: '份数必须是大于 0 的正整数' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ ok: false, error: '用章事由不能为空' });
    }

    const fromDate = new Date(useAt);
    const toDate = new Date(expectedReturnAt);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()) || fromDate >= toDate) {
      return res.status(400).json({ ok: false, error: '预计归还时间必须晚于用章时间' });
    }

    await ensureDefaultSealItems(req.tenantId);

    // 1. 容量校验
    for (const type of sealTypes) {
      const { available, active, freeNow } = await evaluateAvailability(req.tenantId, type, fromDate, toDate);
      if (!available) {
        const typeName = SEAL_TYPE_NAMES[type];
        return res.status(409).json({
          ok: false,
          error: `${typeName}在所选时段已被约满（总共 ${active} 枚，剩余 0 枚），请调整时段或登记候补。`
        });
      }
    }

    // 2. 取原子流水号
    const counter = await SealCounter.findOneAndUpdate(
      { tenantId: req.tenantId },
      { $inc: { next: 1 }, $setOnInsert: { tenantId: req.tenantId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const serialNo = String(counter.next).padStart(6, '0');

    // 3. 解析单级审批人
    const { approver, role } = await resolveSealApprover(req.tenantId, req.user, req.tenant?.settings);

    // 4. 构建申请单
    const applicantSnapshot = {
      employeeNo: req.user.employeeNo || '',
      name: req.user.profile?.name || req.user.userid || '',
      department: req.user.department || '',
      title: req.user.title || ''
    };

    const newRequest = await SealRequest.create({
      tenantId: req.tenantId,
      serialNo,
      applicantId: req.user._id,
      applicant: applicantSnapshot,
      useDepartment: (useDepartment || applicantSnapshot.department || '').trim(),
      useAt: fromDate,
      expectedReturnAt: toDate,
      sealTypes,
      documentName: documentName.trim(),
      copies: numCopies,
      reason: reason.trim(),
      remark: (remark || '').trim(),
      status: 'pending',
      currentApproverId: approver._id,
      approvals: [{
        approverId: approver._id,
        role,
        status: 'pending',
        comment: ''
      }]
    });

    // 5. 记录流水台账
    for (const st of sealTypes) {
      await SealUsageLog.create({
        tenantId: req.tenantId,
        sealType: st,
        requestId: newRequest._id,
        action: 'submit',
        operatorId: req.user._id,
        operatorName: applicantSnapshot.name,
        snapshot: {
          serialNo,
          applicantName: applicantSnapshot.name,
          documentName: newRequest.documentName,
          copies: newRequest.copies,
          useAt: newRequest.useAt,
          expectedReturnAt: newRequest.expectedReturnAt
        },
        note: `提交用章申请 No.${serialNo}`
      }).catch(console.error);
    }

    // 发站内通知给审批人
    await Notice.create({
      tenantId: req.tenantId,
      userId: approver._id,
      kind: 'general',
      title: '待审批：用章申请',
      body: `${applicantSnapshot.name} 提交了用章申请单 No.${serialNo}（${documentName}），请及时审批。`,
      link: `/seal/requests?view=inbox&id=${newRequest._id}`
    }).catch(console.error);

    return res.json({ ok: true, data: newRequest });
  } catch (error) {
    console.error('createRequest error:', error);
    return res.status(500).json({ ok: false, error: error.message || '提交用章申请失败' });
  }
};

/**
 * 用章申请列表
 * GET /seal/requests?view=mine|inbox|history|custody|all&status=&sealType=&page=1&limit=20
 */
exports.getRequests = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const query = { tenantId: req.tenantId };
    const view = req.query.view || 'mine';

    const hasGlobalApprovalView = req.user.role === 'owner' || isAdmin(req.user.privilege) || isGeneralManagerTitle(req.user.title) || (Array.isArray(req.user.attendanceRoles) && req.user.attendanceRoles.includes('general_manager'));

    if (view === 'mine') {
      query.applicantId = req.user._id;
    } else if (view === 'inbox') {
      if (hasGlobalApprovalView) {
        query.status = 'pending';
      } else {
        query.currentApproverId = req.user._id;
        query.status = 'pending';
      }
    } else if (view === 'history') {
      if (hasGlobalApprovalView) {
        query.status = { $ne: 'pending' };
      } else {
        query['approvals.approverId'] = req.user._id;
        query.status = { $ne: 'pending' };
      }
    } else if (view === 'custody') {
      // 保管员工作台关心的三组：待发章、在借、逾期
      query.status = { $in: ['approved', 'checked_out', 'overdue'] };
    } else if (view === 'all') {
      // 管理员全量
    }

    if (req.query.status) {
      query.status = req.query.status;
    }
    if (req.query.sealType) {
      query.sealTypes = req.query.sealType;
    }

    // 计算待我审批角标数量
    const inboxQuery = { tenantId: req.tenantId, status: 'pending' };
    if (!hasGlobalApprovalView) {
      inboxQuery.currentApproverId = req.user._id;
    }

    const [items, total, pendingCount] = await Promise.all([
      SealRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      SealRequest.countDocuments(query),
      SealRequest.countDocuments(inboxQuery)
    ]);

    // 惰性状态派生：若 checked_out 已超过 expectedReturnAt，标为 overdue
    const now = new Date();
    for (const item of items) {
      if (item.status === 'checked_out' && new Date(item.expectedReturnAt) < now) {
        item.status = 'overdue';
      }
    }

    return res.json({
      ok: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      meta: {
        pendingCount,
        hasGlobalApprovalView
      }
    });
  } catch (error) {
    console.error('getRequests error:', error);
    return res.status(500).json({ ok: false, error: '获取用章申请列表失败' });
  }
};

/**
 * 申请详情（包含操作流水）
 * GET /seal/requests/:id
 */
exports.getRequestDetail = async (req, res) => {
  try {
    const request = await SealRequest.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
    if (!request) {
      return res.status(404).json({ ok: false, error: '申请单不存在' });
    }

    // 惰性派生
    if (request.status === 'checked_out' && new Date(request.expectedReturnAt) < new Date()) {
      request.status = 'overdue';
    }

    // 查流水日志
    const logs = await SealUsageLog.find({ tenantId: req.tenantId, requestId: request._id })
      .sort({ at: 1 })
      .lean();

    return res.json({ ok: true, data: { ...request, logs } });
  } catch (error) {
    console.error('getRequestDetail error:', error);
    return res.status(500).json({ ok: false, error: '获取申请详情失败' });
  }
};

/**
 * 申请人主动撤回申请
 * POST /seal/requests/:id/withdraw
 */
exports.withdrawRequest = async (req, res) => {
  try {
    const request = await SealRequest.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!request) {
      return res.status(404).json({ ok: false, error: '申请单不存在' });
    }

    if (String(request.applicantId) !== String(req.user._id) && req.user.role !== 'owner') {
      return res.status(403).json({ ok: false, error: '仅申请人本人可撤回' });
    }

    if (!['pending', 'approved'].includes(request.status)) {
      return res.status(400).json({ ok: false, error: '已借出或已办结的单据不可撤回' });
    }

    request.status = 'withdrawn';
    request.withdrawnAt = new Date();
    request.currentApproverId = null;
    request.updatedAt = new Date();
    await request.save();

    // 记录流水台账
    for (const st of request.sealTypes) {
      await SealUsageLog.create({
        tenantId: req.tenantId,
        sealType: st,
        requestId: request._id,
        action: 'withdraw',
        operatorId: req.user._id,
        operatorName: req.user.profile?.name || req.user.userid,
        snapshot: { serialNo: request.serialNo },
        note: '申请人撤回申请'
      }).catch(console.error);

      // 释放占用名额，触发候补广播
      triggerSealWatchCheck(req.tenantId, st).catch(() => {});
    }

    return res.json({ ok: true, data: request });
  } catch (error) {
    console.error('withdrawRequest error:', error);
    return res.status(500).json({ ok: false, error: '撤回用章申请失败' });
  }
};

/**
 * 单级审批：总经理 / owner 审批
 * POST /seal/requests/:id/review
 */
exports.reviewRequest = async (req, res) => {
  try {
    const { decision, comment } = req.body;
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ ok: false, error: '审批决策必须为 approved 或 rejected' });
    }

    const request = await SealRequest.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!request) {
      return res.status(404).json({ ok: false, error: '申请单不存在' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ ok: false, error: '该单据已不是待审批状态' });
    }

    if (!canApproveSealRequest(req.user, req.tenant, request)) {
      return res.status(403).json({ ok: false, error: '无权审批此单据（仅审批人、总经理或管理员可审批）' });
    }

    const operatorName = req.user.profile?.name || req.user.userid;

    if (decision === 'approved') {
      // 审批通过复检容量冲突（仅排除当前单据，且只与已批准、在借、逾期单据对比，不与其它 pending 单据互锁死锁）
      for (const st of request.sealTypes) {
        const { available, active } = await evaluateAvailability(
          req.tenantId,
          st,
          request.useAt,
          request.expectedReturnAt,
          request._id,
          ['approved', 'checked_out', 'overdue']
        );
        if (!available) {
          return res.status(409).json({
            ok: false,
            error: `时段冲突复检未通过：${SEAL_TYPE_NAMES[st]}在用章时段已被其他已审批申请占满（在用 ${active} 枚），无法通过审批。建议驳回或联系申请人改期。`
          });
        }
      }

      request.status = 'approved';
      request.currentApproverId = null;
      if (request.approvals && request.approvals.length > 0) {
        request.approvals[0].status = 'approved';
        request.approvals[0].comment = (comment || '').trim();
        request.approvals[0].reviewedAt = new Date();
      }
      await request.save();

      // 写流水
      for (const st of request.sealTypes) {
        await SealUsageLog.create({
          tenantId: req.tenantId,
          sealType: st,
          requestId: request._id,
          action: 'approve',
          operatorId: req.user._id,
          operatorName,
          note: comment ? `审批通过: ${comment.trim()}` : '审批通过'
        }).catch(console.error);
      }

      // 站内通知申请人取章
      await Notice.create({
        tenantId: req.tenantId,
        userId: request.applicantId,
        kind: 'seal_approved',
        title: '用章申请已批准',
        body: `你的用章申请 No.${request.serialNo}（${request.documentName}）已获总经理审批通过，请前往保管员处领取实体章。`,
        link: `/seal/requests?id=${request._id}`
      }).catch(console.error);

      // 通知专职保管员准备发章
      const custodianId = req.tenant?.settings?.sealCustodianId;
      if (custodianId && String(custodianId) !== String(req.user._id)) {
        await Notice.create({
          tenantId: req.tenantId,
          userId: custodianId,
          kind: 'general',
          title: '待发章：新通过用章单',
          body: `用章申请 No.${request.serialNo} 已审批通过，等待发章。`,
          link: '/seal/workbench'
        }).catch(console.error);
      }
    } else {
      // 驳回
      request.status = 'rejected';
      request.currentApproverId = null;
      if (request.approvals && request.approvals.length > 0) {
        request.approvals[0].status = 'rejected';
        request.approvals[0].comment = (comment || '').trim();
        request.approvals[0].reviewedAt = new Date();
      }
      await request.save();

      // 写流水
      for (const st of request.sealTypes) {
        await SealUsageLog.create({
          tenantId: req.tenantId,
          sealType: st,
          requestId: request._id,
          action: 'reject',
          operatorId: req.user._id,
          operatorName,
          note: comment ? `审批驳回: ${comment.trim()}` : '审批驳回'
        }).catch(console.error);

        // 驳回释放占用名额，触发候补通知
        triggerSealWatchCheck(req.tenantId, st).catch(() => {});
      }

      // 通知申请人
      await Notice.create({
        tenantId: req.tenantId,
        userId: request.applicantId,
        kind: 'general',
        title: '用章申请已被驳回',
        body: `你的用章申请 No.${request.serialNo}（${request.documentName}）已被驳回。${comment ? `理由: ${comment}` : ''}`,
        link: `/seal/requests?id=${request._id}`
      }).catch(console.error);
    }

    return res.json({ ok: true, data: request });
  } catch (error) {
    console.error('reviewRequest error:', error);
    return res.status(500).json({ ok: false, error: '审批操作失败' });
  }
};

/**
 * 保管员集中发章
 * POST /seal/requests/:id/checkout
 * body: { sealItemIds: ['...'] }
 */
exports.checkoutRequest = async (req, res) => {
  try {
    const { sealItemIds } = req.body;
    if (!Array.isArray(sealItemIds) || sealItemIds.length === 0) {
      return res.status(400).json({ ok: false, error: '发章时必须指定分配的实体章' });
    }

    const request = await SealRequest.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!request) {
      return res.status(404).json({ ok: false, error: '申请单不存在' });
    }

    if (request.status !== 'approved') {
      return res.status(400).json({ ok: false, error: '只有审批通过（待发章）的单据才能执行发章' });
    }

    const items = await SealItem.find({
      _id: { $in: sealItemIds },
      tenantId: req.tenantId,
      status: 'active'
    });

    if (items.length !== sealItemIds.length) {
      return res.status(400).json({ ok: false, error: '指定的某些实体章不存在或非在用状态' });
    }

    // 校验实体章未被借出
    for (const item of items) {
      if (item.physicalOut) {
        return res.status(409).json({
          ok: false,
          error: `实体章【${item.code}】当前处于在借状态（借用人: ${item.currentBorrowerName || '他人'}），无法借出`
        });
      }
    }

    // 校验类别覆盖
    const providedTypes = items.map(i => i.sealType);
    for (const st of request.sealTypes) {
      if (!providedTypes.includes(st)) {
        return res.status(400).json({ ok: false, error: `发章缺少必需类别: ${SEAL_TYPE_NAMES[st]}` });
      }
    }

    const operatorName = req.user.profile?.name || req.user.userid;

    // 1. 原子更新实体章物理状态（CAS 防并发借出）
    const assignedSealItems = items.map(item => ({
      sealItemId: item._id,
      code: item.code,
      sealType: item.sealType
    }));

    const updateRes = await SealItem.updateMany(
      { _id: { $in: sealItemIds }, physicalOut: false, status: 'active', tenantId: req.tenantId },
      {
        $set: {
          physicalOut: true,
          currentRequestId: request._id,
          currentBorrowerName: request.applicant.name
        },
        $inc: { borrowCount: 1 }
      }
    );

    if (updateRes.modifiedCount !== sealItemIds.length) {
      // 实体章已被并发借出，安全回滚当前操作可能已占用的章
      await SealItem.updateMany(
        { _id: { $in: sealItemIds }, currentRequestId: request._id },
        {
          $set: { physicalOut: false, currentRequestId: null, currentBorrowerName: '' },
          $inc: { borrowCount: -1 }
        }
      );
      return res.status(409).json({
        ok: false,
        error: '所选实体章已被并发借出或状态已变更，请刷新重试'
      });
    }

    // 2. 原子更新申请单（CAS 确保单据仍为 approved）
    const updatedRequest = await SealRequest.findOneAndUpdate(
      { _id: request._id, status: 'approved' },
      {
        $set: {
          status: 'checked_out',
          sealItems: assignedSealItems,
          checkedOutAt: new Date(),
          operatorId: req.user._id,
          operatorName,
          updatedAt: new Date()
        }
      },
      { new: true }
    );

    if (!updatedRequest) {
      // 回滚实体章借出状态
      await SealItem.updateMany(
        { _id: { $in: sealItemIds }, currentRequestId: request._id },
        {
          $set: { physicalOut: false, currentRequestId: null, currentBorrowerName: '' },
          $inc: { borrowCount: -1 }
        }
      );
      return res.status(409).json({ ok: false, error: '申请单状态已变更，发章操作中止' });
    }

    // 3. 记录台账
    for (const assigned of assignedSealItems) {
      await SealUsageLog.create({
        tenantId: req.tenantId,
        sealType: assigned.sealType,
        sealItemId: assigned.sealItemId,
        sealItemCode: assigned.code,
        requestId: request._id,
        action: 'checkout',
        operatorId: req.user._id,
        operatorName,
        snapshot: {
          serialNo: request.serialNo,
          borrower: request.applicant.name,
          documentName: request.documentName
        },
        note: `发章借出【${assigned.code}】`
      }).catch(console.error);
    }

    return res.json({ ok: true, data: request });
  } catch (error) {
    console.error('checkoutRequest error:', error);
    return res.status(500).json({ ok: false, error: '发章操作失败' });
  }
};

/**
 * 保管员集中收章归还
 * POST /seal/requests/:id/return
 * body: { actualReturnAt?, note? }
 */
exports.returnRequest = async (req, res) => {
  try {
    const { actualReturnAt, note } = req.body;
    const request = await SealRequest.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!request) {
      return res.status(404).json({ ok: false, error: '申请单不存在' });
    }

    if (!['checked_out', 'overdue'].includes(request.status)) {
      return res.status(400).json({ ok: false, error: '仅在借或逾期中的单据可执行归还' });
    }

    const returnDate = actualReturnAt ? new Date(actualReturnAt) : new Date();
    const operatorName = req.user.profile?.name || req.user.userid;

    // 1. 释放实体章
    const itemIds = request.sealItems.map(i => i.sealItemId);
    await SealItem.updateMany(
      { _id: { $in: itemIds } },
      {
        $set: {
          physicalOut: false,
          currentRequestId: null,
          currentBorrowerName: ''
        }
      }
    );

    // 2. 更新申请单
    request.status = 'returned';
    request.actualReturnAt = returnDate;
    request.returnNote = (note || '').trim();
    request.updatedAt = new Date();
    await request.save();

    // 3. 记录台账
    for (const assigned of request.sealItems) {
      await SealUsageLog.create({
        tenantId: req.tenantId,
        sealType: assigned.sealType,
        sealItemId: assigned.sealItemId,
        sealItemCode: assigned.code,
        requestId: request._id,
        action: 'return',
        operatorId: req.user._id,
        operatorName,
        snapshot: {
          serialNo: request.serialNo,
          borrower: request.applicant.name,
          actualReturnAt: returnDate
        },
        note: note ? `收章入库: ${note.trim()}` : '收章入库销账'
      }).catch(console.error);

      // 释放名额触发候补通知
      triggerSealWatchCheck(req.tenantId, assigned.sealType).catch(() => {});
    }

    // 4. 发销账通知给借用人
    await Notice.create({
      tenantId: req.tenantId,
      userId: request.applicantId,
      kind: 'seal_returned',
      title: '用章归还销账回执',
      body: `你的用章单 No.${request.serialNo}（${request.documentName}）已由保管员 ${operatorName} 确认收章归还，流程已完结。`,
      link: `/seal/requests?id=${request._id}`
    }).catch(console.error);

    return res.json({ ok: true, data: request });
  } catch (error) {
    console.error('returnRequest error:', error);
    return res.status(500).json({ ok: false, error: '收章操作失败' });
  }
};

/**
 * 使用台账列表查询
 * GET /seal/ledger?sealItemId=&sealType=&action=&from=&to=&page=1&limit=20
 */
exports.getLedger = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const query = { tenantId: req.tenantId };
    if (req.query.sealItemId) query.sealItemId = req.query.sealItemId;
    if (req.query.sealType) query.sealType = req.query.sealType;
    if (req.query.action) query.action = req.query.action;
    if (req.query.from || req.query.to) {
      query.at = {};
      if (req.query.from) query.at.$gte = new Date(req.query.from);
      if (req.query.to) query.at.$lte = new Date(req.query.to);
    }

    const [items, total] = await Promise.all([
      SealUsageLog.find(query).sort({ at: -1 }).skip(skip).limit(limit).lean(),
      SealUsageLog.countDocuments(query)
    ]);

    return res.json({
      ok: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('getLedger error:', error);
    return res.status(500).json({ ok: false, error: '获取使用台账失败' });
  }
};

/**
 * 印章使用统计（借出次数、借出总时长、逾期统计）
 * GET /seal/statistics?sealItemId=&sealType=
 */
exports.getStatistics = async (req, res) => {
  try {
    const query = { tenantId: req.tenantId };
    if (req.query.sealType) query.sealType = req.query.sealType;
    if (req.query.sealItemId) query._id = req.query.sealItemId;

    const seals = await SealItem.find(query).lean();
    const stats = [];

    for (const seal of seals) {
      // 借出记录（从 SealUsageLog 或 SealRequest 统计）
      const requests = await SealRequest.find({
        tenantId: req.tenantId,
        'sealItems.sealItemId': seal._id,
        status: { $in: ['checked_out', 'overdue', 'returned'] }
      }).select('useAt expectedReturnAt actualReturnAt checkedOutAt status reminders').lean();

      let totalDurationMinutes = 0;
      let overdueCount = 0;
      let overdueDurationMinutes = 0;

      for (const r of requests) {
        const start = r.checkedOutAt || r.useAt;
        const end = r.actualReturnAt || new Date();
        const duration = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
        totalDurationMinutes += duration;

        if (r.status === 'overdue' || (r.actualReturnAt && new Date(r.actualReturnAt) > new Date(r.expectedReturnAt))) {
          overdueCount += 1;
          const od = Math.max(0, Math.round((new Date(end).getTime() - new Date(r.expectedReturnAt).getTime()) / 60000));
          overdueDurationMinutes += od;
        }
      }

      stats.push({
        sealItemId: seal._id,
        code: seal.code,
        sealType: seal.sealType,
        sealTypeName: SEAL_TYPE_NAMES[seal.sealType] || seal.sealType,
        status: seal.status,
        physicalOut: seal.physicalOut,
        currentBorrowerName: seal.currentBorrowerName,
        borrowCount: requests.length,
        totalDurationMinutes,
        overdueCount,
        overdueDurationMinutes
      });
    }

    return res.json({ ok: true, data: stats });
  } catch (error) {
    console.error('getStatistics error:', error);
    return res.status(500).json({ ok: false, error: '获取印章统计数据失败' });
  }
};

/**
 * 候补关注登记
 * POST /seal/watches
 * body: { sealType, desiredFrom, desiredTo }
 */
exports.createWatch = async (req, res) => {
  try {
    const { sealType, desiredFrom, desiredTo } = req.body;
    if (!ALL_SEAL_TYPES.includes(sealType)) {
      return res.status(400).json({ ok: false, error: '印章类别无效' });
    }

    const fromDate = new Date(desiredFrom);
    const toDate = new Date(desiredTo);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()) || fromDate >= toDate) {
      return res.status(400).json({ ok: false, error: '候补结束时间必须晚于开始时间' });
    }

    const watch = await SealWatch.create({
      tenantId: req.tenantId,
      userId: req.user._id,
      userName: req.user.profile?.name || req.user.userid,
      sealType,
      desiredFrom: fromDate,
      desiredTo: toDate,
      status: 'waiting'
    });

    return res.json({ ok: true, data: watch });
  } catch (error) {
    console.error('createWatch error:', error);
    return res.status(500).json({ ok: false, error: '登记候补失败' });
  }
};

/**
 * 我的候补列表
 * GET /seal/watches
 */
exports.getWatches = async (req, res) => {
  try {
    const watches = await SealWatch.find({
      tenantId: req.tenantId,
      userId: req.user._id
    }).sort({ createdAt: -1 }).lean();

    return res.json({ ok: true, data: watches });
  } catch (error) {
    console.error('getWatches error:', error);
    return res.status(500).json({ ok: false, error: '获取候补列表失败' });
  }
};

/**
 * 取消候补
 * DELETE /seal/watches/:id
 */
exports.cancelWatch = async (req, res) => {
  try {
    const watch = await SealWatch.findOneAndDelete({
      _id: req.params.id,
      tenantId: req.tenantId,
      userId: req.user._id
    });
    if (!watch) {
      return res.status(404).json({ ok: false, error: '候补记录不存在' });
    }
    return res.json({ ok: true, message: '已取消候补关注' });
  } catch (error) {
    console.error('cancelWatch error:', error);
    return res.status(500).json({ ok: false, error: '取消候补失败' });
  }
};

/**
 * 读取用章租户设置
 * GET /seal/settings
 */
exports.getSettings = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantId).select('settings').lean();
    const settings = tenant?.settings || {};

    const rawCustodianIds = settings.sealCustodianIds?.length
      ? settings.sealCustodianIds
      : (settings.sealCustodianId ? [settings.sealCustodianId] : []);
    const custodianIds = rawCustodianIds.map(String);

    // 查询租户候选员工（在职且非平台超管）
    const candidateUsers = await User.find({
      tenantId: req.tenantId,
      role: { $ne: 'platform' },
      status: { $ne: 'disabled' }
    })
      .select('_id profile.name userid employeeNo department title')
      .sort({ department: 1, 'profile.name': 1, userid: 1 })
      .lean();

    const candidates = candidateUsers.map(u => ({
      userId: String(u._id),
      name: u.profile?.name || u.userid,
      department: u.department || '',
      employeeNo: u.employeeNo || '',
      title: u.title || '',
      userid: u.userid
    }));

    return res.json({
      ok: true,
      data: {
        sealEnabled: settings.sealEnabled === true,
        sealCustodianId: custodianIds[0] || null,
        sealCustodianIds: custodianIds,
        candidates,
        sealOverdueRemindMinutes: Number(settings.sealOverdueRemindMinutes) || 120,
        sealOverdueEscalateMinutes: Number(settings.sealOverdueEscalateMinutes) || 1440
      }
    });
  } catch (error) {
    console.error('getSettings error:', error);
    return res.status(500).json({ ok: false, error: '获取用章设置失败' });
  }
};

/**
 * 更新用章租户设置
 * POST /seal/settings
 */
exports.updateSettings = async (req, res) => {
  try {
    const {
      sealEnabled,
      sealCustodianId,
      sealCustodianIds,
      sealOverdueRemindMinutes,
      sealOverdueEscalateMinutes
    } = req.body;

    const tenant = await Tenant.findById(req.tenantId);
    if (!tenant) {
      return res.status(404).json({ ok: false, error: '租户不存在' });
    }

    if (!tenant.settings) tenant.settings = {};

    if (sealEnabled !== undefined) {
      tenant.settings.sealEnabled = Boolean(sealEnabled);
    }

    if (sealCustodianIds !== undefined) {
      const ids = Array.isArray(sealCustodianIds) ? sealCustodianIds.filter(Boolean) : [];
      if (ids.length > 0) {
        const validUsers = await User.find({
          _id: { $in: ids },
          tenantId: req.tenantId,
          status: { $ne: 'disabled' }
        }).select('_id');
        const verifiedIds = validUsers.map(u => u._id);
        tenant.settings.sealCustodianIds = verifiedIds;
        tenant.settings.sealCustodianId = verifiedIds[0] || null;
      } else {
        tenant.settings.sealCustodianIds = [];
        tenant.settings.sealCustodianId = null;
      }
    } else if (sealCustodianId !== undefined) {
      if (sealCustodianId) {
        const u = await User.findOne({ _id: sealCustodianId, tenantId: req.tenantId, status: { $ne: 'disabled' } });
        if (!u) {
          return res.status(400).json({ ok: false, error: '指定的保管员用户不存在或已停用' });
        }
        tenant.settings.sealCustodianId = u._id;
        tenant.settings.sealCustodianIds = [u._id];
      } else {
        tenant.settings.sealCustodianId = null;
        tenant.settings.sealCustodianIds = [];
      }
    }

    if (sealOverdueRemindMinutes !== undefined) {
      const mins = parseInt(sealOverdueRemindMinutes, 10);
      if (isNaN(mins) || mins <= 0) {
        return res.status(400).json({ ok: false, error: '逾期催办阈值必须为大于 0 的整数' });
      }
      tenant.settings.sealOverdueRemindMinutes = mins;
    }

    if (sealOverdueEscalateMinutes !== undefined) {
      const mins = parseInt(sealOverdueEscalateMinutes, 10);
      if (isNaN(mins) || mins <= 0) {
        return res.status(400).json({ ok: false, error: '逾期升级总经理阈值必须为大于 0 的整数' });
      }
      tenant.settings.sealOverdueEscalateMinutes = mins;
    }

    await tenant.save();

    // 若开启了开关，幂等预置实体章
    if (tenant.settings.sealEnabled) {
      await ensureDefaultSealItems(tenant._id);
    }

    return res.json({ ok: true, message: '用章设置已保存' });
  } catch (error) {
    console.error('updateSettings error:', error);
    return res.status(500).json({ ok: false, error: '更新用章设置失败' });
  }
};
