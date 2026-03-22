/**
 * Compare Invoice.total_weight with the normalized sum of Invoice.bills[].weight
 * for all invoices in a given ship_date range.
 *
 * Normalization rule:
 * - use Invoice.bills[].weight when weight > 0
 * - otherwise fallback to Invoice.bills[].num * Bill.weight
 *
 * Usage:
 *   node scripts/check-invoice-total-vs-bills-weight.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const secrets = require('../config/secrets');

const MONGO_URI = process.env.MONGODB || secrets.db;
const START_DATE = new Date('2026-01-26T00:00:00');
const END_DATE = new Date('2026-02-25T23:59:59');
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

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log(`Connected to MongoDB: ${MONGO_URI}`);
  console.log(`Date range: ${formatDate(START_DATE)} ~ ${formatDate(END_DATE)}`);
  console.log('='.repeat(120));

  const invoices = mongoose.connection.db.collection('invoices');
  const bills = mongoose.connection.db.collection('bills');
  const invoiceList = await invoices.aggregate([
    {
      $addFields: {
        normalized_ship_date: {
          $switch: {
            branches: [
              {
                case: { $eq: [{ $type: '$ship_date' }, 'date'] },
                then: '$ship_date'
              },
              {
                case: { $eq: [{ $type: '$ship_date' }, 'string'] },
                then: {
                  $dateFromString: {
                    dateString: '$ship_date',
                    onError: null,
                    onNull: null
                  }
                }
              }
            ],
            default: null
          }
        }
      }
    },
    {
      $match: {
        normalized_ship_date: { $gte: START_DATE, $lte: END_DATE }
      }
    },
    {
      $project: {
        tenantId: 1,
        waybill_no: 1,
        ship_date: 1,
        normalized_ship_date: 1,
        total_weight: 1,
        bills: 1
      }
    },
    {
      $sort: {
        normalized_ship_date: 1,
        waybill_no: 1
      }
    }
  ]).toArray();

  const billIdSet = new Set();
  for (const inv of invoiceList) {
    if (!Array.isArray(inv.bills)) continue;
    for (const item of inv.bills) {
      if (item && item.bill_id) {
        billIdSet.add(String(item.bill_id));
      }
    }
  }

  const billDocs = await bills.find(
    { _id: { $in: Array.from(billIdSet).map(id => new mongoose.Types.ObjectId(id)) } },
    { projection: { weight: 1 } }
  ).toArray();
  const billWeightMap = new Map(
    billDocs.map(bill => [String(bill._id), toNumber(bill.weight)])
  );

  let invoiceCount = 0;
  let equalCount = 0;
  let diffCount = 0;
  let grandTotalWeight = 0;
  let grandBillsWeight = 0;
  let fallbackBillCount = 0;
  let missingBillCount = 0;
  let missingUnitWeightCount = 0;

  for (const inv of invoiceList) {
    invoiceCount += 1;

    const totalWeight = toNumber(inv.total_weight);
    const billsWeight = Array.isArray(inv.bills)
      ? inv.bills.reduce((sum, bill) => {
        if (!bill) return sum;

        const directWeight = toNumber(bill.weight);
        if (directWeight > 0) {
          return sum + directWeight;
        }

        const billId = bill.bill_id ? String(bill.bill_id) : '';
        const unitWeight = billId ? toNumber(billWeightMap.get(billId)) : 0;
        const num = toNumber(bill.num);

        if (!billId || !billWeightMap.has(billId)) {
          missingBillCount += 1;
          return sum;
        }

        if (unitWeight <= 0) {
          missingUnitWeightCount += 1;
          return sum;
        }

        fallbackBillCount += 1;
        return sum + num * unitWeight;
      }, 0)
      : 0;
    const diff = Number((totalWeight - billsWeight).toFixed(3));
    const isEqual = Math.abs(diff) <= FLOAT_TOLERANCE;

    grandTotalWeight += totalWeight;
    grandBillsWeight += billsWeight;

    if (isEqual) {
      equalCount += 1;
    } else {
      diffCount += 1;
    }

    console.log(
      [
        String(invoiceCount).padStart(5, ' '),
        `tenant=${inv.tenantId || '(null)'}`,
        `waybill=${inv.waybill_no || '(null)'}`,
        `ship_date=${formatDate(inv.normalized_ship_date || inv.ship_date)}`,
        `total_weight=${totalWeight.toFixed(3)}`,
        `bills_weight_sum=${billsWeight.toFixed(3)}`,
        `diff=${diff.toFixed(3)}`,
        isEqual ? 'OK' : 'DIFF'
      ].join(' | ')
    );
  }

  console.log('='.repeat(120));
  console.log(`invoice_count      : ${invoiceCount}`);
  console.log(`equal_count        : ${equalCount}`);
  console.log(`diff_count         : ${diffCount}`);
  console.log(`sum(total_weight)  : ${grandTotalWeight.toFixed(3)}`);
  console.log(`sum(norm_bill_wt)  : ${grandBillsWeight.toFixed(3)}`);
  console.log(`grand_diff         : ${(grandTotalWeight - grandBillsWeight).toFixed(3)}`);
  console.log(`fallback_bill_cnt  : ${fallbackBillCount}`);
  console.log(`missing_bill_cnt   : ${missingBillCount}`);
  console.log(`missing_unit_wt_cnt: ${missingUnitWeightCount}`);
  console.log('='.repeat(120));

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
