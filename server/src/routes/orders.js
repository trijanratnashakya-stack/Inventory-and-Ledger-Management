const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Counter = require('../models/Counter');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const { requireAuth, requireRole } = require('../middleware/auth');
const { stockStatus } = require('../utils/status');
const Setting = require('../models/Setting');
const { suggestedQuantity, suggestedStacks, openOrderQuantities } = require('../utils/orders');

const router = express.Router();
// Every signed-in user can create and view orders.
router.use(requireAuth);

const isId = (v) => mongoose.Types.ObjectId.isValid(v);
const MAX_LINES = 200;
const MAX_QTY = 100000;

function serializeOrder(o, { withItems = true } = {}) {
  const obj = o.toObject ? o.toObject() : o;
  const out = {
    _id: obj._id,
    number: obj.number,
    status: obj.status,
    note: obj.note || '',
    createdAt: obj.createdAt,
    createdBy: obj.createdBy && obj.createdBy.username ? obj.createdBy.username : null,
    createdById: obj.createdBy && obj.createdBy._id ? obj.createdBy._id : obj.createdBy,
    receivedAt: obj.receivedAt || null,
    receivedBy: obj.receivedBy && obj.receivedBy.username ? obj.receivedBy.username : null,
    lineCount: obj.items.length,
    totalSacks: obj.items.reduce((sum, i) => sum + i.quantity, 0),
    totalUnits: obj.items.reduce((sum, i) => sum + i.quantity * (i.sackSize || 1), 0),
  };
  if (withItems) out.items = obj.items;
  return out;
}

// GET /api/orders/suggestions
// Lowest-quantity products first: the same list as the dashboard alerts,
// across both categories, with a suggested order quantity.
router.get('/suggestions', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
  const products = await Product.find({ active: true, $expr: { $lte: ['$quantity', '$lowStockThreshold'] } })
    .sort({ quantity: 1, name: 1 })
    .limit(limit)
    .populate('company', 'name');
  const onOrder = await openOrderQuantities(products.map((p) => p._id));
  const { reorderMultiplier } = await Setting.get();

  res.json({
    suggestions: products.map((p) => ({
      id: p._id,
      productId: p.productId || null,
      name: p.name,
      category: p.category,
      company: p.category === 'gem' ? 'Gems' : p.company ? p.company.name : null,
      quantity: p.quantity,
      lowStockThreshold: p.lowStockThreshold,
      status: stockStatus(p.quantity, p.lowStockThreshold),
      sackSize: p.sackSize || p.stackSize || 1,
      suggestedUnits: suggestedQuantity(p.quantity, p.lowStockThreshold, reorderMultiplier),
      suggestedQuantity: suggestedStacks(p.quantity, p.lowStockThreshold, p.sackSize || p.stackSize, reorderMultiplier),
      onOrder: onOrder.get(String(p._id)) || 0,
    })),
  });
});

// GET /api/orders?page=&limit=
router.get('/', async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
  const [orders, total] = await Promise.all([
    Order.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('createdBy', 'username'),
    Order.countDocuments(),
  ]);
  res.json({
    items: orders.map((o) => serializeOrder(o, { withItems: false })),
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
  });
});

// POST /api/orders   { note?, items: [{ product, quantity }] }
router.post('/', async (req, res) => {
  const { note, items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Add at least one product to the order' });
  }
  if (items.length > MAX_LINES) return res.status(400).json({ error: `An order can have at most ${MAX_LINES} lines` });

  // Validate each line and merge duplicates of the same product.
  const wanted = new Map();
  for (const line of items) {
    const qty = Number(line && line.quantity);
    if (!line || !isId(line.product)) return res.status(400).json({ error: 'Invalid product in order' });
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      return res.status(400).json({ error: `Quantities must be whole numbers from 1 to ${MAX_QTY}` });
    }
    const key = String(line.product);
    wanted.set(key, (wanted.get(key) || 0) + qty);
  }
  if (note !== undefined && (typeof note !== 'string' || note.length > 500)) {
    return res.status(400).json({ error: 'Note must be 500 characters or fewer' });
  }

  const ids = [...wanted.keys()];
  const products = await Product.find({ _id: { $in: ids }, active: true }).populate('company', 'name');
  if (products.length !== ids.length) {
    return res.status(400).json({ error: 'One or more products no longer exist. Refresh and try again.' });
  }
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const { orderPrefix } = await Setting.get();
  const counter = await Counter.findOneAndUpdate({ _id: 'order' }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  const order = await Order.create({
    number: `${orderPrefix}-${String(counter.seq).padStart(4, '0')}`,
    note,
    createdBy: req.user._id,
    items: ids.map((id) => {
      const p = byId.get(id);
      return {
        product: p._id,
        productId: p.productId || undefined,
        name: p.name,
        company: p.category === 'gem' ? 'Gems' : p.company ? p.company.name : undefined,
        category: p.category,
        quantity: wanted.get(id),
        sackSize: p.sackSize || p.stackSize || 1,
      };
    }),
  });
  await order.populate('createdBy', 'username');
  res.status(201).json({ order: serializeOrder(order) });
});

router.get('/:id', async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Order not found' });
  const order = await Order.findById(req.params.id).populate('createdBy', 'username').populate('receivedBy', 'username');
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({ order: serializeOrder(order) });
});

// PATCH /api/orders/:id/cancel  (the person who made it, or a manager/admin)
router.patch('/:id/cancel', async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Order not found' });
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const isOwner = String(order.createdBy) === String(req.user._id);
  const isManager = ['admin', 'manager'].includes(req.user.role);
  if (!isOwner && !isManager) return res.status(403).json({ error: 'Only the creator or a manager can cancel this order' });
  if (order.status !== 'open') return res.status(409).json({ error: 'Only open orders can be cancelled' });

  order.status = 'cancelled';
  await order.save();
  await order.populate('createdBy', 'username');
  res.json({ order: serializeOrder(order) });
});

// PATCH /api/orders/:id/receive  (manager/admin) - goods arrived: add every line to stock
router.patch('/:id/receive', requireRole('admin', 'manager'), async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Order not found' });
  // Claim the order first so two people clicking at once can't add the stock twice.
  const order = await Order.findOneAndUpdate(
    { _id: req.params.id, status: 'open' },
    { status: 'received', receivedAt: new Date(), receivedBy: req.user._id },
    { new: true }
  );
  if (!order) {
    const exists = await Order.exists({ _id: req.params.id });
    return res.status(exists ? 409 : 404).json({ error: exists ? 'Only open orders can be received' : 'Order not found' });
  }
  for (const line of order.items) {
    // Stock is counted in units; an order line is a number of sacks.
    const size = line.sackSize || line.stackSize || 1;
    const units = line.quantity * size;
    const product = await Product.findByIdAndUpdate(line.product, { $inc: { quantity: units } }, { new: true });
    if (!product) continue; // product was removed since the order was placed
    await StockMovement.create({
      product: product._id,
      type: 'in',
      delta: units,
      quantityAfter: product.quantity,
      note: `Received ${order.number}${size > 1 ? ` (${line.quantity} x ${size})` : ''}`,
      user: req.user._id,
    });
  }
  await order.populate(['createdBy', 'receivedBy'].map((path) => ({ path, select: 'username' })));
  res.json({ order: serializeOrder(order) });
});

// DELETE /api/orders/:id (admin/manager)
router.delete('/:id', requireRole('admin', 'manager'), async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Order not found' });
  const order = await Order.findByIdAndDelete(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.status(204).send();
});

module.exports = router;
