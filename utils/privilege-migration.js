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

module.exports = { migrateBinaryToArray, needsMigration, migrateAllUsers };
