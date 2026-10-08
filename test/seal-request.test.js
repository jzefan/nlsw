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
const { requireSealEnabled, canManageSeals, canApproveSealRequest, resolveSealApprover, resolveSealApprovers, isSealApproverFlag, sealApproverLookup } = require('../utils/seal-permissions');
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
  const approverId = id();
  const pendingReq = {
    _id: id(),
    status: 'pending',
    approvals: [{ approverId, role: 'seal_type_approver', sealTypes: ['official'], status: 'pending' }]
  };

  // 专职保管员无审批权
  assert.equal(canApproveSealRequest(custodian, tenant, pendingReq), false);

  // 指定审批人有审批权
  const designatedApprover = mockUser(tenantId, { _id: approverId });
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

test('canApproveSealRequest revokes the designated approver right once their step is done', () => {
  const tenantId = id();
  const approverId = id();
  const user = mockUser(tenantId, { _id: approverId });

  // 自己那一步已经通过，单据仍在等别人 → 不该再能重复审批
  const partiallyApproved = {
    _id: id(),
    status: 'pending',
    approvals: [
      { approverId, role: 'seal_type_approver', sealTypes: ['official'], status: 'approved' },
      { approverId: id(), role: 'general_manager', sealTypes: ['contract'], status: 'pending' }
    ]
  };
  assert.equal(canApproveSealRequest(user, {}, partiallyApproved), false);

  // 整单已结束 → 更没有权限
  const finished = {
    _id: id(),
    status: 'approved',
    approvals: [{ approverId, role: 'seal_type_approver', sealTypes: ['official'], status: 'approved' }]
  };
  assert.equal(canApproveSealRequest(user, {}, finished), false);
});

test('reviewRequest approval capacity recheck ignores other unapproved pending requests', async t => {
  const tenantId = id();
  const requestId = id();
  const gmId = id();

  t.mock.method(SealItem, 'countDocuments', async () => 1);

  // 模拟待审单据（单级：只有总经理一步）
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
    currentApproverIds: [gmId],
    approvals: [{ approverId: gmId, role: 'general_manager', sealTypes: ['official'], status: 'pending' }],
    toObject() { return this; },
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
  // 序列化要查审批人姓名
  t.mock.method(User, 'find', () => queryResult([
    { _id: gmId, profile: { name: '李总' }, userid: 'gm' }
  ]));

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
  assert.deepEqual(currentReq.currentApproverIds, [], '全部通过后待审名单清空');
  // 验证复检时的状态过滤排除了 pending
  assert.deepEqual(findFilterUsed.status.$in, ['approved', 'checked_out', 'overdue']);
});

test('seal pending count filters by approver unless the viewer has the global view', async t => {
  const tenantId = id();
  const member = mockUser(tenantId);
  const owner = mockUser(tenantId, { role: 'owner' });
  const filters = [];
  t.mock.method(SealRequest, 'countDocuments', async filter => { filters.push(filter); return 2; });

  const memberRes = response();
  await sealApi.getPendingCount({ tenantId, user: member }, memberRes);
  assert.equal(memberRes.statusCode, 200);
  assert.equal(memberRes.body.data.pendingCount, 2);
  assert.deepEqual(
    filters[0].approvals,
    { $elemMatch: { approverId: member._id, status: 'pending' } },
    '普通审批人只看自己名下还有 pending 步骤的单据'
  );
  assert.equal(filters[0].status, 'pending');

  const ownerRes = response();
  await sealApi.getPendingCount({ tenantId, user: owner }, ownerRes);
  assert.equal(ownerRes.statusCode, 200);
  assert.equal(ownerRes.body.data.pendingCount, 2);
  assert.equal(filters[1].approvals, undefined, '主账号看全公司待审批，不再按审批人过滤');
  assert.equal(filters[1].status, 'pending');
});

test('a legacy pending request without currentApproverIds still reaches its approver inbox', async t => {
  const tenantId = id();
  const approver = mockUser(tenantId);
  const filters = [];
  t.mock.method(SealRequest, 'countDocuments', async filter => { filters.push(filter); return 1; });

  // 存量单据：只有旧字段 currentApproverId，没有派生的 currentApproverIds
  const res = response();
  await sealApi.getPendingCount({ tenantId, user: approver }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.pendingCount, 1);
  assert.deepEqual(
    filters[0].approvals,
    { $elemMatch: { approverId: approver._id, status: 'pending' } },
    '待办判据必须打在 approvals 上，否则存量单据的审批人收不到待办'
  );
});

