const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const PayrollStatement = require('../models/PayrollStatement');
const PayrollRoleMutationLock = require('../models/PayrollRoleMutationLock');
const userApi = require('../controllers/api/user');
const userController = require('../controllers/user');
const platformApi = require('../controllers/api/platform');
const payrollApi = require('../controllers/api/payroll');
const { hasProtectedIdentity, hasProtectedPrivileges, hasProtectedCredentials } = require('../utils/user-security');

const id = () => new mongoose.Types.ObjectId();
function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end(body) { this.body = JSON.parse(body); return this; },
    send(body) { this.body = body; return this; }
  };
}
function employee(fields = {}) {
  return {
    _id: id(), tenantId: id(), role: 'member', userid: 'ordinary-employee',
    password: 'original-hash', phone: '13800000001', profile: { name: '员工', phone: '13800000001' },
    employeeNo: '', payrollRoles: [], attendanceRoles: [], privilege: [],
    sessionVersion: 3, securityIdentityVersion: 2, ...fields
  };
}

// Reads return detached documents; only matching database writes change persisted state.
function userStore(t, initial) {
  let persisted = initial;
  const writes = [];
  const snapshot = () => persisted && { ...persisted, profile: { ...persisted.profile } };
  const matches = filter => persisted && Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some(matches);
    if (value && typeof value === 'object' && '$exists' in value) return (persisted[key] !== undefined) === value.$exists;
    return String(persisted[key]) === String(value);
  });
  const query = value => ({ select() { return this; }, exec: async () => value, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) });
  t.mock.method(PayrollRoleMutationLock, 'findOneAndUpdate', async () => ({}));
  t.mock.method(PayrollRoleMutationLock, 'deleteOne', async () => ({ deletedCount: 1 }));
  t.mock.method(User, 'findOne', filter => query(matches(filter) ? snapshot() : null));
  t.mock.method(User, 'findById', userId => query(String(persisted?._id) === String(userId) ? snapshot() : null));
  t.mock.method(User, 'hashPassword', async password => `hash:${password}`);
  t.mock.method(User, 'updateOne', async (filter, update) => {
    writes.push({ filter, update });
    if (!matches(filter)) return { modifiedCount: 0 };
    for (const [key, value] of Object.entries(update.$set || {})) {
      if (key.startsWith('profile.')) persisted.profile[key.slice(8)] = value;
      else persisted[key] = value;
    }
    for (const key of Object.keys(update.$unset || {})) delete persisted[key];
    for (const [key, value] of Object.entries(update.$inc || {})) persisted[key] = (persisted[key] || 0) + value;
    return { modifiedCount: 1 };
  });
  t.mock.method(User, 'deleteOne', async filter => {
    writes.push({ filter });
    if (!matches(filter)) return { deletedCount: 0 };
    persisted = null;
    return { deletedCount: 1 };
  });
  return { snapshot, writes };
}

// 删除与改登录手机号属「接管身份」，对任何员工身份都禁止，与能否重置密码无关。
async function assertTakeoverBlocked(target, actor, tenantId) {
  const req = body => ({ user: actor, tenantId, body });
  const actions = [
    res => userApi.postUserMgr(req({ act: 'modify', data: { userid: target.userid, phone: 'attacker-phone', privilege: [] } }), res),
    res => userApi.postUserMgr(req({ act: 'delete', userid: target.userid }), res),
    res => userController.postUserMgr(req({ act: 'modify', data: { userid: target.userid, phone: 'attacker-phone', privilege: [] } }), res),
    res => userController.postUserMgr(req({ act: 'delete', userid: target.userid }), res)
  ];
  for (const action of actions) {
    const res = response();
    await action(res);
    assert.equal(res.statusCode, 403);
  }
}

