const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Company = require('../models/Company');
const StockMovement = require('../models/StockMovement');
const PriceHistory = require('../models/PriceHistory');
const Order = require('../models/Order');
const Setting = require('../models/Setting');
const { requireAuth, requireRole } = require('../middleware/auth');
const { stockStatus, statusFilter } = require('../utils/status');

const router = express.Router();
router.use(requireAuth);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isId = (v) => mongoose.Types.ObjectId.isValid(v);
const toNumber = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

function serialize(p) {
  const o = p.toObject ? p.toObject() : p;
  return { ...o, status: stockStatus(o.quantity, o.lowStockThreshold) };
}

const SORTS = {
  name: { name: 1 },
  '-name': { name: -1 },
  quantity: { quantity: 1 },
  '-quantity': { quantity: -1 },
  productId: { productId: 1 },
  updated: { updatedAt: -1 },
};

// GET /api/products?q=&category=&company=&status=&sort=&page=&limit=
router.get('/', async (req, res) => {
  const { q, category, company, status, sort } = req.query;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);

  const filter = { active: true, ...statusFilter(status) };
  if (['gem', 'non_gem'].includes(category)) filter.category = category;
  if (company && isId(company)) filter.company = company;
  if (typeof q === 'string' && q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim()), 'i');
    filter.$and = [{ $or: [{ productId: rx }, { name: rx }] }];
  }

  const sortSpec = SORTS[sort] || { category: 1, name: 1 };
  const [items, total] = await Promise.all([
    Product.find(filter)
      .collation({ locale: 'en', strength: 2, numericOrdering: true })
      .sort(sortSpec)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('company', 'name isLocal'),
    Product.countDocuments(filter),
  ]);

  res.json({ items: items.map(serialize), total, page, pages: Math.ceil(total / limit) || 1 });
});

// POST /api/products/import  { rows: [...], dryRun?: true }
// Row: { category: gem|non_gem, productId, name, company, quantity, lowStockThreshold, wholesalePrice, retailPrice }
// All-or-nothing: if any row is invalid nothing is written and every problem is listed.
router.post('/import', requireRole('admin', 'manager'), async (req, res) => {
  const { rows, dryRun } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'The file has no rows' });
  if (rows.length > 1000) return res.status(400).json({ error: 'Import at most 1000 rows at a time' });

  const problems = [];
  const clean = [];
  const seenGem = new Set();
  const seenNon = new Set();
  const seenNonId = new Set();
  const collation = { locale: 'en', strength: 2 };

  const defaultLow = (await Setting.get()).defaultLowStock;
  const companies = await Company.find().collation(collation);
  const companyByName = new Map(companies.map((c) => [c.name.toLowerCase(), c]));

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i] || {};
    const line = i + 2; // row 1 of the file is the header
    const fail = (msg) => problems.push({ row: line, error: msg });
    const category = String(r.category || '').trim().toLowerCase().replace('-', '_').replace(' ', '_');
    const name = String(r.name || '').trim();
    const productId = String(r.productId || '').trim();
    const companyName = String(r.company || '').trim();
    if (!['gem', 'non_gem'].includes(category)) { fail('category must be gem or non_gem'); continue; }
    if (!name) { fail('name is required'); continue; }
    const nums = {};
    let bad = false;
    for (const [field, fallback] of [['quantity', 0], ['lowStockThreshold', defaultLow], ['stackSize', 1], ['wholesalePrice', 0], ['retailPrice', 0]]) {
      const raw = r[field] === undefined || r[field] === '' || r[field] === null ? fallback : Number(r[field]);
      const whole = field === 'quantity' || field === 'lowStockThreshold' || field === 'stackSize';
      if (!Number.isFinite(raw) || raw < (field === 'stackSize' ? 1 : 0) || (whole && !Number.isInteger(raw))) { fail(`${field} must be ${whole ? 'a whole number' : 'a number'}, ${field === 'stackSize' ? '1' : '0'} or more`); bad = true; break; }
      nums[field] = raw;
    }
    if (bad) continue;

    if (category === 'gem') {
      if (!productId) { fail('Gem items need a Product ID'); continue; }
      if (seenGem.has(productId.toLowerCase())) { fail(`Product ID ${productId} appears twice in the file`); continue; }
      seenGem.add(productId.toLowerCase());
    } else {
      if (!companyName) { fail('Non-Gem items need a company (use "Local / Unbranded" for unbranded)'); continue; }
      const key = `${companyName.toLowerCase()}|${name.toLowerCase()}`;
      if (seenNon.has(key)) { fail(`${name} appears twice under ${companyName} in the file`); continue; }
      seenNon.add(key);
      if (productId) {
        if (seenNonId.has(productId.toLowerCase())) { fail(`Product ID ${productId} appears twice in the file`); continue; }
        seenNonId.add(productId.toLowerCase());
      }
    }
    clean.push({ line, category, name, productId, companyName, ...nums });
  }

  // Clashes with products that already exist.
  if (!problems.length) {
    const ids = clean.filter((c) => c.productId).map((c) => c.productId);
    const existingIds = new Set(
      (await Product.find({ active: true, productId: { $in: ids } }).collation(collation).select('productId')).map((p) => p.productId.toLowerCase())
    );
    for (const c of clean) {
      if (c.productId && existingIds.has(c.productId.toLowerCase())) problems.push({ row: c.line, error: `Product ID ${c.productId} already exists` });
    }
    const nonGems = clean.filter((c) => c.category === 'non_gem' && companyByName.has(c.companyName.toLowerCase()));
    if (nonGems.length) {
      const existing = await Product.find({
        active: true,
        category: 'non_gem',
        company: { $in: [...new Set(nonGems.map((c) => companyByName.get(c.companyName.toLowerCase())._id))] },
      }).collation(collation).select('company name');
      const taken = new Set(existing.map((p) => `${String(p.company)}|${p.name.toLowerCase()}`));
      for (const c of nonGems) {
        if (taken.has(`${String(companyByName.get(c.companyName.toLowerCase())._id)}|${c.name.toLowerCase()}`)) {
          problems.push({ row: c.line, error: `${c.name} already exists under ${c.companyName}` });
        }
      }
    }
  }

  if (problems.length) return res.status(422).json({ error: `${problems.length} problem${problems.length === 1 ? '' : 's'} found. Nothing was imported.`, problems: problems.slice(0, 50) });
  if (dryRun) return res.json({ ok: true, count: clean.length, newCompanies: [...new Set(clean.filter((c) => c.category === 'non_gem' && !companyByName.has(c.companyName.toLowerCase())).map((c) => c.companyName))] });

  for (const c of clean) {
    if (c.category === 'non_gem' && !companyByName.has(c.companyName.toLowerCase())) {
      const company = await Company.create({ name: c.companyName, isLocal: /^local\b/i.test(c.companyName) });
      companyByName.set(c.companyName.toLowerCase(), company);
    }
  }
  const created = await Product.create(
    clean.map((c) => ({
      category: c.category,
      productId: c.productId || undefined,
      name: c.name,
      company: c.category === 'non_gem' ? companyByName.get(c.companyName.toLowerCase())._id : undefined,
      quantity: c.quantity,
      lowStockThreshold: c.lowStockThreshold,
      stackSize: c.stackSize,
      wholesalePrice: c.wholesalePrice,
      retailPrice: c.retailPrice,
    }))
  );
  await StockMovement.create(
    created.filter((p) => p.quantity > 0).map((p) => ({ product: p._id, type: 'initial', delta: p.quantity, quantityAfter: p.quantity, note: 'CSV import', user: req.user._id }))
  );
  res.status(201).json({ ok: true, count: created.length });
});

