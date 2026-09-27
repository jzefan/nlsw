/**
 * 人员显示名规则（全项目统一口径）
 *
 * 姓名是主标签，括号内按 工号 → 手机号 → 部门 取第一个有值的作为区分：
 *   有工号      → 韩磊（001）
 *   无工号有手机号 → 韩磊（13500138000）
 *   只有部门     → 韩磊（运营部）
 * 姓名不重复就直接用姓名；如果同名人员的部门等区分字段也相同，再补登录名
 * （缺少登录名时补账号 ID），保证选择列表里不会出现无法区分的重复标签。
 *
 * 传入的行至少需要 userId / name / userid / employeeNo / phone / department。
 * 重名判断的范围就是传进来的这批行，所以调用方应传入「同一批会一起展示的人」。
 */
function buildPersonLabels(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const nameCounts = new Map();
  for (const row of list) {
    const key = row?.name || row?.userid || '';
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  }
  const labels = new Map();
  const tentativeLabels = new Map();
  const labelCounts = new Map();
  for (const row of list) {
    const name = row?.name || row?.userid || '';
    const suffix = row?.employeeNo || row?.phone || row?.department || (nameCounts.get(name) > 1 ? (row?.userid || '') : '');
    const label = suffix ? `${name}（${suffix}）` : name;
    tentativeLabels.set(String(row?.userId), label);
    labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
  }
  for (const row of list) {
    const id = String(row?.userId);
    const label = tentativeLabels.get(id) || '';
    if (labelCounts.get(label) > 1) {
      const account = row?.userid || id;
      labels.set(id, `${label}（账号 ${account}）`);
    } else {
      labels.set(id, label);
    }
  }
  return labels;
}

module.exports = { buildPersonLabels };
