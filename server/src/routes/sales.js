const express = require('express');
const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const Counter = require('../models/Counter');
const Product = require('../models/Product');
const Party = require('../models/Party');
const LedgerEntry = require('../models/LedgerEntry');
const StockMovement = require('../models/StockMovement');
const Setting = require('../models/Setting');
const { requireAuth, requireRole } = require('../middleware/auth');
const { round2, nepalToday } = require('../utils/ledger');

const router = express.Router();
router.use(requireAuth);

const isId = (v) => mongoose.Types.ObjectId.isValid(v);
const MAX_LINES = 200;
const MAX_QTY = 100000;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function serializeSale(s, { withItems = true } = {}) {
  const obj = s.toObject ? s.toObject() : s;
  const out = {
    _id: obj._id,
    invoiceNumber: obj.invoiceNumber,
    date: obj.date,
    customer: obj.customer,
    customerName: obj.customerName,
    customerPhone: obj.customerPhone || '',
    customerAddress: obj.customerAddress || '',
    customerPan: obj.customerPan || '',
    subtotal: obj.subtotal,
    discountPercent: obj.discountPercent || 0,
    discountAmount: obj.discountAmount || 0,
    grandTotal: obj.grandTotal,
    paymentType: obj.paymentType,
    paidAmount: obj.paidAmount || 0,
    status: obj.status,
    note: obj.note || '',
    createdAt: obj.createdAt,
    createdBy: obj.createdBy && obj.createdBy.username ? obj.createdBy.username : null,
    createdById: obj.createdBy && obj.createdBy._id ? obj.createdBy._id : obj.createdBy,
    voidedAt: obj.voidedAt || null,
    voidedBy: obj.voidedBy && obj.voidedBy.username ? obj.voidedBy.username : null,
    lineCount: obj.items ? obj.items.length : 0,
    totalUnits: obj.items ? obj.items.reduce((sum, i) => sum + i.quantity, 0) : 0,
  };
  if (withItems) out.items = obj.items;
  return out;
}

// GET /api/sales?page=&limit=&q=&paymentType=&status=&from=&to=
router.get('/', async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);

  const filter = {};
  if (req.query.q && String(req.query.q).trim()) {
    const qRegex = new RegExp(escapeRegex(String(req.query.q).trim()), 'i');
    filter.$or = [{ invoiceNumber: qRegex }, { customerName: qRegex }];
  }
  if (['cash', 'credit', 'bank', 'partial'].includes(req.query.paymentType)) {
    filter.paymentType = req.query.paymentType;
  }
  if (['completed', 'voided'].includes(req.query.status)) {
    filter.status = req.query.status;
  }
  if (req.query.customer && isId(req.query.customer)) {
    filter.customer = req.query.customer;
  }
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = req.query.from;
    if (req.query.to) filter.date.$lte = req.query.to;
  }

  const today = nepalToday();

  const [sales, total, stats] = await Promise.all([
    Sale.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('createdBy', 'username'),
    Sale.countDocuments(filter),
    Sale.aggregate([
      {
        $facet: {
          overall: [
            { $match: { status: 'completed' } },
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: '$grandTotal' },
                completedCount: { $sum: 1 },
                cashRevenue: {
                  $sum: { $cond: [{ $in: ['$paymentType', ['cash', 'bank']] }, '$grandTotal', 0] },
                },
                creditRevenue: {
                  $sum: { $cond: [{ $eq: ['$paymentType', 'credit'] }, '$grandTotal', 0] },
                },
              },
            },
          ],
          today: [
            { $match: { status: 'completed', date: today } },
            {
              $group: {
                _id: null,
                todayRevenue: { $sum: '$grandTotal' },
                todayCount: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]),
  ]);

  const overall = (stats[0] && stats[0].overall[0]) || { totalRevenue: 0, completedCount: 0, cashRevenue: 0, creditRevenue: 0 };
  const todayStats = (stats[0] && stats[0].today[0]) || { todayRevenue: 0, todayCount: 0 };

  res.json({
    items: sales.map((s) => serializeSale(s, { withItems: false })),
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
    summary: {
      totalRevenue: round2(overall.totalRevenue || 0),
      completedCount: overall.completedCount || 0,
      cashRevenue: round2(overall.cashRevenue || 0),
      creditRevenue: round2(overall.creditRevenue || 0),
      todayRevenue: round2(todayStats.todayRevenue || 0),
      todayCount: todayStats.todayCount || 0,
    },
  });
});