router.get('/:id', async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Product not found' });
  const product = await Product.findById(req.params.id).populate('company', 'name isLocal');
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const [movements, prices] = await Promise.all([
    StockMovement.find({ product: product._id }).sort({ createdAt: -1 }).limit(50).populate('user', 'username'),
    PriceHistory.find({ product: product._id }).sort({ createdAt: -1 }).limit(50).populate('user', 'username'),
  ]);
  res.json({ product: serialize(product), movements, priceHistory: prices });
});

function readProductBody(body) {
  const errors = [];
  const out = {};
  if (body.category !== undefined) {
    if (!['gem', 'non_gem'].includes(body.category)) errors.push('Category must be gem or non_gem');
    out.category = body.category;
  }
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) errors.push('Name is required');
    out.name = body.name;
  }
  if (body.productId !== undefined) out.productId = typeof body.productId === 'string' ? body.productId.trim() : body.productId;
  if (body.company !== undefined) out.company = body.company || null;
  if (body.imageUrl !== undefined) out.imageUrl = body.imageUrl;
  if (body.stackSize !== undefined) {
    const n = toNumber(body.stackSize === '' ? 1 : body.stackSize);
    if (!Number.isInteger(n) || n < 1) errors.push('Stack size must be a whole number, 1 or more');
    out.stackSize = n;
  }
  for (const field of ['quantity', 'lowStockThreshold', 'wholesalePrice', 'retailPrice']) {
    if (body[field] !== undefined) {
      const n = toNumber(body[field]);
      if (!Number.isFinite(n) || n < 0) errors.push(`${field} must be a number, 0 or more`);
      out[field] = n;
    }
  }
  return { errors, data: out };
}

