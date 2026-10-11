'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useDebounce } from '@/lib/hooks';
import { useSettings, useUser } from '@/components/AppShell';
import { Alert, Empty } from '@/components/ui';
import { Balance, DuePill } from '@/components/accountUi';

const TYPES = [
  ['customer', 'Customers'],
  ['vendor', 'Vendors'],
];

const blankForm = (settings) => ({
  name: '',
  phone: '',
  address: '',
  panNumber: '',
  discountPercent: settings.defaultDiscount ?? 0,
  creditDays: settings.defaultCreditDays ?? 30,
  openingBalance: '',
  openingSide: 'dr',
});

export default function AccountsPage() {
  const user = useUser();
  const { settings } = useSettings();
  const [type, setType] = useState('customer');
  const [q, setQ] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(() => blankForm(settings));
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null); // id being deleted
  const [voiding, setVoiding] = useState(null);   // id being voided
  const dq = useDebounce(q);

  const load = useCallback(() => {
    const endpoint = showRecent ? '/parties/recent' : `/parties?${new URLSearchParams(Object.entries({ type, ...(dq ? { q: dq } : {}) }))}`;
    return api(endpoint)
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(e.message));
  }, [type, dq, showRecent]);

  useEffect(() => {
    load();
  }, [load]);

  if (user.role === 'staff') return <Alert>Accounts are limited to managers and admins.</Alert>;

  const isCustomer = type === 'customer';
  const isRecent = showRecent;
  const noun = isRecent ? 'account' : (isCustomer ? 'customer' : 'vendor');
  const items = data ? (isRecent ? data.items : data.items.filter((p) => !onlyOverdue || p.due.status === 'overdue')) : [];

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/parties', {
        method: 'POST',
        body: {
          ...form,
          type,
          discountPercent: isCustomer ? Number(form.discountPercent) || 0 : 0,
          creditDays: Number(form.creditDays),
          openingBalance: form.openingBalance === '' ? 0 : Number(form.openingBalance),
        },
      });
      setForm(blankForm(settings));
      setAdding(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function voidAll(p) {
    const activeCount = p.balance && p.balance.side ? 1 : 0; // just for the message; server counts precisely
    if (!window.confirm(`Void all active ledger entries for "${p.name}"? Each entry will be marked voided and the balance will reset to the opening balance. This cannot be undone.`)) return;
    setVoiding(p._id);
    setError('');
    try {
      await api(`/parties/${p._id}/entries/void-all`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setVoiding(null);
    }
  }

  async function deleteParty(p) {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone. The account must have no active ledger entries.`)) return;
    setDeleting(p._id);
    setError('');
    try {
      await api(`/parties/${p._id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ledger</h1>
          <p className="sub">Customer and vendor ledgers. Dr means they owe us, Cr means we owe them.</p>
        </div>
        {!isRecent && (
          <button className="btn" onClick={() => setAdding((v) => !v)}>
            {adding ? 'Close' : `+ Add ${noun}`}
          </button>
        )}
      </div>

      <div className="tabs">
        {TYPES.map(([value, label]) => (
          <button
            key={value}
            className={`tab${!showRecent && type === value ? ' tab-active' : ''}`}
            onClick={() => {
              setData(null);
              setAdding(false);
              setOnlyOverdue(false);
              setShowRecent(false);
              setType(value);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {adding && (
        <form className="card" onSubmit={create}>
          <h2>New {noun}</h2>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="p-name">Name</label>
              <input id="p-name" required maxLength={120} value={form.name} onChange={set('name')} />
            </div>
            <div className="field">
              <label htmlFor="p-phone">Phone</label>
              <input id="p-phone" maxLength={30} value={form.phone} onChange={set('phone')} />
            </div>
            <div className="field">
              <label htmlFor="p-addr">Address</label>
              <input id="p-addr" maxLength={200} value={form.address} onChange={set('address')} />
            </div>
            <div className="field">
              <label htmlFor="p-pan">PAN number</label>
              <input id="p-pan" maxLength={20} value={form.panNumber} onChange={set('panNumber')} />
            </div>
            {isCustomer && (
              <div className="field">
                <label htmlFor="p-disc">Discount %</label>
                <input id="p-disc" type="number" min="0" max="100" step="0.01" value={form.discountPercent} onChange={set('discountPercent')} />
                <div className="hint">The standing discount this customer gets from us.</div>
              </div>
            )}
            <div className="field">
              <label htmlFor="p-days">Credit days</label>
              <input id="p-days" type="number" min="0" max="365" step="1" required value={form.creditDays} onChange={set('creditDays')} />
              <div className="hint">An invoice is overdue this many days after its date.</div>
            </div>
            <div className="field">
              <label htmlFor="p-open">Opening balance (Rs.)</label>
              <input id="p-open" type="number" min="0" step="0.01" value={form.openingBalance} onChange={set('openingBalance')} />
            </div>
            <div className="field">
              <label htmlFor="p-side">Opening side</label>
              <select id="p-side" value={form.openingSide} onChange={set('openingSide')}>
                <option value="dr">Dr (they owe us)</option>
                <option value="cr">Cr (we owe them)</option>
              </select>
            </div>
          </div>
          <button className="btn" disabled={busy}>
            {busy ? 'Saving…' : `Save ${noun}`}
          </button>
        </form>
      )}

      <Alert>{error}</Alert>

      <section className="card card-flush">
        <div className="card-head">
          {!isRecent && (
            <input type="search" aria-label="Search accounts" placeholder={`Search ${noun}s by name`} value={q} onChange={(e) => setQ(e.target.value)} />
          )}
          {data && (
            <div className="chips" role="group" aria-label="Payment status">
              <button className={`chip${!onlyOverdue && !showRecent ? ' chip-active' : ''}`} onClick={() => { setShowRecent(false); setOnlyOverdue(false); }}>
                All ({data.items.length})
              </button>
              <button className={`chip${onlyOverdue && !showRecent ? ' chip-active' : ''}`} onClick={() => { setShowRecent(false); setOnlyOverdue(true); }}>
                Overdue ({data.summary?.overdue || 0})
              </button>
              <button className={`chip${showRecent ? ' chip-active' : ''}`} onClick={() => { setShowRecent(true); setOnlyOverdue(false); }}>
                Recents
              </button>
            </div>
          )}
        </div>
        {data && items.length === 0 ? (
          <Empty>{onlyOverdue ? `No overdue ${noun}s. Everyone is within their credit days.` : `No ${noun}s yet.`}</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Phone</th>
                  <th>Address</th>
                  <th className="num">Balance</th>
                  <th>Payment status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p._id}>
                    <td>
                      <Link href={`/accounts/${p._id}`} className="link-btn">
                        {p.name}
                      </Link>
                    </td>
                    <td>
                      <span className="badge">{p.type}</span>
                    </td>
                    <td className="muted">{p.phone || '-'}</td>
                    <td className="muted">{p.address || '-'}</td>
                    <td className="num">
                      <Balance value={p.balance} />
                    </td>
                    <td>
                      <DuePill due={p.due} type={p.type} />
                    </td>
                    <td>
                      <Link href={`/accounts/${p._id}`} className="link-btn">
                        Ledger
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
