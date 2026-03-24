/**
 * 同步 Invoice.bills[].vehicles[].veh_price → Bill.invoices[].vehicles[].veh_price
 *
 * 以 Invoice 侧为准，将不一致的 Bill 侧 veh_price 更新为 Invoice 侧的值。
 * 通过 inner_waybill_no 匹配同一条内部车辆记录。
 *
 * Usage:
 *   node scripts/sync-veh-price-to-bill.js          # dry-run（只检测，不修改）
 *   node scripts/sync-veh-price-to-bill.js --apply   # 实际执行修改
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const secrets = require('../config/secrets');

const MONGO_URI = process.env.MONGODB || secrets.db;
const START_DATE = new Date('2025-01-01T00:00:00');
const DRY_RUN = !process.argv.includes('--apply');
const OUTPUT_FILE = path.join(__dirname, 'veh-price-sync-result.txt');

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
    bills: 1,
  });

  let totalChecked = 0;
  let mismatchCount = 0;
  let billsUpdated = 0;
  const results = [];

  // 收集所有需要更新的 Bill: billId -> { invNo -> { innerWaybillNo -> invPrice } }
  const billUpdates = new Map();

  for await (const inv of cursor) {
    for (const billRef of inv.bills || []) {
      if (!billRef.vehicles || billRef.vehicles.length === 0) continue;
      if (!billRef.bill_id) continue;

      const billIdStr = String(billRef.bill_id);

      // 查提单
      let bill;
      try {
        bill = await billsColl.findOne(
          { _id: billRef.bill_id },
          { projection: { bill_no: 1, invoices: 1 } }
        );
      } catch { continue; }
      if (!bill) continue;

      const billInvRecord = (bill.invoices || []).find(
        (bi) => bi.inv_no === inv.waybill_no
      );
      if (!billInvRecord) continue;

      for (const invVeh of billRef.vehicles) {
        totalChecked++;

        const billVeh = (billInvRecord.vehicles || []).find(
          (bv) => bv.inner_waybill_no === invVeh.inner_waybill_no
        );

        const invPrice = invVeh.veh_price ?? 0;
        const billPrice = billVeh ? (billVeh.veh_price ?? 0) : null;

        if (billPrice === null || invPrice !== billPrice) {
          mismatchCount++;
          results.push({
            waybill_no: inv.waybill_no,
            vehicle_vessel_name: inv.vehicle_vessel_name || '',
            inv_veh_name: invVeh.veh_name || '',
            inv_veh_price: invPrice,
            bill_no: bill.bill_no || '',
            bill_inv_no: billInvRecord.inv_no || '',
            bill_veh_name: billVeh ? (billVeh.veh_name || '') : '(未找到)',
            bill_veh_price_before: billPrice === null ? '(未找到)' : billPrice,
            bill_veh_price_after: invPrice,
          });

          // 记录待更新
          if (billVeh) {
            if (!billUpdates.has(billIdStr)) billUpdates.set(billIdStr, []);
            billUpdates.get(billIdStr).push({
              invNo: inv.waybill_no,
              innerWaybillNo: invVeh.inner_waybill_no,
              newPrice: invPrice,
            });
          }
        }
      }
    }
  }

  console.log(`\n检查完成: 共检查 ${totalChecked} 条内部车辆记录`);
  console.log(`不一致记录: ${mismatchCount} 条`);
  console.log(`需要更新的提单: ${billUpdates.size} 个`);

  // 执行更新
  if (!DRY_RUN && billUpdates.size > 0) {
    console.log('\n开始更新 Bill 文档...');
    for (const [billIdStr, updates] of billUpdates) {
      const bill = await billsColl.findOne({ _id: new mongoose.Types.ObjectId(billIdStr) });
      if (!bill) continue;

      let modified = false;
      for (const invRecord of bill.invoices || []) {
        for (const bVeh of invRecord.vehicles || []) {
          const upd = updates.find(
            (u) => u.invNo === invRecord.inv_no && u.innerWaybillNo === bVeh.inner_waybill_no
          );
          if (upd) {
            bVeh.veh_price = upd.newPrice;
            modified = true;
          }
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

  // 输出结果到文件
  const header = [
    '运单号', '车船号', '运单侧车号', '运单侧veh_price',
    '提单号', '提单侧运单号', '提单侧车号',
    '提单侧veh_price(修改前)', '提单侧veh_price(修改后)',
  ].join('\t');
  const lines = results.map((m) =>
    [
      m.waybill_no, m.vehicle_vessel_name, m.inv_veh_name, m.inv_veh_price,
      m.bill_no, m.bill_inv_no, m.bill_veh_name,
      m.bill_veh_price_before, m.bill_veh_price_after,
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
