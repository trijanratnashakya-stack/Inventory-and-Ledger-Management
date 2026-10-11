'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { adToBs, bsToAd, longBs, todayBs } from '@/lib/bs';
import { useSettings, useUser } from '@/components/AppShell';
import { Alert, Empty } from '@/components/ui';
import { Balance, DuePill } from '@/components/accountUi';
import { BRAND } from '@/lib/format';

const blankEntry = () => ({ bsDate: todayBs(), particulars: '', ref: '', side: 'dr', amount: '' });

export default function LedgerPage() {
  const { id } = useParams();
  const router = useRouter();
  const user = useUser();
  const { settings } = useSettings();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [entry, setEntry] = useState(blankEntry);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState(null);
  const [notice, setNotice] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(
    () =>
      api(`/parties/${id}`)
        .then((d) => {
          setData(d);
          setError('');
        })
        .catch((e) => setError(e.message)),
    [id]
  );

  useEffect(() => {
    load();
  }, [load]);

  if (user.role === 'staff') return <Alert>Accounts are limited to managers and admins.</Alert>;
  if (!data) return error ? <Alert>{error}</Alert> : <p className="muted">Loading…</p>;

  const { party, statement, due } = data;
  const isCustomer = party.type === 'customer';

  function startEdit() {
    setDetails({
      phone: party.phone,
      address: party.address,
      panNumber: party.panNumber,
      openingBalance: party.openingBalance,
      openingSide: party.openingSide,
      discountPercent: party.discountPercent,
      creditDays: party.creditDays,
    });
    setEditing(true);
  }

  async function saveDetails(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/parties/${id}`, {
        method: 'PUT',
        body: { ...details, openingBalance: Number(details.openingBalance) || 0, openingSide: details.openingSide, discountPercent: isCustomer ? Number(details.discountPercent) || 0 : 0, creditDays: Number(details.creditDays) },
      });
      setEditing(false);
      setNotice('Details saved.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function add(e) {
    e.preventDefault();
    setError('');
    const date = bsToAd(entry.bsDate);
    if (!date) return setError('Enter a real Bikram Sambat date as YYYY-MM-DD, for example 2083-06-19');
    setBusy(true);
    try {
      await api(`/parties/${id}/entries`, {
        method: 'POST',
        body: { date, particulars: entry.particulars, ref: entry.ref, side: entry.side, amount: Number(entry.amount) },
      });
      setEntry({ ...blankEntry(), side: entry.side, bsDate: entry.bsDate });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(row) {
    if (!window.confirm(`Delete this entry (${row.particulars})? This cannot be undone.`)) return;
    try {
      await api(`/parties/${id}/entries/${row._id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function voidEntry(row) {
    if (!window.confirm(`Void this entry (${row.particulars})? It stays on record but no longer counts toward the balance.`)) return;
    try {
      await api(`/parties/${id}/entries/${row._id}/void`, { method: 'PATCH' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteParty() {
    if (!window.confirm(`Delete "${party.name}"? This cannot be undone. The account must have no active ledger entries.`)) return;
    setDeleting(true);
    setError('');
    try {
      await api(`/parties/${id}`, { method: 'DELETE' });
      router.replace('/accounts');
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="print-only">
        <strong>{settings.companyName || BRAND}</strong>
        <div>{[settings.address, settings.phone, settings.panNumber && `PAN ${settings.panNumber}`].filter(Boolean).join(' · ')}</div>
        <div>Statement of account: {party.name}</div>
      </div>
      <div className="page-head">
        <div>
          <h1>{party.name}</h1>
          <p className="sub">
            <Link href="/accounts" className="link-btn no-print">
              ← Back to Ledger
            </Link>{' '}
            · {party.type === 'customer' ? 'Customer' : 'Vendor'}
            {party.phone ? ` · ${party.phone}` : ''}
            {party.address ? ` · ${party.address}` : ''}
            {party.panNumber ? ` · PAN ${party.panNumber}` : ''}
          </p>
        </div>
        <div className="inline-form no-print">
          <button className="btn btn-ghost" onClick={startEdit}>
            Edit details
          </button>
          <button className="btn btn-ghost" onClick={() => window.print()}>
            Print statement
          </button>
          {user.role === 'admin' && (
            <button
              className="btn btn-ghost"
              style={{ color: 'var(--red)' }}
              disabled={deleting}
              onClick={deleteParty}
            >
              {deleting ? 'Deleting…' : 'Delete account'}
            </button>
          )}
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div>
            <div className="stat-label">Opening</div>
            <div className="stat-value">
              <Balance value={statement.opening} />
            </div>
          </div>
        </div>
        <div className="stat">
          <div>
            <div className="stat-label">Total Dr / Cr</div>
            <div className="stat-value stat-small">
              {money(statement.totalDebit)} / {money(statement.totalCredit)}
            </div>
          </div>
        </div>
        <div className="stat">
          <div>
            <div className="stat-label">Closing balance</div>
            <div className="stat-value">
              <Balance value={statement.closing} />
            </div>
          </div>
        </div>
        {isCustomer && (
          <div className="stat">
            <div>
              <div className="stat-label">Discount</div>
              <div className="stat-value">{party.discountPercent || 0}%</div>
            </div>
          </div>
        )}
        <div className="stat">
          <div>
            <div className="stat-label">Payment status · {party.creditDays} credit days</div>
            <div style={{ marginTop: 6 }}>
              <DuePill due={due} type={party.type} />
            </div>
          </div>
        </div>
      </div>

      {editing && details && (
        <form className="card no-print" onSubmit={saveDetails}>
          <h2>Edit details</h2>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="d-phone">Phone</label>
              <input id="d-phone" maxLength={30} value={details.phone} onChange={(e) => setDetails({ ...details, phone: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="d-addr">Address</label>
              <input id="d-addr" maxLength={200} value={details.address} onChange={(e) => setDetails({ ...details, address: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="d-pan">PAN number</label>
              <input id="d-pan" maxLength={20} value={details.panNumber} onChange={(e) => setDetails({ ...details, panNumber: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="d-bal">Opening balance</label>
              <input id="d-bal" type="number" min="0" step="0.01" value={details.openingBalance} onChange={(e) => setDetails({ ...details, openingBalance: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="d-side">Side</label>
              <select id="d-side" value={details.openingSide} onChange={(e) => setDetails({ ...details, openingSide: e.target.value })}>
                <option value="dr">Dr (debit)</option>
                <option value="cr">Cr (credit)</option>
              </select>
            </div>
            {isCustomer && (
              <div className="field">
                <label htmlFor="d-disc">Discount %</label>
                <input id="d-disc" type="number" min="0" max="100" step="0.01" value={details.discountPercent} onChange={(e) => setDetails({ ...details, discountPercent: e.target.value })} />
              </div>
            )}
            <div className="field">
              <label htmlFor="d-days">Credit days</label>
              <input id="d-days" type="number" min="0" max="365" step="1" required value={details.creditDays} onChange={(e) => setDetails({ ...details, creditDays: e.target.value })} />
            </div>
          </div>
          <div className="inline-form">
            <button className="btn" disabled={busy}>
              {busy ? 'Saving…' : 'Save details'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <Alert kind="ok">{notice}</Alert>

      <Alert>{error}</Alert>

      {party.active && (
        <form className="card no-print" onSubmit={add}>
          <h2>Add entry</h2>
          <div className="entry-grid">
            <div className="field">
              <label htmlFor="e-date">Date (BS)</label>
              <input id="e-date" required placeholder="2083-06-19" value={entry.bsDate} onChange={(e) => setEntry({ ...entry, bsDate: e.target.value })} />
              <div className="hint">{bsToAd(entry.bsDate) ? `${longBs(entry.bsDate)}` : 'YYYY-MM-DD'}</div>
            </div>
            <div className="field">
              <label htmlFor="e-part">Particulars</label>
              <input id="e-part" required maxLength={200} value={entry.particulars} onChange={(e) => setEntry({ ...entry, particulars: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="e-ref">Voucher / Ref</label>
              <input id="e-ref" maxLength={40} value={entry.ref} onChange={(e) => setEntry({ ...entry, ref: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="e-side">Side</label>
              <select id="e-side" value={entry.side} onChange={(e) => setEntry({ ...entry, side: e.target.value })}>
                <option value="dr">Dr (debit)</option>
                <option value="cr">Cr (credit)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="e-amt">Amount (Rs.)</label>
              <input id="e-amt" required type="number" min="0.01" step="0.01" value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} />
            </div>
          </div>
          <button className="btn" disabled={busy}>
            {busy ? 'Saving…' : 'Add entry'}
          </button>
        </form>
      )}

      <section className="card card-flush">
        <div className="table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Date (BS)</th>
                <th>Particulars</th>
                <th>Ref</th>
                <th className="num">Dr</th>
                <th className="num">Cr</th>
                <th className="num">Balance</th>
                <th className="no-print" />
              </tr>
            </thead>
            <tbody>
              <tr className="muted">
                <td />
                <td>Opening balance</td>
                <td />
                <td />
                <td />
                <td className="num">
                  <Balance value={statement.opening} />
                </td>
                <td className="no-print" />
              </tr>
              {statement.rows.map((r) => (
                <tr key={r._id} className={r.voided ? 'row-void' : undefined}>
                  <td title={`AD ${r.date}`}>{adToBs(r.date)}</td>
                  <td>
                    {r.particulars}
                    {r.voided && <span className="badge"> voided</span>}
                  </td>
                  <td className="muted">{r.ref || '-'}</td>
                  <td className="num">{r.debit ? money(r.debit) : ''}</td>
                  <td className="num">{r.credit ? money(r.credit) : ''}</td>
                  <td className="num">{r.balance ? <Balance value={r.balance} /> : ''}</td>
                  <td className="no-print">
                    {!r.voided && (
                      <>
                        <button className="link-btn" onClick={() => voidEntry(r)}>Void</button>
                        {' · '}
                        <button className="link-btn" style={{ color: 'var(--red)' }} onClick={() => deleteEntry(r)}>Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>
                  <strong>Total</strong>
                </td>
                <td />
                <td />
                <td className="num">
                  <strong>{money(statement.totalDebit)}</strong>
                </td>
                <td className="num">
                  <strong>{money(statement.totalCredit)}</strong>
                </td>
                <td className="num">
                  <strong>
                    <Balance value={statement.closing} />
                  </strong>
                </td>
                <td className="no-print" />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </>
  );
}
