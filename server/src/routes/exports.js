const express = require('express');
const Product = require('../models/Product');
const Party = require('../models/Party');
const LedgerEntry = require('../models/LedgerEntry');
const Sale = require('../models/Sale');
const { requireAuth, requireRole } = require('../middleware/auth');
const { signedOpening, describeBalance, round2 } = require('../utils/ledger');
const { stockStatus } = require('../utils/status');

const router = express.Router();
router.use(requireAuth, requireRole('admin', 'manager'));

// Cells that start with = + - @ can run as formulas when opened in Excel, so they are prefixed with an apostrophe.
function cell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const toCsv = (rows) => `${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;

function send(res, name, rows) {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${name}"`);
  res.send(`﻿${toCsv(rows)}`);
}

// Same columns the CSV importer reads, so an export can be edited and re-imported elsewhere.
router.get('/products.csv', async (req, res) => {
  const products = await Product.find({ active: true }).populate('company', 'name').sort({ category: 1, name: 1 });
  send(res, 'products.csv', [
    ['category', 'productId', 'name', 'company', 'quantity', 'lowStockThreshold', 'stackSize', 'wholesalePrice', 'retailPrice', 'status'],
    ...products.map((p) => [p.category, p.productId || '', p.name, p.company ? p.company.name : '', p.quantity, p.lowStockThreshold, p.stackSize || 1, p.wholesalePrice, p.retailPrice, stockStatus(p.quantity, p.lowStockThreshold)]),
  ]);
});

router.get('/accounts.csv', async (req, res) => {
  const parties = await Party.find({ active: true }).sort({ type: 1, nameKey: 1 });
  const sums = await LedgerEntry.aggregate([
    { $match: { voided: false } },
    { $group: { _id: '$party', debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
  ]);
  const byParty = new Map(sums.map((s) => [String(s._id), s]));
  send(res, 'accounts.csv', [
    ['type', 'name', 'phone', 'address', 'panNumber', 'discountPercent', 'creditDays', 'balance', 'side'],
    ...parties.map((p) => {
      const s = byParty.get(String(p._id)) || { debit: 0, credit: 0 };
      const b = describeBalance(round2(signedOpening(p) + s.debit - s.credit));
      return [p.type, p.name, p.phone || '', p.address || '', p.panNumber || '', p.type === 'customer' ? p.discountPercent : '', p.creditDays, b.amount, b.side];
    }),
  ]);
});

router.get('/sales.csv', async (req, res) => {
  const sales = await Sale.find().sort({ date: -1, createdAt: -1 });
  send(res, 'sales.csv', [
    ['invoiceNumber', 'date', 'customerName', 'customerPhone', 'itemsCount', 'subtotal', 'discountPercent', 'discountAmount', 'grandTotal', 'paymentType', 'paidAmount', 'status'],
    ...sales.map((s) => [
      s.invoiceNumber,
      s.date,
      s.customerName,
      s.customerPhone || '',
      s.items ? s.items.length : 0,
      s.subtotal,
      s.discountPercent || 0,
      s.discountAmount || 0,
      s.grandTotal,
      s.paymentType,
      s.paidAmount || 0,
      s.status,
    ]),
  ]);
});

module.exports = router;