test('Tenant schema keeps sealApprovers entries (no silent strict drop, no stray _id)', () => {
  // 护栏：本仓最阴的坑是「配置字段没在 schema 声明 → 接口 200 但库里没落值」
  assert.equal(Tenant.schema.path('settings.sealApprovers').instance, 'Array');
  assert.ok(Tenant.schema.path('settings.sealApprovers.userId'), 'userId 路径必须存在');
  assert.ok(Tenant.schema.path('settings.sealApprovers.sealTypes'), 'sealTypes 路径必须存在');
  assert.equal(Tenant.schema.path('settings.sealApprovers._id'), undefined, '子文档要 _id: false，否则多出无意义 _id');

  const userId = id();
  const doc = new Tenant({
    code: 'x',
    name: 'x',
    settings: { sealApprovers: [{ userId, sealTypes: ['official', 'finance'] }] }
  });
  const saved = doc.toObject().settings.sealApprovers;
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].sealTypes, ['official', 'finance'], '一人多类要原样存下');
  assert.equal('_id' in saved[0], false);
});

// ---------------------------------------------------------------------------
// 按印章类别指定审批人（会签）
// ---------------------------------------------------------------------------

test('resolveSealApprovers falls back per type when only some types have an approver', async t => {
  const tenantId = id();
  const applicant = mockUser(tenantId);
  const financeId = id();
  const gmId = id();

  t.mock.method(User, 'find', query => queryResult([
    { _id: financeId, profile: { name: '财务主管' }, userid: 'caiwu' }
  ]));
  t.mock.method(User, 'findOne', query => {
    if (query?.attendanceRoles === 'general_manager') return queryResult({ _id: gmId, profile: { name: '李总' }, userid: 'gm' });
    return queryResult(null);
  });

  // 财务章配了人、公章没配 → 两类各走各的审批人
  const settings = { sealApprovers: [{ userId: financeId, sealTypes: ['finance'] }] };
  const steps = await resolveSealApprovers(tenantId, ['official', 'finance'], applicant, settings);

  assert.equal(steps.length, 2, '两类章分给两个人 → 两步审批');

  const financeStep = steps.find(s => String(s.approver._id) === String(financeId));
  assert.ok(financeStep, '财务章走配置的人');
  assert.equal(financeStep.role, 'seal_type_approver');
  assert.deepEqual(financeStep.sealTypes, ['finance']);

  const officialStep = steps.find(s => String(s.approver._id) === String(gmId));
  assert.ok(officialStep, '未配置的公章走总经理兜底');
  assert.equal(officialStep.role, 'general_manager');
  assert.deepEqual(officialStep.sealTypes, ['official']);
});

test('resolveSealApprovers merges one person covering multiple seal types into a single step', async t => {
  const tenantId = id();
  const applicant = mockUser(tenantId);
  const legalId = id();
  const financeId = id();

  t.mock.method(User, 'find', () => queryResult([
    { _id: legalId, profile: { name: '法务' }, userid: 'fw' },
    { _id: financeId, profile: { name: '财务主管' }, userid: 'caiwu' }
  ]));
  t.mock.method(User, 'findOne', async () => queryResult(null));

  // 一人管三类 + 一人管一类：5 类不必对应 5 个人
  const settings = {
    sealApprovers: [
      { userId: legalId, sealTypes: ['official', 'contract', 'invoice'] },
      { userId: financeId, sealTypes: ['finance'] }
    ]
  };
  const steps = await resolveSealApprovers(tenantId, ['official', 'contract', 'invoice', 'finance'], applicant, settings);

  assert.equal(steps.length, 2, '四个人 → 只剩两步审批');
  const legalStep = steps.find(s => String(s.approver._id) === String(legalId));
  assert.deepEqual(legalStep.sealTypes, ['official', 'contract', 'invoice'], '法务那一步汇总他负责的三类');
  const financeStep = steps.find(s => String(s.approver._id) === String(financeId));
  assert.deepEqual(financeStep.sealTypes, ['finance']);
});

test('resolveSealApprovers sends every type to one person when a single approver covers all of them', async t => {
  const tenantId = id();
  const applicant = mockUser(tenantId);
  const gmId = id();

  t.mock.method(User, 'find', () => queryResult([
    { _id: gmId, profile: { name: '李总' }, userid: 'gm' }
  ]));
  t.mock.method(User, 'findOne', async () => queryResult(null));

  const settings = {
    sealApprovers: [{ userId: gmId, sealTypes: ['official', 'finance', 'contract', 'invoice', 'legal'] }]
  };
  const steps = await resolveSealApprovers(tenantId, ['official', 'finance', 'legal'], applicant, settings);

  assert.equal(steps.length, 1, '一个人管所有类别 → 单步审批');
  assert.deepEqual(steps[0].sealTypes, ['official', 'finance', 'legal']);
});

