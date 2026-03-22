/**
 * Compare exact outsourced-ship detail-endpoint rows vs summary ship rows.
 *
 * Detail side replicates getVesselAllocationDetail with:
 *   fVehType=外挂, fVehMode=船
 * Summary side replicates getVesselRevenueData vessel aggregation.
 *
 * Usage:
 *   node scripts/compare-outsourced-ship-detail-endpoint-vs-summary.js
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

function getInnerVehicleWeight(bill, vehicle) {
  if (toNumber(vehicle.send_weight) > 0) return toNumber(vehicle.send_weight);
  return (bill.block_num > 0)
    ? (toNumber(vehicle.send_num) * toNumber(bill.weight))
    : 0;
}

function accumulate(map, key, base, field, weight) {
  if (!map.has(key)) {
    map.set(key, {
      ...base,
      detailWeight: 0,
      detailMainWeight: 0,
      detailInnerWeight: 0,
      detailRows: 0,
      detailMainRows: 0,
      detailInnerRows: 0,
      summaryWeight: 0,
      summaryRows: 0,
    });
  }
  const row = map.get(key);
  row[field] += weight;
  return row;
}

async function main() {
  await mongoose.connect(MONGO_URI);

  const shipVehs = await Vehicle.find({ veh_category: '外挂', veh_type: '船' })
    .select('tenantId name')
    .lean()
    .exec();

  const shipVehNameSet = new Set(
    shipVehs.map(v => `${String(v.tenantId || '')}::${v.name || ''}`)
  );

  const allVehs = await Vehicle.find({})
    .select('tenantId name veh_type veh_category')
    .lean()
    .exec();
  const vehMap = {};
  allVehs.forEach(v => {
    vehMap[`${String(v.tenantId || '')}::${v.name || ''}`] = {
      type: v.veh_type || '',
      category: v.veh_category || '',
    };
  });

  const invoices = await Invoice.find({
    state: { $ne: '新建' },
    ship_date: { $gte: START_DATE, $lte: END_DATE }
  })
    .select('tenantId waybill_no ship_date vehicle_vessel_name inner_settle bills')
    .lean()
    .exec();

  const invMap = {};
  const billIdSet = new Set();
  invoices.forEach(inv => {
    invMap[`${String(inv.tenantId || '')}::${inv.waybill_no || ''}`] = inv;
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

  const compareMap = new Map();
  let detailTotal = 0;
  let detailMainTotal = 0;
  let detailInnerTotal = 0;
  let summaryTotal = 0;

  for (const bill of bills) {
    for (const invRecord of (bill.invoices || [])) {
      const inv = invMap[`${String(bill.tenantId || '')}::${invRecord.inv_no || ''}`];
      if (!inv) continue;

      const monthStr = utils.toFinancialMonth(inv.ship_date);
      if (monthStr !== TARGET_MONTH) continue;

      const mainVehKey = `${String(bill.tenantId || '')}::${invRecord.veh_ves_name || ''}`;
      const mainVehInfo = vehMap[mainVehKey] || {};
      const mainWeight = getBillRecordWeight(bill, invRecord);

      const outerKey = `${String(inv.tenantId || '')}::${inv.waybill_no || ''}`;
      const base = {
        tenantId: String(inv.tenantId || ''),
        waybill: inv.waybill_no || '',
        shipDate: formatDate(inv.ship_date),
        vehicle: invRecord.veh_ves_name || inv.vehicle_vessel_name || '',
      };

      // Exact detail endpoint: main vehicle row if its name is in outsourced ship names.
      if (shipVehNameSet.has(mainVehKey)) {
        const row = accumulate(compareMap, outerKey, base, 'detailWeight', mainWeight);
        row.detailMainWeight += mainWeight;
        row.detailRows += 1;
        row.detailMainRows += 1;
        detailTotal += mainWeight;
        detailMainTotal += mainWeight;
      }

      // Exact detail endpoint: inner rows whose veh_name is also in outsourced ship names.
      for (const subVeh of (invRecord.vehicles || [])) {
        const subVehKey = `${String(bill.tenantId || '')}::${subVeh.veh_name || ''}`;
        if (!shipVehNameSet.has(subVehKey)) continue;

        const innerWeight = getInnerVehicleWeight(bill, subVeh);
        const innerKey = `${String(inv.tenantId || '')}::${subVeh.inner_waybill_no || inv.waybill_no || ''}`;
        const innerBase = {
          tenantId: String(inv.tenantId || ''),
          waybill: subVeh.inner_waybill_no || inv.waybill_no || '',
          outerWaybill: inv.waybill_no || '',
          shipDate: formatDate(inv.ship_date),
          vehicle: subVeh.veh_name || '',
        };

        const row = accumulate(compareMap, innerKey, innerBase, 'detailWeight', innerWeight);
        row.detailInnerWeight += innerWeight;
        row.detailRows += 1;
        row.detailInnerRows += 1;
        detailTotal += innerWeight;
        detailInnerTotal += innerWeight;
      }

      // Exact summary ship logic.
      const isSummaryShip = mainVehInfo.type === '船' ||
        (mainVehInfo.type !== '车' && Array.isArray(invRecord.vehicles) && invRecord.vehicles.length > 0);

      if (isSummaryShip && mainVehInfo.category === '外挂') {
        const row = accumulate(compareMap, outerKey, base, 'summaryWeight', mainWeight);
        row.summaryRows += 1;
        summaryTotal += mainWeight;
      }
    }
  }

  const rows = Array.from(compareMap.values())
    .map(row => {
      row.detailWeight = utils.toFixedNumber(row.detailWeight, 3);
      row.detailMainWeight = utils.toFixedNumber(row.detailMainWeight, 3);
      row.detailInnerWeight = utils.toFixedNumber(row.detailInnerWeight, 3);
      row.summaryWeight = utils.toFixedNumber(row.summaryWeight, 3);
      row.diff = utils.toFixedNumber(row.detailWeight - row.summaryWeight, 3);
      row.status = Math.abs(row.diff) <= FLOAT_TOLERANCE ? 'OK' : 'DIFF';
      return row;
    })
    .sort((a, b) => {
      if (a.shipDate !== b.shipDate) return a.shipDate.localeCompare(b.shipDate);
      return (a.waybill || '').localeCompare(b.waybill || '');
    });

  let diffCount = 0;
  rows.forEach((row, idx) => {
    if (row.status === 'DIFF') diffCount += 1;
    console.log(
      [
        String(idx + 1).padStart(4, ' '),
        `tenant=${row.tenantId}`,
        `waybill=${row.waybill}`,
        row.outerWaybill ? `outer_waybill=${row.outerWaybill}` : null,
        `date=${row.shipDate}`,
        `vehicle=${row.vehicle}`,
        `detail_weight=${row.detailWeight.toFixed(3)}`,
        `detail_main=${row.detailMainWeight.toFixed(3)}`,
        `detail_inner=${row.detailInnerWeight.toFixed(3)}`,
        `summary_weight=${row.summaryWeight.toFixed(3)}`,
        `diff=${row.diff.toFixed(3)}`,
        `detail_rows=${row.detailRows}`,
        `summary_rows=${row.summaryRows}`,
        row.status,
      ].filter(Boolean).join(' | ')
    );
  });

  console.log('='.repeat(180));
  console.log(`row_count           : ${rows.length}`);
  console.log(`diff_row_count      : ${diffCount}`);
  console.log(`detail_total        : ${utils.toFixedNumber(detailTotal, 3).toFixed(3)}`);
  console.log(`detail_main_total   : ${utils.toFixedNumber(detailMainTotal, 3).toFixed(3)}`);
  console.log(`detail_inner_total  : ${utils.toFixedNumber(detailInnerTotal, 3).toFixed(3)}`);
  console.log(`summary_total       : ${utils.toFixedNumber(summaryTotal, 3).toFixed(3)}`);
  console.log(`total_diff          : ${utils.toFixedNumber(detailTotal - summaryTotal, 3).toFixed(3)}`);
  console.log('='.repeat(180));

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
