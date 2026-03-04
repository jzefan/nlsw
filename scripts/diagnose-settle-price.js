/**
 * Diagnose: Check price distribution in bill-invoice pairs for settle page
 */
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB ||
  `mongodb://${process.env.MONGO_HOST || 'localhost'}:${process.env.MONGO_PORT || '27027'}/${process.env.MONGO_DATABASE || 'nldb_saas'}`;

async function main() {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const invoices = db.collection('invoices');
  const bills = db.collection('bills');

  const start = new Date('2026-02-02T00:00:00');
  const end = new Date('2026-03-01T23:59:59');

  // Get invoices in date range (same filter as old settle page)
  const invs = await invoices.find(
    { state: { $ne: '新建' }, selfOwned: { $ne: 1 }, ship_date: { $gte: start, $lte: end } },
    { projection: { waybill_no: 1, bills: 1 } }
  ).toArray();

  const invNos = new Set(invs.map(i => i.waybill_no));
  const billIds = [];
  invs.forEach(inv => {
    if (inv.bills) inv.bills.forEach(b => { if (b.bill_id) billIds.push(b.bill_id); });
  });

  console.log('Invoices in date range (state!=新建, selfOwned!=1):', invs.length);
  console.log('Bill IDs referenced:', billIds.length);

  // Get those bills
  const matchedBills = await bills.find({ _id: { $in: billIds } }).toArray();
  console.log('Bills found:', matchedBills.length);

  // Count invoice entries with various price states
  let totalPairs = 0;
  let priceGe0 = 0;
  let priceEqNeg1 = 0;
  let priceUndefined = 0;
  let unsettledAndPriced = 0;
  let collUnsettledAndPriced = 0;

  matchedBills.forEach(bill => {
    if (!bill.invoices) return;
    bill.invoices.forEach(binv => {
      if (!invNos.has(binv.inv_no)) return;
      totalPairs++;
      if (binv.price === undefined || binv.price === null) priceUndefined++;
      else if (binv.price === -1) priceEqNeg1++;
      else if (binv.price >= 0) priceGe0++;

      const custUnsettled = (((binv.inv_settle_flag || 0) & 1) !== 1);
      if (custUnsettled && binv.price >= 0) unsettledAndPriced++;

      const collUnsettled = (((binv.inv_settle_flag || 0) & 2) !== 2);
      if (collUnsettled && typeof binv.collection_price === 'number' && binv.collection_price >= 0) {
        collUnsettledAndPriced++;
      }
    });
  });

  console.log('\nBill-Invoice pairs in date range:', totalPairs);
  console.log('  price >= 0 (priced):', priceGe0);
  console.log('  price === -1 (unpriced):', priceEqNeg1);
  console.log('  price undefined/null:', priceUndefined);
  console.log('\n  CUSTOMER: unsettled AND priced (what shows on page):', unsettledAndPriced);
  console.log('  COLLECTION: unsettled AND priced:', collUnsettledAndPriced);

  // Also test Mongoose casting behavior
  console.log('\n--- Mongoose casting test ---');
  const Invoice = mongoose.model('Invoice', new mongoose.Schema({
    waybill_no: String,
    ship_date: Date,
    state: String,
    selfOwned: Number
  }, { collection: 'invoices' }));

  // Query with string dates (mimicking old code)
  const withStringDates = await Invoice.find({
    $and: [
      { state: { $ne: '新建' } },
      { selfOwned: { $ne: 1 } },
      { ship_date: { $gte: '2026-02-02 00:00:00', $lte: '2026-03-01 23:59:59' } }
    ]
  }).select('waybill_no').lean();

  console.log('Mongoose query with string dates:', withStringDates.length);

  // Query with Date objects
  const withDateObjects = await Invoice.find({
    $and: [
      { state: { $ne: '新建' } },
      { selfOwned: { $ne: 1 } },
      { ship_date: { $gte: start, $lte: end } }
    ]
  }).select('waybill_no').lean();

  console.log('Mongoose query with Date objects:', withDateObjects.length);

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