// 重置密码已按角色分级：普通员工允许主账号/平台管理员重置。
async function assertResetAllowed(target, actor, tenantId) {
  for (const reset of [
    res => userApi.resetPassword({ user: actor, tenantId, body: { user: { userid: target.userid } } }, res),
    res => userController.postResetPassword({ user: actor, tenantId, body: { user: { userid: target.userid } } }, res, error => { throw error; })
  ]) {
    const res = response();
    await reset(res);
    assert.equal(res.statusCode, 200);
  }
  const platformRes = response();
  await platformApi.resetUserPassword({ body: { userId: target._id } }, platformRes);
  assert.equal(platformRes.statusCode, 200);
}

// 受保护凭据（总经理/管理员/薪资/考勤角色/平台身份）三条重置入口都必须 403。
async function assertProtectedRoutes(target, actor, tenantId) {
  const req = body => ({ user: actor, tenantId, body });
  const actions = [
    res => userApi.resetPassword(req({ user: { userid: target.userid } }), res),
    res => userApi.postUserMgr(req({ act: 'modify', data: { userid: target.userid, phone: 'attacker-phone', privilege: [] } }), res),
    res => userApi.postUserMgr(req({ act: 'delete', userid: target.userid }), res),
    res => userController.postResetPassword(req({ user: { userid: target.userid } }), res, error => { throw error; }),
    res => userController.postUserMgr(req({ act: 'modify', data: { userid: target.userid, phone: 'attacker-phone', privilege: [] } }), res),
    res => userController.postUserMgr(req({ act: 'delete', userid: target.userid }), res),
    res => platformApi.resetUserPassword({ body: { userId: target._id } }, res)
  ];
  for (const action of actions) {
    const res = response();
    await action(res);
    assert.equal(res.statusCode, 403);
  }
}

test('ordinary employee can be reset by owner or platform but still cannot be taken over or deleted', async t => {
  const target = employee();
  const store = userStore(t, target);
  t.mock.method(PayrollStatement, 'find', filter => {
    assert.equal(String(filter.tenantId), String(target.tenantId));
    assert.equal(String(filter.employeeId), String(target._id));
    return { sort() { return this; }, lean: async () => [{
      month: '2026-09', currentPublishedRevision: 1, payments: [],
      revisions: [{ revision: 1, employee: { name: '员工' }, components: {}, totals: { netPayCents: 500000 } }]
    }] };
  });
  const salary = response();
  await payrollApi.getMyStatements({ user: store.snapshot(), tenantId: target.tenantId, query: { year: '2026' } }, salary);
  assert.equal(salary.body.data.rows[0].totals.netPayCents, 500000);
  // 员工身份本身仍受保护：接管与删除两条路依然被拦。
  await assertTakeoverBlocked(target, { _id: id(), role: 'member', privilege: ['admin'] }, target.tenantId);
  assert.equal(store.snapshot().password, 'original-hash');
  // 但主账号/平台管理员可以重置其密码（忘记密码的恢复入口）。
  await assertResetAllowed(target, { _id: id(), role: 'owner', privilege: ['admin'] }, target.tenantId);
  assert.equal(store.snapshot().password, 'hash:123456');
  assert.equal(store.snapshot().mustChangePassword, true);
  // 三条重置入口各使 sessionVersion +1（起始 3）。
  assert.equal(store.snapshot().sessionVersion, 6);
});

for (const [label, fields] of [
  ['disabled status', { status: 'disabled' }],
  ['attendance exclusion', { attendanceTracked: false }],
  ['populated tenant', { tenantId: { _id: id() } }]
]) {
  test(`employee identity remains protected with ${label}`, async t => {
    const target = employee(fields);
    const store = userStore(t, target);
    assert.equal(hasProtectedIdentity(target), true);
    // 员工身份不受停用/排除考勤影响：接管与删除仍然被拦（重置密码已按角色分级放开）。
    await assertTakeoverBlocked(target, { _id: id(), role: 'member', privilege: ['admin'] }, target.tenantId);
    assert.equal(store.writes.length, 0);
  });
}

