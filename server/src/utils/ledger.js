// Ledger maths, kept free of database code so it can be unit tested.
// Convention: Dr is positive, Cr is negative. A positive balance on a customer
// means they owe us; a Cr balance on a vendor means we owe them.

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function signedOpening(party) {
  const amount = party.openingBalance || 0;
  return party.openingSide === 'cr' ? -amount : amount;
}

function describeBalance(signed) {
  const value = round2(signed);
  if (value === 0) return { amount: 0, side: '' };
  return { amount: Math.abs(value), side: value > 0 ? 'Dr' : 'Cr' };
}

// Entries must already be sorted by date, then creation time.
function buildStatement(party, entries) {
  let running = signedOpening(party);
  let totalDebit = 0;
  let totalCredit = 0;
  const rows = entries.map((e) => {
    if (!e.voided) {
      running = round2(running + (e.debit || 0) - (e.credit || 0));
      totalDebit += e.debit || 0;
      totalCredit += e.credit || 0;
    }
    return { ...e, balance: e.voided ? null : describeBalance(running) };
  });
  return {
    opening: describeBalance(signedOpening(party)),
    rows,
    totalDebit: round2(totalDebit),
    totalCredit: round2(totalCredit),
    closing: describeBalance(running),
  };
}

// ---- Payment due status ----------------------------------------------------
// What the other side owes (customers owe on the Dr side, we owe vendors on the Cr side) is split into
// items by date. Payments on the opposite side clear the oldest items first (FIFO). The oldest item still
// unpaid plus the account's credit days is the due date. The opening balance counts from the day the
// account was created, or the first ledger entry if that is earlier.
const DAY_MS = 86400000;
const dayNumber = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) / DAY_MS;
const dayString = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);

// Today's date in Nepal (UTC+5:45) as YYYY-MM-DD, so "overdue" flips at local midnight.
const nepalToday = (now = Date.now()) => new Date(now + 5.75 * 3600000).toISOString().slice(0, 10);

function dueInfo(party, entries, today = nepalToday(), createdDate) {
  const vendor = party.type === 'vendor';
  const owed = vendor ? 'credit' : 'debit';
  const paid = vendor ? 'debit' : 'credit';
  const live = entries.filter((e) => !e.voided).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const items = [];
  let payments = 0;
  const opening = party.openingBalance || 0;
  if (opening > 0) {
    const onOwedSide = vendor ? party.openingSide === 'cr' : party.openingSide !== 'cr';
    if (onOwedSide) {
      let date = createdDate || today;
      if (live.length && live[0].date < date) date = live[0].date;
      items.push({ date, amount: opening });
    } else {
      payments += opening;
    }
  }
  for (const e of live) {
    if (e[owed] > 0) items.push({ date: e.date, amount: e[owed] });
    if (e[paid] > 0) payments += e[paid];
  }

  let outstanding = 0;
  let oldest = null;
  for (const item of items) {
    const cleared = Math.min(item.amount, payments);
    payments -= cleared;
    const left = round2(item.amount - cleared);
    if (left > 0) {
      outstanding += left;
      if (!oldest) oldest = item.date;
    }
  }
  outstanding = round2(outstanding);
  if (outstanding <= 0) return { status: 'clear', outstanding: 0 };

  const creditDays = Number.isFinite(party.creditDays) ? party.creditDays : 30;
  const dueDate = dayString(dayNumber(oldest) + creditDays);
  const late = dayNumber(today) - dayNumber(dueDate);
  return { status: late > 0 ? 'overdue' : 'due', outstanding, oldestUnpaid: oldest, dueDate, days: Math.abs(late) };
}

module.exports = { round2, signedOpening, describeBalance, buildStatement, dueInfo, nepalToday };
