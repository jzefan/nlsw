/**
 * 测试账号的识别与排除。
 *
 * **为什么需要**：部署与开发过程中会在真实租户里建一批测试账号（test、zefan 之类），
 * 它们不是公司员工，却出现在员工资料、考勤台账、工资表里 —— 既污染统计（应出勤、工资总额），
 * 也让财务以为真有人在领工资。用户 2026-10-06 明确要求：不展示、不纳入考勤、不纳入工资表。
 *
 * **为什么按前缀而不是人工名单**：人工勾选一定会漏 —— 新建一个 test_2 就又混进来了。
 * 约定好前缀（建测试账号时本来就带这些名），匹配一次就够，以后新开账号自动生效。
 *
 * 三条判据（2026-10-06 与用户确认）：
 * 1. 登录名 `userid` 或真实姓名命中测试前缀即算（不区分大小写，只做**前缀**匹配 ——
 *    「测试」放在名字中间（「测试部李四」）不算，避免误伤真人）；
 * 2. **owner 豁免**：`test-firm`、`zefan` 这类 owner 是真人维护账号（用户本人就是 zefan），
 *    排掉就没人能进系统改配置、连自己都看不到自己；
 * 3. 已经在库里的历史数据（台账行、工资条）**不动**，只是不再展示、不再纳入新统计。
 */

/** 登录名或姓名以这些开头即视为测试账号（小写比对）。 */
const TEST_ACCOUNT_PREFIXES = Object.freeze(['test', 'zefan', 'demo', 'saas-test', 'guest', 'tmp']);

/** owner 是真人维护账号，任何情况下都不按测试账号排除。 */
function isOwnerAccount(user) {
  return user?.role === 'owner';
}

/** 把登录名/姓名规整成可比的小写文本；取不到时返回空串。 */
function normalizedIdentities(user) {
  return [user?.userid, user?.profile?.name]
    .map(value => String(value ?? '').trim().toLowerCase())
    .filter(Boolean);
}

/** 这个账号是不是测试账号（owner 恒为 false）。 */
function isTestAccount(user) {
  if (!user || isOwnerAccount(user)) return false;
  return normalizedIdentities(user).some(identity =>
    TEST_ACCOUNT_PREFIXES.some(prefix => identity.startsWith(prefix)));
}

/**
 * 从一批账号里挑出「真实员工」：排掉测试账号。
 *
 * **刻意在内存里过滤而不是拼 Mongo 条件**：判据要看 `userid` 与 `profile.name` 两个字段、
 * 还要豁免 `role`，用 `$or` + `$nin` 拼出来的条件和内存判据很容易不一致（改一处忘另一处）。
 * 员工量是几十到几百级，一次性过滤的开销可以忽略，换来的是「一处判据、全站复用」。
 *
 * @param {Array} users
 * @returns {Array} 同一个数组里的真员工（不改原数组）
 */
function filterRealEmployees(users) {
  return (Array.isArray(users) ? users : []).filter(user => !isTestAccount(user));
}

module.exports = {
  TEST_ACCOUNT_PREFIXES,
  isTestAccount,
  isOwnerAccount,
  filterRealEmployees,
};
