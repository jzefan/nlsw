const test = require('node:test');
const assert = require('node:assert');
const { buildPersonLabels } = require('../utils/person-label');

const row = (overrides) => ({ userId: '', name: '', userid: '', employeeNo: '', phone: '', department: '', ...overrides });

test('显示名：有工号 → 姓名（工号）', () => {
  const labels = buildPersonLabels([row({ userId: 'a', name: '韩磊', userid: 'hl', employeeNo: '001' })]);
  assert.strictEqual(labels.get('a'), '韩磊（001）');
});

test('显示名：无工号时依次回落到手机号、部门', () => {
  const labels = buildPersonLabels([
    row({ userId: 'a', name: '谢云霞', userid: 'xie', phone: '13800138000' }),
    row({ userId: 'b', name: '陆峰', userid: 'lu', department: '运营部' }),
  ]);
  assert.strictEqual(labels.get('a'), '谢云霞（13800138000）');
  assert.strictEqual(labels.get('b'), '陆峰（运营部）');
});

test('显示名：工号优先于手机号和部门', () => {
  const labels = buildPersonLabels([row({ userId: 'a', name: '吴芳', userid: 'wf', employeeNo: '005', phone: '13900139000', department: '财务部' })]);
  assert.strictEqual(labels.get('a'), '吴芳（005）');
});

test('显示名：三者都没有且姓名不重复 → 直接用姓名，不加后缀', () => {
  const labels = buildPersonLabels([
    row({ userId: 'a', name: '李娜', userid: 'ln' }),
    row({ userId: 'b', name: '王强', userid: 'wq' }),
  ]);
  assert.strictEqual(labels.get('a'), '李娜');
  assert.strictEqual(labels.get('b'), '王强');
});

test('显示名：三者都没有且姓名重复 → 用登录名区分，避免两个同名无法对应', () => {
  const labels = buildPersonLabels([
    row({ userId: 'a', name: '张伟', userid: 'zw1' }),
    row({ userId: 'b', name: '张伟', userid: 'zw2' }),
  ]);
  assert.strictEqual(labels.get('a'), '张伟（zw1）');
  assert.strictEqual(labels.get('b'), '张伟（zw2）');
});

test('显示名：同名但各自有可区分字段时，各自用自己的字段，不需要登录名兜底', () => {
  const labels = buildPersonLabels([
    row({ userId: 'a', name: '张伟', userid: 'zw1', employeeNo: '021' }),
    row({ userId: 'b', name: '张伟', userid: 'zw2', department: '运营部' }),
  ]);
  assert.strictEqual(labels.get('a'), '张伟（021）');
  assert.strictEqual(labels.get('b'), '张伟（运营部）');
});
