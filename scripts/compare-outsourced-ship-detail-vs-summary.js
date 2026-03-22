/**
 * Compare outsourced ship waybill data between:
 * 1. detail list logic (外挂 + 船)
 * 2. summary logic contribution into vessel total
 *
 * Usage:
 *   node scripts/compare-outsourced-ship-detail-vs-summary.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const secrets = require('../config/secrets');
const utils = require('../controllers/utils');
const Vehicle = require('../models/Vehicle');
const Invoice = require('../models/Invoice');
const Bill = require('../models/Bill');

const MONGO_URI = process.env.MONGODB || secrets.db;
const START_DATE = new Date('2026-01-26T00:00:00');
const END_DATE = new Date('2026-02-25T23:59:59');
const TARGET_MONTH = '2026-02';
const FLOAT_TOLERANCE = 0.001;

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatDate(value) {
  if (!value) return '(null)';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function getBillRecordWeight(bill, invRecord) {
  return (bill.block_num > 0)
    ? (toNumber(invRecord.num) * toNumber(bill.weight))
    : toNumber(invRecord.weight);
}

async function main() {
  await mongoose.connect(MONGO_URI);

  const vehList = await Vehicle.find({
    veh_category: '外挂',
    veh_type: '船',
  }).select('tenantId name veh_type veh_category').lean().exec();

  const outsourcedShipNameSet = new Set(
    vehList.map(v => `${String(v.tenantId || '')}::${v.name || ''}`)
  );

  const allVehList = await Vehicle.find({})
    .select('tenantId name veh_type veh_category')
    .lean()
    .exec();

  const vehMap = {};
  allVehList.forEach(v => {
    vehMap[`${String(v.tenantId || '')}::${v.name || ''}`] = {
      type: v.veh_type || '',
      category: v.veh_category || '',
    };
  });

  const invoices = await Invoice.find({
    state: { $ne: '新建' },
    ship_date: { $gte: START_DATE, $lte: END_DATE },
  })
    .select('tenantId waybill_no ship_date vehicle_vessel_name bills')
    .lean()
    .exec();

  const invoiceMap = {};
  const billIdSet = new Set();
  invoices.forEach(inv => {
    invoiceMap[`${String(inv.tenantId || '')}::${inv.waybill_no || ''}`] = inv;
    (inv.bills || []).forEach(b => {
      if (b && b.bill_id) billIdSet.add(String(b.bill_id));
    });
  });

  const bills = await Bill.find({
    _id: { $in: Array.from(billIdSet).map(id => new mongoose.Types.ObjectId(id)) }
  })
    .select('tenantId block_num weight invoices')
    .lean()
    .exec();

  const waybillMap = new Map();

  function ensureWaybillRow(inv, invRecord) {
    const key = `${String(inv.tenantId || '')}::${inv.waybill_no || ''}`;
    if (!waybillMap.has(key)) {
      waybillMap.set(key, {
        tenantId: String(inv.tenantId || ''),
        waybill: inv.waybill_no || '',
        shipDate: formatDate(inv.ship_date),
        month: utils.toFinancialMonth(inv.ship_date),
        vehicle: invRecord.veh_ves_name || inv.vehicle_vessel_name || '',
        detailWeight: 0,
        summaryWeight: 0,
        detailRecords: 0,
        summaryRecords: 0,
      });
    }
    return waybillMap.get(key);
  }

  for (const bill of bills) {
    for (const invRecord of (bill.invoices || [])) {
      const inv = invoiceMap[`${String(bill.tenantId || '')}::${invRecord.inv_no || ''}`];
      if (!inv) continue;

      const monthStr = utils.toFinancialMonth(inv.ship_date);
      if (monthStr !== TARGET_MONTH) continue;

      const vehKey = `${String(bill.tenantId || '')}::${invRecord.veh_ves_name || ''}`;
      const vehInfo = vehMap[vehKey] || {};
      const weight = getBillRecordWeight(bill, invRecord);
      const isOutsourcedShipDetail = outsourcedShipNameSet.has(vehKey);
      const isSummaryShip = vehInfo.type === '船' || (vehInfo.type !== '车' && Array.isArray(invRecord.vehicles) && invRecord.vehicles.length > 0);

      if (!isOutsourcedShipDetail && !(isSummaryShip && vehInfo.category === '外挂')) {
        continue;
      }

      const row = ensureWaybillRow(inv, invRecord);

      if (isOutsourcedShipDetail) {
        row.detailWeight += weight;
        row.detailRecords += 1;
      }

      if (isSummaryShip && vehInfo.category === '外挂') {
        row.summaryWeight += weight;
        row.summaryRecords += 1;
      }
    }
  }

  const rows = Array.from(waybillMap.values())
    .map(row => {
      const detailWeight = utils.toFixedNumber(row.detailWeight, 3);
      const summaryWeight = utils.toFixedNumber(row.summaryWeight, 3);
      const diff = utils.toFixedNumber(detailWeight - summaryWeight, 3);
      return {
        ...row,
        detailWeight,
        summaryWeight,
        diff,
        status: Math.abs(diff) <= FLOAT_TOLERANCE ? 'OK' : 'DIFF',
      };
    })
    .sort((a, b) => {
      if (a.shipDate !== b.shipDate) return a.shipDate.localeCompare(b.shipDate);
      return a.waybill.localeCompare(b.waybill);
    });

  let totalDetail = 0;
  let totalSummary = 0;
  let diffCount = 0;

  rows.forEach((row, idx) => {
    totalDetail += row.detailWeight;
    totalSummary += row.summaryWeight;
    if (row.status === 'DIFF') diffCount += 1;

    console.log(
      [
        String(idx + 1).padStart(4, ' '),
        `tenant=${row.tenantId}`,
        `waybill=${row.waybill}`,
        `date=${row.shipDate}`,
        `vehicle=${row.vehicle}`,
        `detail_weight=${row.detailWeight.toFixed(3)}`,
        `summary_weight=${row.summaryWeight.toFixed(3)}`,
        `diff=${row.diff.toFixed(3)}`,
        `detail_records=${row.detailRecords}`,
        `summary_records=${row.summaryRecords}`,
        row.status,
      ].join(' | ')
    );
  });

  console.log('='.repeat(160));
  console.log(`waybill_count        : ${rows.length}`);
  console.log(`diff_waybill_count   : ${diffCount}`);
  console.log(`detail_total_weight  : ${utils.toFixedNumber(totalDetail, 3).toFixed(3)}`);
  console.log(`summary_total_weight : ${utils.toFixedNumber(totalSummary, 3).toFixed(3)}`);
  console.log(`total_diff           : ${utils.toFixedNumber(totalDetail - totalSummary, 3).toFixed(3)}`);
  console.log('='.repeat(160));

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
