const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Use existing models
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Order = require('../models/Order');

// MongoDB connection
const MONGO_URI = 'mongodb://localhost:27027/nldb_saas';

async function createTestTenant() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✓ Connected to MongoDB');

    // Calculate expiry time (12 hours from now)
    const expireDate = new Date();
    expireDate.setHours(expireDate.getHours() + 12);

    // Check if tenant already exists
    const existing = await Tenant.findOne({ code: 'TEST12H' });
    if (existing) {
      console.log('✗ Tenant TEST12H already exists. Deleting...');
      await User.deleteMany({ tenantId: existing._id });
      await Order.deleteMany({ tenantId: existing._id });
      await Tenant.deleteOne({ _id: existing._id });
      console.log('✓ Cleaned up existing tenant');
    }

    // Create tenant
    console.log('\nCreating tenant...');
    const tenant = await Tenant.create({
      code: 'TEST12H',
      name: '测试公司12小时',
      fullName: '测试公司12小时过期',
      status: 'active',
      plan: 'enterprise',
      maxUsers: 10,
      expireDate: expireDate,
      creator: 'script'
    });
    console.log(`✓ Tenant created: ${tenant.name} (${tenant.code})`);
    console.log(`  ID: ${tenant._id}`);
    console.log(`  Expires: ${expireDate.toLocaleString('zh-CN')}`);

    // Create user
    console.log('\nCreating user...');
    const hashedPassword = await bcrypt.hash('123456', 10);
    const user = await User.create({
      tenantId: tenant._id,
      tenantCode: tenant.code,
      userid: 'test12h',
      role: 'owner',
      password: hashedPassword,
      privilege: ['admin', 'operator', 'account', 'statistics', 'cust-revenue', 'vessel-revenue'],
      profile: {
        name: '测试用户',
        phone: '',
        email: ''
      }
    });
    console.log(`✓ User created: ${user.userid}`);
    console.log(`  Password: 123456`);
    console.log(`  Role: ${user.role}`);

    // Create order
    console.log('\nCreating order...');
    const startDate = new Date();
    const orderNo = `ORD-${startDate.getFullYear()}${String(startDate.getMonth() + 1).padStart(2, '0')}${String(startDate.getDate()).padStart(2, '0')}-TEST`;

    const order = await Order.create({
      tenantId: tenant._id,
      orderNo: orderNo,
      plan: 'enterprise',
      amount: 1000,
      startDate: startDate,
      endDate: expireDate,
      status: 'paid',
      paymentMethod: '测试',
      paidAt: startDate,
      notes: '测试订单-12小时过期',
      creator: 'script'
    });
    console.log(`✓ Order created: ${order.orderNo}`);
    console.log(`  Status: ${order.status}`);
    console.log(`  Amount: ¥${order.amount}`);
    console.log(`  End Date: ${expireDate.toLocaleString('zh-CN')}`);

    console.log('\n' + '='.repeat(60));
    console.log('SUCCESS! Test tenant created:');
    console.log('='.repeat(60));
    console.log(`Username: test12h`);
    console.log(`Password: 123456`);
    console.log(`Company Code: TEST12H`);
    console.log(`Expires in: 12 hours (${expireDate.toLocaleString('zh-CN')})`);
    console.log('='.repeat(60));
    console.log('\nYou can now:');
    console.log('1. Login at http://localhost:1080');
    console.log('2. You should see a RED subscription banner (high urgency)');
    console.log('3. The banner will be non-dismissible (<2 hours before expiry)');
    console.log('4. A warning toast will appear on login');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('✗ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

createTestTenant();
