const test = require('node:test');
const assert = require('node:assert');
const { stockStatus, statusFilter } = require('../src/utils/status');

test('stockStatus buckets', () => {
  assert.strictEqual(stockStatus(0, 12), 'out');
  assert.strictEqual(stockStatus(1, 12), 'low');
  assert.strictEqual(stockStatus(12, 12), 'low');
  assert.strictEqual(stockStatus(13, 12), 'in');
});

test('statusFilter shapes', () => {
  assert.deepStrictEqual(statusFilter('out'), { quantity: { $lte: 0 } });
  assert.ok(statusFilter('low').$expr);
  assert.deepStrictEqual(statusFilter('all'), {});
});

test('app and routes load and mount', () => {
  const app = require('../src/app');
  assert.strictEqual(typeof app, 'function');
});

test('product rules are enforced by validation', async () => {
  const Product = require('../src/models/Product');
  const gemNoId = new Product({ category: 'gem', name: 'Plate' });
  assert.ok((await gemNoId.validate().catch((e) => e)).errors.productId);
  const nonGemNoCompany = new Product({ category: 'non_gem', name: 'Peeler' });
  assert.ok((await nonGemNoCompany.validate().catch((e) => e)).errors.company);
  const ok = new Product({ category: 'non_gem', name: 'Peeler', company: '64b7f0c2a1b2c3d4e5f60718' });
  assert.strictEqual(await ok.validate(), undefined);
});
