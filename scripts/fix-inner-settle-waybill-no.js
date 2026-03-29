/**
 * 清洗以下字段中的“内部运单号_车船号”数据：
 *   1. invoices.inner_settle[].inner_waybill_no
 *   2. bills.invoices[].vehicles[].inner_waybill_no
 *
 * 问题数据形态：
 *   内部运单号_车船号
 * 例如：
 *   01202603230016005003_苏A5D620
 *
 * 修复规则：
 *   仅当 inner_waybill_no 包含 "_" 且后缀非空时，
 *   将其截断为 "_" 前的内部运单号。
 *
 * Usage:
 *   node scripts/fix-inner-settle-waybill-no.js          # dry-run
 *   node scripts/fix-inner-settle-waybill-no.js --apply  # 执行修改
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const secrets = require('../config/secrets');

const MONGO_URI = process.env.MONGODB || secrets.db;
const DRY_RUN = !process.argv.includes('--apply');
const OUTPUT_FILE = path.join(__dirname, 'fix-inner-settle-waybill-no-result.txt');

function normalizeInnerWaybillNo(value) {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  const underscoreIndex = trimmed.indexOf('_');
  if (underscoreIndex <= 0 || underscoreIndex === trimmed.length - 1) {
    return trimmed;
  }

  return trimmed.slice(0, underscoreIndex);
}

function extractVehicleVesselName(value) {
  if (typeof value !== 'string') return '';

  const trimmed = value.trim();
  const underscoreIndex = trimmed.indexOf('_');
  if (underscoreIndex <= 0 || underscoreIndex === trimmed.length - 1) {
    return '';
  }

  return trimmed.slice(underscoreIndex + 1);
}

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');
  console.log(DRY_RUN ? '模式: DRY-RUN（仅检查，不修改）' : '模式: APPLY（执行修改）');

  const invoices = mongoose.connection.db.collection('invoices');
  const bills = mongoose.connection.db.collection('bills');

  const invoiceCursor = invoices.find(
    { 'inner_settle.inner_waybill_no': /_/ },
    {
      projection: {
        waybill_no: 1,
        tenantId: 1,
        inner_settle: 1,
      },
    }
  );

  const billCursor = bills.find(
    { 'invoices.vehicles.inner_waybill_no': /_/ },
    {
      projection: {
        bill_no: 1,
        tenantId: 1,
        invoices: 1,
      },
    }
  );

  let checkedInvoices = 0;
  let matchedInvoices = 0;
  let changedInvoiceEntries = 0;
  let checkedBills = 0;
  let matchedBills = 0;
  let changedBillEntries = 0;
  const samples = [];
  const outputRows = [];

  for await (const invoice of invoiceCursor) {
    checkedInvoices++;
    if (!Array.isArray(invoice.inner_settle) || invoice.inner_settle.length === 0) {
      continue;
    }

    let hasChange = false;
    const nextInnerSettle = invoice.inner_settle.map((item) => {
      const before = item && item.inner_waybill_no;
      const after = normalizeInnerWaybillNo(before);
      const vehicleVesselName = extractVehicleVesselName(before);

      if (before !== after) {
        hasChange = true;
        changedInvoiceEntries++;
        outputRows.push({
          source: 'invoice.inner_settle',
          documentNo: invoice.waybill_no || '',
          invoiceWaybillNo: invoice.waybill_no || '',
          billNo: '',
          innerWaybillNo: before || '',
          normalizedInnerWaybillNo: after || '',
          vehicleVesselName,
        });
        if (samples.length < 20) {
          samples.push({
            source: 'invoice.inner_settle',
            invoice_waybill_no: invoice.waybill_no || '',
            bill_no: '',
            tenantId: String(invoice.tenantId || ''),
            before,
            after,
            vehicle_vessel_name: vehicleVesselName,
          });
        }
      }

      return {
        ...item,
        inner_waybill_no: after,
      };
    });

    if (!hasChange) continue;
    matchedInvoices++;

    if (!DRY_RUN) {
      await invoices.updateOne(
        { _id: invoice._id },
        { $set: { inner_settle: nextInnerSettle } }
      );
    }
  }

  for await (const bill of billCursor) {
    checkedBills++;
    if (!Array.isArray(bill.invoices) || bill.invoices.length === 0) {
      continue;
    }

    let hasChange = false;
    const nextInvoices = bill.invoices.map((invoiceItem) => {
      if (!Array.isArray(invoiceItem.vehicles) || invoiceItem.vehicles.length === 0) {
        return invoiceItem;
      }

      const nextVehicles = invoiceItem.vehicles.map((vehicleItem) => {
        const before = vehicleItem && vehicleItem.inner_waybill_no;
        const after = normalizeInnerWaybillNo(before);
        const vehicleVesselName = extractVehicleVesselName(before);

        if (before !== after) {
          hasChange = true;
          changedBillEntries++;
          outputRows.push({
            source: 'bill.invoices.vehicles',
            documentNo: bill.bill_no || '',
            invoiceWaybillNo: invoiceItem.inv_no || '',
            billNo: bill.bill_no || '',
            innerWaybillNo: before || '',
            normalizedInnerWaybillNo: after || '',
            vehicleVesselName,
          });
          if (samples.length < 20) {
            samples.push({
              source: 'bill.invoices.vehicles',
              invoice_waybill_no: invoiceItem.inv_no || '',
              bill_no: bill.bill_no || '',
              tenantId: String(bill.tenantId || ''),
              before,
              after,
              vehicle_vessel_name: vehicleVesselName,
            });
          }
        }

        return {
          ...vehicleItem,
          inner_waybill_no: after,
        };
      });

      return {
        ...invoiceItem,
        vehicles: nextVehicles,
      };
    });

    if (!hasChange) continue;
    matchedBills++;

    if (!DRY_RUN) {
      await bills.updateOne(
        { _id: bill._id },
        { $set: { invoices: nextInvoices } }
      );
    }
  }

  console.log(`扫描到包含下划线的 invoice 数量: ${checkedInvoices}`);
  console.log(`实际需要修复的 invoice 数量: ${matchedInvoices}`);
  console.log(`实际需要修复的 invoice.inner_settle 条目数: ${changedInvoiceEntries}`);
  console.log(`扫描到包含下划线的 bill 数量: ${checkedBills}`);
  console.log(`实际需要修复的 bill 数量: ${matchedBills}`);
  console.log(`实际需要修复的 bill.invoices.vehicles 条目数: ${changedBillEntries}`);

  const header = ['来源', '单号', '运单号', '提单号', '内部运单号', '修正后内部运单号', '车船号'].join('\t');
  const content = [
    header,
    ...outputRows.map((row) =>
      [
        row.source,
        row.documentNo,
        row.invoiceWaybillNo,
        row.billNo,
        row.innerWaybillNo,
        row.normalizedInnerWaybillNo,
        row.vehicleVesselName,
      ].join('\t')
    ),
  ].join('\n');
  fs.writeFileSync(OUTPUT_FILE, content, 'utf-8');
  console.log(`明细已写入: ${OUTPUT_FILE}`);

  if (samples.length > 0) {
    console.log('\n样例（最多 20 条）:');
    samples.forEach((sample, index) => {
      console.log(
        `${index + 1}. source=${sample.source} invoice=${sample.invoice_waybill_no} bill=${sample.bill_no} tenantId=${sample.tenantId} ${sample.before} -> ${sample.after} vehicle=${sample.vehicle_vessel_name}`
      );
    });
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
