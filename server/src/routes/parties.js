const express = require('express');
const mongoose = require('mongoose');
const Party = require('../models/Party');
const LedgerEntry = require('../models/LedgerEntry');
const { requireAuth, requireRole } = require('../middleware/auth');
const Setting = require('../models/Setting');
const { signedOpening, describeBalance, calculateBalance, buildStatement, dueInfo, round2 } = require('../utils/ledger');

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
  const allEntries = await LedgerEntry.find({ party: { $in: parties.map((p) => p._id) }, voided: false }).select('party date particulars debit credit openingBalanceAmount voided').lean();
  const entriesByParty = new Map();
  for (const e of allEntries) {
    const k = String(e.party);
    if (!entriesByParty.has(k)) entriesByParty.set(k, []);
    entriesByParty.get(k).push(e);
  }

  const items = parties.map((p) => {
    const entries = entriesByParty.get(String(p._id)) || [];
    const calc = calculateBalance(p, entries);
    const due = dueInfo(p, entries, undefined, p.createdAt.toISOString().slice(0, 10));
    return { ...serializeParty(p), balance: calc.closing, due, updatedAt: p.updatedAt };
  });
  res.json({ items });
});

// GET /api/parties/vouchers/check?number=...&partyId=...&excludeEntryId=...
router.get('/vouchers/check', async (req, res) => {
  const { number, partyId, excludeEntryId } = req.query;
  if (!number || !String(number).trim()) {
    return res.json({ conflict: null });
  }
  const cleanNum = String(number).trim();
  const refKey = cleanNum.toLowerCase();

  const query = {
    refKey,
    voided: false,
  };
  if (excludeEntryId && isId(excludeEntryId)) {
    query._id = { $ne: excludeEntryId };
  }

  const existingEntries = await LedgerEntry.find(query).populate('party', 'name type').lean();
  if (!existingEntries || existingEntries.length === 0) {
    return res.json({ conflict: null });
  }

  const currentPartyId = partyId && isId(partyId) ? String(partyId) : null;

  // First look for a conflict on a different account
  const diffAccountConflict = existingEntries.find(e => String(e.party._id) !== currentPartyId);
  if (diffAccountConflict) {
    const p = diffAccountConflict.party;
    const amt = diffAccountConflict.particulars === 'Opening Balance'
      ? diffAccountConflict.openingBalanceAmount
      : (diffAccountConflict.debit || diffAccountConflict.credit || 0);
    return res.json({
      conflict: {
        type: 'different_account',
        accountName: p ? p.name : 'Another account',
        particulars: diffAccountConflict.particulars,
        date: diffAccountConflict.date,
        amount: amt,
        message: `Voucher No. ${cleanNum} has already been used in ${p ? p.name : 'another account'} (${diffAccountConflict.particulars}, ${diffAccountConflict.date}, Rs. ${amt.toLocaleString('en-IN')}).`,
      }
    });
  }

  // Otherwise check same account conflict
  const sameAccountConflict = existingEntries.find(e => currentPartyId && String(e.party._id) === currentPartyId);
  if (sameAccountConflict) {
    return res.json({
      conflict: {
        type: 'same_account',
        accountName: sameAccountConflict.party ? sameAccountConflict.party.name : 'this account',
        particulars: sameAccountConflict.particulars,
        date: sameAccountConflict.date,
        amount: sameAccountConflict.particulars === 'Opening Balance' ? sameAccountConflict.openingBalanceAmount : (sameAccountConflict.debit || sameAccountConflict.credit || 0),
        message: `This voucher number is already used in this account (${sameAccountConflict.particulars}, ${sameAccountConflict.date}).`,
      }
    });
  }

  const first = existingEntries[0];
  const p = first.party;
  const amt = first.particulars === 'Opening Balance' ? first.openingBalanceAmount : (first.debit || first.credit || 0);
  return res.json({
    conflict: {
      type: 'different_account',
      accountName: p ? p.name : 'Another account',
      particulars: first.particulars,
      date: first.date,
      amount: amt,
      message: `Voucher No. ${cleanNum} has already been used in ${p ? p.name : 'another account'} (${first.particulars}, ${first.date}, Rs. ${amt.toLocaleString('en-IN')}).`,
    }
  });
});

