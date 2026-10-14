/**
 * 职务（User.title）在库里存在两种写法：
 *  - 新用户管理写的是代码：ceo / gm / mgr / operator / account / statistician
 *  - 老账号存的是中文名：董事长 / 总经理 / 经理 / 业务员 / 会计 / 统计员
 * 权限判断前先归一成代码，避免同一个职务因为写法不同而拿到不同权限。
 */
const TITLE_CODES = {
  '董事长': 'ceo',
  '总经理': 'gm',
  '经理': 'mgr',
  '业务员': 'operator',
  '会计': 'account',
  '统计员': 'statistician',
};

function normalizeTitle(title) {
  const value = String(title ?? '').trim();
  return TITLE_CODES[value] || value;
}

function isGeneralManagerTitle(title) {
  return normalizeTitle(title) === 'gm';
}

function isChairmanTitle(title) {
  return normalizeTitle(title) === 'ceo';
}

/** 董事长与总经理合称「一把手」，在用章、工资等模块按最高权限处理。 */
function isTopLeaderTitle(title) {
  const code = normalizeTitle(title);
  return code === 'gm' || code === 'ceo';
}

/**
 * 全模块全权（含考勤、工资、用章等新模块）。三个来源，任一满足即可：
 *  1. **登录名 `admin`**（系统初始化创建的主账号，utils/standalone-init.js）
 *  2. `role === 'owner'`（公司主账号）
 *  3. 职务为总经理/董事长（含中文旧写法）
 *
 * 与 `privilege` 里的 `admin` **无关** —— 用户反复强调：「老业务的权限不要延伸到新的业务里」。
 * `privilege: ['admin']`（用户管理里的「管理」）只管订单、运单、结算等老业务模块，
 * 在考勤、工资、用章里**一律不生效**。新模块一律用本函数判全权，不要散着判 role / userid / title。
 */
function isFullPrivilegeUser(user) {
  if (!user) return false;
  return user.userid === 'admin'
    || user.role === 'owner'
    || isTopLeaderTitle(user.title);
}

module.exports = {
  normalizeTitle,
  isGeneralManagerTitle,
  isChairmanTitle,
  isTopLeaderTitle,
  isFullPrivilegeUser
};
