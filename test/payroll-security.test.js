const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const userApi = require('../controllers/api/user');
const userController = require('../controllers/user');
const platformApi = require('../controllers/api/platform');
const { bumpSessionVersion } = require('../utils/user-security');
const { __testables: passportTestables } = require('../config/passport');
const PayrollRoleMutationLock = require('../models/PayrollRoleMutationLock');

function id() { return new mongoose.Types.ObjectId(); }

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function queryResult(value) {
  return {
    select() { return this; },
    lean() { return Promise.resolve(value); },
    exec: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
  };
}

function payrollUser(tenantId, fields = {}) {
  return {
    _id: id(), tenantId, userid: 'finance-user', phone: '11111111',
    profile: { name: '财务', phone: '11111111' }, payrollRoles: ['finance'],
    privilege: [], sessionVersion: 4, password: 'hashed',
    async save() { this.saved = true; },
    ...fields
  };
}

// Keep loaded documents separate from storage and enforce CAS, as MongoDB does.
function identityStore(t, users, { beforeWrite } = {}) {
  const clone = user => user ? ({ ...user, profile: { ...user.profile }, payrollRoles: [...(user.payrollRoles || [])], attendanceRoles: [...(user.attendanceRoles || [])], payrollRoleAudit: [...(user.payrollRoleAudit || [])] }) : null;
  const rows = new Map(users.map(user => [String(user._id), clone(user)]));
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some(part => matches(row, part));
    const actual = row[key];
    if (value instanceof RegExp) return value.test(actual || '');
    if (value && typeof value === 'object' && !value._bsontype) {
      if ('$ne' in value) return String(actual) !== String(value.$ne);
      if ('$exists' in value) return (actual !== undefined) === value.$exists;
      if ('$in' in value) return value.$in.some(item => String(actual) === String(item));
    }
    return Array.isArray(actual) ? actual.includes(value) : String(actual) === String(value);
  });
  const result = value => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, exec: async () => value, lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
  let locked = false;
  t.mock.method(PayrollRoleMutationLock, 'findOneAndUpdate', async () => {
    if (locked) throw Object.assign(new Error('duplicate lock'), { code: 11000 });
    locked = true; return {};
  });
  t.mock.method(PayrollRoleMutationLock, 'deleteOne', async () => { locked = false; return { deletedCount: 1 }; });
  t.mock.method(User, 'findOne', filter => result(clone([...rows.values()].find(row => matches(row, filter)))));
  t.mock.method(User, 'find', filter => result([...rows.values()].filter(row => matches(row, filter)).map(clone)));
  t.mock.method(User, 'updateOne', async (filter, update) => {
    const injected = beforeWrite?.(filter, update, rows);
    if (injected) return injected;
    const row = [...rows.values()].find(row => matches(row, filter));
    if (!row) return { modifiedCount: 0 };
    Object.assign(row, update.$set);
    for (const key of Object.keys(update.$unset || {})) delete row[key];
    for (const [key, amount] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + amount;
    for (const [key, item] of Object.entries(update.$push || {})) row[key] = [...(row[key] || []), item];
    return { modifiedCount: 1 };
  });
  return { rows, isLocked: () => locked };
}

test('GM position changes atomically move both roles and reservations using real CAS conditions', async t => {
  const tenantId = id();
  const former = payrollUser(tenantId, { userid: 'former', title: '总经理', payrollRoles: ['finance', 'general_manager'], attendanceRoles: ['general_manager'], securityIdentityVersion: 5, payrollGeneralManagerTenantId: tenantId, attendanceGeneralManagerTenantId: tenantId });
  const successor = payrollUser(tenantId, { userid: 'successor', title: 'operator', payrollRoles: [], attendanceRoles: ['manager'], securityIdentityVersion: 3 });
  const store = identityStore(t, [former, successor]);
  const res = response();
  await userApi.postUserMgr({ user: { _id: id(), role: 'owner' }, tenantId, body: { act: 'modify', data: { userid: successor.userid, name: '接任人', phone: successor.phone, privilege: [], title: 'gm' } } }, res);
  assert.equal(res.body.ok, true);
  const old = store.rows.get(String(former._id)), next = store.rows.get(String(successor._id));
  assert.equal(old.title, '');
  assert.deepEqual(old.payrollRoles, ['finance']);
  assert.deepEqual(old.attendanceRoles, []);
  assert.equal(old.payrollGeneralManagerTenantId, undefined);
  assert.equal(old.attendanceGeneralManagerTenantId, undefined);
  assert.equal(next.title, 'gm');
  assert.deepEqual(next.payrollRoles, ['general_manager']);
  assert.deepEqual(next.attendanceRoles, ['manager', 'general_manager']);
  assert.equal(String(next.payrollGeneralManagerTenantId), String(tenantId));
  assert.equal(String(next.attendanceGeneralManagerTenantId), String(tenantId));
  assert.equal(store.isLocked(), false);
});

