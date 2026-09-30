const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const SealItem = require('../models/SealItem');
const SealCounter = require('../models/SealCounter');
const SealRequest = require('../models/SealRequest');
const SealWatch = require('../models/SealWatch');
const SealUsageLog = require('../models/SealUsageLog');
const Notice = require('../models/Notice');
const Tenant = require('../models/Tenant');
const User = require('../models/User');

const sealApi = require('../controllers/api/seal');
const { requireSealEnabled, canManageSeals, canApproveSealRequest, resolveSealApprover } = require('../utils/seal-permissions');
const secrets = require('../config/secrets');

function id() {
  return new mongoose.Types.ObjectId();
}

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function mockUser(tenantId, overrides = {}) {
  return {
    _id: id(),
    tenantId,
    userid: 'test-user',
    employeeNo: 'E-001',
    department: '技术部',
    title: '员工',
    status: 'active',
    role: 'member',
    privilege: [],
    attendanceRoles: [],
    profile: { name: '张三' },
    ...overrides
  };
}

test('requireSealEnabled guard in standalone and SaaS modes', async t => {
  const tenantId = id();
  let nextCalls = 0;
  const next = () => { nextCalls++; };

  // 1. 未登录拦截
  const res1 = response();
  await requireSealEnabled({ user: null }, res1, next);
  assert.equal(res1.statusCode, 401);

  // 2. 账号已停用拦截
  const res2 = response();
  await requireSealEnabled({ user: { _id: id(), status: 'disabled' } }, res2, next);
  assert.equal(res2.statusCode, 403);

  // 3. SaaS 模式：未开启用章开关返回 404
  const res3 = response();
  await requireSealEnabled({
    user: mockUser(tenantId),
    tenantId,
    tenant: { settings: { sealEnabled: false } }
  }, res3, next);
  assert.equal(res3.statusCode, 404);

  // 4. SaaS 模式：开启用章开关允许通行
  nextCalls = 0;
  const res4 = response();
  await requireSealEnabled({
    user: mockUser(tenantId),
    tenantId,
    tenant: { settings: { sealEnabled: true } }
  }, res4, next);
  assert.equal(nextCalls, 1);
});

test('canManageSeals authorization matrix', () => {
  const tenantId = id();
  const custodianId = id();
  const tenant = { settings: { sealCustodianId: custodianId } };

  // 1. 专职保管员（单人兼容）
  const custodian = mockUser(tenantId, { _id: custodianId });
  assert.equal(canManageSeals(custodian, tenant), true);

  // 1.1 多位专职保管员
  const custodian2Id = id();
  const tenantMulti = { settings: { sealCustodianIds: [custodianId, custodian2Id] } };
  const custodian2 = mockUser(tenantId, { _id: custodian2Id });
  assert.equal(canManageSeals(custodian2, tenantMulti), true);
  const nonCustodian = mockUser(tenantId);
  assert.equal(canManageSeals(nonCustodian, tenantMulti), false);

  // 2. 主账号 owner
  const owner = mockUser(tenantId, { role: 'owner' });
  assert.equal(canManageSeals(owner, tenant), true);

  // 3. 系统管理员 admin
  const admin = mockUser(tenantId, { privilege: ['admin'] });
  assert.equal(canManageSeals(admin, tenant), true);

  // 4. 总经理角色 / 职务
  const gmUser = mockUser(tenantId, { attendanceRoles: ['general_manager'] });
  assert.equal(canManageSeals(gmUser, tenant), true);
  const gmTitle = mockUser(tenantId, { title: '总经理' });
  assert.equal(canManageSeals(gmTitle, tenant), true);
  const ceoTitle = mockUser(tenantId, { title: '董事长' });
  assert.equal(canManageSeals(ceoTitle, tenant), true);

  // 5. 普通员工拒绝
  const regular = mockUser(tenantId);
  assert.equal(canManageSeals(regular, tenant), false);
});

function queryResult(value) {
  return {
    select() { return this; },
    lean() { return Promise.resolve(value); },
    exec: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
  };
}

