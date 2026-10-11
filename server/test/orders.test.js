const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { suggestedQuantity } = require('../src/utils/orders');

test('suggestedQuantity tops stock up to twice the threshold, minimum 1', () => {
  assert.strictEqual(suggestedQuantity(0, 12), 24);
  assert.strictEqual(suggestedQuantity(3, 12), 21);
  assert.strictEqual(suggestedQuantity(12, 12), 12);
  assert.strictEqual(suggestedQuantity(30, 12), 1);
  assert.strictEqual(suggestedQuantity(0, 0), 1);
});

test('Order validation: needs items and whole-number quantities', async () => {
  const Order = require('../src/models/Order');
  const id = new mongoose.Types.ObjectId();

  const empty = new Order({ number: 'ORD-0001', createdBy: id, items: [] });
  assert.ok((await empty.validate().catch((e) => e)).errors.items);

  const fractional = new Order({ number: 'ORD-0001', createdBy: id, items: [{ product: id, name: 'Plate', quantity: 1.5 }] });
  assert.ok((await fractional.validate().catch((e) => e)).errors['items.0.quantity']);

  const zero = new Order({ number: 'ORD-0001', createdBy: id, items: [{ product: id, name: 'Plate', quantity: 0 }] });
  assert.ok((await zero.validate().catch((e) => e)).errors['items.0.quantity']);

  const ok = new Order({ number: 'ORD-0001', createdBy: id, items: [{ product: id, name: 'Plate', quantity: 3 }] });
  assert.strictEqual(await ok.validate(), undefined);
  assert.strictEqual(ok.status, 'open');
});

test('order endpoints are mounted and require sign-in', async () => {
  const app = require('../src/app');
  const server = app.listen(0);
  try {
    const { port } = server.address();
    for (const path of ['/api/orders', '/api/orders/suggestions']) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.strictEqual(res.status, 401, path);
    }
    const post = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.strictEqual(post.status, 401);
  } finally {
    server.close();
  }
});

test('suggestedStacks rounds up to whole stacks, minimum 1', () => {
  const { suggestedStacks } = require('../src/utils/orders');
  assert.strictEqual(suggestedStacks(0, 12, 1), 24);
  assert.strictEqual(suggestedStacks(0, 12, 10), 3); // 24 units -> 3 stacks of 10
  assert.strictEqual(suggestedStacks(3, 12, 12), 2); // 21 units -> 2 stacks of 12
  assert.strictEqual(suggestedStacks(50, 12, 12), 1);
});

test('order lines keep a stack size and totals count units', async () => {
  const mongoose = require('mongoose');
  const Order = require('../src/models/Order');
  const id = new mongoose.Types.ObjectId();
  const o = new Order({ number: 'ORD-0002', createdBy: id, items: [{ product: id, name: 'Plate', quantity: 3, stackSize: 12 }] });
  assert.strictEqual(await o.validate(), undefined);
  assert.strictEqual(o.items[0].stackSize, 12);
  const Product = require('../src/models/Product');
  const bad = new Product({ category: 'gem', productId: 'X1', name: 'Plate', stackSize: 0 });
  assert.ok((await bad.validate().catch((e) => e)).errors.stackSize);
});
