/**
 * Compare exported outsourced-ship Excel rows with current backend detail rows.
 *
 * Usage:
 *   node scripts/compare-xlsx-vs-current-outsourced-ship-detail.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const ExcelJS = require('../front_end/node_modules/exceljs');
const secrets = require('../config/secrets');
const Vehicle = require('../models/Vehicle');
const Invoice = require('../models/Invoice');
const Bill = require('../models/Bill');
const utils = require('../controllers/utils');

const MONGO_URI = process.env.MONGODB || secrets.db;
const XLSX_PATH = 'test/vessel_detail_2026-03-20-1.xlsx';
const START_DATE = new Date('2026-01-26T00:00:00');
const END_DATE = new Date('2026-02-25T23:59:59');
const TARGET_MONTH = '2026-02';

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatDate(value) {
  if (!value) return '';
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

function makeRowKey(row) {
  return [
    row.vname || '',
    row.name || '',
    row.ship_from || '',
    row.ship_to || '',
    toNumber(row.send_num).toFixed(3),
    toNumber(row.send_weight).toFixed(3),
    row.ship_date || '',
  ].join('|');
}

async function loadXlsxRows() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(XLSX_PATH);
  const sheet = workbook.worksheets[0];
  const rows = [];

  for (let i = 2; i <= sheet.actualRowCount; i++) {
    const row = sheet.getRow(i).values.slice(1);
    rows.push({
      vname: row[0] || '',
      name: row[1] || '',
      ship_from: row[2] || '',
      ship_to: row[3] || '',
      price: toNumber(row[4]),
      single_price: toNumber(row[5]),
      send_num: toNumber(row[6]),
      send_weight: toNumber(row[7]),
      ship_date: formatDate(row[8]),
    });
  }

  return rows;
}

async function loadCurrentBackendRows() {
  const shipVehicles = await Vehicle.find({ veh_category: '外挂', veh_type: '船' })
    .select('tenantId name')
    .lean()
    .exec();
  const shipVehNames = new Set(shipVehicles.map(v => `${String(v.tenantId || '')}::${v.name || ''}`));

  const invoices = await Invoice.find({
    state: { $ne: '新建' },
    ship_date: { $gte: START_DATE, $lte: END_DATE },
  }).lean().exec();

  const invMap = {};
  const billIds = [];
  invoices.forEach(inv => {
    invMap[`${String(inv.tenantId || '')}::${inv.waybill_no || ''}`] = inv;
    (inv.bills || []).forEach(b => {
      if (b && b.bill_id) billIds.push(b.bill_id);
    });
  });

  const bills = await Bill.find({ _id: { $in: billIds } })
    .select('tenantId block_num weight invoices')
    .lean()
    .exec();

  const rows = [];

  for (const bill of bills) {
    for (const invRecord of (bill.invoices || [])) {
      const inv = invMap[`${String(bill.tenantId || '')}::${invRecord.inv_no || ''}`];
      if (!inv) continue;
      if (utils.toFinancialMonth(inv.ship_date) !== TARGET_MONTH) continue;

      const vehKey = `${String(bill.tenantId || '')}::${invRecord.veh_ves_name || ''}`;
      if (!shipVehNames.has(vehKey)) continue;

      const weight = getBillRecordWeight(bill, invRecord);
      const customerName = inv.ship_customer ? `${inv.ship_name}/${inv.ship_customer}` : (inv.ship_name || '');

      rows.push({
        vname: invRecord.veh_ves_name || '',
        name: customerName,
        ship_from: inv.ship_from || '',
        ship_to: inv.ship_to || '',
        price: utils.toFixedNumber(toNumber(invRecord.veh_ves_price) * weight, 3),
        single_price: toNumber(invRecord.veh_ves_price),
        send_num: toNumber(invRecord.num),
        send_weight: utils.toFixedNumber(weight, 3),
        ship_date: formatDate(inv.ship_date),
      });
    }
  }

  return rows;
}

function summarizeByVehicle(rows) {
  const map = new Map();
  rows.forEach(row => {
    if (!map.has(row.vname)) {
      map.set(row.vname, { rows: 0, weight: 0 });
    }
    const item = map.get(row.vname);
    item.rows += 1;
    item.weight += toNumber(row.send_weight);
  });
  return Array.from(map.entries())
    .map(([vname, item]) => ({
      vname,
      rows: item.rows,
      weight: utils.toFixedNumber(item.weight, 3),
    }))
    .sort((a, b) => b.weight - a.weight || a.vname.localeCompare(b.vname));
}

async function main() {
  await mongoose.connect(MONGO_URI);

  const xlsxRows = await loadXlsxRows();
  const backendRows = await loadCurrentBackendRows();

  const xlsxKeyCount = new Map();
  xlsxRows.forEach(row => {
    const key = makeRowKey(row);
    xlsxKeyCount.set(key, (xlsxKeyCount.get(key) || 0) + 1);
  });

  const backendKeyCount = new Map();
  backendRows.forEach(row => {
    const key = makeRowKey(row);
    backendKeyCount.set(key, (backendKeyCount.get(key) || 0) + 1);
  });

  const fileOnlyRows = [];
  const backendOnlyRows = [];

  for (const row of xlsxRows) {
    const key = makeRowKey(row);
    const count = backendKeyCount.get(key) || 0;
    if (count > 0) {
      backendKeyCount.set(key, count - 1);
    } else {
      fileOnlyRows.push(row);
    }
  }

  for (const row of backendRows) {
    const key = makeRowKey(row);
    const count = xlsxKeyCount.get(key) || 0;
    if (count > 0) {
      xlsxKeyCount.set(key, count - 1);
    } else {
      backendOnlyRows.push(row);
    }
  }

  const fileByVehicle = summarizeByVehicle(xlsxRows);
  const backendByVehicle = summarizeByVehicle(backendRows);
  const vehicleSet = new Set([
    ...fileByVehicle.map(v => v.vname),
    ...backendByVehicle.map(v => v.vname),
  ]);

  const fileMap = new Map(fileByVehicle.map(v => [v.vname, v]));
  const backendMap = new Map(backendByVehicle.map(v => [v.vname, v]));
  const vehicleDiffs = Array.from(vehicleSet)
    .map(vname => {
      const f = fileMap.get(vname) || { rows: 0, weight: 0 };
      const b = backendMap.get(vname) || { rows: 0, weight: 0 };
      return {
        vname,
        file_rows: f.rows,
        file_weight: utils.toFixedNumber(f.weight, 3),
        backend_rows: b.rows,
        backend_weight: utils.toFixedNumber(b.weight, 3),
        diff_weight: utils.toFixedNumber(f.weight - b.weight, 3),
      };
    })
    .sort((a, b) => Math.abs(b.diff_weight) - Math.abs(a.diff_weight) || a.vname.localeCompare(b.vname));

  const xlsxTotal = utils.toFixedNumber(xlsxRows.reduce((sum, row) => sum + toNumber(row.send_weight), 0), 3);
  const backendTotal = utils.toFixedNumber(backendRows.reduce((sum, row) => sum + toNumber(row.send_weight), 0), 3);

  console.log(`xlsx_rows=${xlsxRows.length}`);
  console.log(`backend_rows=${backendRows.length}`);
  console.log(`xlsx_total=${xlsxTotal.toFixed(3)}`);
  console.log(`backend_total=${backendTotal.toFixed(3)}`);
  console.log(`total_diff=${utils.toFixedNumber(xlsxTotal - backendTotal, 3).toFixed(3)}`);
  console.log(`file_only_row_count=${fileOnlyRows.length}`);
  console.log(`backend_only_row_count=${backendOnlyRows.length}`);
  console.log('='.repeat(160));
  console.log('vehicle_diffs=');
  vehicleDiffs.forEach(item => {
    console.log(JSON.stringify(item));
  });
  console.log('='.repeat(160));
  console.log('file_only_rows_top_60=');
  fileOnlyRows.slice(0, 60).forEach(row => console.log(JSON.stringify(row)));
  console.log('='.repeat(160));
  console.log('backend_only_rows_top_60=');
  backendOnlyRows.slice(0, 60).forEach(row => console.log(JSON.stringify(row)));

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