test('demoting a GM clears the position, both roles and reservations in one CAS', async t => {
  const tenantId = id();
  const manager = payrollUser(tenantId, { title: 'gm', payrollRoles: ['finance', 'general_manager'], attendanceRoles: ['attendance_admin', 'general_manager'], securityIdentityVersion: 7, payrollGeneralManagerTenantId: tenantId, attendanceGeneralManagerTenantId: tenantId });
  const store = identityStore(t, [manager]);
  const res = response();
  await userApi.postUserMgr({ user: { _id: id(), role: 'member', privilege: ['admin'] }, tenantId, body: { act: 'modify', data: { userid: manager.userid, title: 'operator', name: manager.profile.name, phone: manager.phone, privilege: [] } } }, res);
  assert.equal(res.body.ok, true);
  const persisted = store.rows.get(String(manager._id));
  assert.equal(persisted.title, 'operator');
  assert.deepEqual(persisted.payrollRoles, ['finance']);
  assert.deepEqual(persisted.attendanceRoles, ['attendance_admin']);
  assert.equal(persisted.payrollGeneralManagerTenantId, undefined);
  assert.equal(persisted.attendanceGeneralManagerTenantId, undefined);
  assert.equal(persisted.securityIdentityVersion, 8);
});

test('a failed successor CAS restores the former GM without committing the successor position', async t => {
  const tenantId = id();
  const former = payrollUser(tenantId, { userid: 'former', title: '总经理', attendanceRoles: ['general_manager'], payrollRoles: ['general_manager'], securityIdentityVersion: 2, payrollGeneralManagerTenantId: tenantId, attendanceGeneralManagerTenantId: tenantId });
  const successor = payrollUser(tenantId, { userid: 'successor', title: 'operator', payrollRoles: [], securityIdentityVersion: 4 });
  const store = identityStore(t, [former, successor], { beforeWrite: filter => String(filter._id) === String(successor._id) ? { modifiedCount: 0 } : null });
  const res = response();
  await userApi.postUserMgr({ user: { _id: id(), role: 'owner' }, tenantId, body: { act: 'modify', data: { userid: successor.userid, title: 'gm', phone: successor.phone, name: '新总经理', privilege: [] } } }, res);
  assert.equal(res.statusCode, 409);
  const old = store.rows.get(String(former._id)), next = store.rows.get(String(successor._id));
  assert.equal(old.title, '总经理');
  assert.deepEqual(old.attendanceRoles, ['general_manager']);
  assert.deepEqual(old.payrollRoles, ['general_manager']);
  assert.equal(String(old.payrollGeneralManagerTenantId), String(tenantId));
  assert.equal(String(old.attendanceGeneralManagerTenantId), String(tenantId));
  assert.equal(next.title, 'operator');
  assert.equal(next.securityIdentityVersion, 4);
  assert.equal(store.isLocked(), false);
});

