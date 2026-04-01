/**
 * 修复历史船运单中重复的内部运单号。
 *
 * 目标问题：
 * - 同一张 ship invoice 下，多个不同车辆/始发地组使用了同一个 inner_waybill_no
 * - 同步修复以下位置：
 *   1. invoices.bills[].vehicles[].inner_waybill_no
 *   2. invoices.inner_settle[].inner_waybill_no
 *   3. bills.invoices[].vehicles[].inner_waybill_no
 *
 * 说明：
 * - 默认 DRY-RUN，只输出分析结果，不写库
 * - 加 --apply 才会执行修复
 * - 新内部运单号按 {waybill_no}{三位流水} 生成，流水从当前运单已存在最大后缀 + 1 开始
 * - 对于重复 old inner_waybill_no 对应的 inner_settle：
 *   保留原号的 inner_settle；新生成号会创建默认“未结算”记录
 *
 * 用法：
 *   node scripts/fix-duplicate-inner-waybill-no.js
 *   node scripts/fix-duplicate-inner-waybill-no.js --apply
 *   node scripts/fix-duplicate-inner-waybill-no.js --tenant DEFAULT
 *   node scripts/fix-duplicate-inner-waybill-no.js --tenant-id 698b3d640c84731cc9a67f40 --apply
 *   node scripts/fix-duplicate-inner-waybill-no.js --waybill 01202603310001002 --apply
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Tenant = require('../models/Tenant');
const secrets = require('../config/secrets');

const DRY_RUN = !process.argv.includes('--apply');
const OUTPUT_FILE = path.join(__dirname, 'fix-duplicate-inner-waybill-no-report.json');

function getArgValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : '';
}

const TENANT_CODE = getArgValue('--tenant');
const TENANT_ID = getArgValue('--tenant-id');
const WAYBILL_NO = getArgValue('--waybill');

function buildMongoUri() {
  return process.env.MONGODB || secrets.db;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function defaultInnerSettle(innerWaybillNo) {
  return {
    inner_waybill_no: innerWaybillNo,
    state: '未结算',
    price: 0,
    date: null,
    unship_date: null,
    delay_day: 0,
    advance_charge_mode: '现金',
    advance_charge: 0,
    charge_cash: 0,
    charge_oil: 0,
    receipt: 0,
    remark: '',
    ticket_no: '',
    pay_date: null,
  };
}

function getMaxInnerSuffix(invoice) {
  let max = -1;

  for (const bill of invoice.bills || []) {
    for (const vehicle of bill.vehicles || []) {
      const innerNo = normalizeText(vehicle.inner_waybill_no);
      if (!innerNo.startsWith(invoice.waybill_no || '')) continue;
      const suffix = innerNo.slice(String(invoice.waybill_no || '').length);
      const num = Number.parseInt(suffix, 10);
      if (!Number.isNaN(num) && num > max) {
        max = num;
      }
    }
  }

  return max;
}

function buildVehicleGroupKey(innerWaybillNo, vehName, vehShipFrom) {
  return `${normalizeText(innerWaybillNo)}||${normalizeText(vehName)}||${normalizeText(vehShipFrom)}`;
}

function analyzeInvoice(invoice) {
  const byInnerNo = new Map();
  const allInnerNos = new Set();
  let sequence = 0;

  for (let billIndex = 0; billIndex < (invoice.bills || []).length; billIndex++) {
    const bill = invoice.bills[billIndex];
    for (let vehicleIndex = 0; vehicleIndex < (bill.vehicles || []).length; vehicleIndex++) {
      const vehicle = bill.vehicles[vehicleIndex];
      const innerWaybillNo = normalizeText(vehicle.inner_waybill_no);
      const vehName = normalizeText(vehicle.veh_name);
      const vehShipFrom = normalizeText(vehicle.veh_ship_from || invoice.ship_from);

      if (!innerWaybillNo) continue;
      allInnerNos.add(innerWaybillNo);

      if (!byInnerNo.has(innerWaybillNo)) {
        byInnerNo.set(innerWaybillNo, new Map());
      }

      const vehicleKey = buildVehicleGroupKey(innerWaybillNo, vehName, vehShipFrom);
      const groups = byInnerNo.get(innerWaybillNo);
      if (!groups.has(vehicleKey)) {
        groups.set(vehicleKey, {
          innerWaybillNo,
          vehName,
          vehShipFrom,
          firstSeq: sequence,
          refs: [],
        });
      }

      groups.get(vehicleKey).refs.push({
        billIndex,
        vehicleIndex,
      });
      sequence++;
    }
  }

  let nextSuffix = getMaxInnerSuffix(invoice) + 1;
  const mappings = [];

  for (const [innerWaybillNo, groups] of byInnerNo.entries()) {
    if (groups.size <= 1) continue;

    const sortedGroups = Array.from(groups.values()).sort((a, b) => a.firstSeq - b.firstSeq);
    for (let i = 1; i < sortedGroups.length; i++) {
      let candidate;
      do {
        candidate = `${invoice.waybill_no}${String(nextSuffix).padStart(3, '0')}`;
        nextSuffix++;
      } while (allInnerNos.has(candidate));

      allInnerNos.add(candidate);
      mappings.push({
        oldInnerWaybillNo: innerWaybillNo,
        newInnerWaybillNo: candidate,
        vehName: sortedGroups[i].vehName,
        vehShipFrom: sortedGroups[i].vehShipFrom,
        affectedRefs: sortedGroups[i].refs.length,
      });
    }
  }

  return mappings;
}

function applyMappingsToInvoice(invoice, mappings) {
  if (mappings.length === 0) {
    return {
      updatedBills: invoice.bills || [],
      updatedInnerSettle: invoice.inner_settle || [],
    };
  }

  const mappingByGroupKey = new Map(
    mappings.map((item) => [
      buildVehicleGroupKey(item.oldInnerWaybillNo, item.vehName, item.vehShipFrom),
      item,
    ]),
  );

  const updatedBills = (invoice.bills || []).map((bill) => ({
    ...bill,
    vehicles: (bill.vehicles || []).map((vehicle) => {
      const originalInnerWaybillNo = normalizeText(vehicle.inner_waybill_no);
      const vehName = normalizeText(vehicle.veh_name);
      const vehShipFrom = normalizeText(vehicle.veh_ship_from || invoice.ship_from);
      const mapping = mappingByGroupKey.get(
        buildVehicleGroupKey(originalInnerWaybillNo, vehName, vehShipFrom),
      );

      if (!mapping) return { ...vehicle };
      return {
        ...vehicle,
        inner_waybill_no: mapping.newInnerWaybillNo,
      };
    }),
  }));

  const existingInnerSettleMap = new Map(
    (invoice.inner_settle || []).map((item) => [normalizeText(item.inner_waybill_no), item]),
  );
  const seen = new Set();
  const updatedInnerSettle = [];

  for (const bill of updatedBills) {
    for (const vehicle of bill.vehicles || []) {
      const innerWaybillNo = normalizeText(vehicle.inner_waybill_no);
      if (!innerWaybillNo || seen.has(innerWaybillNo)) continue;
      seen.add(innerWaybillNo);

      updatedInnerSettle.push(
        existingInnerSettleMap.get(innerWaybillNo) || defaultInnerSettle(innerWaybillNo),
      );
    }
  }

  return {
    updatedBills,
    updatedInnerSettle,
  };
}

function applyMappingsToBillDocument(billDoc, invoiceWaybillNo, mappings, defaultShipFrom) {
  if (!Array.isArray(billDoc.invoices) || billDoc.invoices.length === 0) {
    return billDoc.invoices || [];
  }

  const mappingByGroupKey = new Map(
    mappings.map((item) => [
      buildVehicleGroupKey(item.oldInnerWaybillNo, item.vehName, item.vehShipFrom),
      item,
    ]),
  );

  return billDoc.invoices.map((invoiceItem) => {
    if (invoiceItem.inv_no !== invoiceWaybillNo || !Array.isArray(invoiceItem.vehicles)) {
      return invoiceItem;
    }

    return {
      ...invoiceItem,
      vehicles: invoiceItem.vehicles.map((vehicle) => {
        const originalInnerWaybillNo = normalizeText(vehicle.inner_waybill_no);
        const vehName = normalizeText(vehicle.veh_name);
        const vehShipFrom = normalizeText(vehicle.veh_ship_from || defaultShipFrom);
        const mapping = mappingByGroupKey.get(
          buildVehicleGroupKey(originalInnerWaybillNo, vehName, vehShipFrom),
        );

        if (!mapping) return { ...vehicle };
        return {
          ...vehicle,
          inner_waybill_no: mapping.newInnerWaybillNo,
        };
      }),
    };
  });
}

function collectBillChangeReport(billDoc, invoiceWaybillNo, mappings, defaultShipFrom) {
  if (!Array.isArray(billDoc.invoices) || billDoc.invoices.length === 0) {
    return [];
  }

  const mappingByGroupKey = new Map(
    mappings.map((item) => [
      buildVehicleGroupKey(item.oldInnerWaybillNo, item.vehName, item.vehShipFrom),
      item,
    ]),
  );

  const changes = [];

  for (const invoiceItem of billDoc.invoices) {
    if (invoiceItem.inv_no !== invoiceWaybillNo || !Array.isArray(invoiceItem.vehicles)) continue;

    for (const vehicle of invoiceItem.vehicles) {
      const originalInnerWaybillNo = normalizeText(vehicle.inner_waybill_no);
      const vehName = normalizeText(vehicle.veh_name);
      const vehShipFrom = normalizeText(vehicle.veh_ship_from || defaultShipFrom);
      const mapping = mappingByGroupKey.get(
        buildVehicleGroupKey(originalInnerWaybillNo, vehName, vehShipFrom),
      );

      if (!mapping) continue;
      changes.push({
        invNo: invoiceItem.inv_no || '',
        oldInnerWaybillNo: originalInnerWaybillNo,
        newInnerWaybillNo: mapping.newInnerWaybillNo,
        vehName,
        vehShipFrom,
      });
    }
  }

  return changes;
}

async function resolveTenantFilter() {
  if (TENANT_ID) {
    return new mongoose.Types.ObjectId(TENANT_ID);
  }

  if (!TENANT_CODE) return null;

  const tenant = await Tenant.findOne({ code: TENANT_CODE.toUpperCase() }).select('_id name code').lean();
  if (!tenant) {
    throw new Error(`未找到租户 code=${TENANT_CODE}`);
  }
  return tenant._id;
}

async function main() {
  const mongoUri = buildMongoUri();
  await mongoose.connect(mongoUri);

  console.log('Connected to MongoDB');
  console.log(DRY_RUN ? '模式: DRY-RUN（只分析，不写库）' : '模式: APPLY（执行修复）');

  const db = mongoose.connection.db;
  const invoices = db.collection('invoices');
  const bills = db.collection('bills');

  const tenantId = await resolveTenantFilter();
  const invoiceQuery = {
    'bills.vehicles.inner_waybill_no': { $exists: true, $ne: '' },
  };
  if (tenantId) invoiceQuery.tenantId = tenantId;
  if (WAYBILL_NO) invoiceQuery.waybill_no = WAYBILL_NO;

  const cursor = invoices.find(invoiceQuery, {
    projection: {
      tenantId: 1,
      waybill_no: 1,
      ship_from: 1,
      bills: 1,
      inner_settle: 1,
    },
  });

  let scanned = 0;
  let affectedInvoices = 0;
  let updatedInvoices = 0;
  let updatedBills = 0;
  let updatedVehicleRows = 0;
  let affectedBillDocs = 0;
  const report = [];

  for await (const invoice of cursor) {
    scanned++;
    const mappings = analyzeInvoice(invoice);
    if (mappings.length === 0) continue;

    const billIds = (invoice.bills || []).map((item) => item.bill_id).filter(Boolean);
    const relatedBills = billIds.length > 0
      ? await bills.find(
          { _id: { $in: billIds } },
          { projection: { bill_no: 1, invoices: 1 } },
        ).toArray()
      : [];
    const relatedBillChanges = relatedBills
      .map((billDoc) => ({
        billId: String(billDoc._id),
        billNo: billDoc.bill_no || '',
        changes: collectBillChangeReport(
          billDoc,
          invoice.waybill_no,
          mappings,
          invoice.ship_from,
        ),
      }))
      .filter((item) => item.changes.length > 0);

    affectedInvoices++;
    affectedBillDocs += relatedBillChanges.length;
    updatedVehicleRows += mappings.reduce((sum, item) => sum + item.affectedRefs, 0);

    const reportItem = {
      tenantId: String(invoice.tenantId || ''),
      waybillNo: invoice.waybill_no || '',
      mappingCount: mappings.length,
      mappings,
      affectedBillCount: relatedBillChanges.length,
      affectedBills: relatedBillChanges,
    };
    report.push(reportItem);

    if (DRY_RUN) continue;

    const { updatedBills: updatedInvoiceBills, updatedInnerSettle } = applyMappingsToInvoice(invoice, mappings);

    await invoices.updateOne(
      { _id: invoice._id },
      {
        $set: {
          bills: updatedInvoiceBills,
          inner_settle: updatedInnerSettle,
        },
      },
    );
    updatedInvoices++;

    for (const billDoc of relatedBills) {
      const nextInvoices = applyMappingsToBillDocument(
        billDoc,
        invoice.waybill_no,
        mappings,
        invoice.ship_from,
      );

      await bills.updateOne(
        { _id: billDoc._id },
        { $set: { invoices: nextInvoices } },
      );
      updatedBills++;
    }
  }

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      {
        mode: DRY_RUN ? 'dry-run' : 'apply',
        tenantCode: TENANT_CODE || null,
        tenantId: tenantId ? String(tenantId) : null,
        waybillNo: WAYBILL_NO || null,
        scanned,
        affectedInvoices,
        updatedInvoices,
        updatedBills,
        affectedBillDocs,
        updatedVehicleRows,
        report,
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`扫描运单数: ${scanned}`);
  console.log(`存在重复内部运单号的船运单数: ${affectedInvoices}`);
  console.log(`涉及的 bills 文档数: ${affectedBillDocs}`);
  console.log(`涉及的车辆记录数: ${updatedVehicleRows}`);
  if (!DRY_RUN) {
    console.log(`已更新 invoices: ${updatedInvoices}`);
    console.log(`已更新 bills: ${updatedBills}`);
  }
  console.log(`报告文件: ${OUTPUT_FILE}`);

  if (report.length > 0) {
    console.log('\n样例:');
    report.slice(0, 10).forEach((item, index) => {
      console.log(`${index + 1}. invoice=${item.waybillNo} tenant=${item.tenantId}`);
      item.mappings.forEach((mapping) => {
        console.log(
          `   ${mapping.oldInnerWaybillNo} -> ${mapping.newInnerWaybillNo} vehicle=${mapping.vehName} shipFrom=${mapping.vehShipFrom || '-'} refs=${mapping.affectedRefs}`,
        );
      });
      item.affectedBills.slice(0, 5).forEach((billItem) => {
        console.log(`   bill=${billItem.billNo} (${billItem.billId})`);
        billItem.changes.forEach((change) => {
          console.log(
            `      ${change.oldInnerWaybillNo} -> ${change.newInnerWaybillNo} vehicle=${change.vehName} shipFrom=${change.vehShipFrom || '-'}`,
          );
        });
      });
    });
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
