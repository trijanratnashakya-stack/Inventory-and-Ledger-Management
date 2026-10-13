const test = require('node:test');
const assert = require('node:assert');
const { buildStatement, describeBalance, signedOpening, calculateBalance } = require('../src/utils/ledger');

test('opening balance sign and description', () => {
  assert.strictEqual(signedOpening({ openingBalance: 500, openingSide: 'dr' }), 500);
  assert.strictEqual(signedOpening({ openingBalance: 500, openingSide: 'cr' }), -500);
  assert.deepStrictEqual(describeBalance(-250.5), { amount: 250.5, side: 'Cr' });
  assert.deepStrictEqual(describeBalance(0), { amount: 0, side: '' });
});

test('statement keeps a running balance and skips voided entries', () => {
  const party = { openingBalance: 1000, openingSide: 'dr' };
  const s = buildStatement(party, [
    { debit: 500, credit: 0 },
    { debit: 0, credit: 200 },
    { debit: 999, credit: 0, voided: true },
    { debit: 0, credit: 1500 },
  ]);
  assert.deepStrictEqual(s.rows[0].balance, { amount: 1500, side: 'Dr' });
  assert.deepStrictEqual(s.rows[1].balance, { amount: 1300, side: 'Dr' });
  assert.strictEqual(s.rows[2].balance, null);
  assert.deepStrictEqual(s.closing, { amount: 200, side: 'Cr' });
  assert.strictEqual(s.totalDebit, 500);
  assert.strictEqual(s.totalCredit, 1700);
});

test('ledger entry needs exactly one of debit or credit', async () => {
  const mongoose = require('mongoose');
  const LedgerEntry = require('../src/models/LedgerEntry');
  const id = new mongoose.Types.ObjectId();
  const base = { party: id, date: '2026-09-02', particulars: 'Goods', createdBy: id };
  assert.ok((await new LedgerEntry({ ...base, debit: 5, credit: 5 }).validate().catch((e) => e)).errors.debit);
  assert.ok((await new LedgerEntry({ ...base }).validate().catch((e) => e)).errors.debit);
  assert.ok((await new LedgerEntry({ ...base, debit: 1.234 }).validate().catch((e) => e)).errors.debit);
  assert.strictEqual(await new LedgerEntry({ ...base, debit: 5 }).validate(), undefined);
});

test('accounts and import endpoints require sign-in', async () => {
  const app = require('../src/app');
  const server = app.listen(0);
  try {
    const { port } = server.address();
    for (const [method, path] of [['GET', '/api/parties'], ['POST', '/api/products/import'], ['PATCH', '/api/orders/abc/receive']]) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, { method });
      assert.strictEqual(res.status, 401, path);
    }
  } finally {
    server.close();
  }
});

test('due status: payments clear the oldest invoice first, then credit days decide overdue', () => {
  const { dueInfo } = require('../src/utils/ledger');
  const customer = { type: 'customer', openingBalance: 0, creditDays: 30 };
  const entries = [
    { date: '2026-08-01', debit: 1000, credit: 0 },
    { date: '2026-09-20', debit: 500, credit: 0 },
    { date: '2026-09-25', debit: 0, credit: 1000 },
  ];
  // The Aug invoice is paid. The 500 from 20 Sep is due 20 Oct.
  const notYet = dueInfo(customer, entries, '2026-10-06');
  assert.strictEqual(notYet.status, 'due');
  assert.strictEqual(notYet.outstanding, 500);
  assert.strictEqual(notYet.dueDate, '2026-10-20');
  assert.strictEqual(notYet.days, 14);
  const late = dueInfo(customer, entries, '2026-10-25');
  assert.strictEqual(late.status, 'overdue');
  assert.strictEqual(late.days, 5);
  // Paid in full is clear. Voided entries are ignored.
  assert.strictEqual(dueInfo(customer, [...entries, { date: '2026-10-01', debit: 0, credit: 500 }], '2026-12-01').status, 'clear');
  assert.strictEqual(dueInfo(customer, [{ date: '2026-01-01', debit: 99, credit: 0, voided: true }], '2026-12-01').status, 'clear');
});

test('due status for a vendor looks at what we owe (Cr), and an opening balance counts', () => {
  const { dueInfo } = require('../src/utils/ledger');
  const vendor = { type: 'vendor', openingBalance: 400, openingSide: 'cr', creditDays: 10 };
  const r = dueInfo(vendor, [{ date: '2026-09-01', debit: 100, credit: 0 }], '2026-09-30', '2026-08-01');
  assert.strictEqual(r.status, 'overdue');
  assert.strictEqual(r.outstanding, 300);
  assert.strictEqual(r.oldestUnpaid, '2026-08-01');
});

test('Ranjit figures give closing balance 176612 via calculateBalance and buildStatement', () => {
  const party = { type: 'customer', openingBalance: 220335, openingSide: 'dr' };
  const entries = [
    { date: '2026-09-01', particulars: 'Opening Balance', openingBalanceAmount: 220335, debit: 0, credit: 0 },
    { date: '2026-09-02', particulars: 'Goods', debit: 191277, credit: 0 },
    { date: '2026-09-03', particulars: 'Cash', debit: 0, credit: 235000 },
  ];
  const calc = calculateBalance(party, entries);
  assert.deepStrictEqual(calc.closing, { amount: 176612, side: 'Dr' });
  const stmt = buildStatement(party, entries);
  assert.deepStrictEqual(stmt.closing, { amount: 176612, side: 'Dr' });
});

test('vendor account balance calculation', () => {
  const vendor = { type: 'vendor', openingBalance: 1000, openingSide: 'cr' };
  const entries = [
    { date: '2026-09-01', particulars: 'Goods', debit: 0, credit: 500 },
    { date: '2026-09-02', particulars: 'Cash', debit: 200, credit: 0 },
  ];
  const calc = calculateBalance(vendor, entries);
  assert.deepStrictEqual(calc.closing, { amount: 1300, side: 'Cr' });
});

test('account with no entries (balance = opening only)', () => {
  const party = { type: 'customer', openingBalance: 500, openingSide: 'dr' };
  const calc = calculateBalance(party, []);
  assert.deepStrictEqual(calc.closing, { amount: 500, side: 'Dr' });
});

test('account with no opening balance', () => {
  const party = { type: 'customer', openingBalance: 0, openingSide: 'dr' };
  const entries = [
    { date: '2026-09-01', particulars: 'Goods', debit: 300, credit: 0 },
    { date: '2026-09-02', particulars: 'Cash', debit: 0, credit: 100 },
  ];
  const calc = calculateBalance(party, entries);
  assert.deepStrictEqual(calc.closing, { amount: 200, side: 'Dr' });
});

test('account with a voided entry excludes voided entry', () => {
  const party = { type: 'customer', openingBalance: 1000, openingSide: 'dr' };
  const entries = [
    { date: '2026-09-01', particulars: 'Goods', debit: 500, credit: 0 },
    { date: '2026-09-02', particulars: 'Goods', debit: 200, credit: 0, voided: true },
  ];
  const calc = calculateBalance(party, entries);
  assert.deepStrictEqual(calc.closing, { amount: 1500, side: 'Dr' });
});