// POST /api/sales
router.post('/', async (req, res) => {
  const { date, customerId, customerName, customerPhone, customerAddress, customerPan, items, discountPercent, paymentType, paidAmount, note } = req.body || {};

  const saleDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : nepalToday();

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Add at least one product to the sale' });
  }
  if (items.length > MAX_LINES) return res.status(400).json({ error: `A sale can have at most ${MAX_LINES} lines` });

  let party = null;
  if (customerId) {
    if (!isId(customerId)) return res.status(400).json({ error: 'Invalid customer selected' });
    party = await Party.findById(customerId);
    if (!party) return res.status(404).json({ error: 'Customer account not found' });
    if (!party.active) return res.status(409).json({ error: 'Selected customer account is inactive' });
  }

  const resolvedCustomerName = (party ? party.name : customerName || 'Walk-in Customer').trim();
  if (!resolvedCustomerName) return res.status(400).json({ error: 'Customer name is required' });

  // Validate items
  const lineDetails = [];
  const productQuantities = new Map();

  for (const line of items) {
    if (!line || !isId(line.product)) return res.status(400).json({ error: 'Invalid product in sale' });
    const qty = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);

    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      return res.status(400).json({ error: `Quantities must be whole numbers from 1 to ${MAX_QTY}` });
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return res.status(400).json({ error: 'Unit price must be 0 or greater' });
    }

    const priceType = ['retail', 'wholesale', 'custom'].includes(line.priceType) ? line.priceType : 'retail';
    const lineTotal = round2(qty * unitPrice);

    lineDetails.push({
      product: line.product,
      quantity: qty,
      priceType,
      unitPrice: round2(unitPrice),
      total: lineTotal,
    });

    const key = String(line.product);
    productQuantities.set(key, (productQuantities.get(key) || 0) + qty);
  }

  // Check product existence and stock availability
  const productIds = [...productQuantities.keys()];
  const products = await Product.find({ _id: { $in: productIds }, active: true }).populate('company', 'name');

  if (products.length !== productIds.length) {
    return res.status(400).json({ error: 'One or more products no longer exist. Refresh and try again.' });
  }

  const byId = new Map(products.map((p) => [String(p._id), p]));

  // Verify stock levels
  for (const [id, reqQty] of productQuantities.entries()) {
    const p = byId.get(id);
    if (p.quantity < reqQty) {
      return res.status(400).json({
        error: `Not enough stock for ${p.name}. In stock: ${p.quantity}, requested: ${reqQty}`,
      });
    }
  }

  // Calculate totals
  const subtotal = round2(lineDetails.reduce((sum, l) => sum + l.total, 0));
  const resolvedDiscountPercent = Number(discountPercent) >= 0 && Number(discountPercent) <= 100 ? Number(discountPercent) : party ? party.discountPercent || 0 : 0;
  const discountAmount = round2(subtotal * (resolvedDiscountPercent / 100));
  const grandTotal = round2(subtotal - discountAmount);

  const resolvedPaymentType = ['cash', 'credit', 'bank', 'partial'].includes(paymentType) ? paymentType : 'cash';
  let resolvedPaidAmount = 0;

  if (resolvedPaymentType === 'cash' || resolvedPaymentType === 'bank') {
    resolvedPaidAmount = grandTotal;
  } else if (resolvedPaymentType === 'partial') {
    resolvedPaidAmount = Math.min(Math.max(Number(paidAmount) || 0, 0), grandTotal);
  } else if (resolvedPaymentType === 'credit') {
    resolvedPaidAmount = 0;
    if (!party) {
      return res.status(400).json({ error: 'Sales on credit require a customer account. Please select or create a customer.' });
    }
  }

  const settings = await Setting.get();
  const prefix = settings.invoicePrefix || 'INV';
  const counter = await Counter.findOneAndUpdate({ _id: 'sale' }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  const invoiceNumber = `${prefix}-${String(counter.seq).padStart(4, '0')}`;

  // Deduct stock atomically and log movements
  const decremented = [];
  try {
    for (const line of lineDetails) {
      const p = byId.get(String(line.product));
      const updated = await Product.findOneAndUpdate(
        { _id: line.product, quantity: { $gte: line.quantity } },
        { $inc: { quantity: -line.quantity } },
        { new: true }
      );
      if (!updated) {
        throw new Error(`Stock for ${p.name} changed during checkout. Please try again.`);
      }
      decremented.push({ product: line.product, quantity: line.quantity });

      await StockMovement.create({
        product: updated._id,
        type: 'out',
        delta: -line.quantity,
        quantityAfter: updated.quantity,
        note: `Sale ${invoiceNumber}`,
        user: req.user._id,
      });

      // Complete line snapshot
      line.productId = p.productId || undefined;
      line.name = p.name;
      line.company = p.category === 'gem' ? 'Gems' : p.company ? p.company.name : undefined;
      line.category = p.category;
    }
  } catch (err) {
    // Rollback decremented stock
    for (const item of decremented) {
      await Product.findByIdAndUpdate(item.product, { $inc: { quantity: item.quantity } });
    }
    return res.status(400).json({ error: err.message });
  }

  // Handle Ledger entries if customer is linked
  let ledgerEntryId = null;
  let paymentLedgerEntryId = null;

  if (party) {
    // If credit or partial credit, post debit to customer ledger
    if (resolvedPaymentType === 'credit' || (resolvedPaymentType === 'partial' && resolvedPaidAmount < grandTotal)) {
      const debitEntry = await LedgerEntry.create({
        party: party._id,
        date: saleDate,
        particulars: `Sale Invoice ${invoiceNumber}`,
        ref: invoiceNumber,
        debit: grandTotal,
        credit: 0,
        createdBy: req.user._id,
      });
      ledgerEntryId = debitEntry._id;

      if (resolvedPaidAmount > 0) {
        const creditEntry = await LedgerEntry.create({
          party: party._id,
          date: saleDate,
          particulars: `Payment received (${resolvedPaymentType}) for ${invoiceNumber}`,
          ref: invoiceNumber,
          debit: 0,
          credit: resolvedPaidAmount,
          createdBy: req.user._id,
        });
        paymentLedgerEntryId = creditEntry._id;
      }
    }
  }

  const sale = await Sale.create({
    invoiceNumber,
    date: saleDate,
    customer: party ? party._id : null,
    customerName: resolvedCustomerName,
    customerPhone: customerPhone || (party ? party.phone : ''),
    customerAddress: customerAddress || (party ? party.address : ''),
    customerPan: customerPan || (party ? party.panNumber : ''),
    items: lineDetails,
    subtotal,
    discountPercent: resolvedDiscountPercent,
    discountAmount,
    grandTotal,
    paymentType: resolvedPaymentType,
    paidAmount: resolvedPaidAmount,
    note: typeof note === 'string' ? note.trim() : '',
    createdBy: req.user._id,
    ledgerEntry: ledgerEntryId,
    paymentLedgerEntry: paymentLedgerEntryId,
  });

  await sale.populate('createdBy', 'username');
  res.status(201).json({ sale: serializeSale(sale) });
});

