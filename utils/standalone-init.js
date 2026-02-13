const Tenant = require('../models/Tenant');
const User = require('../models/User');
const secrets = require('../config/secrets');

/**
 * Initialize standalone mode: ensure a DEFAULT tenant and admin owner exist.
 * This is idempotent — safe to run on every startup.
 */
async function initStandalone() {
  // 1. Ensure DEFAULT tenant exists
  let tenant = await Tenant.findOne({ code: 'DEFAULT' });
  if (!tenant) {
    tenant = await Tenant.create({
      code: 'DEFAULT',
      name: secrets.companyName,
      fullName: secrets.companyName,
      plan: 'enterprise',
      maxUsers: 999,
      status: 'active',
      creator: 'system',
    });
    console.log('  Created DEFAULT tenant:', tenant.name);
  }

  // 2. Migrate existing users without tenantId to DEFAULT tenant
  const usersWithoutTenant = await User.find({
    $or: [
      { tenantId: { $exists: false } },
      { tenantId: null }
    ]
  });

  if (usersWithoutTenant.length > 0) {
    for (const user of usersWithoutTenant) {
      user.tenantId = tenant._id;
      user.tenantCode = 'DEFAULT';
      // 如果没有 role 字段，设置为 member（保持向后兼容）
      if (!user.role) {
        user.role = 'member';
      }
      await user.save();
    }
    console.log(`  Migrated ${usersWithoutTenant.length} user(s) to DEFAULT tenant`);
  }

  // 3. Ensure an owner account exists for this tenant
  const ownerExists = await User.findOne({ tenantId: tenant._id, role: 'owner' });
  if (!ownerExists) {
    const user = new User({
      userid: 'admin',
      password: '123456',
      role: 'owner',
      tenantId: tenant._id,
      tenantCode: 'DEFAULT',
      privilege: ['admin'],
      no: 1,
      title: '管理员',
    });
    user.profile = { name: '管理员', gender: '', location: '', phone: '' };
    await user.save();
    console.log('  Created admin owner account (admin / 123456)');
  }
}

module.exports = { initStandalone };
