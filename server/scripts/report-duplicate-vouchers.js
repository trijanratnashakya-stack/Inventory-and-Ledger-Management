require('dotenv').config();
const mongoose = require('mongoose');
const LedgerEntry = require('../src/models/LedgerEntry');
const Party = require('../src/models/Party');

async function runReport() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/inventory';
  await mongoose.connect(uri);

  const entries = await LedgerEntry.find({ voided: false, refKey: { $exists: true, $ne: '' } })
    .populate('party', 'name type')
    .lean();

  const byRefKey = new Map();
  for (const e of entries) {
    if (!e.refKey || !e.party) continue;
    if (!byRefKey.has(e.refKey)) {
      byRefKey.set(e.refKey, []);
    }
    byRefKey.get(e.refKey).push(e);
  }

  console.log('=== DUPLICATE VOUCHER / REF REPORT ===\n');
  let duplicateCount = 0;

  for (const [refKey, list] of byRefKey.entries()) {
    const parties = new Set(list.map(e => String(e.party._id)));
    if (parties.size > 1) {
      duplicateCount++;
      const sampleRef = list[0].ref;
      console.log(`Voucher / Ref: "${sampleRef}" (key: ${refKey}) is used across ${parties.size} different accounts:`);
      for (const e of list) {
        const amt = e.particulars === 'Opening Balance' ? e.openingBalanceAmount : (e.debit || e.credit || 0);
        console.log(`  - Account: ${e.party.name} (${e.party.type}), Date: ${e.date}, Particulars: ${e.particulars}, Amount: Rs. ${amt}`);
      }
      console.log('');
    }
  }

  if (duplicateCount === 0) {
    console.log('No voucher numbers duplicated across different accounts found.');
  } else {
    console.log(`Found ${duplicateCount} voucher number(s) duplicated across different accounts.`);
  }

  await mongoose.disconnect();
}

runReport().catch(err => {
  console.error(err);
  process.exit(1);
});
