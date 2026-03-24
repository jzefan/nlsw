/**
 * 检查 Invoice.vessel_price 与 Bill.invoices[].veh_ves_price 的不一致性
 *
 * 对于每个运单，遍历其关联的提单记录，比较：
 *   Invoice.vessel_price  vs  Bill.invoices[](匹配inv_no).veh_ves_price
 *
 * 仅输出 vessel_price > 0 且两者不同的记录（vessel_price=0 表示未设置，跳过）
 *
 * Usage:
 *   node scripts/find-vessel-price-mismatch.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const secrets = require('../config/secrets');

const MONGO_URI = process.env.MONGODB || secrets.db;
const START_DATE = new Date('2025-01-01T00:00:00');
const OUTPUT_FILE = path.join(__dirname, 'vessel-price-mismatch.txt');

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  const invoicesColl = db.collection('invoices');
  const billsColl = db.collection('bills');

  const cursor = invoicesColl.find({
    ship_date: { $gte: START_DATE },
  }).project({
    waybill_no: 1,
    vehicle_vessel_name: 1,
    vessel_price: 1,
    price_mode: 1,
    total_weight: 1,
    bills: 1,
  });

  let totalChecked = 0;
  let mismatchCount = 0;
  const mismatches = [];
  const billCache = new Map();

  for await (const inv of cursor) {
    const vesselPrice = inv.vessel_price ?? 0;
    // 跳过未设置价格和不需要结算的
    if (vesselPrice <= 0) continue;

    for (const billRef of inv.bills || []) {
      if (!billRef.bill_id) continue;

      const billIdStr = String(billRef.bill_id);
      let bill = billCache.get(billIdStr);
      if (bill === undefined) {
        bill = await billsColl.findOne(
          { _id: billRef.bill_id },
          { projection: { bill_no: 1, invoices: 1 } }
        );
        billCache.set(billIdStr, bill || null);
      }
      if (!bill) continue;

      const billInvRecord = (bill.invoices || []).find(
        (bi) => bi.inv_no === inv.waybill_no
      );
      if (!billInvRecord) continue;

      totalChecked++;
      const billPrice = billInvRecord.veh_ves_price ?? 0;

      if (vesselPrice !== billPrice) {
        mismatchCount++;
        mismatches.push({
          waybill_no: inv.waybill_no,
          vehicle_vessel_name: inv.vehicle_vessel_name || '',
          price_mode: inv.price_mode === 1 ? '打包' : '每吨',
          invoice_vessel_price: vesselPrice,
          bill_no: bill.bill_no || '',
          bill_veh_ves_name: billInvRecord.veh_ves_name || '',
          bill_veh_ves_price: billPrice,
        });
      }
    }
  }

  console.log(`\n检查完成: 共检查 ${totalChecked} 条运单-提单记录`);
  console.log(`不一致记录: ${mismatchCount} 条`);

  const header = [
    '运单号', '车船号', '价格模式',
    'Invoice.vessel_price',
    '提单号', '提单侧车船号',
    'Bill.veh_ves_price',
  ].join('\t');
  const lines = mismatches.map((m) =>
    [
      m.waybill_no, m.vehicle_vessel_name, m.price_mode,
      m.invoice_vessel_price,
      m.bill_no, m.bill_veh_ves_name,
      m.bill_veh_ves_price,
    ].join('\t')
  );
  const content = [header, ...lines].join('\n');
  fs.writeFileSync(OUTPUT_FILE, content, 'utf-8');
  console.log(`结果已写入: ${OUTPUT_FILE}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
