const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

test('Sale validation: requires items, customer name, grand total, and positive quantities', async () => {
  const Sale = require('../src/models/Sale');
  const id = new mongoose.Types.ObjectId();

  const empty = new Sale({
    invoiceNumber: 'INV-0001',
    date: '2026-10-06',
    customerName: 'Test Customer',
    createdBy: id,
    items: [],
    subtotal: 0,
    grandTotal: 0,
  });
  assert.ok((await empty.validate().catch((e) => e)).errors.items);

  const fractional = new Sale({
    invoiceNumber: 'INV-0001',
    date: '2026-10-06',
    customerName: 'Test Customer',
    createdBy: id,
    items: [{ product: id, name: 'Plate', quantity: 1.5, unitPrice: 100, total: 150 }],
    subtotal: 150,
    grandTotal: 150,
  });
  assert.ok((await fractional.validate().catch((e) => e)).errors['items.0.quantity']);

  const zero = new Sale({
    invoiceNumber: 'INV-0001',
    date: '2026-10-06',
    customerName: 'Test Customer',
    createdBy: id,
    items: [{ product: id, name: 'Plate', quantity: 0, unitPrice: 100, total: 0 }],
    subtotal: 0,
    grandTotal: 0,
  });
  assert.ok((await zero.validate().catch((e) => e)).errors['items.0.quantity']);

  const valid = new Sale({
    invoiceNumber: 'INV-0001',
    date: '2026-10-06',
    customerName: 'Test Customer',
    createdBy: id,
    items: [{ product: id, name: 'Plate', quantity: 2, unitPrice: 100, total: 200 }],
    subtotal: 200,
    discountPercent: 5,
    discountAmount: 10,
    grandTotal: 190,
    paymentType: 'cash',
    paidAmount: 190,
  });
  assert.strictEqual(await valid.validate(), undefined);
  assert.strictEqual(valid.status, 'completed');
  assert.strictEqual(valid.paymentType, 'cash');
});

test('sales endpoints are mounted and require sign-in', async () => {
  const app = require('../src/app');
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/sales`);
    assert.strictEqual(res.status, 401);

    const post = await fetch(`http://127.0.0.1:${port}/api/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.strictEqual(post.status, 401);
  } finally {
    server.close();
  }
});