test('owners and platform actors cannot take over or delete a company member, but may reset its password', async t => {
  const target = employee();
  const store = userStore(t, target);
  for (const role of ['owner', 'platform']) {
    await assertTakeoverBlocked(target, { _id: id(), role, privilege: [] }, target.tenantId);
  }
  assert.equal(store.writes.length, 0);
  assert.equal(store.snapshot().password, 'original-hash');

  await assertResetAllowed(target, { _id: id(), role: 'owner', privilege: [] }, target.tenantId);
  assert.equal(store.snapshot().password, 'hash:123456');
});

test('administrator can still maintain ordinary employee system privileges without changing credentials', async t => {
  const target = employee();
  const store = userStore(t, target);
  assert.equal(hasProtectedIdentity(target), true);
  assert.equal(hasProtectedPrivileges(target), false);
  const actor = { _id: id(), role: 'member', privilege: ['admin'] };
  for (const [controller, privilege] of [[userApi, ['operator']], [userController, ['statistics']]]) {
    const res = response();
    await controller.postUserMgr({ user: actor, tenantId: target.tenantId, body: { act: 'modify', data: {
      userid: target.userid, name: target.profile.name, phone: target.phone, privilege
    } } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.deepEqual(store.snapshot().privilege, privilege);
    assert.equal(store.snapshot().password, 'original-hash');
    assert.equal(store.snapshot().phone, '13800000001');
  }
});

test('leader titles and platform identities stay protected without optional employee roles', async t => {
  for (const title of ['gm', '总经理', 'ceo', '董事长']) {
    const leader = employee({ tenantId: undefined, title });
    const store = userStore(t, leader);
    assert.equal(hasProtectedIdentity(leader), true);
    const res = response();
    await platformApi.resetUserPassword({ body: { userId: leader._id } }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(store.writes.length, 0);
  }
  const target = employee({ tenantId: undefined, role: 'platform' });
  const store = userStore(t, target);
  await assertProtectedRoutes(target, { _id: id(), role: 'platform' }, undefined);
  assert.equal(store.writes.length, 0);
});

test('the graded reset rule keys on authority-bearing attributes, not on having a tenant', async t => {
  // 工号已全员回填，不能再作为「此账号受保护」的信号：普通员工带工号也允许重置。
  const ordinary = employee({ employeeNo: 'E-9' });
  assert.equal(hasProtectedIdentity(ordinary), true, '员工身份本身仍受保护（接管/删除照旧被拦）');
  assert.equal(hasProtectedCredentials(ordinary), false, '带工号的普通员工不拦重置');

  // 反面：一旦带上管理权或涉薪考勤角色，就必须拦住重置。
  for (const [label, fields] of [
    ['owner role', { role: 'owner' }],
    ['admin privilege', { privilege: ['admin'] }],
    ['payroll role', { payrollRoles: ['finance'] }],
    ['attendance role', { attendanceRoles: ['attendance_admin'] }],
    ['GM title', { title: '总经理' }],
    ['platform role', { role: 'platform', tenantId: undefined }]
  ]) {
    assert.equal(hasProtectedCredentials(employee(fields)), true, `${label} 必须拦住重置`);
  }
});

test('unlinked ordinary legacy accounts retain generic recovery and deletion behavior', async t => {
  const target = employee({ tenantId: undefined });
  const store = userStore(t, target);
  assert.equal(hasProtectedIdentity(target), false);
  const reset = response();
  await platformApi.resetUserPassword({ body: { userId: target._id } }, reset);
  assert.equal(reset.statusCode, 200);
  assert.equal(reset.body.ok, true);
  assert.equal(store.snapshot().password, 'hash:123456');
  assert.equal(store.snapshot().mustChangePassword, true);
  assert.equal(store.snapshot().sessionVersion, 4);
  assert.equal(store.snapshot().securityIdentityVersion, 3);
  const removed = response();
  await userApi.postUserMgr({ user: { _id: id(), role: 'platform' }, body: { act: 'delete', userid: target.userid } }, removed);
  assert.equal(removed.body.ok, true);
  assert.equal(store.snapshot(), null);
});