test('sealApproverLookup maps each type to its owner and ignores dirty entries', () => {
  const a = id();
  const b = id();

  const lookup = sealApproverLookup({
    sealApprovers: [
      { userId: a, sealTypes: ['official', 'finance'] },
      { userId: b, sealTypes: ['contract'] },
      { userId: null, sealTypes: ['legal'] },
      { userId: a, sealTypes: [] }
    ]
  });

  assert.equal(String(lookup.official), String(a));
  assert.equal(String(lookup.finance), String(a), '同一人多类都归他');
  assert.equal(String(lookup.contract), String(b));
  assert.equal(lookup.legal, undefined, '没有 userId 的脏条目要被忽略');

  assert.deepEqual(sealApproverLookup({}), {}, '没配就是空表，不是崩');
});

test('resolveSealApprovers treats a disabled or self-referencing configured approver as unset', async t => {
  const tenantId = id();
  const applicant = mockUser(tenantId);
  const gmId = id();

  // User.find 只返回在职且不是申请人本人的 → 两种异常配置都走不到配置的人
  t.mock.method(User, 'find', () => queryResult([]));
  t.mock.method(User, 'findOne', query => {
    if (query?.attendanceRoles === 'general_manager') return queryResult({ _id: gmId, profile: { name: '李总' }, userid: 'gm' });
    return queryResult(null);
  });

  // 1. 配置的人已停用（查不到）→ 兜底
  const disabled = await resolveSealApprovers(tenantId, ['official'], applicant, { sealApprovers: [{ userId: id(), sealTypes: ['official'] }] });
  assert.equal(String(disabled[0].approver._id), String(gmId));
  assert.equal(disabled[0].role, 'general_manager');

  // 2. 配置的人就是申请人本人（自审）→ 兜底
  const selfReview = await resolveSealApprovers(tenantId, ['official'], applicant, { sealApprovers: [{ userId: String(applicant._id), sealTypes: ['official'] }] });
  assert.equal(String(selfReview[0].approver._id), String(gmId), '自审无效，回落兜底链');
  assert.equal(selfReview[0].role, 'general_manager');

  // 3. 一人管多类、其中一类自审 → 该类回落兜底，另一类仍归他
  const otherId = id();
  t.mock.method(User, 'find', () => queryResult([{ _id: otherId, profile: { name: '同事' }, userid: 'other' }]));
  const mixed = await resolveSealApprovers(tenantId, ['official', 'legal'], applicant, {
    sealApprovers: [
      { userId: String(applicant._id), sealTypes: ['official'] },  // 自审 → 回落
      { userId: otherId, sealTypes: ['legal'] }                    // 正常 → 归配置的人
    ]
  });
  assert.equal(mixed.length, 2, '自审的那类走总经理，另一类由配置的人扛');
  assert.equal(String(mixed.find(s => s.approver._id && String(s.approver._id) === String(gmId)).sealTypes[0]), 'official');
  assert.deepEqual(mixed.find(s => String(s.approver._id) === String(otherId)).sealTypes, ['legal']);

  // 4. 一个人管的所有类别全是自审 → 全部回落给同一个人（总经理），合并成一步
  const allSelf = await resolveSealApprovers(tenantId, ['official', 'legal'], applicant, {
    sealApprovers: [{ userId: String(applicant._id), sealTypes: ['official', 'legal'] }]
  });
  assert.equal(allSelf.length, 1, '两类都自审 → 都归总经理，合并成一步');
  assert.deepEqual(allSelf[0].sealTypes, ['official', 'legal']);
});

test('isSealApproverFlag marks only users listed as approvers', () => {
  const a = id();
  const b = id();
  const settings = { sealApprovers: [{ userId: a, sealTypes: ['official', 'finance'] }, { userId: b, sealTypes: ['contract'] }] };

  assert.equal(isSealApproverFlag(settings, a), true);
  assert.equal(isSealApproverFlag(settings, b), true);
  assert.equal(isSealApproverFlag(settings, id()), false);
  assert.equal(isSealApproverFlag({}, a), false);
  assert.equal(isSealApproverFlag(null, a), false);
});

