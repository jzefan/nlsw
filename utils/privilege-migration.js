/**
 * 二进制字符串 → 命名数组 迁移工具
 *
 * 旧格式: '11111111' (admin) 或 '10100010' (各位对应权限)
 * 新格式: ['admin'] 或 ['operator', 'account', 'seePrice']
 */

const BIT_TO_PERMISSION = {
  0: 'operator',
  1: 'statistics',
  2: 'account',
  // 3: reserved
  4: 'custRevenue',
  5: 'vesselRevenue',
  6: 'selfVehicle',
  7: 'seePrice',
};

/**
 * 将旧的二进制字符串权限转为新的命名数组
 * @param {string} privilege - 旧权限字符串，如 '11111111' 或 'admin'
 * @returns {string[]} 新权限数组
 */
function migrateBinaryToArray(privilege) {
  if (!privilege || typeof privilege !== 'string') return [];
  if (privilege === 'admin' || privilege === '11111111') return ['admin'];

  if (!/^[01]{8}$/.test(privilege)) {
    console.warn(`[privilege-migration] Invalid privilege format: "${privilege}", defaulting to []`);
    return [];
  }

  const perms = [];
  for (const [bit, name] of Object.entries(BIT_TO_PERMISSION)) {
    if (privilege[Number(bit)] === '1') {
      perms.push(name);
    }
  }
  return perms;
}

/**
 * 判断权限值是否需要迁移（旧格式）
 */
function needsMigration(privilege) {
  if (Array.isArray(privilege)) return false;
  if (typeof privilege !== 'string') return true;
  // 旧格式：'admin' 或 8位二进制字符串
  return true;
}

/**
 * 在 app.js 启动时调用：扫描所有用户，迁移旧格式权限
 */
async function migrateAllUsers(UserModel) {
  const users = await UserModel.find({}).exec();
  let count = 0;
  for (const user of users) {
    if (needsMigration(user.privilege)) {
      const newPrivilege = migrateBinaryToArray(user.privilege);
      await UserModel.updateOne(
        { _id: user._id },
        { $set: { privilege: newPrivilege } }
      );
      count++;
    }
  }
  if (count > 0) {
    console.log(`[privilege-migration] Migrated ${count} user(s) from binary string to array format.`);
  }
}

/**
 * 将新的命名数组权限转为旧的二进制字符串（用于旧模板兼容）
 * @param {string[]} privilege - 新权限数组，如 ['admin'] 或 ['operator', 'account']
 * @returns {string} 旧权限字符串，如 '11111111' 或 '10100000'
 */
function migrateArrayToBinary(privilege) {
  if (!Array.isArray(privilege)) return '00000000';

  // 管理员返回全权限
  if (privilege.includes('admin')) return '11111111';

  // 构建二进制字符串（8位）
  const bits = ['0', '0', '0', '0', '0', '0', '0', '0'];

  // 根据权限名称设置对应位
  const PERMISSION_TO_BIT = {
    'operator': 0,      // 业务员
    'statistics': 1,    // 统计
    'account': 2,       // 会计
    // 3: reserved
    'custRevenue': 4,   // 客户营业额
    'vesselRevenue': 5, // 车船营业额
    'selfVehicle': 6,   // 自有车
    'seePrice': 7,      // 查看价格
  };

  for (const perm of privilege) {
    const bit = PERMISSION_TO_BIT[perm];
    if (bit !== undefined) {
      bits[bit] = '1';
    }
  }

  return bits.join('');
}

module.exports = { migrateBinaryToArray, migrateArrayToBinary, needsMigration, migrateAllUsers };
