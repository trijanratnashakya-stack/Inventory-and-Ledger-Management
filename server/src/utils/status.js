// Stock status is derived, never stored.
//   out: quantity is 0
//   low: 0 < quantity <= lowStockThreshold
//   in:  quantity > lowStockThreshold
// "Low" is its own bucket, so in + low + out = total.
function stockStatus(quantity, lowStockThreshold) {
  if (quantity <= 0) return 'out';
  if (quantity <= lowStockThreshold) return 'low';
  return 'in';
}

// MongoDB filter equivalent of stockStatus, for list queries and dashboard counts.
function statusFilter(status) {
  switch (status) {
    case 'out':
      return { quantity: { $lte: 0 } };
    case 'low':
      return { quantity: { $gt: 0 }, $expr: { $lte: ['$quantity', '$lowStockThreshold'] } };
    case 'in':
      return { $expr: { $gt: ['$quantity', '$lowStockThreshold'] } };
    default:
      return {};
  }
}

module.exports = { stockStatus, statusFilter };