// GET /api/parties?type=customer|vendor&q=&includeInactive=1
router.get('/', async (req, res) => {
  const filter = {};
  if (['customer', 'vendor'].includes(req.query.type)) filter.type = req.query.type;
  if (!req.query.includeInactive) filter.active = true;
  if (req.query.q && String(req.query.q).trim()) filter.name = new RegExp(escapeRegex(String(req.query.q).trim()), 'i');

  const parties = await Party.find(filter).sort({ nameKey: 1 });
  const allEntries = await LedgerEntry.find({ party: { $in: parties.map((p) => p._id) }, voided: false }).select('party date particulars debit credit openingBalanceAmount voided').lean();
  const entriesByParty = new Map();
  for (const e of allEntries) {
    const k = String(e.party);
    if (!entriesByParty.has(k)) entriesByParty.set(k, []);
    entriesByParty.get(k).push(e);
  }

  const summary = { overdue: 0, due: 0, clear: 0, overdueAmount: 0 };
  const items = parties.map((p) => {
    const entries = entriesByParty.get(String(p._id)) || [];
    const calc = calculateBalance(p, entries);
    const due = dueInfo(p, entries, undefined, p.createdAt.toISOString().slice(0, 10));
    summary[due.status] += 1;
    if (due.status === 'overdue') summary.overdueAmount = round2(summary.overdueAmount + due.outstanding);
    return { ...serializeParty(p), balance: calc.closing, due };
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
      openingBalanceAmount: e.openingBalanceAmount,
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

  const { date, particulars, ref, allowSameAccountDuplicate } = req.body || {};
  const amount = Number(req.body && req.body.amount);

  if (!['Opening Balance', 'Goods', 'Cash'].includes(particulars)) return res.status(400).json({ error: 'Invalid particulars' });

  // Automate side assignment
  const isCustomer = party.type === 'customer';
  let finalSide = 'dr'; // Default
  if (particulars === 'Opening Balance') {
    finalSide = 'dr';
  } else if (particulars === 'Goods') {
    finalSide = isCustomer ? 'dr' : 'cr';
  } else if (particulars === 'Cash') {
    finalSide = isCustomer ? 'cr' : 'dr';
  }

  let finalRef = ref;
  if (particulars === 'Opening Balance') {
    finalRef = undefined;
  }

  // Voucher / Ref duplicate check server-side
  if (finalRef && String(finalRef).trim() && particulars !== 'Opening Balance') {
    const cleanRef = String(finalRef).trim();
    const refKey = cleanRef.toLowerCase();
    const existing = await LedgerEntry.find({ refKey, voided: false }).populate('party', 'name').lean();
    if (existing && existing.length > 0) {
      const diffAccount = existing.find(e => String(e.party._id) !== String(party._id));
      if (diffAccount) {
        const p = diffAccount.party;
        const amt = diffAccount.particulars === 'Opening Balance' ? diffAccount.openingBalanceAmount : (diffAccount.debit || diffAccount.credit || 0);
        return res.status(409).json({
          error: `Voucher No. ${cleanRef} has already been used in ${p ? p.name : 'another account'} (${diffAccount.particulars}, ${diffAccount.date}, Rs. ${amt.toLocaleString('en-IN')}).`
        });
      }
    }
  }

  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Amount must be more than 0' });

  await LedgerEntry.create({
    party: party._id,
    date,
    particulars,
    ref: finalRef,
    refKey: finalRef ? String(finalRef).trim().toLowerCase() : undefined,
    openingBalanceAmount: particulars === 'Opening Balance' ? amount : 0,
    debit: particulars !== 'Opening Balance' && finalSide === 'dr' ? amount : 0,
    credit: particulars !== 'Opening Balance' && finalSide === 'cr' ? amount : 0,
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

  const { date, particulars, ref } = req.body || {};
  const amount = Number(req.body && req.body.amount);

  if (date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Date must look like YYYY-MM-DD' });
    entry.date = date;
  }
  if (particulars !== undefined) {
    if (!particulars || !particulars.trim()) return res.status(400).json({ error: 'Particulars are required' });
    entry.particulars = particulars.trim();
  }

  // Automate side assignment
  const isCustomer = party.type === 'customer';
  let finalSide = 'dr'; // Default
  if (entry.particulars === 'Opening Balance') {
    finalSide = 'dr';
  } else if (entry.particulars === 'Goods') {
    finalSide = isCustomer ? 'dr' : 'cr';
  } else if (entry.particulars === 'Cash') {
    finalSide = isCustomer ? 'cr' : 'dr';
  }

  let finalRef = ref;
  if (ref !== undefined) {
    finalRef = entry.particulars === 'Opening Balance' ? undefined : (ref ? ref.trim() : undefined);
    entry.ref = finalRef;
    entry.refKey = finalRef ? String(finalRef).toLowerCase() : undefined;
  }

  // Voucher / Ref duplicate check server-side for edit
  if (finalRef && String(finalRef).trim() && entry.particulars !== 'Opening Balance') {
    const cleanRef = String(finalRef).trim();
    const refKey = cleanRef.toLowerCase();
    const existing = await LedgerEntry.find({ refKey, voided: false, _id: { $ne: entry._id } }).populate('party', 'name').lean();
    if (existing && existing.length > 0) {
      const diffAccount = existing.find(e => String(e.party._id) !== String(party._id));
      if (diffAccount) {
        const p = diffAccount.party;
        const amt = diffAccount.particulars === 'Opening Balance' ? diffAccount.openingBalanceAmount : (diffAccount.debit || diffAccount.credit || 0);
        return res.status(409).json({
          error: `Voucher No. ${cleanRef} has already been used in ${p ? p.name : 'another account'} (${diffAccount.particulars}, ${diffAccount.date}, Rs. ${amt.toLocaleString('en-IN')}).`
        });
      }
    }
  }

  if (!isNaN(amount)) {
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Amount must be more than 0' });
    entry.openingBalanceAmount = entry.particulars === 'Opening Balance' ? amount : 0;
    entry.debit = entry.particulars !== 'Opening Balance' && finalSide === 'dr' ? amount : 0;
    entry.credit = entry.particulars !== 'Opening Balance' && finalSide === 'cr' ? amount : 0;
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