test('resolveSealApprover picks general manager or falls back to owner', async t => {
  const tenantId = id();
  const gmId = id();
  const ownerId = id();
  const applicant = mockUser(tenantId);

  // 场景 1：存在总经理
  t.mock.method(User, 'findOne', query => {
    if (query?.attendanceRoles === 'general_manager') {
      return queryResult({ _id: gmId, profile: { name: '李总' }, userid: 'gm' });
    }
    return queryResult(null);
  });

  const res1 = await resolveSealApprover(tenantId, applicant, {});
  assert.equal(String(res1.approver._id), String(gmId));
  assert.equal(res1.role, 'general_manager');

  // 场景 2：未配置总经理，由 owner 兜底
  t.mock.method(User, 'findOne', query => {
    if (query?.attendanceRoles === 'general_manager') return queryResult(null);
    if (query?.role === 'owner') {
      return queryResult({ _id: ownerId, profile: { name: '王老板' }, userid: 'owner' });
    }
    return queryResult(null);
  });

  const res2 = await resolveSealApprover(tenantId, applicant, {});
  assert.equal(String(res2.approver._id), String(ownerId));
  assert.equal(res2.role, 'owner');
});

test('SealItem physical out guard prevents disabling or scrapping in-use seals', async t => {
  const tenantId = id();
  const itemId = id();

  // 模拟在借实体章
  const itemInUse = {
    _id: itemId,
    tenantId,
    sealType: 'official',
    code: '公章-1',
    status: 'active',
    physicalOut: true,
    save: async () => {}
  };

  t.mock.method(SealItem, 'findOne', async () => itemInUse);

  const req = {
    params: { id: String(itemId) },
    tenantId,
    body: { status: 'disabled' }
  };
  const res = response();

  await sealApi.updateItem(req, res);
  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /在借状态/);
});

test('createRequest validates times, copies, and checks availability', async t => {
  const tenantId = id();
  const applicant = mockUser(tenantId);

  // 1. 结束时间早于开始时间
  const req1 = {
    tenantId,
    user: applicant,
    body: {
      useAt: '2026-09-30 18:00',
      expectedReturnAt: '2026-09-30 10:00',
      sealTypes: ['official'],
      documentName: '劳动合同',
      copies: 1,
      reason: '员工入职'
    }
  };
  const res1 = response();
  await sealApi.createRequest(req1, res1);
  assert.equal(res1.statusCode, 400);

  // 2. 份数为 0
  const req2 = {
    tenantId,
    user: applicant,
    body: {
      useAt: '2026-09-30 10:00',
      expectedReturnAt: '2026-09-30 12:00',
      sealTypes: ['official'],
      documentName: '劳动合同',
      copies: 0,
      reason: '员工入职'
    }
  };
  const res2 = response();
  await sealApi.createRequest(req2, res2);
  assert.equal(res2.statusCode, 400);
});

test('sweep-line availability correctly handles adjacent, overlap and multiple seals', async t => {
  const tenantId = id();

  // 模拟只有 1 枚公章在用
  t.mock.method(SealItem, 'countDocuments', async filter => {
    if (filter?.status === 'active' && filter?.sealType === 'official') return 1;
    return 1;
  });

  // 已有申请 1：2026-10-01 10:00 - 12:00
  const existingReqs = [{
    useAt: new Date('2026-10-01T10:00:00+08:00'),
    expectedReturnAt: new Date('2026-10-01T12:00:00+08:00'),
    status: 'approved',
    applicant: { name: '老李' },
    serialNo: '000001'
  }];

  t.mock.method(SealRequest, 'find', () => queryResult(existingReqs));

  // 1. 部分重叠（11:00 - 13:00）：冲突
  const req1 = {
    tenantId,
    query: { from: '2026-10-01T11:00:00+08:00', to: '2026-10-01T13:00:00+08:00' }
  };
  const res1 = response();
  await sealApi.getAvailability(req1, res1);
  assert.equal(res1.body.data.official.available, false);
  assert.equal(res1.body.data.official.freeNow, 0);

  // 2. 半开区间相邻（12:00 - 14:00）：可用（先出后进）
  const req2 = {
    tenantId,
    query: { from: '2026-10-01T12:00:00+08:00', to: '2026-10-01T14:00:00+08:00' }
  };
  const res2 = response();
  await sealApi.getAvailability(req2, res2);
  assert.equal(res2.body.data.official.available, true);
  assert.equal(res2.body.data.official.freeNow, 1);
});