router.post('/', requireRole('admin', 'manager'), async (req, res) => {
  const { errors, data } = readProductBody(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors[0], errors });
  if (data.company && !(isId(data.company) && (await Company.exists({ _id: data.company })))) {
    return res.status(400).json({ error: 'Selected company does not exist' });
  }
  if (data.lowStockThreshold === undefined && (req.body || {}).lowStockThreshold === undefined) {
    data.lowStockThreshold = (await Setting.get()).defaultLowStock;
  }
  const product = await Product.create(data);
  if (product.quantity > 0) {
    await StockMovement.create({
      product: product._id,
      type: 'initial',
      delta: product.quantity,
      quantityAfter: product.quantity,
      note: 'Initial stock',
      user: req.user._id,
    });
  }
  await product.populate('company', 'name isLocal');
  res.status(201).json({ product: serialize(product) });
});

// Edit descriptive fields only. Stock and prices have their own endpoints so
// every change lands in the audit trail.
router.put('/:id', requireRole('admin', 'manager'), async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Product not found' });
  const { errors, data } = readProductBody(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors[0], errors });
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  for (const key of ['name', 'productId', 'company', 'imageUrl', 'lowStockThreshold', 'stackSize']) {
    if (data[key] !== undefined) product[key] = data[key];
  }
  await product.save();
  await product.populate('company', 'name isLocal');
  res.json({ product: serialize(product) });
});

// POST /api/products/:id/stock   { delta: -3 } or { set: 40 }, optional note
router.post('/:id/stock', requireRole('admin', 'manager'), async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Product not found' });
  const { delta, set, note } = req.body || {};
  let updated;
  let appliedDelta;
  let type;

  if (set !== undefined) {
    const target = toNumber(set);
    if (!Number.isInteger(target) || target < 0) return res.status(400).json({ error: 'Quantity must be a whole number, 0 or more' });
    const before = await Product.findByIdAndUpdate(req.params.id, { quantity: target }, { new: false });
    if (!before) return res.status(404).json({ error: 'Product not found' });
    updated = { ...before.toObject(), quantity: target };
    appliedDelta = target - before.quantity;
    type = 'adjust';
  } else {
    const d = toNumber(delta);
    if (!Number.isInteger(d) || d === 0) return res.status(400).json({ error: 'Provide a non-zero whole number delta, or set an exact quantity' });
    // The $gte guard makes "can't go below zero" atomic, so two clerks can't oversell.
    const doc = await Product.findOneAndUpdate(
      d < 0 ? { _id: req.params.id, quantity: { $gte: -d } } : { _id: req.params.id },
      { $inc: { quantity: d } },
      { new: true }
    );
    if (!doc) {
      const exists = await Product.exists({ _id: req.params.id });
      return res.status(exists ? 409 : 404).json({ error: exists ? 'Not enough stock for that removal' : 'Product not found' });
    }
    updated = doc.toObject();
    appliedDelta = d;
    type = d > 0 ? 'in' : 'out';
  }

  if (appliedDelta !== 0) {
    await StockMovement.create({
      product: req.params.id,
      type,
      delta: appliedDelta,
      quantityAfter: updated.quantity,
      note,
      user: req.user._id,
    });
  }
  res.json({ quantity: updated.quantity, status: stockStatus(updated.quantity, updated.lowStockThreshold) });
});

// PUT /api/products/:id/price   { wholesalePrice, retailPrice }
router.put('/:id/price', requireRole('admin', 'manager'), async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Product not found' });
  const wholesale = toNumber(req.body.wholesalePrice);
  const retail = toNumber(req.body.retailPrice);
  if (!Number.isFinite(wholesale) || !Number.isFinite(retail) || wholesale < 0 || retail < 0) {
    return res.status(400).json({ error: 'Wholesale and retail prices must be numbers, 0 or more' });
  }
  const before = await Product.findByIdAndUpdate(
    req.params.id,
    { wholesalePrice: wholesale, retailPrice: retail },
    { new: false }
  );
  if (!before) return res.status(404).json({ error: 'Product not found' });
  if (before.wholesalePrice !== wholesale || before.retailPrice !== retail) {
    await PriceHistory.create({
      product: before._id,
      oldWholesale: before.wholesalePrice,
      newWholesale: wholesale,
      oldRetail: before.retailPrice,
      newRetail: retail,
      user: req.user._id,
    });
  }
  res.json({ wholesalePrice: wholesale, retailPrice: retail });
});

// Soft delete: the product disappears from every list and its ID and name can be reused,
// but stock and price history stay on record. Admin only. Blocked while an open order needs it.
router.delete('/:id', requireRole('admin'), async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Product not found' });
  const openOrder = await Order.findOne({ status: 'open', 'items.product': req.params.id }).select('number');
  if (openOrder) {
    return res.status(409).json({ error: `This product is on open order ${openOrder.number}. Receive or cancel that order first.` });
  }
  const product = await Product.findOneAndUpdate({ _id: req.params.id, active: true }, { active: false });
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json({ ok: true });
});

module.exports = router;
