const mongoose = require('mongoose');
const LedgerEntry = require('./server/src/models/LedgerEntry');

async function migrate() {
  await mongoose.connect('mongodb://localhost:27017/inventory'); // Update if needed
  const entries = await LedgerEntry.find({ particulars: 'Opening Balance', voided: false });

  for (const entry of entries) {
    const amount = entry.debit || entry.credit || 0;
    entry.openingBalanceAmount = amount;
    entry.debit = 0;
    entry.credit = 0;
    await entry.save();
  }
  console.log(`Migrated ${entries.length} opening balance entries.`);
  process.exit();
}

migrate();