// GET /api/sales/:id
router.get('/:id', async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Sale not found' });
  const sale = await Sale.findById(req.params.id)
    .populate('createdBy', 'username')
    .populate('voidedBy', 'username')
    .populate('customer');
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  res.json({ sale: serializeSale(sale) });
});

// PATCH /api/sales/:id/void (manager/admin only)
router.patch('/:id/void', requireRole('admin', 'manager'), async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Sale not found' });

  const sale = await Sale.findOneAndUpdate(
    { _id: req.params.id, status: 'completed' },
    { status: 'voided', voidedAt: new Date(), voidedBy: req.user._id },
    { new: true }
  );

  if (!sale) {
    const exists = await Sale.exists({ _id: req.params.id });
    return res.status(exists ? 409 : 404).json({ error: exists ? 'Sale is already voided' : 'Sale not found' });
  }

  // Restore inventory stock
  for (const line of sale.items) {
    const product = await Product.findByIdAndUpdate(line.product, { $inc: { quantity: line.quantity } }, { new: true });
    if (product) {
      await StockMovement.create({
        product: product._id,
        type: 'in',
        delta: line.quantity,
        quantityAfter: product.quantity,
        note: `Voided sale ${sale.invoiceNumber}`,
        user: req.user._id,
      });
    }
  }

  // Void associated ledger entries
  if (sale.ledgerEntry) {
    await LedgerEntry.findByIdAndUpdate(sale.ledgerEntry, {
      voided: true,
      voidedBy: req.user._id,
      voidedAt: new Date(),
    });
  }
  if (sale.paymentLedgerEntry) {
    await LedgerEntry.findByIdAndUpdate(sale.paymentLedgerEntry, {
      voided: true,
      voidedBy: req.user._id,
      voidedAt: new Date(),
    });
  }

  await sale.populate(['createdBy', 'voidedBy'].map((path) => ({ path, select: 'username' })));
  res.json({ sale: serializeSale(sale) });
});

// DELETE /api/sales/:id (manager/admin only)
router.delete('/:id', requireRole('admin', 'manager'), async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Sale not found' });

  const sale = await Sale.findById(req.params.id);
  if (!sale) return res.status(404).json({ error: 'Sale not found' });

  // If the sale was completed (not voided earlier), return stock back to inventory
  if (sale.status === 'completed') {
    for (const line of sale.items) {
      const product = await Product.findByIdAndUpdate(line.product, { $inc: { quantity: line.quantity } }, { new: true });
      if (product) {
        await StockMovement.create({
          product: product._id,
          type: 'in',
          delta: line.quantity,
          quantityAfter: product.quantity,
          note: `Deleted sale ${sale.invoiceNumber}`,
          user: req.user._id,
        });
      }
    }
  }

  // Remove linked ledger entries so customer balance remains accurate
  if (sale.ledgerEntry) {
    await LedgerEntry.findByIdAndDelete(sale.ledgerEntry);
  }
  if (sale.paymentLedgerEntry) {
    await LedgerEntry.findByIdAndDelete(sale.paymentLedgerEntry);
  }

  await Sale.findByIdAndDelete(req.params.id);
  res.json({ ok: true, message: `Sale ${sale.invoiceNumber} deleted` });
});

module.exports = router;
