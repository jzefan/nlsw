/**
 * 同步 Invoice.vessel_price → Bill.invoices[].veh_ves_price
 *
 * 以 Invoice.vessel_price 为准（> 0 时），将不一致的 Bill 侧 veh_ves_price 更新。
 *
 * Usage:
 *   node scripts/sync-vessel-price-to-bill.js          # dry-run
 *   node scripts/sync-vessel-price-to-bill.js --apply   # 执行修改
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const secrets = require('../config/secrets');

const MONGO_URI = process.env.MONGODB || secrets.db;
const START_DATE = new Date('2025-01-01T00:00:00');
const DRY_RUN = !process.argv.includes('--apply');
const OUTPUT_FILE = path.join(__dirname, 'vessel-price-sync-result.txt');

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');
  console.log(DRY_RUN ? '模式: DRY-RUN（仅检测，不修改）' : '模式: APPLY（执行修改）');

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
    bills: 1,
  });

  let totalChecked = 0;
  let mismatchCount = 0;
  let billsUpdated = 0;
  const results = [];

  // billId -> [{ invNo, newPrice }]
  const billUpdates = new Map();
  const billCache = new Map();

  for await (const inv of cursor) {
    const vesselPrice = inv.vessel_price ?? 0;
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
        results.push({
          waybill_no: inv.waybill_no,
          vehicle_vessel_name: inv.vehicle_vessel_name || '',
          price_mode: inv.price_mode === 1 ? '打包' : '每吨',
          invoice_vessel_price: vesselPrice,
          bill_no: bill.bill_no || '',
          bill_veh_ves_price_before: billPrice,
          bill_veh_ves_price_after: vesselPrice,
        });

        if (!billUpdates.has(billIdStr)) billUpdates.set(billIdStr, []);
        billUpdates.get(billIdStr).push({
          invNo: inv.waybill_no,
          newPrice: vesselPrice,
        });
      }
    }
  }

  console.log(`\n检查完成: 共检查 ${totalChecked} 条运单-提单记录`);
  console.log(`不一致记录: ${mismatchCount} 条`);
  console.log(`需要更新的提单: ${billUpdates.size} 个`);

  if (!DRY_RUN && billUpdates.size > 0) {
    console.log('\n开始更新 Bill 文档...');
    for (const [billIdStr, updates] of billUpdates) {
      const bill = await billsColl.findOne({ _id: new mongoose.Types.ObjectId(billIdStr) });
      if (!bill) continue;

      let modified = false;
      for (const invRecord of bill.invoices || []) {
        const upd = updates.find((u) => u.invNo === invRecord.inv_no);
        if (upd) {
          invRecord.veh_ves_price = upd.newPrice;
          modified = true;
        }
      }

      if (modified) {
        await billsColl.updateOne(
          { _id: new mongoose.Types.ObjectId(billIdStr) },
          { $set: { invoices: bill.invoices } }
        );
        billsUpdated++;
      }
    }
    console.log(`更新完成: ${billsUpdated} 个提单已修改`);
  }

  const header = [
    '运单号', '车船号', '价格模式',
    'Invoice.vessel_price',
    '提单号',
    'Bill.veh_ves_price(修改前)', 'Bill.veh_ves_price(修改后)',
  ].join('\t');
  const lines = results.map((m) =>
    [
      m.waybill_no, m.vehicle_vessel_name, m.price_mode,
      m.invoice_vessel_price,
      m.bill_no,
      m.bill_veh_ves_price_before, m.bill_veh_ves_price_after,
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
