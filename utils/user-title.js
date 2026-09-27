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

module.exports = { normalizeTitle, isGeneralManagerTitle, isChairmanTitle };
