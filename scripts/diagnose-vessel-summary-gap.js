/**
 * Diagnose the gap between:
 * 1. outsourced vessel detail list total
 * 2. vessel revenue summary total
 *
 * It prints records that are included by the detail-list vessel logic
 * but not counted into summary vsTotal for the same fiscal month.
 *
 * Usage:
 *   node scripts/diagnose-vessel-summary-gap.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const secrets = require('../config/secrets');
const utils = require('../controllers/utils');

const MONGO_URI = process.env.MONGODB || secrets.db;
const START_DATE = new Date('2026-01-26T00:00:00');
const END_DATE = new Date('2026-02-25T23:59:59');
const TARGET_MONTH = '2026-02';

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

function buildRecordKey(billId, invRecord) {
  return [
    String(billId || ''),
    String(invRecord.inv_no || ''),
    String(invRecord.veh_ves_name || ''),
    toNumber(invRecord.num).toFixed(3),
    toNumber(invRecord.weight).toFixed(3),
    toNumber(invRecord.veh_ves_price).toFixed(3),
  ].join('|');
}

async function main() {
  await mongoose.connect(MONGO_URI);

  const db = mongoose.connection.db;
  const invoices = db.collection('invoices');
  const bills = db.collection('bills');
  const vehicles = db.collection('vehicles');

  console.log(`Connected to MongoDB: ${MONGO_URI}`);
  console.log(`Date range: ${formatDate(START_DATE)} ~ ${formatDate(END_DATE)}`);
  console.log(`Target month: ${TARGET_MONTH}`);
  console.log('='.repeat(140));

  const vehList = await vehicles.find({}).project({
    tenantId: 1,
    name: 1,
    veh_type: 1,
    veh_category: 1,
  }).toArray();

  const vehMap = {};
  const outsourcedShipNames = new Set();
  const vehicleDupMap = new Map();

  vehList.forEach(v => {
    const key = `${String(v.tenantId || '')}::${v.name || ''}`;
    if (!vehicleDupMap.has(key)) vehicleDupMap.set(key, []);
    vehicleDupMap.get(key).push({
      _id: String(v._id),
      veh_type: v.veh_type || '',
      veh_category: v.veh_category || '',
    });

    vehMap[key] = {
      type: v.veh_type || '',
      category: v.veh_category || '',
    };

    if (v.veh_category === '外挂' && v.veh_type === '船') {
      outsourcedShipNames.add(key);
    }
  });

  const duplicatedVehicleNames = Array.from(vehicleDupMap.entries())
    .filter(([, rows]) => rows.length > 1);

  if (duplicatedVehicleNames.length > 0) {
    console.log('Duplicate vehicle names found in same tenant:');
    duplicatedVehicleNames.slice(0, 20).forEach(([key, rows]) => {
      console.log(`  ${key}`);
      rows.forEach(row => {
        console.log(`    _id=${row._id} | type=${row.veh_type} | category=${row.veh_category}`);
      });
    });
    console.log('-'.repeat(140));
  } else {
    console.log('No duplicate vehicle names found within the same tenant.');
    console.log('-'.repeat(140));
  }

  const invoiceList = await invoices.find({
    state: { $ne: '新建' },
    ship_date: { $gte: START_DATE, $lte: END_DATE }
  }, {
    projection: {
      tenantId: 1,
      waybill_no: 1,
      ship_date: 1,
      vehicle_vessel_name: 1,
      bills: 1,
    }
  }).toArray();

  const invoiceMap = new Map();
  const billIdSet = new Set();
  invoiceList.forEach(inv => {
    const key = `${String(inv.tenantId || '')}::${inv.waybill_no || ''}`;
    invoiceMap.set(key, inv);
    (inv.bills || []).forEach(b => {
      if (b && b.bill_id) billIdSet.add(String(b.bill_id));
    });
  });

  const billDocs = await bills.find({
    _id: { $in: Array.from(billIdSet).map(id => new mongoose.Types.ObjectId(id)) }
  }, {
    projection: {
      tenantId: 1,
      block_num: 1,
      weight: 1,
      invoices: 1,
    }
  }).toArray();

  let detailOutsourcedAllTotal = 0;
  let detailOutsourcedTruckTotal = 0;
  let detailOutsourcedShipTotal = 0;
  let summaryVsTotal = 0;
  let summaryOutsourcedShipTotal = 0;
  let detailShipButSummaryTruck = 0;
  let detailShipButSummarySkipped = 0;

  const detailShipKeys = new Set();
  const summaryShipKeys = new Set();
  const mismatchRows = [];
  const mismatchReasonCount = {};

  for (const bill of billDocs) {
    for (const invRecord of (bill.invoices || [])) {
      const invoiceKey = `${String(bill.tenantId || '')}::${invRecord.inv_no || ''}`;
      const inv = invoiceMap.get(invoiceKey);
      if (!inv) continue;

      const monthStr = utils.toFinancialMonth(inv.ship_date);
      const vehKey = `${String(bill.tenantId || '')}::${invRecord.veh_ves_name || ''}`;
      const vehInfo = vehMap[vehKey] || {};
      const weight = getBillRecordWeight(bill, invRecord);
      const recordKey = buildRecordKey(bill._id, invRecord);
      const detailCountsAsOutsourcedShip = outsourcedShipNames.has(vehKey) && monthStr === TARGET_MONTH;
      const detailCountsAsOutsourcedAll = monthStr === TARGET_MONTH && vehInfo.category === '外挂';
      const detailCountsAsOutsourcedTruck = detailCountsAsOutsourcedAll && vehInfo.type === '车';
      const summaryCountsAsShip = monthStr === TARGET_MONTH &&
        (vehInfo.type === '船' || (vehInfo.type !== '车' && Array.isArray(invRecord.vehicles) && invRecord.vehicles.length > 0));

      if (detailCountsAsOutsourcedAll) {
        detailOutsourcedAllTotal += weight;
      }

      if (detailCountsAsOutsourcedTruck) {
        detailOutsourcedTruckTotal += weight;
      }

      if (detailCountsAsOutsourcedShip) {
        detailOutsourcedShipTotal += weight;
        detailShipKeys.add(recordKey);
      }

      if (summaryCountsAsShip) {
        summaryVsTotal += weight;
        summaryShipKeys.add(recordKey);
        if (vehInfo.category === '外挂') {
          summaryOutsourcedShipTotal += weight;
        }
      }

      if (detailCountsAsOutsourcedShip && !summaryCountsAsShip) {
        let reason = 'unknown';
        if (monthStr !== TARGET_MONTH) {
          reason = `month=${monthStr}`;
          detailShipButSummarySkipped += weight;
        } else if (vehInfo.type === '车') {
          reason = 'veh_type=车';
          detailShipButSummaryTruck += weight;
        } else if (!vehInfo.type && (!invRecord.vehicles || invRecord.vehicles.length === 0)) {
          reason = 'veh_missing_and_no_inner';
          detailShipButSummarySkipped += weight;
        } else {
          reason = `type=${vehInfo.type || '(empty)'} inner_count=${(invRecord.vehicles || []).length}`;
          detailShipButSummarySkipped += weight;
        }

        mismatchReasonCount[reason] = (mismatchReasonCount[reason] || 0) + 1;
        mismatchRows.push({
          tenantId: String(bill.tenantId || ''),
          billId: String(bill._id),
          waybill: invRecord.inv_no || '',
          shipDate: formatDate(inv.ship_date),
          month: monthStr,
          vehName: invRecord.veh_ves_name || '',
          vehType: vehInfo.type || '',
          vehCategory: vehInfo.category || '',
          innerCount: (invRecord.vehicles || []).length,
          weight: weight.toFixed(3),
          reason,
        });
      }
    }
  }

  console.log(`invoice_count                    : ${invoiceList.length}`);
  console.log(`bill_count                       : ${billDocs.length}`);
  console.log(`detail_outsourced_all_total      : ${detailOutsourcedAllTotal.toFixed(3)}`);
  console.log(`detail_outsourced_truck_total    : ${detailOutsourcedTruckTotal.toFixed(3)}`);
  console.log(`detail_outsourced_ship_total     : ${detailOutsourcedShipTotal.toFixed(3)}`);
  console.log(`summary_vs_total                 : ${summaryVsTotal.toFixed(3)}`);
  console.log(`summary_outsourced_ship_total    : ${summaryOutsourcedShipTotal.toFixed(3)}`);
  console.log(`detail_ship_but_summary_truck_wt : ${detailShipButSummaryTruck.toFixed(3)}`);
  console.log(`detail_ship_but_summary_skip_wt  : ${detailShipButSummarySkipped.toFixed(3)}`);
  console.log(`detail_ship_record_count         : ${detailShipKeys.size}`);
  console.log(`summary_ship_record_count        : ${summaryShipKeys.size}`);
  console.log(`mismatch_record_count            : ${mismatchRows.length}`);
  console.log('-'.repeat(140));

  console.log('Mismatch reasons:');
  Object.keys(mismatchReasonCount).sort().forEach(reason => {
    console.log(`  ${reason}: ${mismatchReasonCount[reason]}`);
  });
  console.log('-'.repeat(140));

  if (mismatchRows.length > 0) {
    console.log('First 50 mismatched rows:');
    mismatchRows.slice(0, 50).forEach((row, idx) => {
      console.log(
        [
          String(idx + 1).padStart(3, ' '),
          `tenant=${row.tenantId}`,
          `bill=${row.billId}`,
          `waybill=${row.waybill}`,
          `date=${row.shipDate}`,
          `month=${row.month}`,
          `veh=${row.vehName}`,
          `type=${row.vehType || '(empty)'}`,
          `category=${row.vehCategory || '(empty)'}`,
          `inner=${row.innerCount}`,
          `weight=${row.weight}`,
          `reason=${row.reason}`,
        ].join(' | ')
      );
    });
  }

  console.log('='.repeat(140));
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
