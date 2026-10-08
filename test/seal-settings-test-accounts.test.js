const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const sealApi = require('../controllers/api/seal');
const { filterRealEmployees } = require('../utils/test-account');

function id() { return new mongoose.Types.ObjectId(); }
function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}
function query(value) {
  // 候选名单那条链是 .select().sort().lean()，桩要还原整条链，否则报 sort is not a function
  return {
    select() { return this; },
    sort() { return this; },
    lean: async () => value,
    then: (a, b) => Promise.resolve(value).then(a, b),
  };
}
function account(userid, name, role = 'member', employeeNo = '') {
  return { _id: id(), userid, role, employeeNo, profile: { name }, department: '物流', title: '' };
}

/** 用章设置的三类名单都要按同一判据过滤：候选、已存保管员、已存审批人。 */
const REAL = [
  account('HL', '韩磊', 'owner', '001'),
  account('zhangsan', '张三', 'member', '006'),
];
const TESTING = [
  account('test', 'lingyanxie', 'member', '002'),
  account('test-new', 'test-new', 'member', '030'),
];
/** owner 命中前缀也要留着 —— 用户本人就是 zefan，排掉就没人能维护系统 */
const OWNER_WITH_TEST_PREFIX = [account('zefan', 'Zefan JIANG', 'owner', '003')];

test('用章候选名单排除测试账号，保留 owner', async t => {
  const tenantId = id();
  t.mock.method(Tenant, 'findById', () => query({ settings: { sealCustodianIds: [], sealApprovers: undefined } }));
  t.mock.method(User, 'find', () => query([...REAL, ...TESTING, ...OWNER_WITH_TEST_PREFIX]));
  t.mock.method(User, 'findOne', () => query(null));

  const res = response();
  await sealApi.getSettings({ tenantId }, res);

  assert.equal(res.statusCode, 200);
  const ids = res.body.data.candidates.map(item => item.userid);
  assert.deepEqual(ids.sort(), ['HL', 'zefan', 'zhangsan']);
  assert.ok(!ids.includes('test'), 'test 账号不在候选里');
  assert.ok(!ids.includes('test-new'), 'test-new 账号不在候选里');
  assert.ok(ids.includes('zefan'), 'owner 即使命中前缀也要留着');
});

test('库里已存的保管员/审批人若是测试账号，下发时要剔掉（光过滤候选不够）', async t => {
  const tenantId = id();
  // 这是最容易漏的一处：设置是从库里读**已存的 id**，候选列表过滤了不代表这里也过滤了
  const testingId = TESTING[0]._id;
  const testing2Id = TESTING[1]._id;
  t.mock.method(Tenant, 'findById', () => query({
    settings: {
      // 历史配置里存了测试账号（那时还没有这个规则）
      sealCustodianIds: [String(testingId), String(REAL[0]._id)],
      sealApprovers: [
        { userId: String(testingId), sealTypes: ['official'] },
        { userId: String(testing2Id), sealTypes: ['finance'] },
        { userId: String(REAL[1]._id), sealTypes: ['contract'] },
      ],
    },
  }));
  t.mock.method(User, 'find', () => query([...REAL, ...TESTING, ...OWNER_WITH_TEST_PREFIX]));

  const res = response();
  await sealApi.getSettings({ tenantId }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.sealCustodianIds, [String(REAL[0]._id)], '保管员里的测试账号要剔掉');
  assert.deepEqual(
    res.body.data.sealApprovers.map(item => item.userId),
    [String(REAL[1]._id)],
    '审批人里的两个测试账号都要剔掉，只留真员工',
  );
});

test('写入时把测试账号指定为保管员/审批人会被拒，且不落库', async t => {
  const tenantId = id();
  const testingUser = TESTING[0];
  // tenant.save() 刻意打桩成抛错：一旦守卫没拦住、真的走到保存，我们就会看到而不是静默写库
  t.mock.method(Tenant, 'findById', () => query({ settings: {} }));
  t.mock.method(User, 'find', () => query([testingUser]));
  t.mock.method(User, 'findOne', () => query(testingUser));
  const saveCalls = [];
  t.mock.method(Tenant.prototype, 'save', async function () { saveCalls.push(this); });

  const custodianRes = response();
  await sealApi.updateSettings({ tenantId, body: { sealCustodianId: String(testingUser._id) } }, custodianRes);
  assert.equal(custodianRes.statusCode, 400);
  assert.match(custodianRes.body.error, /保管员/);

  const approverRes = response();
  await sealApi.updateSettings({ tenantId, body: { sealApprovers: [{ userId: String(testingUser._id), sealTypes: ['official'] }] } }, approverRes);
  assert.equal(approverRes.statusCode, 400);
  assert.match(approverRes.body.error, /审批人/);

  assert.equal(saveCalls.length, 0, '被拒的两次都不该走到保存');
});

test('测试账号判据与用章过滤用的是同一份（改一处不会两处不一致）', () => {
  const all = [account('HL', '韩磊'), account('test', 'lingyanxie'), account('zefan', 'Zefan JIANG', 'owner')];
  assert.deepEqual(filterRealEmployees(all).map(user => user.userid), ['HL', 'zefan']);
});