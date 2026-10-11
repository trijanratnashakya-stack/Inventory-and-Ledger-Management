'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { BRAND, canEdit, money } from '@/lib/format';
import { adToBs, longBs } from '@/lib/bs';
import { useSettings, useUser } from '@/components/AppShell';
import { Alert } from '@/components/ui';
import { PaymentTypePill, SaleStatusPill } from '@/components/saleUi';

export default function SaleDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const user = useUser();
  const { settings } = useSettings();
  const [sale, setSale] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api(`/sales/${id}`)
      .then((d) => !cancelled && setSale(d.sale))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function voidSale() {
    if (
      !window.confirm(
        `Void ${sale.invoiceNumber}? This will return all sold items back to inventory and void any associated ledger entries.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const d = await api(`/sales/${id}/void`, { method: 'PATCH' });
      setSale(d.sale);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteSale() {
    if (
      !window.confirm(
        `Permanently delete sale ${sale.invoiceNumber}? Sold items will be returned back to inventory and any ledger entries will be removed.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(`/sales/${id}`, { method: 'DELETE' });
      router.push('/sales');
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  if (!sale) return error ? <Alert>{error}</Alert> : <p className="muted">Loading…</p>;

  const dateBs = adToBs(sale.date);
  const isVoided = sale.status === 'voided';
  const remainingDue = Math.max(0, sale.grandTotal - (sale.paidAmount || 0));

  return (
    <>
      {/* Company letterhead visible only in Print */}
      <div className="print-only">
        <strong>{settings.companyName || BRAND}</strong>
        <div>{[settings.address, settings.phone, settings.panNumber && `PAN ${settings.panNumber}`].filter(Boolean).join(' · ')}</div>
        <div style={{ marginTop: 8, fontWeight: 700 }}>
          TAX INVOICE / SALES BILL: {sale.invoiceNumber}
        </div>
      </div>

      <div className="page-head">
        <div>
          <h1>
            {sale.invoiceNumber} <SaleStatusPill status={sale.status} /> <PaymentTypePill type={sale.paymentType} />
          </h1>
          <p className="sub">
            <Link href="/sales" className="link-btn no-print">
              ← Back to sales
            </Link>{' '}
            · {dateBs ? longBs(dateBs) : sale.date} (AD {sale.date}) · Created by {sale.createdBy || 'unknown'}
            {isVoided && sale.voidedAt && ` · Voided by ${sale.voidedBy || 'admin'} on ${new Date(sale.voidedAt).toLocaleDateString()}`}
          </p>
        </div>
        <div className="inline-form no-print">
          <button className="btn btn-ghost" onClick={() => window.print()}>
            Print Invoice
          </button>
          {!isVoided && canEdit(user) && (
            <button className="btn btn-ghost" disabled={busy} onClick={voidSale}>
              {busy ? 'Voiding…' : 'Void Sale'}
            </button>
          )}
          {canEdit(user) && (
            <button className="btn btn-danger" disabled={busy} onClick={deleteSale}>
              {busy ? 'Deleting…' : 'Delete Sale'}
            </button>
          )}
        </div>
      </div>

      <Alert>{error}</Alert>

      {/* Customer & Invoice Summary Cards */}
      <div className="stats">
        <div className="stat">
          <div>
            <div className="stat-label">Customer</div>
            <div className="stat-value stat-small">
              {sale.customer ? (
                <Link href={`/accounts/${typeof sale.customer === 'object' ? sale.customer._id : sale.customer}`} className="link-btn no-print">
                  {sale.customerName}
                </Link>
              ) : (
                sale.customerName
              )}
            </div>
            <span className="sub-line">
              {[sale.customerPhone, sale.customerAddress, sale.customerPan && `PAN ${sale.customerPan}`]
                .filter(Boolean)
                .join(' · ') || 'Walk-in'}
            </span>
          </div>
        </div>

        <div className="stat">
          <div>
            <div className="stat-label">Grand Total</div>
            <div className="stat-value">{money(sale.grandTotal)}</div>
            {sale.discountAmount > 0 && (
              <span className="sub-line muted">
                Includes {sale.discountPercent}% discount ({money(sale.discountAmount)})
              </span>
            )}
          </div>
        </div>

        <div className="stat">
          <div>
            <div className="stat-label">Payment Status</div>
            <div className="stat-value stat-small" style={{ textTransform: 'capitalize' }}>
              {sale.paymentType}
            </div>
            <span className="sub-line">
              {sale.paymentType === 'credit'
                ? `Full amount on credit (${money(sale.grandTotal)})`
                : sale.paymentType === 'partial'
                ? `Paid ${money(sale.paidAmount)}, Due ${money(remainingDue)}`
                : `Paid in full (${money(sale.grandTotal)})`}
            </span>
          </div>
        </div>

        <div className="stat">
          <div>
            <div className="stat-label">Units Sold</div>
            <div className="stat-value">{sale.totalUnits}</div>
            <span className="sub-line">{sale.lineCount} item line{sale.lineCount === 1 ? '' : 's'}</span>
          </div>
        </div>
      </div>

      {sale.note && (
        <section className="card">
          <strong>Note</strong>
          <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{sale.note}</p>
        </section>
      )}

      {/* Invoice Items Table */}
      <section className="card card-flush">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th>Product ID</th>
                <th>Product Name</th>
                <th>Company</th>
                <th className="num">Unit Price</th>
                <th className="num">Qty</th>
                <th className="num">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((i, idx) => (
                <tr key={idx}>
                  <td className="muted">{idx + 1}</td>
                  <td>{i.productId || <span className="muted">-</span>}</td>
                  <td>
                    <strong>{i.name}</strong>
                  </td>
                  <td className="muted">{i.company || '-'}</td>
                  <td className="num">{money(i.unitPrice)}</td>
                  <td className="num">
                    <strong>{i.quantity}</strong>
                  </td>
                  <td className="num">{money(i.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} style={{ textAlign: 'right' }}>
                  <strong>Subtotal</strong>
                </td>
                <td className="num">
                  <strong>{sale.totalUnits}</strong>
                </td>
                <td className="num">
                  <strong>{money(sale.subtotal)}</strong>
                </td>
              </tr>
              {sale.discountAmount > 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'right', color: 'var(--accent-dark)' }}>
                    Discount ({sale.discountPercent}%)
                  </td>
                  <td className="num" style={{ color: 'var(--accent-dark)' }}>
                    -{money(sale.discountAmount)}
                  </td>
                </tr>
              )}
              <tr>
                <td colSpan={6} style={{ textAlign: 'right', fontSize: '16px' }}>
                  <strong>Grand Total</strong>
                </td>
                <td className="num" style={{ fontSize: '18px' }}>
                  <strong>{money(sale.grandTotal)}</strong>
                </td>
              </tr>
              {sale.paymentType === 'partial' && (
                <>
                  <tr className="muted">
                    <td colSpan={6} style={{ textAlign: 'right' }}>
                      Paid Amount
                    </td>
                    <td className="num">{money(sale.paidAmount)}</td>
                  </tr>
                  <tr className="muted">
                    <td colSpan={6} style={{ textAlign: 'right' }}>
                      Balance Due (on Ledger)
                    </td>
                    <td className="num">{money(remainingDue)}</td>
                  </tr>
                </>
              )}
            </tfoot>
          </table>
        </div>
      </section>
    </>
  );
}
