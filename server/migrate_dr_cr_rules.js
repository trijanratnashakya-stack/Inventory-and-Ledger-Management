const mongoose = require('mongoose');
const LedgerEntry = require('./src/models/LedgerEntry');
const Party = require('./src/models/Party');

async function migrate() {
  await mongoose.connect('mongodb://localhost:27017/inventory');

  // 1. Recalculate side for Goods and Cash entries
  const entries = await LedgerEntry.find({ particulars: { $in: ['Goods', 'Cash'] } }).populate('party');

  let updatedCount = 0;
  for (const entry of entries) {
    if (!entry.party) continue;
    const isCustomer = entry.party.type === 'customer';
    const amount = entry.debit || entry.credit || 0;

    let expectedSide = 'dr';
    if (entry.particulars === 'Goods') {
      expectedSide = isCustomer ? 'dr' : 'cr';
    } else if (entry.particulars === 'Cash') {
      expectedSide = isCustomer ? 'cr' : 'dr';
    }

    const newDebit = expectedSide === 'dr' ? amount : 0;
    const newCredit = expectedSide === 'cr' ? amount : 0;

    if (entry.debit !== newDebit || entry.credit !== newCredit) {
      entry.debit = newDebit;
      entry.credit = newCredit;
      await entry.save();
      updatedCount++;
    }
  }

  console.log(`Recalculated Dr/Cr sides for ${updatedCount} entries.`);

  // 2. Fix Opening Balance entries
  const openingEntries = await LedgerEntry.find({ particulars: 'Opening Balance' });
  for (const entry of openingEntries) {
    if (entry.openingBalanceAmount === 0 && (entry.debit > 0 || entry.credit > 0)) {
      entry.openingBalanceAmount = entry.debit || entry.credit;
      entry.debit = 0;
      entry.credit = 0;
      await entry.save();
    }
  }
  console.log(`Verified ${openingEntries.length} opening balance entries.`);

  process.exit();
}

migrate();
