const test = require('node:test');
const assert = require('node:assert/strict');
const { isTestAccount, isOwnerAccount, filterRealEmployees, TEST_ACCOUNT_PREFIXES } = require('../utils/test-account');

/**
 * 造一个最小账号对象：只带判据用得到的字段。
 * owner 豁免是这里最容易写错的一条 —— owner 是真人维护账号（用户本人就是 zefan）。
 */
function account(userid, name, role = 'member') {
  return { userid, role, profile: { name } };
}

test('测试账号按登录名前缀识别，不区分大小写', () => {
  assert.equal(isTestAccount(account('test')), true);
  assert.equal(isTestAccount(account('TEST')), true);
  assert.equal(isTestAccount(account('Test_new', '李四')), true, 'test 开头的后缀也算');
  assert.equal(isTestAccount(account('test-new')), true);
  assert.equal(isTestAccount(account('zefan')), true);
  assert.equal(isTestAccount(account('Zefan', 'JIANG')), true);
  assert.equal(isTestAccount(account('demo_account')), true);
  assert.equal(isTestAccount(account('tmp1')), true);
});

test('测试账号也按真实姓名识别：登录名正常但名字带 test 的同样排除', () => {
  // 本仓真实存在的形态：登录名 test，真名是英文名
  assert.equal(isTestAccount(account('test', 'lingyanxie')), true);
  assert.equal(isTestAccount(account('someone', 'tester')), true);
  assert.equal(isTestAccount(account('someone', 'Zefan JIANG')), true);
});

test('owner 豁免：命中前缀的主账号不排除，否则没人能进系统维护', () => {
  assert.equal(isOwnerAccount(account('zefan', 'Zefan JIANG', 'owner')), true);
  assert.equal(isTestAccount(account('zefan', 'Zefan JIANG', 'owner')), false, 'zefan 是 owner → 保留');
  assert.equal(isTestAccount(account('test-firm', '测试管理员', 'owner')), false, 'test-firm 是 owner → 保留');
  // 同样的人一旦不是 owner，就该被排除
  assert.equal(isTestAccount({ ...account('zefan', 'Zefan JIANG', 'owner'), role: 'member' }), true);
});

test('真人不能被误伤：前缀只在前缀位置，出现在名字中间不算', () => {
  assert.equal(isTestAccount(account('hl', '韩磊')), false);
  assert.equal(isTestAccount(account('caiwu', '财务')), false);
  assert.equal(isTestAccount(account('chengdaozheng', '成道峥')), false);
  // 「测试」在名字中间 → 不是测试命名习惯，别排除
  assert.equal(isTestAccount(account('lisi', '测试部李四')), false);
  assert.equal(isTestAccount(account('zhaoming', '张test明')), false);
  // 真实前缀命中，不因其他字符被放过
  assert.equal(isTestAccount(account('tester', 'test2')), true);
});

test('缺字段或空值不会炸，也不该被当成测试账号', () => {
  assert.equal(isTestAccount(null), false);
  assert.equal(isTestAccount(undefined), false);
  assert.equal(isTestAccount({}), false);
  assert.equal(isTestAccount({ userid: '', profile: {} }), false);
  assert.equal(isTestAccount({ userid: '   ', profile: { name: null } }), false);
});

test('filterRealEmployees 挑出真员工，原数组不被改动', () => {
  const users = [
    account('hl', '韩磊'),
    account('test', 'lingyanxie'),
    account('zefan', 'Zefan JIANG', 'owner'),
    account('caiwu', '财务'),
    account('test-new', 'test-new'),
  ];
  const real = filterRealEmployees(users);
  assert.deepEqual(real.map(user => user.userid), ['hl', 'zefan', 'caiwu'], 'zefan 是 owner 要留着');
  assert.equal(users.length, 5, '原数组没有被就地过滤');
  assert.deepEqual(filterRealEmployees(null), []);
  assert.deepEqual(filterRealEmployees(undefined), []);
});

test('前缀清单本身稳定（改它要有人记得同步文档与测试）', () => {
  assert.deepEqual(TEST_ACCOUNT_PREFIXES, ['test', 'zefan', 'demo', 'saas-test', 'guest', 'tmp']);
  for (const prefix of TEST_ACCOUNT_PREFIXES) {
    assert.equal(prefix, prefix.toLowerCase(), '前缀必须小写，否则不区分大小写的匹配会漏');
  }
});
