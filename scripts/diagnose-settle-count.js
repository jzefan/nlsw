/**
 * Diagnose: Why settle page shows fewer records than expected
 *
 * Counts invoices by state and settlement flags for a given date range.
 *
 * Usage:
 *   node scripts/diagnose-settle-count.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB ||
  `mongodb://${process.env.MONGO_HOST || 'localhost'}:${process.env.MONGO_PORT || '27027'}/${process.env.MONGO_DATABASE || 'nldb_saas'}`;

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB\n');

  const db = mongoose.connection.db;
  const invoices = db.collection('invoices');
  const bills = db.collection('bills');

  // Date range: Feb 2 to Mar 1
  const startDate = new Date('2026-02-02T00:00:00');
  const endDate = new Date('2026-03-01T23:59:59');

  console.log(`Date range: ${startDate.toISOString()} ~ ${endDate.toISOString()}`);
  console.log('='.repeat(60));

  // 1. Count total invoices in date range
  const totalInvs = await invoices.countDocuments({
    ship_date: { $gte: startDate, $lte: endDate }
  });
  console.log(`\n1. Total invoices in date range: ${totalInvs}`);

  // 2. Count invoices by state
  const stateAgg = await invoices.aggregate([
    { $match: { ship_date: { $gte: startDate, $lte: endDate } } },
    { $group: { _id: '$state', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  console.log('\n2. Invoices by state:');
  stateAgg.forEach(s => console.log(`   ${s._id || '(null)'}: ${s.count}`));

  // 3. Count invoices with state != '新建' (what old settle page queries)
  const nonNewInvs = await invoices.countDocuments({
    state: { $ne: '新建' },
    ship_date: { $gte: startDate, $lte: endDate }
  });
  console.log(`\n3. Invoices with state != '新建' (old settle backend query): ${nonNewInvs}`);

  // 4. Count invoices by settle_flag
  const flagAgg = await invoices.aggregate([
    { $match: { ship_date: { $gte: startDate, $lte: endDate }, state: { $ne: '新建' } } },
    { $group: { _id: '$settle_flag', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]).toArray();
  console.log('\n4. Invoice settle_flag distribution (state != 新建):');
  flagAgg.forEach(f => {
    const flag = f._id === null ? 'null' : f._id;
    const bits = typeof f._id === 'number' ? ` (binary: ${f._id.toString(2).padStart(4, '0')})` : '';
    console.log(`   settle_flag=${flag}${bits}: ${f.count}`);
  });

  // 5. Count bills with inv_settle_flag (from Bill.invoices subdocument)
  const billFlagAgg = await bills.aggregate([
    { $unwind: '$invoices' },
    { $group: { _id: '$invoices.inv_settle_flag', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]).toArray();
  console.log('\n5. Bill inv_settle_flag distribution (all bills):');
  billFlagAgg.forEach(f => {
    const flag = f._id === null ? 'null/undefined' : f._id;
    const bits = typeof f._id === 'number' ? ` (binary: ${f._id.toString(2).padStart(4, '0')})` : '';
    console.log(`   inv_settle_flag=${flag}${bits}: ${f.count}`);
  });

  // 6. Check ship_date type distribution (string vs Date)
  const dateTypeAgg = await invoices.aggregate([
    { $match: { ship_date: { $gte: startDate, $lte: endDate } } },
    { $project: { dateType: { $type: '$ship_date' } } },
    { $group: { _id: '$dateType', count: { $sum: 1 } } }
  ]).toArray();
  console.log('\n6. ship_date field type distribution:');
  dateTypeAgg.forEach(t => console.log(`   ${t._id}: ${t.count}`));

  // 7. Simulate old settle page: count bills per invoice that are NOT customer-settled
  const simulateOldPageAgg = await invoices.aggregate([
    {
      $match: {
        state: { $ne: '新建' },
        selfOwned: { $ne: 1 },
        ship_date: { $gte: startDate, $lte: endDate }
      }
    },
    { $unwind: '$bills' },
    {
      $lookup: {
        from: 'bills',
        localField: 'bills.bill_id',
        foreignField: '_id',
        as: 'billDoc'
      }
    },
    { $unwind: '$billDoc' },
    { $unwind: '$billDoc.invoices' },
    {
      $match: {
        $expr: { $eq: ['$billDoc.invoices.inv_no', '$waybill_no'] }
      }
    },
    {
      $group: {
        _id: null,
        totalBillInvPairs: { $sum: 1 },
        customerUnsettled: {
          $sum: {
            $cond: [
              { $ne: [{ $mod: [{ $ifNull: ['$billDoc.invoices.inv_settle_flag', 0] }, 2] }, 1] },
              1, 0
            ]
          }
        },
        collectionUnsettled: {
          $sum: {
            $cond: [
              { $ne: [{ $mod: [{ $floor: { $divide: [{ $ifNull: ['$billDoc.invoices.inv_settle_flag', 0] }, 2] } }, 2] }, 1] },
              1, 0
            ]
          }
        }
      }
    }
  ]).toArray();

  console.log('\n7. Simulated old settle page (CUSTOMER mode):');
  if (simulateOldPageAgg.length > 0) {
    const r = simulateOldPageAgg[0];
    console.log(`   Total bill-invoice pairs: ${r.totalBillInvPairs}`);
    console.log(`   Customer unsettled (inv_settle_flag & 1 != 1): ${r.customerUnsettled}`);
    console.log(`   Collection unsettled (inv_settle_flag & 2 != 2): ${r.collectionUnsettled}`);
  } else {
    console.log('   No data found');
  }

  // 8. Also check string date comparison (what happens without Mongoose casting)
  const stringDateCount = await invoices.countDocuments({
    state: { $ne: '新建' },
    ship_date: { $gte: '2026-02-02 00:00:00', $lte: '2026-03-01 23:59:59' }
  });
  console.log(`\n8. String date comparison (bypassing Mongoose): ${stringDateCount}`);
  console.log('   (If this differs from #3, Mongoose casting is significant)');

  console.log('\n' + '='.repeat(60));
  console.log('ANALYSIS:');
  console.log('- If #7 customerUnsettled ~= 20, the issue is that most records are already settled');
  console.log('- If #8 << #3, the issue is date type mismatch (string vs Date comparison)');
  console.log('- If #6 shows mixed types, some ship_date values are strings');
  console.log('='.repeat(60));

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
