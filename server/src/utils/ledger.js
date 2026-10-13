// Ledger maths, kept free of database code so it can be unit tested.
// Convention: Dr is positive, Cr is negative. A positive balance on a customer
// means they owe us; a Cr balance on a vendor means we owe them.

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function signedOpening(party) {
  const amount = party.openingBalance || 0;
  return party.openingSide === 'cr' ? -amount : amount;
}

function describeBalance(signed, isVendor = false) {
  const value = round2(signed);
  if (value === 0) return { amount: 0, side: '' };
  const side = isVendor ? (value > 0 ? 'Cr' : 'Dr') : (value > 0 ? 'Dr' : 'Cr');
  return { amount: Math.abs(value), side };
}

function calculateBalance(party, entries) {
  const live = (entries || []).filter((e) => !e.voided);
  const openingEntry = live.find((e) => e.particulars === 'Opening Balance');

  let openingAmount = 0;
  if (openingEntry) {
    openingAmount = openingEntry.openingBalanceAmount || 0;
  } else {
    openingAmount = party.openingBalance || 0;
  }

  const isVendor = party.type === 'vendor';
  const openingSide = party.openingSide || (isVendor ? 'cr' : 'dr');

  let totalDebit = 0;
  let totalCredit = 0;

  for (const e of live) {
    if (e === openingEntry) continue;
    totalDebit += (e.debit || 0);
    totalCredit += (e.credit || 0);
  }

  totalDebit = round2(totalDebit);
  totalCredit = round2(totalCredit);

  let signedClosing;
  let signedOpeningVal;

  if (isVendor) {
    // Vendor: Cr = positive (we owe them), Dr = negative (they owe us)
    // Formula: closing = opening + total Cr - total Dr
    signedOpeningVal = openingSide === 'cr' ? openingAmount : -openingAmount;
    signedClosing = round2(signedOpeningVal + totalCredit - totalDebit);
  } else {
    // Customer: Dr = positive (they owe us), Cr = negative (we owe them)
    // Formula: closing = opening + total Dr - total Cr
    signedOpeningVal = openingSide === 'cr' ? -openingAmount : openingAmount;
    signedClosing = round2(signedOpeningVal + totalDebit - totalCredit);
  }

  return {
    opening: describeBalance(signedOpeningVal, isVendor),
    totalDebit,
    totalCredit,
    closing: describeBalance(signedClosing, isVendor),
    signedClosing
  };
}

// Entries must already be sorted by date, then creation time.
function buildStatement(party, entries) {
  const isVendor = party.type === 'vendor';
  const live = (entries || []).filter((e) => !e.voided);
  const openingEntry = live.find((e) => e.particulars === 'Opening Balance');
  const openingSide = party.openingSide || (isVendor ? 'cr' : 'dr');
  const baseOpening = openingEntry ? (openingEntry.openingBalanceAmount || 0) : (party.openingBalance || 0);

  let running;
  // Use consistent signed math: Customer (Dr pos, Cr neg), Vendor (Cr pos, Dr neg)
  if (openingSide === 'cr') {
    running = isVendor ? baseOpening : -baseOpening;
  } else {
    running = isVendor ? -baseOpening : baseOpening;
  }

  const rows = entries.map((e) => {
    let rowDebit = e.debit || 0;
    let rowCredit = e.credit || 0;

    if (!e.voided && e !== openingEntry) {
      if (isVendor) {
        running = round2(running + rowCredit - rowDebit);
      } else {
        running = round2(running + rowDebit - rowCredit);
      }
    }

    return {
      ...e,
      balance: e.voided ? null : describeBalance(running, isVendor),
      debit: rowDebit,
      credit: rowCredit
    };
  });

  const calc = calculateBalance(party, entries);

  return {
    opening: calc.opening,
    rows,
    totalDebit: calc.totalDebit,
    totalCredit: calc.totalCredit,
    closing: calc.closing,
  };
}

// ---- Payment due status ----------------------------------------------------
const DAY_MS = 86400000;
const dayNumber = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) / DAY_MS;
const dayString = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);
const nepalToday = (now = Date.now()) => new Date(now + 5.75 * 3600000).toISOString().slice(0, 10);

function dueInfo(party, entries, today = nepalToday(), createdDate) {
  const calc = calculateBalance(party, entries);
  if (calc.signedClosing === 0 || calc.closing.amount === 0) {
    return { status: 'clear', outstanding: 0 };
  }

  const vendor = party.type === 'vendor';
  const owed = vendor ? 'credit' : 'debit';
  const paid = vendor ? 'debit' : 'credit';
  const live = entries.filter((e) => !e.voided).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const items = [];
  let payments = 0;
  const openingEntry = live.find((e) => e.particulars === 'Opening Balance');
  const openingAmount = openingEntry ? (openingEntry.openingBalanceAmount || 0) : (party.openingBalance || 0);
  const openingSide = party.openingSide || (vendor ? 'cr' : 'dr');

  const onOwedSide = vendor ? (openingSide === 'cr') : (openingSide === 'dr');
  if (openingAmount !== 0) {
    if (onOwedSide) {
      let date = createdDate || today;
      if (live.length && live[0].date < date) date = live[0].date;
      items.push({ date, amount: openingAmount });
    } else {
      payments += openingAmount;
    }
  }
  for (const e of live) {
    if (e === openingEntry) continue;
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
  if (outstanding <= 0) {
    outstanding = Math.abs(calc.signedClosing);
    if (!oldest) oldest = createdDate || today;
  }

  const creditDays = Number.isFinite(party.creditDays) ? party.creditDays : 30;
  const dueDate = dayString(dayNumber(oldest || createdDate || today) + creditDays);
  const late = dayNumber(today) - dayNumber(dueDate);
  return { status: late > 0 ? 'overdue' : 'due', outstanding, oldestUnpaid: oldest || createdDate || today, dueDate, days: Math.abs(late) };
}

module.exports = { round2, signedOpening, describeBalance, calculateBalance, buildStatement, dueInfo, nepalToday };
