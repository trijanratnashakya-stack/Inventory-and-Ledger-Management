const express = require('express');
const mongoose = require('mongoose');
const Party = require('../models/Party');
const LedgerEntry = require('../models/LedgerEntry');
const { requireAuth, requireRole } = require('../middleware/auth');
const Setting = require('../models/Setting');
const { signedOpening, describeBalance, buildStatement, dueInfo, round2 } = require('../utils/ledger');

const router = express.Router();
// Money records are for company-authorized accounts only: staff cannot see them.
router.use(requireAuth, requireRole('admin', 'manager'));

const isId = (v) => mongoose.Types.ObjectId.isValid(v);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function partyFields(body) {
  const out = {};
  for (const key of ['name', 'phone', 'address', 'panNumber']) {
    if (body[key] !== undefined) out[key] = typeof body[key] === 'string' ? body[key].trim() : body[key];
  }
  if (body.discountPercent !== undefined && body.discountPercent !== '') out.discountPercent = Number(body.discountPercent);
  if (body.creditDays !== undefined && body.creditDays !== '') out.creditDays = Number(body.creditDays);
  if (body.active !== undefined) out.active = !!body.active;
  return out;
}

function serializeParty(p) {
  return {
    _id: p._id,
    type: p.type,
    name: p.name,
    phone: p.phone || '',
    address: p.address || '',
    panNumber: p.panNumber || '',
    openingBalance: p.openingBalance,
    openingSide: p.openingSide,
    discountPercent: p.discountPercent || 0,
    creditDays: p.creditDays,
    active: p.active,
  };
}

