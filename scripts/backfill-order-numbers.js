/**
 * 一次性脚本：从现有 Bill 和 OrderPlan 中提取 order_no，回填到 OrderNumber 集合
 * 用法：node scripts/backfill-order-numbers.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const secrets = require('../config/secrets');

const MONGO_URI = process.env.MONGODB || secrets.db;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to', MONGO_URI.replace(/:([^@]+)@/, ':***@'));

  const OrderNumber = require('../models/OrderNumber');
  const Bill = require('../models/Bill');
  const OrderPlan = require('../models/OrderPlan');

  // Collect all unique (tenantId, order_no) pairs from Bills
  const billOrders = await Bill.aggregate([
    { $match: { order_no: { $exists: true, $ne: '' } } },
    { $group: { _id: { tenantId: '$tenantId', value: '$order_no' } } }
  ]);

  // Collect from OrderPlans
  const planOrders = await OrderPlan.aggregate([
    { $match: { order_no: { $exists: true, $ne: '' } } },
    { $group: { _id: { tenantId: '$tenantId', value: '$order_no' } } }
  ]);

  // Merge and deduplicate
  const seen = new Set();
  const ops = [];

  for (const row of [...billOrders, ...planOrders]) {
    const key = `${row._id.tenantId}_${row._id.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ops.push({
      updateOne: {
        filter: { tenantId: row._id.tenantId, type: 'order_no', value: row._id.value },
        update: { $setOnInsert: { tenantId: row._id.tenantId, type: 'order_no', value: row._id.value } },
        upsert: true
      }
    });
  }

  if (ops.length > 0) {
    const result = await OrderNumber.bulkWrite(ops);
    console.log(`Done. Processed ${ops.length} order numbers. Upserted: ${result.upsertedCount}, Modified: ${result.modifiedCount}`);
  } else {
    console.log('No order numbers found to backfill.');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