test('a conflicting former GM write stops promotion before assigning the successor', async t => {
  const tenantId = id();
  const former = payrollUser(tenantId, { userid: 'former', title: 'gm', payrollRoles: ['general_manager'], securityIdentityVersion: 2 });
  const successor = payrollUser(tenantId, { userid: 'successor', title: 'operator', payrollRoles: [], securityIdentityVersion: 4 });
  const store = identityStore(t, [former, successor], { beforeWrite: filter => String(filter._id) === String(former._id) ? { modifiedCount: 0 } : null });
  const res = response();
  await userApi.postUserMgr({ user: { _id: id(), role: 'owner' }, tenantId, body: { act: 'modify', data: { userid: successor.userid, title: 'gm', phone: successor.phone, privilege: [] } } }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(store.rows.get(String(former._id)).title, 'gm');
  assert.equal(store.rows.get(String(successor._id)).title, 'operator');
});

test('adding a GM persists complete identity while holding the shared role lock', async t => {
  const tenantId = id();
  const former = payrollUser(tenantId, { userid: 'former', title: 'gm', payrollRoles: ['general_manager'], attendanceRoles: ['general_manager'], securityIdentityVersion: 2, payrollGeneralManagerTenantId: tenantId, attendanceGeneralManagerTenantId: tenantId });
  const store = identityStore(t, [former]);
  let created;
  t.mock.method(User.prototype, 'save', async function () {
    assert.equal(store.isLocked(), true);
    created = this.toObject();
    store.rows.set(String(this._id), created);
    return this;
  });
  const res = response();
  await userApi.postUserMgr({ user: { _id: id(), role: 'owner' }, tenantId, body: { act: 'add', data: { userid: 'new-gm', title: 'gm', privilege: [], name: '新总经理', phone: '999' } } }, res);
  assert.equal(res.body.ok, true);
  assert.equal(created.title, 'gm');
  assert.deepEqual(created.payrollRoles, ['general_manager']);
  assert.deepEqual(created.attendanceRoles, ['general_manager']);
  assert.equal(String(created.payrollGeneralManagerTenantId), String(tenantId));
  assert.equal(String(created.attendanceGeneralManagerTenantId), String(tenantId));
  assert.equal(store.rows.get(String(former._id)).title, '');
  assert.equal(store.isLocked(), false);
});

test('a failed new GM save compensates the old identity on standalone storage', async t => {
  const tenantId = id();
  const former = payrollUser(tenantId, { userid: 'former', title: 'gm', payrollRoles: ['general_manager'], attendanceRoles: ['general_manager'], securityIdentityVersion: 2, payrollGeneralManagerTenantId: tenantId, attendanceGeneralManagerTenantId: tenantId });
  const store = identityStore(t, [former]);
  t.mock.method(User.prototype, 'save', async () => { throw Object.assign(new Error('duplicate login'), { code: 11000 }); });
  const res = response();
  await userApi.postUserMgr({ user: { _id: id(), role: 'owner' }, tenantId, body: { act: 'add', data: { userid: 'existing', title: 'gm', privilege: [], name: '新总经理', phone: '999' } } }, res);
  assert.equal(res.statusCode, 409);
  const restored = store.rows.get(String(former._id));
  assert.equal(restored.title, 'gm');
  assert.deepEqual(restored.attendanceRoles, ['general_manager']);
  assert.equal(String(restored.attendanceGeneralManagerTenantId), String(tenantId));
  assert.equal(store.rows.size, 1);
});

test('GM handover moves attendance identity too and clears legacy Chinese GM titles', async t => {
  const tenantId = id();
  const former = payrollUser(tenantId, { userid: 'former', title: '总经理', payrollRoles: ['general_manager'], attendanceRoles: ['general_manager'], securityIdentityVersion: 2, payrollGeneralManagerTenantId: tenantId, attendanceGeneralManagerTenantId: tenantId });
  const successor = payrollUser(tenantId, { userid: 'successor', title: 'operator', payrollRoles: [], attendanceRoles: ['manager'], securityIdentityVersion: 4 });
  const store = identityStore(t, [former, successor]);
  const res = response();
  await userApi.handoverPayrollGeneralManager({ user: { _id: former._id, role: 'member' }, tenantId, headers: { origin: 'https://company.test', host: 'company.test' }, get(name) { return this.headers[name]; }, body: { targetUserId: successor._id, reason: '岗位调整' } }, res);
  assert.equal(res.body.ok, true);
  const old = store.rows.get(String(former._id)), next = store.rows.get(String(successor._id));
  assert.equal(old.title, '');
  assert.deepEqual(old.attendanceRoles, []);
  assert.equal(old.attendanceGeneralManagerTenantId, undefined);
  assert.equal(next.title, 'gm');
  assert.deepEqual(next.attendanceRoles, ['manager', 'general_manager']);
  assert.equal(String(next.attendanceGeneralManagerTenantId), String(tenantId));
});

test('the legacy user page shares the GM identity transition and preserves its failure response', async t => {
  const tenantId = id();
  const former = payrollUser(tenantId, { userid: 'former', title: 'gm', payrollRoles: ['general_manager'], attendanceRoles: ['general_manager'], securityIdentityVersion: 2, payrollGeneralManagerTenantId: tenantId, attendanceGeneralManagerTenantId: tenantId });
  const successor = payrollUser(tenantId, { userid: 'successor', title: 'operator', payrollRoles: [], securityIdentityVersion: 4 });
  let failTarget = false;
  const store = identityStore(t, [former, successor], { beforeWrite: filter => failTarget && String(filter._id) === String(successor._id) ? { modifiedCount: 0 } : null });
  const request = { user: { _id: id(), role: 'owner', tenantId }, body: { act: 'modify', data: { userid: successor.userid, title: 'gm', phone: successor.phone, privilege: [], name: '新总经理' } } };
  const success = response();
  await userController.postUserMgr(request, success);
  assert.equal(success.body.ok, true);
  const old = store.rows.get(String(former._id)), next = store.rows.get(String(successor._id));
  assert.equal(old.title, '');
  assert.deepEqual(old.attendanceRoles, []);
  assert.equal(old.attendanceGeneralManagerTenantId, undefined);
  assert.equal(next.title, 'gm');
  assert.deepEqual(next.attendanceRoles, ['general_manager']);
  assert.deepEqual(next.payrollRoles, ['general_manager']);
  assert.equal(String(next.attendanceGeneralManagerTenantId), String(tenantId));
  assert.equal(String(next.payrollGeneralManagerTenantId), String(tenantId));
  failTarget = true;
  request.body.data.title = 'operator';
  const failed = response();
  await userController.postUserMgr(request, failed);
  assert.equal(failed.statusCode, 409);
  assert.equal(failed.body.ok, false);
  assert.match(failed.body.response, /刷新后重试/);
  assert.equal(next.title, 'gm');
});

test('an occupied role lock blocks a GM position write before changing identities', async t => {
  const tenantId = id();
  const target = payrollUser(tenantId, { title: 'operator', payrollRoles: [], securityIdentityVersion: 4 });
  const store = identityStore(t, [target]);
  t.mock.method(PayrollRoleMutationLock, 'findOneAndUpdate', async () => { throw Object.assign(new Error('duplicate lock'), { code: 11000 }); });
  const res = response();
  await userApi.postUserMgr({ user: { _id: id(), role: 'owner' }, tenantId, body: { act: 'modify', data: { userid: target.userid, title: 'gm', phone: target.phone, privilege: [] } } }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(store.rows.get(String(target._id)).title, 'operator');
  assert.equal(store.rows.get(String(target._id)).securityIdentityVersion, 4);
});

test('failed GM compensation surfaces an explicit recovery error without overwriting a concurrent version', async t => {
  const tenantId = id();
  const former = payrollUser(tenantId, { userid: 'former', title: 'gm', payrollRoles: ['general_manager'], securityIdentityVersion: 2 });
  const successor = payrollUser(tenantId, { userid: 'successor', title: 'operator', payrollRoles: [], securityIdentityVersion: 4 });
  const store = identityStore(t, [former, successor], { beforeWrite: (filter, update, rows) => {
    if (String(filter._id) === String(successor._id)) {
      rows.get(String(former._id)).securityIdentityVersion++;
      return { modifiedCount: 0 };
    }
  } });
  const res = response();
  await userApi.postUserMgr({ user: { _id: id(), role: 'owner' }, tenantId, body: { act: 'modify', data: { userid: successor.userid, title: 'gm', phone: successor.phone, privilege: [] } } }, res);
  assert.equal(res.statusCode, 500);
  assert.match(res.body.message, /自动恢复失败.*联系管理员/);
  assert.equal(store.rows.get(String(former._id)).securityIdentityVersion, 4);
  assert.equal(store.rows.get(String(successor._id)).title, 'operator');
});

test('admin cannot reset, re-identify, or delete a different payroll user', async t => {
  const tenantId = id();
  const actorId = id();
  const target = payrollUser(tenantId);
  t.mock.method(User, 'findOne', () => queryResult(target));
  t.mock.method(User, 'deleteOne', async () => { assert.fail('payroll user must not be deleted'); });

  const actor = { _id: actorId, role: 'member', privilege: ['admin'] };
  const resetResponse = response();
  await userApi.resetPassword({ user: actor, tenantId, body: { user: { userid: target.userid } } }, resetResponse);
  assert.equal(resetResponse.statusCode, 403);
  assert.equal(target.password, 'hashed');
  assert.equal(target.sessionVersion, 4);

  const phoneResponse = response();
  await userApi.postUserMgr({ user: actor, tenantId, body: { act: 'modify', data: { userid: target.userid, phone: 'attacker-phone' } } }, phoneResponse);
  assert.equal(phoneResponse.statusCode, 403);
  assert.equal(target.phone, '11111111');
  assert.equal(target.profile.phone, '11111111');

  const deleteResponse = response();
  await userApi.postUserMgr({ user: actor, tenantId, body: { act: 'delete', userid: target.userid } }, deleteResponse);
  assert.equal(deleteResponse.statusCode, 403);
});

test('generic user CRUD rejects direct payroll role injection', async t => {
  const tenantId = id();
  const target = payrollUser(tenantId, { payrollRoles: [], mustChangePassword: true });
  let currentTarget = target;
  t.mock.method(User, 'findOne', () => queryResult(currentTarget));
  const res = response();
  await userApi.postUserMgr({
    user: { _id: id(), role: 'member', privilege: ['admin'] },
    tenantId,
    body: { act: 'modify', data: { userid: target.userid, phone: target.phone, payrollRoles: ['general_manager'] } }
  }, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(target.payrollRoles, []);
  assert.equal(target.saved, undefined);

  const protectedAdmin = payrollUser(tenantId, { privilege: ['admin'], payrollRoles: [] });
  currentTarget = protectedAdmin;
  const demote = response();
  await userApi.postUserMgr({
    user: { _id: id(), role: 'member', privilege: ['admin'] }, tenantId,
    body: { act: 'modify', data: { userid: protectedAdmin.userid, phone: protectedAdmin.phone, privilege: [] } }
  }, demote);
  assert.equal(demote.statusCode, 403, 'generic edit cannot remove a protected administrator\'s privilege');
});

test('identity CAS conflict blocks a stale credential reset', async t => {
  const tenantId = id(), target = payrollUser(undefined, { payrollRoles: [], securityIdentityVersion: 4 });
  t.mock.method(User, 'findOne', () => queryResult(target));
  t.mock.method(User, 'updateOne', async () => ({ modifiedCount: 0 }));
  const reset = response();
  await userApi.resetPassword({ user: { _id: id(), role: 'platform' }, tenantId, body: { user: { userid: target.userid } } }, reset);
  assert.equal(reset.statusCode, 409);
  assert.equal(target.password, 'hashed');
});

test('finance roles are managed by owner, admin or the GM; the GM title itself comes from user management', async t => {
  const tenantId = id();
  const generalManager = payrollUser(tenantId, { payrollRoles: ['general_manager'], employeeNo: 'G-1', status: 'active' });
  const financeTarget = payrollUser(tenantId, { payrollRoles: [], employeeNo: 'E-2', status: 'active' });
  t.mock.method(PayrollRoleMutationLock, 'findOneAndUpdate', async () => ({}));
  t.mock.method(PayrollRoleMutationLock, 'deleteOne', async () => ({ deletedCount: 1 }));
  t.mock.method(User, 'findOne', filter => queryResult(String(filter._id) === String(financeTarget._id) ? financeTarget : generalManager));
  t.mock.method(User, 'updateOne', async (filter, update) => {
    const user = String(filter._id) === String(financeTarget._id) ? financeTarget : generalManager;
    user.payrollRoles = update.$set.payrollRoles;
    user.payrollRoleAudit = [...(user.payrollRoleAudit || []), update.$push.payrollRoleAudit];
    user.sessionVersion = (user.sessionVersion || 0) + update.$inc.sessionVersion;
    user.securityIdentityVersion = (user.securityIdentityVersion || 0) + update.$inc.securityIdentityVersion;
    return { modifiedCount: 1 };
  });
  const request = (actor, roles, userId = financeTarget._id) => ({
    user: actor, tenantId,
    headers: { origin: 'https://company.test', host: 'company.test' }, get(name) { return this.headers[name]; },
    params: { userId }, body: { payrollRoles: roles }
  });

  // 总经理身份不能通过薪资角色接口授予
  const viaRoles = response();
  await userApi.updatePayrollRoles(request({ _id: id(), role: 'owner' }, ['general_manager'], generalManager._id), viaRoles);
  assert.equal(viaRoles.statusCode, 400);
  assert.match(viaRoles.body.message, /职位/);

  // 管理员可以给员工加财务角色
  const adminId = id();
  const adminGrant = response();
  await userApi.updatePayrollRoles(request({ _id: adminId, role: 'member', privilege: ['admin'] }, ['finance']), adminGrant);
  assert.equal(adminGrant.statusCode, 200);
  assert.deepEqual(financeTarget.payrollRoles, ['finance']);
  assert.deepEqual(financeTarget.payrollRoleAudit.at(-1).nextRoles, ['finance']);
  assert.equal(String(financeTarget.payrollRoleAudit.at(-1).actorId), String(adminId));
  assert.equal(String(financeTarget.payrollRoleAudit.at(-1).tenantId), String(tenantId));

  // 总经理也可以
  const gmGrant = response();
  await userApi.updatePayrollRoles(request({ _id: generalManager._id, role: 'member', payrollRoles: ['general_manager'] }, ['finance']), gmGrant);
  assert.equal(gmGrant.statusCode, 200);

  // 主账号也可以
  const ownerGrant = response();
  await userApi.updatePayrollRoles(request({ _id: id(), role: 'owner' }, ['finance']), ownerGrant);
  assert.equal(ownerGrant.statusCode, 200);

  // 普通员工没有权限
  const denied = response();
  await userApi.updatePayrollRoles(request({ _id: id(), role: 'member', payrollRoles: [] }, ['finance']), denied);
  assert.equal(denied.statusCode, 403);

  // 不能修改本人的薪资角色
  const selfDenied = response();
  await userApi.updatePayrollRoles(request({ _id: financeTarget._id, role: 'owner' }, ['finance'], financeTarget._id), selfDenied);
  assert.equal(selfDenied.statusCode, 403);

  // 给总经理本人加财务：general_manager 必须保留
  const gmFinance = response();
  await userApi.updatePayrollRoles(request({ _id: id(), role: 'owner' }, ['finance'], generalManager._id), gmFinance);
  assert.equal(gmFinance.statusCode, 200);
  assert.deepEqual([...generalManager.payrollRoles].sort(), ['finance', 'general_manager']);

  // 取消财务后总经理角色仍在
  const revoke = response();
  await userApi.updatePayrollRoles(request({ _id: id(), role: 'owner' }, [], generalManager._id), revoke);
  assert.equal(revoke.statusCode, 200);
  assert.deepEqual(generalManager.payrollRoles, ['general_manager']);
});

test('GM handover works without Mongo transactions and records reason on both accounts', async t => {
  const tenantId = id();
  const manager = payrollUser(tenantId, { payrollRoles: ['general_manager'], employeeNo: 'G-1', mustChangePassword: false, securityIdentityVersion: 5, payrollGeneralManagerTenantId: tenantId, status: 'active' });
  const target = payrollUser(tenantId, { payrollRoles: ['finance'], employeeNo: 'E-3', mustChangePassword: false, securityIdentityVersion: 2, status: 'active' });
  t.mock.method(PayrollRoleMutationLock, 'findOneAndUpdate', async () => ({}));
  t.mock.method(PayrollRoleMutationLock, 'deleteOne', async () => ({ deletedCount: 1 }));
  t.mock.method(User, 'find', () => ({ select() { return this; }, limit() { return this; }, lean: async () => [manager] }));
  t.mock.method(User, 'findOne', () => queryResult(target));
  t.mock.method(User, 'updateOne', async (filter, update) => {
    const user = String(filter._id) === String(manager._id) ? manager : target;
    if (update.$set) Object.assign(user, update.$set);
    for (const key of Object.keys(update.$unset || {})) delete user[key];
    if (update.$push?.payrollRoleAudit) user.payrollRoleAudit = [...(user.payrollRoleAudit || []), update.$push.payrollRoleAudit];
    for (const [key, amount] of Object.entries(update.$inc || {})) user[key] = (user[key] || 0) + amount;
    return { modifiedCount: 1 };
  });
  const res = response();
  await userApi.handoverPayrollGeneralManager({
    user: { _id: manager._id, role: 'member' }, tenantId,
    headers: { origin: 'https://company.test', host: 'company.test' }, get(name) { return this.headers[name]; },
    body: { targetUserId: target._id, reason: '岗位调整' }
  }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(manager.payrollRoles, []);
  assert.equal(manager.payrollGeneralManagerTenantId, undefined);
  assert.deepEqual(target.payrollRoles, ['finance', 'general_manager']);
  assert.equal(String(target.payrollGeneralManagerTenantId), String(tenantId));
  assert.equal(manager.payrollRoleAudit[0].reason, '岗位调整');
  assert.equal(target.payrollRoleAudit[0].reason, '岗位调整');
});

test('failed target CAS compensates by restoring the previous GM reservation', async t => {
  const tenantId = id();
  const manager = payrollUser(tenantId, { payrollRoles: ['general_manager'], employeeNo: 'G-1', mustChangePassword: false, securityIdentityVersion: 5, payrollGeneralManagerTenantId: tenantId, status: 'active' });
  const target = payrollUser(tenantId, { payrollRoles: [], employeeNo: 'E-3', mustChangePassword: false, securityIdentityVersion: 2, status: 'active' });
  const store = identityStore(t, [manager, target], { beforeWrite: filter => String(filter._id) === String(target._id) ? { modifiedCount: 0 } : null });
  const res = response();
  await userApi.handoverPayrollGeneralManager({
    user: { _id: manager._id, role: 'member' }, tenantId,
    headers: { origin: 'https://company.test', host: 'company.test' }, get(name) { return this.headers[name]; },
    body: { targetUserId: target._id, reason: '测试目标并发冲突' }
  }, res);
  assert.equal(res.statusCode, 409);
  const restored = store.rows.get(String(manager._id));
  assert.deepEqual(restored.payrollRoles, ['general_manager']);
  assert.equal(String(restored.payrollGeneralManagerTenantId), String(tenantId));
  assert.equal(restored.payrollRoleAudit.at(-1).reason, '总经理变更回滚：测试目标并发冲突');
});

test('setting the general manager title moves the unique reservation away from a disabled former GM', async t => {
  const tenantId = id();
  const retired = payrollUser(tenantId, { _id: id(), status: 'disabled', title: 'gm', payrollRoles: ['finance', 'general_manager'], attendanceRoles: ['general_manager'], securityIdentityVersion: 2, payrollGeneralManagerTenantId: tenantId, attendanceGeneralManagerTenantId: tenantId });
  const target = payrollUser(tenantId, { _id: id(), status: 'active', title: '', employeeNo: 'E-4', securityIdentityVersion: 1, payrollRoles: [], attendanceRoles: [] });
  const updates = [];
  t.mock.method(PayrollRoleMutationLock, 'findOneAndUpdate', async () => ({}));
  t.mock.method(PayrollRoleMutationLock, 'deleteOne', async () => ({ deletedCount: 1 }));
  t.mock.method(User, 'findOne', () => queryResult(target));
  t.mock.method(User, 'find', () => ({ select() { return this; }, limit() { return this; }, lean: async () => [retired] }));
  t.mock.method(User, 'updateOne', async (filter, update) => {
    updates.push({ id: String(filter._id), update });
    return { modifiedCount: 1 };
  });
  const res = response();
  await userApi.postUserMgr({
    user: { _id: id(), role: 'owner' }, tenantId,
    body: { act: 'modify', data: { userid: target.userid, name: '新总经理', title: 'gm', privilege: ['admin'], phone: target.phone } }
  }, res);
  assert.equal(res.statusCode, 200);
  const retiredUpdate = updates.find(item => item.id === String(retired._id));
  assert.ok(retiredUpdate, 'disabled former GM gets updated');
  assert.deepEqual(retiredUpdate.update.$set.payrollRoles, ['finance']);
  assert.deepEqual(retiredUpdate.update.$set.attendanceRoles, []);
  assert.deepEqual(retiredUpdate.update.$unset, { payrollGeneralManagerTenantId: 1, attendanceGeneralManagerTenantId: 1 });
  assert.match(retiredUpdate.update.$push.payrollRoleAudit.reason, /职位变更/);
  const promotedUpdate = updates.filter(item => item.id === String(target._id)).at(-1);
  assert.ok(promotedUpdate.update.$set.payrollRoles.includes('general_manager'));
  assert.ok(promotedUpdate.update.$set.attendanceRoles.includes('general_manager'));
  assert.equal(String(promotedUpdate.update.$set.payrollGeneralManagerTenantId), String(tenantId));
  assert.equal(String(promotedUpdate.update.$set.attendanceGeneralManagerTenantId), String(tenantId));
});

test('removing the general manager title releases both roles and reservations', async t => {
  const tenantId = id();
  const formerGm = payrollUser(tenantId, { _id: id(), status: 'active', title: 'gm', payrollRoles: ['finance', 'general_manager'], attendanceRoles: ['general_manager'], securityIdentityVersion: 3, payrollGeneralManagerTenantId: tenantId, attendanceGeneralManagerTenantId: tenantId });
  const updates = [];
  t.mock.method(PayrollRoleMutationLock, 'findOneAndUpdate', async () => ({}));
  t.mock.method(PayrollRoleMutationLock, 'deleteOne', async () => ({ deletedCount: 1 }));
  t.mock.method(User, 'findOne', () => queryResult(formerGm));
  t.mock.method(User, 'find', () => ({ select() { return this; }, limit() { return this; }, lean: async () => [] }));
  t.mock.method(User, 'updateOne', async (filter, update) => { updates.push(update); return { modifiedCount: 1 }; });
  const res = response();
  await userApi.postUserMgr({
    user: { _id: id(), role: 'owner' }, tenantId,
    body: { act: 'modify', data: { userid: formerGm.userid, name: '普通员工', title: 'operator', privilege: ['operator'], phone: formerGm.phone } }
  }, res);
  assert.equal(res.statusCode, 200);
  const syncUpdate = updates.at(-1);
  assert.deepEqual(syncUpdate.$set.payrollRoles, ['finance']);
  assert.deepEqual(syncUpdate.$set.attendanceRoles, []);
  assert.deepEqual(syncUpdate.$unset, { payrollGeneralManagerTenantId: 1, attendanceGeneralManagerTenantId: 1 });
});

test('payroll role candidates are visible to owner, admin and the GM only', async t => {
  const tenantId = id();
  const candidate = { _id: id(), profile: { name: '员工甲' }, employeeNo: 'E-10', department: '研发', payrollRoles: [], status: 'active', mustChangePassword: false };
  t.mock.method(User, 'find', () => ({ select() { return this; }, sort() { return this; }, lean: async () => [candidate] }));
  const expectedRow = { userId: candidate._id, userid: '', name: '员工甲', employeeNo: 'E-10', phone: '', department: '研发', payrollRoles: [], status: 'active', mustChangePassword: false, displayName: '员工甲（E-10）' };

  for (const actor of [{ _id: id(), role: 'owner' }, { _id: id(), role: 'member', privilege: ['admin'] }, { _id: id(), role: 'member', payrollRoles: ['general_manager'] }]) {
    const res = response();
    await userApi.getPayrollRoleCandidates({ user: actor, tenantId }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.data[0], expectedRow);
  }

  const denied = response();
  await userApi.getPayrollRoleCandidates({ user: { _id: id(), role: 'member', payrollRoles: [] }, tenantId }, denied);
  assert.equal(denied.statusCode, 403);
});

test('payroll candidates treat a missing status field as in post', async t => {
  const tenantId = id();
  // 历史账号没有 status 字段：不应显示成已停用，也不应因此被挡在总经理指派之外
  const legacyCandidate = { _id: id(), profile: { name: '老账号' }, employeeNo: 'E-9', department: '', payrollRoles: [], mustChangePassword: true };
  t.mock.method(User, 'findOne', () => ({ select() { return this; }, lean: async () => null }));
  t.mock.method(User, 'find', () => ({ select() { return this; }, sort() { return this; }, lean: async () => [legacyCandidate] }));
  const res = response();
  await userApi.getPayrollRoleCandidates({ user: { _id: id(), role: 'owner' }, tenantId }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data[0].status, 'active');
  assert.equal(res.body.data[0].mustChangePassword, true);
});

test('stale payroll role lock recovery requires owner confirmation and a dead local process', async t => {
  const tenantId = id();
  const owner = { _id: id(), tenantId, role: 'owner', status: 'active' };
  let lock = { token: 'orphaned', acquiredAt: new Date(), ownerPid: 99999999, ownerHost: require('os').hostname() };
  t.mock.method(PayrollRoleMutationLock, 'find', () => ({ select() { return this; }, lean: async () => [lock] }));
  t.mock.method(PayrollRoleMutationLock, 'findOne', () => ({ select() { return this; }, lean: async () => lock }));
  let deleteFilter;
  t.mock.method(PayrollRoleMutationLock, 'deleteOne', async filter => { deleteFilter = filter; return { deletedCount: 1 }; });
  const list = response();
  await userApi.listPayrollRoleLocks({ user: owner, tenantId }, list);
  assert.equal(list.statusCode, 200);
  assert.equal(list.body.data[0].recoverable, false);
  const fresh = response();
  await userApi.releaseStalePayrollRoleLock({ user: owner, tenantId, headers: { origin: 'https://company.test', host: 'company.test' }, get(name) { return this.headers[name]; }, body: { confirmNoLiveMutation: true } }, fresh);
  assert.equal(fresh.statusCode, 409);
  lock.acquiredAt = new Date(Date.now() - 11 * 60 * 1000);
  const recovered = response();
  await userApi.releaseStalePayrollRoleLock({ user: owner, tenantId, headers: { origin: 'https://company.test', host: 'company.test' }, get(name) { return this.headers[name]; }, body: { confirmNoLiveMutation: true } }, recovered);
  assert.equal(recovered.statusCode, 200);
  assert.equal(deleteFilter.token, 'orphaned');
  assert.equal(deleteFilter.acquiredAt, lock.acquiredAt);
});

test('payroll role writes reject cross-origin and missing-Origin requests', async t => {
  const tenantId = id();
  const target = payrollUser(tenantId, { payrollRoles: [] });
  t.mock.method(User, 'findOne', () => queryResult(target));
  for (const origin of ['https://attacker.example', undefined]) {
    const res = response();
    await userApi.updatePayrollRoles({
      user: { _id: id(), role: 'owner' }, tenantId,
      headers: { origin, host: 'company.test' }, get(name) { return this.headers[name]; },
      params: { userId: target._id }, body: { payrollRoles: ['finance'] }
    }, res);
    assert.equal(res.statusCode, 403);
  }
  assert.deepEqual(target.payrollRoles, []);
});

test('sessionVersion bump is persisted as an atomic increment', () => {
  const user = new User({ userid: 'atomic-check', sessionVersion: 12 });
  bumpSessionVersion(user);
  assert.equal(user.sessionVersion, 13);
  assert.equal(user.getChanges().$inc.sessionVersion, 1);
  assert.equal(user.getChanges().$set?.sessionVersion, undefined);
});

test('password reset increments sessionVersion and Passport denies legacy or stale sessions', async t => {
  const tenantId = id();
  const target = payrollUser(undefined, { payrollRoles: [], sessionVersion: 8 });
  t.mock.method(User, 'findOne', () => queryResult(target));
  t.mock.method(User, 'updateOne', async (_filter, update) => {
    Object.assign(target, update.$set);
    return { modifiedCount: 1 };
  });
  const resetResponse = response();
  await userApi.resetPassword({
    user: { _id: id(), role: 'platform' }, tenantId,
    body: { user: { userid: target.userid } }
  }, resetResponse);
  assert.equal(resetResponse.statusCode, 200);
  assert.equal(target.sessionVersion, 9);

  let findCalls = 0;
  const persistedUser = { _id: target._id, status: 'active', sessionVersion: 9, tenantId };
  t.mock.method(User, 'findById', value => {
    findCalls++;
    assert.equal(String(value), String(target._id));
    return { populate: async () => persistedUser };
  });
  const deserialize = identity => new Promise((resolve, reject) => {
    passportTestables.deserializeUser(identity, (error, user) => error ? reject(error) : resolve(user));
  });
  assert.equal(await deserialize(String(target._id)), false, 'legacy id-only sessions are rejected');
  assert.equal(findCalls, 0);
  assert.equal(await deserialize({ id: String(target._id), sessionVersion: 8 }), false, 'stale session version is rejected');
  assert.equal(await deserialize({ id: String(target._id), sessionVersion: 9 }), persistedUser);
  assert.equal(findCalls, 2);

  t.mock.method(User, 'findById', () => ({ populate: async () => ({ ...persistedUser, status: 'disabled' }) }));
  assert.equal(await deserialize({ id: String(target._id), sessionVersion: 9 }), false, 'disabled user sessions are rejected');
});

test('linked employee and owner/admin accounts cannot be reset by admin or platform routes', async t => {
  const tenantId = id();
  const targets = [
    payrollUser(tenantId, { payrollRoles: [], employeeNo: 'E-1', attendanceRoles: [] }),
    payrollUser(tenantId, { payrollRoles: [], employeeNo: '', role: 'owner', privilege: ['admin'] }),
    payrollUser(tenantId, { payrollRoles: [], employeeNo: '', role: 'member', privilege: ['admin'] })
  ];
  let selected = targets[0];
  t.mock.method(User, 'findOne', () => queryResult(selected));
  t.mock.method(User, 'findById', () => Promise.resolve(selected));
  for (const target of targets) {
    selected = target;
    const apiResponse = response();
    await userApi.resetPassword({
      user: { _id: id(), role: 'member', privilege: ['admin'] }, tenantId,
      body: { user: { userid: target.userid } }
    }, apiResponse);
    assert.equal(apiResponse.statusCode, 403);

    const platformResponse = response();
    await platformApi.resetUserPassword({ body: { userId: target._id } }, platformResponse);
    assert.equal(platformResponse.statusCode, 403);
    assert.equal(target.password, 'hashed');
  }

  selected = null;
  const removedResponse = response();
  await userApi.resetPassword({
    user: { _id: id(), role: 'member', privilege: ['admin'] }, tenantId,
    body: { user: { userid: 'removed-user' } }
  }, removedResponse);
  assert.equal(removedResponse.body.message, '用户未找到');
});

test('self password changes require the current password and bump sessionVersion', async t => {
  const user = payrollUser(id(), { payrollRoles: [], privilege: [], sessionVersion: 6 });
  user.comparePassword = async candidate => candidate === 'old-secret';
  t.mock.method(User, 'findById', async () => user);
  t.mock.method(User, 'updateOne', async (_filter, update) => {
    Object.assign(user, update.$set);
    return { modifiedCount: 1 };
  });
  const req = {
    user: { id: user._id },
    body: { currentPassword: 'wrong-secret', password: 'new-secret-123', confirmPassword: 'new-secret-123' },
    flash() {},
    logIn(_user, callback) { callback(null); }
  };
  const rejected = response();
  rejected.redirect = () => rejected;
  await userController.postUpdatePassword(req, rejected);
  assert.equal(user.saved, undefined);
  assert.equal(user.sessionVersion, 6);

  req.body.currentPassword = 'old-secret';
  const accepted = response();
  accepted.redirect = () => accepted;
  await userController.postUpdatePassword(req, accepted);
  assert.equal(user.mustChangePassword, false);
  assert.equal(user.sessionVersion, 7);
});