// GET /api/parties/recent — returns recently updated parties/accounts
router.get('/recent', async (req, res) => {
  const parties = await Party.find({ active: true }).sort({ updatedAt: -1 }).limit(20);
  const sums = await LedgerEntry.aggregate([
    { $match: { party: { $in: parties.map((p) => p._id) }, voided: false } },
    { $group: { _id: '$party', debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
  ]);
  const byParty = new Map(sums.map((s) => [String(s._id), s]));
  const allEntries = await LedgerEntry.find({ party: { $in: parties.map((p) => p._id) }, voided: false }).select('party date debit credit voided').lean();
  const entriesByParty = new Map();
  for (const e of allEntries) {
    const k = String(e.party);
    if (!entriesByParty.has(k)) entriesByParty.set(k, []);
    entriesByParty.get(k).push(e);
  }

  const items = parties.map((p) => {
    const s = byParty.get(String(p._id)) || { debit: 0, credit: 0 };
    const signed = round2(signedOpening(p) + s.debit - s.credit);
    const due = dueInfo(p, entriesByParty.get(String(p._id)) || [], undefined, p.createdAt.toISOString().slice(0, 10));
    return { ...serializeParty(p), balance: describeBalance(signed), due, updatedAt: p.updatedAt };
  });
  res.json({ items });
});

// GET /api/parties?type=customer|vendor&q=&includeInactive=1
router.get('/', async (req, res) => {
  const filter = {};
  if (['customer', 'vendor'].includes(req.query.type)) filter.type = req.query.type;
  if (!req.query.includeInactive) filter.active = true;
  if (req.query.q && String(req.query.q).trim()) filter.name = new RegExp(escapeRegex(String(req.query.q).trim()), 'i');

  const parties = await Party.find(filter).sort({ nameKey: 1 });
  const sums = await LedgerEntry.aggregate([
    { $match: { party: { $in: parties.map((p) => p._id) }, voided: false } },
    { $group: { _id: '$party', debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
  ]);
  const byParty = new Map(sums.map((s) => [String(s._id), s]));
  const allEntries = await LedgerEntry.find({ party: { $in: parties.map((p) => p._id) }, voided: false }).select('party date debit credit voided').lean();
  const entriesByParty = new Map();
  for (const e of allEntries) {
    const k = String(e.party);
    if (!entriesByParty.has(k)) entriesByParty.set(k, []);
    entriesByParty.get(k).push(e);
  }

  const summary = { overdue: 0, due: 0, clear: 0, overdueAmount: 0 };
  const items = parties.map((p) => {
    const s = byParty.get(String(p._id)) || { debit: 0, credit: 0 };
    const signed = round2(signedOpening(p) + s.debit - s.credit);
    const due = dueInfo(p, entriesByParty.get(String(p._id)) || [], undefined, p.createdAt.toISOString().slice(0, 10));
    summary[due.status] += 1;
    if (due.status === 'overdue') summary.overdueAmount = round2(summary.overdueAmount + due.outstanding);
    return { ...serializeParty(p), balance: describeBalance(signed), due };
  });
  res.json({ items, summary });
});

router.post('/', async (req, res) => {
  const body = req.body || {};
  if (!['customer', 'vendor'].includes(body.type)) return res.status(400).json({ error: 'Choose customer or vendor' });
  const settings = await Setting.get();
  const fields = partyFields(body);
  if (fields.creditDays === undefined) fields.creditDays = settings.defaultCreditDays;
  if (body.type === 'customer' && fields.discountPercent === undefined) fields.discountPercent = settings.defaultDiscount;
  const party = await Party.create({ ...fields, type: body.type });
  res.status(201).json({ party: serializeParty(party) });
});

// GET /api/parties/:id  -> party + full statement with running balance
router.get('/:id', async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Account not found' });
  const party = await Party.findById(req.params.id);
  if (!party) return res.status(404).json({ error: 'Account not found' });
  const entries = await LedgerEntry.find({ party: party._id }).sort({ date: 1, createdAt: 1 }).populate('createdBy', 'username').lean();
  const statement = buildStatement(
    party,
    entries.map((e) => ({
      _id: e._id,
      date: e.date,
      particulars: e.particulars,
      ref: e.ref || '',
      debit: e.debit,
      credit: e.credit,
      voided: e.voided,
      createdBy: e.createdBy ? e.createdBy.username : null,
    }))
  );
  const due = dueInfo(party, entries, undefined, party.createdAt.toISOString().slice(0, 10));
  res.json({ party: serializeParty(party), statement, due });
});

router.put('/:id', async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Account not found' });
  const party = await Party.findById(req.params.id);
  if (!party) return res.status(404).json({ error: 'Account not found' });
  Object.assign(party, partyFields(req.body || {}));
  await party.save();
  res.json({ party: serializeParty(party) });
});

// POST /api/parties/:id/entries  { date, particulars, ref?, side: 'dr'|'cr', amount }
router.post('/:id/entries', async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Account not found' });
  const party = await Party.findById(req.params.id);
  if (!party) return res.status(404).json({ error: 'Account not found' });
  if (!party.active) return res.status(409).json({ error: 'This account is inactive. Reactivate it to add entries.' });

  const { date, particulars, ref, side } = req.body || {};
  const amount = Number(req.body && req.body.amount);

  if (!['Opening Balance', 'Goods', 'Cash'].includes(particulars)) return res.status(400).json({ error: 'Invalid particulars' });
  if (particulars === 'Opening Balance') {
    const existing = await LedgerEntry.findOne({ party: party._id, particulars: 'Opening Balance', voided: false });
    if (existing) return res.status(400).json({ error: 'Opening balance already exists for this account' });
  }

  let finalSide = side;
  if (particulars === 'Goods') finalSide = 'dr';
  if (particulars === 'Cash') finalSide = 'cr';

  if (!['dr', 'cr'].includes(finalSide)) return res.status(400).json({ error: 'Choose Dr or Cr' });
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Amount must be more than 0' });

  await LedgerEntry.create({
    party: party._id,
    date,
    particulars,
    ref: ref || undefined,
    debit: finalSide === 'dr' ? amount : 0,
    credit: finalSide === 'cr' ? amount : 0,
    createdBy: req.user._id,
  });
  res.status(201).json({ ok: true });
});

// DELETE /api/parties/:id  — admin only; blocked if the party has any non-voided ledger entries
router.delete('/:id', requireRole('admin'), async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Account not found' });
  const party = await Party.findById(req.params.id);
  if (!party) return res.status(404).json({ error: 'Account not found' });
  const activeEntries = await LedgerEntry.countDocuments({ party: party._id, voided: false });
  if (activeEntries > 0) {
    return res.status(409).json({
      error: `Cannot delete: this account has ${activeEntries} active ledger ${activeEntries === 1 ? 'entry' : 'entries'}. Void all entries first.`,
    });
  }
  await LedgerEntry.deleteMany({ party: party._id });
  await party.deleteOne();
  res.json({ ok: true });
});