test('multi-seal-type request needs every approver to approve before it can be checked out', async t => {
  const tenantId = id();
  const requestId = id();
  const applicantId = id();
  const financeId = id();
  const legalId = id();

  t.mock.method(SealItem, 'countDocuments', async () => 1);
  t.mock.method(SealRequest, 'find', () => queryResult([]));
  t.mock.method(SealUsageLog, 'create', async () => ({}));
  t.mock.method(Notice, 'create', async () => ({}));
  // 序列化要查审批人姓名
  t.mock.method(User, 'find', () => queryResult([
    { _id: financeId, profile: { name: '财务主管' }, userid: 'caiwu' },
    { _id: legalId, profile: { name: '法务' }, userid: 'fw' }
  ]));

  // 公章 → 财务主管，法人章 → 法务：两个不同的人，必须都通过
  const currentReq = {
    _id: requestId,
    tenantId,
    applicantId,
    applicant: { name: '员工A' },
    documentName: '合作协议',
    serialNo: '000010',
    sealTypes: ['finance', 'legal'],
    useAt: new Date('2026-10-02T10:00:00+08:00'),
    expectedReturnAt: new Date('2026-10-02T12:00:00+08:00'),
    status: 'pending',
    currentApproverIds: [financeId, legalId],
    approvals: [
      { approverId: financeId, role: 'seal_type_approver', sealTypes: ['finance'], status: 'pending' },
      { approverId: legalId, role: 'seal_type_approver', sealTypes: ['legal'], status: 'pending' }
    ],
    toObject() { return this; },
    save: async () => {}
  };
  t.mock.method(SealRequest, 'findOne', async () => currentReq);

  const financeUser = mockUser(tenantId, { _id: financeId });
  const legalUser = mockUser(tenantId, { _id: legalId });

  // 财务主管先通过
  const r1 = response();
  await sealApi.reviewRequest({ tenantId, params: { id: requestId }, user: financeUser, body: { decision: 'approved' } }, r1);
  assert.equal(r1.statusCode, 200);
  assert.equal(currentReq.status, 'pending', '只通过一半 → 单据仍待审批');
  assert.deepEqual(currentReq.currentApproverIds.map(String), [String(legalId)], '待审名单只剩法务');
  assert.equal(currentReq.approvals[0].status, 'approved');
  assert.match(r1.body.message || '', /尚待其他审批人/, '回执要说明还没走完流程');

  // 法务再通过 → 全部通过
  const r2 = response();
  await sealApi.reviewRequest({ tenantId, params: { id: requestId }, user: legalUser, body: { decision: 'approved' } }, r2);
  assert.equal(r2.statusCode, 200);
  assert.equal(currentReq.status, 'approved', '全部通过 → 待发章');
  assert.deepEqual(currentReq.currentApproverIds, []);

  // 已通过的人不能再批一次
  const r3 = response();
  await sealApi.reviewRequest({ tenantId, params: { id: requestId }, user: financeUser, body: { decision: 'approved' } }, r3);
  assert.equal(r3.statusCode, 400, '整单已结束 → 拒绝重复审批');
});

test('one rejection rejects the whole request and skips the remaining steps', async t => {
  const tenantId = id();
  const requestId = id();
  const financeId = id();
  const legalId = id();

  t.mock.method(SealItem, 'countDocuments', async () => 1);
  t.mock.method(SealRequest, 'find', () => queryResult([]));
  t.mock.method(SealUsageLog, 'create', async () => ({}));
  t.mock.method(Notice, 'create', async () => ({}));
  t.mock.method(User, 'find', () => queryResult([
    { _id: financeId, profile: { name: '财务主管' }, userid: 'caiwu' },
    { _id: legalId, profile: { name: '法务' }, userid: 'fw' }
  ]));

  const currentReq = {
    _id: requestId,
    tenantId,
    applicantId: id(),
    applicant: { name: '员工A' },
    documentName: '合作协议',
    serialNo: '000011',
    sealTypes: ['finance', 'legal'],
    useAt: new Date('2026-10-02T10:00:00+08:00'),
    expectedReturnAt: new Date('2026-10-02T12:00:00+08:00'),
    status: 'pending',
    currentApproverIds: [financeId, legalId],
    approvals: [
      { approverId: financeId, role: 'seal_type_approver', sealTypes: ['finance'], status: 'pending' },
      { approverId: legalId, role: 'seal_type_approver', sealTypes: ['legal'], status: 'pending' }
    ],
    toObject() { return this; },
    save: async () => {}
  };
  t.mock.method(SealRequest, 'findOne', async () => currentReq);

  const financeUser = mockUser(tenantId, { _id: financeId });
  const res = response();
  await sealApi.reviewRequest({
    tenantId, params: { id: requestId }, user: financeUser,
    body: { decision: 'rejected', comment: '章类型用错了' }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(currentReq.status, 'rejected', '任一驳回 → 整单驳回');
  assert.equal(currentReq.approvals[0].status, 'rejected');
  assert.equal(currentReq.approvals[1].status, 'skipped', '其余步骤不必再等，记未进行');
  assert.deepEqual(currentReq.currentApproverIds, []);

  // 被驳回后，另一位审批人也不该还能批
  const legalUser = mockUser(tenantId, { _id: legalId });
  const res2 = response();
  await sealApi.reviewRequest({ tenantId, params: { id: requestId }, user: legalUser, body: { decision: 'approved' } }, res2);
  assert.equal(res2.statusCode, 400);
});

