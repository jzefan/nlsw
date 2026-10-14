const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const attendanceLedger = require('../controllers/api/attendance-ledger');
const attendanceApi = require('../controllers/api/attendance');
const { canViewTeam } = require('../utils/attendance-permissions');
const { isFullPrivilegeUser, isTopLeaderTitle, normalizeTitle } = require('../utils/user-title');
const { canManageSeals, canApproveSealRequest, hasGlobalSealApprovalView, requireSealAdmin } = require('../utils/seal-permissions');

/**
 * 权限口径（2026-10-12 用户反复强调：「老业务的权限不要延伸到新的业务里」）：
 *
 * **全模块全权只有三种身份**：
 *  1. 登录名 `userid === 'admin'`（系统初始化创建的主账号）
 *  2. `role === 'owner'`（公司主账号）
 *  3. 职务总经理/董事长（gm/ceo，含中文旧写法）
 *
 * `privilege` 里的 `admin`（用户管理里的「管理」权限位）**只管老业务模块**，
 * 在考勤、工资、用章**一律不生效**。
 *
 * 其余新模块角色按配置授予：用章设置里的印章保管员/审批人、薪资里的财务、考勤里的考勤管理员、有下属的经理。
 */

function id() { return new mongoose.Types.ObjectId(); }
function query(value) {
  return {
    select() { return this; },
    sort() { return this; },
    distinct: async () => [],
    lean: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
}

function user(extra) {
  return { _id: id(), tenantId: id(), status: 'active', userid: `u${Math.floor(Math.random() * 1e6)}`, privilege: [], attendanceRoles: [], payrollRoles: [], ...extra };
}

const ADMIN_LOGIN = user({ userid: 'admin' });
const OWNER = user({ role: 'owner' });
const CHAIRMAN = user({ title: 'ceo' });
const GM = user({ title: 'gm' });
const LEGACY_GM = user({ title: '总经理' });
const LEGACY_CHAIRMAN = user({ title: '董事长' });
const PRIVILEGE_ADMIN = user({ privilege: ['admin'] });
const ATTENDANCE_ADMIN = user({ attendanceRoles: ['attendance_admin'] });
const PLAIN = user({ title: '业务员' });

test('全权识别：登录名 admin / owner / 总经理·董事长，privilege 的 admin 权限位不算', () => {
  for (const u of [ADMIN_LOGIN, OWNER, CHAIRMAN, GM, LEGACY_GM, LEGACY_CHAIRMAN]) {
    assert.equal(isFullPrivilegeUser(u), true, `${u.userid || u.title || u.role} 应为全权用户`);
  }
  // privilege 含 admin 不构成全权 —— 它只管老业务模块，不延伸到考勤/工资/用章
  assert.equal(isFullPrivilegeUser(PRIVILEGE_ADMIN), false);
  assert.equal(isFullPrivilegeUser(PLAIN), false);
  assert.equal(isFullPrivilegeUser(null), false);

  assert.equal(isTopLeaderTitle('ceo'), true);
  assert.equal(isTopLeaderTitle('gm'), true);
  assert.equal(isTopLeaderTitle('董事长'), true);
  assert.equal(isTopLeaderTitle('业务员'), false);
  assert.equal(normalizeTitle('总经理'), 'gm');
});

test('考勤台账可见范围：全权身份与考勤管理员看全公司，其余只看自己', async t => {
  const tenantId = id();
  const mkEmployee = () => ({ _id: id(), employeeNo: 'E-1', profile: { name: '甲' }, department: '物流', status: 'active' });
  const first = mkEmployee(), second = mkEmployee();
  const allEmployees = [first, second];
  const pool = [...allEmployees];
  // 不连库：按查询里的 _id 过滤，模拟「只回本人」的效果
  t.mock.method(User, 'find', q => query(q?._id ? pool.filter(e => String(e._id) === String(q._id)) : pool));

  const mkReq = u => {
    const uu = { ...u, tenantId };
    // 被限制到本人的账号，其本人必须存在于员工池里
    if (u === PLAIN || u === PRIVILEGE_ADMIN) pool.push({ ...mkEmployee(), _id: uu._id });
    return { user: uu, tenantId, tenant: { settings: {} } };
  };

  // 全权身份（含登录名 admin）与考勤管理员：全公司
  for (const u of [ADMIN_LOGIN, OWNER, CHAIRMAN, GM, LEGACY_CHAIRMAN, ATTENDANCE_ADMIN]) {
    const users = await attendanceLedger._test.getScopedUsers(mkReq(u), 'company');
    assert.equal(users.length, 2, `${u.userid || u.title || u.role} 应看到全公司台账`);
  }

  // 普通员工：只看自己
  const plainUsers = await attendanceLedger._test.getScopedUsers(mkReq(PLAIN), 'company');
  assert.equal(plainUsers.length, 1, '普通员工只应看到自己');

  // privilege 含 admin 同样只看自己（老业务权限不延伸到考勤台账）
  const adminUsers = await attendanceLedger._test.getScopedUsers(mkReq(PRIVILEGE_ADMIN), 'company');
  assert.equal(adminUsers.length, 1, '「管理」权限位不应放行全公司台账');
});

test('考勤团队视图：一把手可看全公司，admin 权限位不算', () => {
  // owner 走 isMonthAdmin（考勤管理员那一支）单独放行，canViewTeam 只管「考勤角色 + 职务一把手」
  for (const u of [CHAIRMAN, GM, LEGACY_CHAIRMAN]) {
    assert.equal(canViewTeam(u), true, `${u.title} 应可看团队考勤`);
  }
  assert.equal(canViewTeam(PRIVILEGE_ADMIN), false);
  assert.equal(canViewTeam(PLAIN), false);
});

test('月结类写操作：全权身份可执行，gm/ceo 只读，admin 权限位与普通员工都不行', async () => {
  const tenantId = id();
  const mkRes = () => {
    const res = { statusCode: 200, body: undefined };
    res.status = code => { res.statusCode = code; return res; };
    res.json = body => { res.body = body; return res; };
    return res;
  };
  const mkReq = u => ({ user: { ...u, tenantId }, tenantId, tenant: { settings: {} }, params: { month: '2026-09' }, query: {}, body: {} });

  // 登录名 admin、owner 与考勤管理员过了鉴权（后续因数据/参数返回 400/500，不是 403）
  for (const u of [ADMIN_LOGIN, OWNER, ATTENDANCE_ADMIN]) {
    const res = mkRes();
    await attendanceLedger.closeMonth(mkReq(u), res);
    assert.notEqual(res.statusCode, 403, `${u.userid || u.role || '考勤管理员'} 应能月结`);
  }
  // gm/ceo 是只读视角：能看全公司数据，但不动数据
  for (const u of [CHAIRMAN, GM, LEGACY_CHAIRMAN]) {
    const res = mkRes();
    await attendanceLedger.closeMonth(mkReq(u), res);
    assert.equal(res.statusCode, 403, `${u.title} 不应能月结`);
  }
  // 「管理」权限位与普通员工同样不能月结
  for (const u of [PRIVILEGE_ADMIN, PLAIN]) {
    const res = mkRes();
    await attendanceLedger.closeMonth(mkReq(u), res);
    assert.equal(res.statusCode, 403, '「管理」权限位与普通员工不应能月结');
  }
});

test('用章管理：全权身份与保管员可管，privilege 的 admin 权限位不再放行', () => {
  const tenantId = id();
  const custodian = user({ tenantId });
  const tenant = { settings: { sealCustodianIds: [String(custodian._id)] } };

  for (const u of [ADMIN_LOGIN, OWNER, CHAIRMAN, GM, LEGACY_GM, LEGACY_CHAIRMAN]) {
    assert.equal(canManageSeals({ ...u, tenantId }, tenant), true, `${u.userid || u.title || u.role} 应可管理印章`);
  }
  // 2026-10-12 用户确认：「管理」权限位不延伸到用章
  assert.equal(canManageSeals({ ...PRIVILEGE_ADMIN, tenantId }, tenant), false, '「管理」权限位不应获得用章管理权');
  assert.equal(canManageSeals({ ...custodian }, tenant), true, '保管员应可管理印章');
  assert.equal(canManageSeals({ ...PLAIN, tenantId }, tenant), false);

  // 考勤角色 general_manager 也不单独授予
  const attendanceGmOnly = { ...user({ attendanceRoles: ['general_manager'] }), tenantId };
  assert.equal(canManageSeals(attendanceGmOnly, tenant), false, '仅挂考勤总经理角色不应获得用章管理权');
  assert.equal(hasGlobalSealApprovalView(attendanceGmOnly), false, '仅挂考勤总经理角色不应有全公司用章视角');
  // 但职务本身就是一把手时仍然有
  const gmByTitle = { ...user({ title: 'gm', attendanceRoles: ['general_manager'] }), tenantId };
  assert.equal(canManageSeals(gmByTitle, tenant), true, '职务为总经理应可管理印章');
});

test('用章审批：全权身份有兜底视角，admin 权限位没有，且只能代审待审批单', () => {
  for (const u of [ADMIN_LOGIN, OWNER, CHAIRMAN, GM, LEGACY_CHAIRMAN]) {
    assert.equal(hasGlobalSealApprovalView(u), true, `${u.userid || u.title || u.role} 应有全公司视角`);
    const pending = { status: 'pending', approvals: [{ approverId: id(), status: 'pending' }] };
    assert.equal(canApproveSealRequest(u, {}, pending), true);
    const closed = { status: 'approved', approvals: [{ approverId: id(), status: 'approved' }] };
    assert.equal(canApproveSealRequest(u, {}, closed), false, '单据审批完成后不应再能代审');
  }
  assert.equal(hasGlobalSealApprovalView(PLAIN), false);
  assert.equal(hasGlobalSealApprovalView(PRIVILEGE_ADMIN), false, '「管理」权限位不应有全公司用章视角');
  const pending = { status: 'pending', approvals: [{ approverId: id(), status: 'pending' }] };
  assert.equal(canApproveSealRequest(PRIVILEGE_ADMIN, {}, pending), false, '「管理」权限位不应有兜底代审权');
});

test('员工资料与考勤待办：仅全权身份 / 考勤角色 / 被指派 / 有下属可进，admin 权限位被拒', async () => {
  const mkRes = () => {
    const res = { statusCode: 200, body: undefined };
    res.status = code => { res.statusCode = code; return res; };
    res.json = body => { res.body = body; return res; };
    return res;
  };
  const tryPeopleManager = u => {
    const res = mkRes();
    const passed = attendanceApi._test.requirePeopleManager({ user: u }, res);
    return { passed, res };
  };

  // 员工资料：全权身份可维护
  for (const u of [ADMIN_LOGIN, OWNER, CHAIRMAN, GM, LEGACY_CHAIRMAN]) {
    const { passed } = tryPeopleManager(u);
    assert.equal(passed, true, `${u.userid || u.title || u.role} 应可维护员工资料`);
  }
  // 「管理」权限位、普通员工、考勤管理员都不行
  for (const u of [PRIVILEGE_ADMIN, PLAIN, ATTENDANCE_ADMIN]) {
    const { passed, res } = tryPeopleManager(u);
    assert.equal(passed, false, `${u.privilege?.length ? '「管理」权限位' : u.title || '考勤管理员'} 不应能维护员工资料`);
    assert.equal(res.statusCode, 403);
  }
});

test('用章设置：仅全权身份可配置，admin 权限位被拒', () => {
  const mkRes = () => {
    const res = { statusCode: 200, body: undefined };
    res.status = code => { res.statusCode = code; return res; };
    res.json = body => { res.body = body; return res; };
    return res;
  };
  const tryAdmin = u => {
    const res = mkRes();
    let passed = false;
    requireSealAdmin({ user: u }, res, () => { passed = true; });
    return { passed, res };
  };

  for (const u of [ADMIN_LOGIN, OWNER, CHAIRMAN, GM, LEGACY_CHAIRMAN]) {
    const { passed, res } = tryAdmin(u);
    assert.equal(passed, true, `${u.userid || u.title || u.role} 应可配置用章设置`);
    assert.equal(res.statusCode, 200);
  }
  for (const u of [PLAIN, PRIVILEGE_ADMIN]) {
    const { passed, res } = tryAdmin(u);
    assert.equal(passed, false, `${u.privilege?.length ? '「管理」权限位' : u.title} 不应能配置用章设置`);
    assert.equal(res.statusCode, 403);
  }
});