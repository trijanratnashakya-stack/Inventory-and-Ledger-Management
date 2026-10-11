const Order = require('../models/Order');

// Suggested order quantity: bring the item back up to `multiplier` times its
// low-stock level (2 by default, set in Settings), and always suggest at least 1.
//   threshold 12, quantity 3  -> 21
//   threshold 12, quantity 0  -> 24
function suggestedQuantity(quantity, lowStockThreshold, multiplier = 2) {
  return Math.max(lowStockThreshold * multiplier - quantity, 1);
}

// The same suggestion expressed in sacks, rounded up to whole sacks.
function suggestedStacks(quantity, lowStockThreshold, sackSize = 1, multiplier = 2) {
  return Math.max(Math.ceil(suggestedQuantity(quantity, lowStockThreshold, multiplier) / Math.max(sackSize || 1, 1)), 1);
}

// Units already requested on open (not cancelled) orders, keyed by product id.
// Lets the UI warn "already on order" so the same item isn't ordered twice.
async function openOrderQuantities(productIds) {
  if (!productIds.length) return new Map();
  const rows = await Order.aggregate([
    { $match: { status: 'open' } },
    { $unwind: '$items' },
    { $match: { 'items.product': { $in: productIds } } },
    { $group: { _id: '$items.product', quantity: { $sum: { $multiply: ['$items.quantity', { $ifNull: ['$items.sackSize', { $ifNull: ['$items.stackSize', 1] }] }] } } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.quantity]));
}

module.exports = { suggestedQuantity, suggestedStacks, openOrderQuantities };