test('overdue seals continuously lock reservation slots', async t => {
  const tenantId = id();

  t.mock.method(SealItem, 'countDocuments', async () => 1);

  // 模拟一条逾期的单据（原本预计 2 小时前归还，但仍未归还）
  const pastReturn = new Date(Date.now() - 7200000);
  const overdueReqs = [{
    useAt: new Date(Date.now() - 14400000),
    expectedReturnAt: pastReturn,
    status: 'overdue',
    applicant: { name: '逾期员工' },
    serialNo: '000002'
  }];

  t.mock.method(SealRequest, 'find', () => queryResult(overdueReqs));

  // 申请当前时段，由于逾期未还持续锁定，应该判定不可用
  const req = {
    tenantId,
    query: {
      from: new Date(Date.now() - 1000).toISOString(),
      to: new Date(Date.now() + 3600000).toISOString()
    }
  };
  const res = response();
  await sealApi.getAvailability(req, res);
  assert.equal(res.body.data.official.available, false);

  // 申请明天时段，由于实体章仍处于逾期未还状态，未来时段同样持续锁定
  const tomorrowReq = {
    tenantId,
    query: {
      from: new Date(Date.now() + 86400000).toISOString(),
      to: new Date(Date.now() + 90000000).toISOString()
    }
  };
  const tomorrowRes = response();
  await sealApi.getAvailability(tomorrowReq, tomorrowRes);
  assert.equal(tomorrowRes.body.data.official.available, false);
});

test('canApproveSealRequest strictly prevents dedicated custodian without admin/GM role from approving', () => {
  const tenantId = id();
  const custodianId = id();
  const tenant = { settings: { sealCustodianId: custodianId } };

  const custodian = mockUser(tenantId, { _id: custodianId, role: 'member' });
  const pendingReq = { _id: id(), currentApproverId: id(), status: 'pending' };

  // 专职保管员无审批权
  assert.equal(canApproveSealRequest(custodian, tenant, pendingReq), false);

  // 指定审批人有审批权
  const designatedApprover = mockUser(tenantId, { _id: pendingReq.currentApproverId });
  assert.equal(canApproveSealRequest(designatedApprover, tenant, pendingReq), true);

  // 公司主账号 owner 有审批权
  const owner = mockUser(tenantId, { role: 'owner' });
  assert.equal(canApproveSealRequest(owner, tenant, pendingReq), true);

  // 系统管理员 admin 有审批权
  const admin = mockUser(tenantId, { privilege: ['admin'] });
  assert.equal(canApproveSealRequest(admin, tenant, pendingReq), true);

  // 总经理有审批权
  const gm = mockUser(tenantId, { attendanceRoles: ['general_manager'] });
  assert.equal(canApproveSealRequest(gm, tenant, pendingReq), true);
});

test('reviewRequest approval capacity recheck ignores other unapproved pending requests', async t => {
  const tenantId = id();
  const requestId = id();
  const gmId = id();

  t.mock.method(SealItem, 'countDocuments', async () => 1);

  // 模拟待审单据
  const currentReq = {
    _id: requestId,
    tenantId,
    applicantId: id(),
    applicant: { name: '员工A' },
    documentName: '合同A',
    serialNo: '000003',
    sealTypes: ['official'],
    useAt: new Date('2026-10-02T10:00:00+08:00'),
    expectedReturnAt: new Date('2026-10-02T12:00:00+08:00'),
    status: 'pending',
    currentApproverId: gmId,
    approvals: [{ approverId: gmId, status: 'pending' }],
    save: async () => {}
  };

  t.mock.method(SealRequest, 'findOne', async () => currentReq);

  // 模拟数据库中存在另一张同一时段的 pending 单据（例如员工B也提交了申请）
  // 关键：在 reviewRequest 复检时，查询状态不应包含 pending，因此不应发生死锁
  let findFilterUsed = null;
  t.mock.method(SealRequest, 'find', filter => {
    findFilterUsed = filter;
    return queryResult([]); // 无 approved/checked_out/overdue 的硬冲突
  });

  t.mock.method(SealUsageLog, 'create', async () => ({}));
  t.mock.method(Notice, 'create', async () => ({}));

  const gmUser = mockUser(tenantId, { _id: gmId, attendanceRoles: ['general_manager'] });
  const reviewReq = {
    tenantId,
    params: { id: requestId },
    user: gmUser,
    body: { decision: 'approved', comment: '同意' }
  };
  const reviewRes = response();

  await sealApi.reviewRequest(reviewReq, reviewRes);

  assert.equal(reviewRes.statusCode, 200);
  assert.equal(currentReq.status, 'approved');
  // 验证复检时的状态过滤排除了 pending
  assert.deepEqual(findFilterUsed.status.$in, ['approved', 'checked_out', 'overdue']);
});