// POST /api/parties/:id/entries/void-all  — voids every active entry on this account at once
router.post('/:id/entries/void-all', async (req, res) => {
  if (!isId(req.params.id)) return res.status(404).json({ error: 'Account not found' });
  const party = await Party.findById(req.params.id);
  if (!party) return res.status(404).json({ error: 'Account not found' });
  const result = await LedgerEntry.updateMany(
    { party: party._id, voided: false },
    { voided: true, voidedBy: req.user._id, voidedAt: new Date() }
  );
  res.json({ ok: true, voided: result.modifiedCount });
});

// PATCH /api/parties/:id/entries/:entryId/void
router.patch('/:id/entries/:entryId/void', async (req, res) => {
  if (!isId(req.params.id) || !isId(req.params.entryId)) return res.status(404).json({ error: 'Entry not found' });
  const entry = await LedgerEntry.findOneAndUpdate(
    { _id: req.params.entryId, party: req.params.id, voided: false },
    { voided: true, voidedBy: req.user._id, voidedAt: new Date() }
  );
  if (!entry) return res.status(404).json({ error: 'Entry not found or already voided' });
  res.json({ ok: true });
});

// PUT /api/parties/:id/entries/:entryId
router.put('/:id/entries/:entryId', async (req, res) => {
  if (!isId(req.params.id) || !isId(req.params.entryId)) return res.status(404).json({ error: 'Entry not found' });
  const party = await Party.findById(req.params.id);
  if (!party) return res.status(404).json({ error: 'Account not found' });
  if (!party.active) return res.status(409).json({ error: 'This account is inactive. Reactivate it to edit entries.' });

  const entry = await LedgerEntry.findOne({ _id: req.params.entryId, party: party._id });
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  if (entry.voided) return res.status(400).json({ error: 'Cannot edit a voided entry' });

  const { date, particulars, ref, side } = req.body || {};
  const amount = Number(req.body && req.body.amount);

  if (date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Date must look like YYYY-MM-DD' });
    entry.date = date;
  }
  if (particulars !== undefined) {
    if (!particulars || !particulars.trim()) return res.status(400).json({ error: 'Particulars are required' });
    entry.particulars = particulars.trim();
  }
  if (ref !== undefined) {
    entry.ref = ref ? ref.trim() : undefined;
  }
  if (side !== undefined || !isNaN(amount)) {
    if (!['dr', 'cr'].includes(side)) return res.status(400).json({ error: 'Choose Dr or Cr' });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Amount must be more than 0' });
    entry.debit = side === 'dr' ? amount : 0;
    entry.credit = side === 'cr' ? amount : 0;
  }

  await entry.save();
  await Party.updateOne({ _id: party._id }, { $set: { updatedAt: new Date() } });
  res.json({ ok: true, entry });
});

// DELETE /api/parties/:id/entries/:entryId
router.delete('/:id/entries/:entryId', async (req, res) => {
  if (!isId(req.params.id) || !isId(req.params.entryId)) return res.status(404).json({ error: 'Entry not found' });
  const entry = await LedgerEntry.findOneAndDelete({ _id: req.params.entryId, party: req.params.id });
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  await Party.updateOne({ _id: req.params.id }, { $set: { updatedAt: new Date() } });
  res.json({ ok: true });
});

module.exports = router;
