'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useDebounce } from '@/lib/hooks';
import { canEdit, money } from '@/lib/format';
import { adToBs, longBs } from '@/lib/bs';
import { useUser } from '@/components/AppShell';
import { Alert, Empty, Pager } from '@/components/ui';
import { PaymentTypePill, SaleStatusPill } from '@/components/saleUi';

const FILTERS = [
  ['', 'All'],
  ['cash', 'Cash'],
  ['credit', 'Credit'],
  ['bank', 'Bank'],
  ['partial', 'Partial'],
  ['voided', 'Voided'],
];

export default function SalesPage() {
  const user = useUser();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [masked, setMasked] = useState(() => {
    try {
      return localStorage.getItem('hide_sales_amounts') === 'true';
    } catch {
      return false;
    }
  });

  const toggleMask = () => {
    const next = !masked;
    setMasked(next);
    try {
      localStorage.setItem('hide_sales_amounts', String(next));
    } catch {}
  };
  const dq = useDebounce(q);

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), limit: '25' });
    if (dq.trim()) params.set('q', dq.trim());
    if (filter === 'voided') {
      params.set('status', 'voided');
    } else if (filter) {
      params.set('paymentType', filter);
    }

    return api(`/sales?${params}`)
      .then((d) => {
        setResult(d);
        setError('');
      })
      .catch((e) => setError(e.message));
  }, [page, dq, filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function deleteSale(s) {
    if (
      !window.confirm(
        `Permanently delete sale ${s.invoiceNumber}? Sold items will be returned back to inventory and any ledger entries will be removed.`
      )
    ) {
      return;
    }
    try {
      await api(`/sales/${s._id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const summary = result ? result.summary : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Sales</h1>
          <p className="sub">
            {result ? `${result.total} invoices · Total ${money(summary?.totalRevenue || 0)}` : 'Loading…'}
          </p>
        </div>
        <Link href="/sales/new" className="btn">
          + New Sale
        </Link>
      </div>

      {summary && (
        <div className="stats">
          <div className="stat">
            <div>
              <div className="stat-label">Today's Sales</div>
              <div className="stat-value">{masked ? '••••••' : money(summary.todayRevenue)}</div>
              <span className="sub-line">{summary.todayCount} sales today</span>
            </div>
            <button
              type="button"
              className="stat-toggle"
              aria-label={masked ? 'Show amount' : 'Hide amount'}
              aria-pressed={masked}
              onClick={toggleMask}
            >
              {masked ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              )}
            </button>
          </div>
          <div className="stat">
            <div>
              <div className="stat-label">Total Revenue</div>
              <div className="stat-value">{masked ? '••••••' : money(summary.totalRevenue)}</div>
              <span className="sub-line">{summary.completedCount} completed invoices</span>
            </div>
          </div>
          <div className="stat">
            <div>
              <div className="stat-label">Cash / Bank</div>
              <div className="stat-value">{masked ? '••••••' : money(summary.cashRevenue)}</div>
              <span className="sub-line">Immediate payments</span>
            </div>
          </div>
          <div className="stat">
            <div>
              <div className="stat-label">Credit Sales</div>
              <div className="stat-value">{masked ? '••••••' : money(summary.creditRevenue)}</div>
              <span className="sub-line">Added to customer ledgers</span>
            </div>
          </div>
        </div>
      )}

      <Alert>{error}</Alert>

      <section className="card card-flush">
        <div className="card-head">
          <input
            type="search"
            aria-label="Search sales"
            placeholder="Search by invoice number or customer name"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          <div className="chips" role="group" aria-label="Filter sales by payment or status">
            {FILTERS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`chip${filter === value ? ' chip-active' : ''}`}
                onClick={() => {
                  setFilter(value);
                  setPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {result && result.items.length === 0 ? (
          <Empty>{dq || filter ? 'No sales found matching your filter.' : 'No sales made yet. Create your first sale!'}</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date (BS)</th>
                  <th>Customer</th>
                  <th className="num">Items</th>
                  <th className="num">Units</th>
                  <th className="num">Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(result ? result.items : []).map((s) => (
                  <tr key={s._id} className={s.status === 'voided' ? 'row-void' : undefined}>
                    <td>
                      <Link href={`/sales/${s._id}`} className="link-btn">
                        {s.invoiceNumber}
                      </Link>
                    </td>
                    <td title={`AD ${s.date}`}>{adToBs(s.date) ? longBs(adToBs(s.date)) : s.date}</td>
                    <td>
                      {s.customer ? (
                        <Link href={`/accounts/${s.customer}`} className="link-btn">
                          {s.customerName}
                        </Link>
                      ) : (
                        <span>{s.customerName}</span>
                      )}
                      {s.customerPhone && <span className="sub-line">{s.customerPhone}</span>}
                    </td>
                    <td className="num">{s.lineCount}</td>
                    <td className="num">{s.totalUnits}</td>
                    <td className="num">
                      <strong>{money(s.grandTotal)}</strong>
                      {s.discountAmount > 0 && (
                        <span className="sub-line muted">(-{money(s.discountAmount)})</span>
                      )}
                    </td>
                    <td>
                      <PaymentTypePill type={s.paymentType} />
                    </td>
                    <td>
                      <SaleStatusPill status={s.status} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="inline-form" style={{ justifyContent: 'flex-end' }}>
                        <Link href={`/sales/${s._id}`} className="link-btn">
                          View
                        </Link>
                        {canEdit(user) && (
                          <button
                            type="button"
                            className="link-btn"
                            style={{ color: 'var(--red)', marginLeft: 8 }}
                            onClick={() => deleteSale(s)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result && <Pager page={result.page} pages={result.pages} onPage={setPage} />}
      </section>
    </>
  );
}
