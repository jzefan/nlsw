/**
 * 找出运单(Invoice)和提单(Bill)中 inner vehicle 的 veh_price 不一致的记录
 *
 * 遍历每个运单的 bills[].vehicles[]，
 * 查找对应 Bill.invoices[].vehicles[] 中的记录，比较 veh_price
 *
 * Usage:
 *   node scripts/find-veh-price-mismatch.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const secrets = require('../config/secrets');

const MONGO_URI = process.env.MONGODB || secrets.db;
const START_DATE = new Date('2025-01-01T00:00:00');
const OUTPUT_FILE = path.join(__dirname, 'veh-price-mismatch.txt');

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  const invoicesColl = db.collection('invoices');
  const billsColl = db.collection('bills');

  // 查询 2025 年至今的所有运单
  const cursor = invoicesColl.find({
    ship_date: { $gte: START_DATE },
  }).project({
    waybill_no: 1,
    vehicle_vessel_name: 1,
    bills: 1,
  });

  let totalChecked = 0;
  let mismatchCount = 0;
  const mismatches = [];

  // 缓存已查过的 bill
  const billCache = new Map();

  for await (const inv of cursor) {
    for (const billRef of inv.bills || []) {
      if (!billRef.vehicles || billRef.vehicles.length === 0) continue;
      if (!billRef.bill_id) continue;

      const billIdStr = String(billRef.bill_id);

      // 查对应提单（带缓存）
      let bill = billCache.get(billIdStr);
      if (bill === undefined) {
        bill = await billsColl.findOne(
          { _id: billRef.bill_id },
          { projection: { bill_no: 1, invoices: 1 } }
        );
        billCache.set(billIdStr, bill || null);
      }
      if (!bill) continue;

      // 找提单中匹配当前运单的 invoice record
      const billInvRecord = (bill.invoices || []).find(
        (bi) => bi.inv_no === inv.waybill_no
      );
      if (!billInvRecord) continue;

      // 遍历运单侧的每条内部车辆
      for (const invVeh of billRef.vehicles) {
        totalChecked++;

        // 按 inner_waybill_no 匹配提单侧车辆
        const billVeh = (billInvRecord.vehicles || []).find(
          (bv) => bv.inner_waybill_no === invVeh.inner_waybill_no
        );

        const invPrice = invVeh.veh_price ?? 0;
        const billPrice = billVeh ? (billVeh.veh_price ?? 0) : null;

        if (billPrice === null || invPrice !== billPrice) {
          mismatchCount++;
          mismatches.push({
            waybill_no: inv.waybill_no,
            vehicle_vessel_name: inv.vehicle_vessel_name || '',
            inv_veh_name: invVeh.veh_name || '',
            inv_veh_price: invPrice,
            bill_no: bill.bill_no || '',
            bill_inv_no: billInvRecord.inv_no || '',
            bill_veh_name: billVeh ? (billVeh.veh_name || '') : '(未找到)',
            bill_veh_price: billPrice === null ? '(未找到)' : billPrice,
          });
        }
      }
    }
  }

  console.log(`\n检查完成: 共检查 ${totalChecked} 条内部车辆记录`);
  console.log(`不一致记录: ${mismatchCount} 条`);

  // 输出到文件
  const header = ['运单号', '车船号', '运单侧车号', '运单侧veh_price', '提单号', '提单侧运单号', '提单侧车号', '提单侧veh_price'].join('\t');
  const lines = mismatches.map((m) =>
    [m.waybill_no, m.vehicle_vessel_name, m.inv_veh_name, m.inv_veh_price, m.bill_no, m.bill_inv_no, m.bill_veh_name, m.bill_veh_price].join('\t')
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
