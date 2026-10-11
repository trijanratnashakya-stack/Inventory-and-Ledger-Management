const express = require('express');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const PriceHistory = require('../models/PriceHistory');
const { requireAuth } = require('../middleware/auth');
const { stockStatus, statusFilter } = require('../utils/status');
const Setting = require('../models/Setting');
const { suggestedStacks, openOrderQuantities } = require('../utils/orders');

const router = express.Router();
router.use(requireAuth);

// GET /api/dashboard?category=gem|non_gem
router.get('/', async (req, res) => {
  const category = req.query.category === 'non_gem' ? 'non_gem' : 'gem';
  const base = { active: true, category };

  const [total, inStock, low, out, alerts] = await Promise.all([
    Product.countDocuments(base),
    Product.countDocuments({ ...base, ...statusFilter('in') }),
    Product.countDocuments({ ...base, ...statusFilter('low') }),
    Product.countDocuments({ ...base, ...statusFilter('out') }),
    Product.find({ ...base, $expr: { $lte: ['$quantity', '$lowStockThreshold'] } })
      .sort({ quantity: 1, name: 1 })
      .limit(20)
      .populate('company', 'name'),
  ]);

  // Units already on open orders, so the alerts can say "already ordered".
  const onOrder = await openOrderQuantities(alerts.map((p) => p._id));
  const { reorderMultiplier } = await Setting.get();

  // Recent activity: latest stock movements and price changes, merged.
  const productMatch = { match: { category, active: true }, select: 'name productId category' };
  const [movements, prices] = await Promise.all([
    StockMovement.find().sort({ createdAt: -1 }).limit(40).populate({ path: 'product', ...productMatch }),
    PriceHistory.find().sort({ createdAt: -1 }).limit(40).populate({ path: 'product', ...productMatch }),
  ]);
  const activity = [
    ...movements.filter((m) => m.product).map((m) => ({
      id: m._id, kind: 'quantity', product: m.product.name, productId: m.product.productId,
      detail: `${m.delta > 0 ? '+' : ''}${m.delta} (now ${m.quantityAfter})`, at: m.createdAt,
    })),
    ...prices.filter((p) => p.product).map((p) => ({
      id: p._id, kind: 'price', product: p.product.name, productId: p.product.productId,
      detail: `Retail ${p.oldRetail} to ${p.newRetail}`, at: p.createdAt,
    })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 10);

  res.json({
    category,
    counts: { total, inStock, lowStock: low, outOfStock: out },
    alerts: alerts.map((p) => ({
      id: p._id,
      productId: p.productId || null,
      name: p.name,
      company: p.category === 'gem' ? 'Gems' : p.company && p.company.name,
      quantity: p.quantity,
      status: stockStatus(p.quantity, p.lowStockThreshold),
      sackSize: p.sackSize || p.stackSize || 1,
      suggestedQuantity: suggestedStacks(p.quantity, p.lowStockThreshold, p.sackSize || p.stackSize, reorderMultiplier),
      onOrder: onOrder.get(String(p._id)) || 0,
    })),
    activity,
  });
});

module.exports = router;
