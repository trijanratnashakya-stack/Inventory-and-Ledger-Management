'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { BRAND, canEdit } from '@/lib/format';
import { useSettings, useUser } from '@/components/AppShell';
import { Alert } from '@/components/ui';
import { OrderPill } from '@/components/orderUi';

export default function OrderDetailPage() {
  const { id } = useParams();
  const user = useUser();
  const { settings } = useSettings();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api(`/orders/${id}`)
      .then((d) => !cancelled && setOrder(d.order))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function cancelOrder() {
    if (!window.confirm(`Cancel ${order.number}? This cannot be undone.`)) return;
    setBusy(true);
    setError('');
    try {
      const d = await api(`/orders/${id}/cancel`, { method: 'PATCH' });
      setOrder(d.order);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!order) return error ? <Alert>{error}</Alert> : <p className="muted">Loading…</p>;

  async function receiveOrder() {
    if (!window.confirm(`Mark ${order.number} as received? The ordered stacks will be added to stock as units.`)) return;
    setBusy(true);
    setError('');
    try {
      const d = await api(`/orders/${id}/receive`, { method: 'PATCH' });
      setOrder(d.order);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const hasSacks = order.items.some((i) => (i.sackSize || 1) > 1);
  const canCancel = order.status === 'open' && (canEdit(user) || String(order.createdById) === String(user.id));

  return (
    <>
      <div className="print-only">
        <strong>{settings.companyName || BRAND}</strong>
        <div>{[settings.address, settings.phone, settings.panNumber && `PAN ${settings.panNumber}`].filter(Boolean).join(' · ')}</div>
        <div>Purchase order {order.number}</div>
      </div>
      <div className="page-head">
        <div>
          <h1>
            {order.number} <OrderPill status={order.status} />
          </h1>
          <p className="sub">
            <Link href="/orders" className="link-btn no-print">
              ← Back to orders
            </Link>{' '}
            · Created {new Date(order.createdAt).toLocaleString()} by {order.createdBy || 'unknown'}
            {order.receivedAt ? ` · Received ${new Date(order.receivedAt).toLocaleString()}` : ''}
          </p>
        </div>
        <div className="inline-form no-print">
          <button className="btn btn-ghost" onClick={() => window.print()}>
            Print
          </button>
          {order.status === 'open' && canEdit(user) && (
            <button className="btn" disabled={busy} onClick={receiveOrder}>
              Mark received
            </button>
          )}
          {canCancel && (
            <button className="btn btn-ghost" disabled={busy} onClick={cancelOrder}>
              Cancel order
            </button>
          )}
        </div>
      </div>

      <Alert>{error}</Alert>

      {order.note && (
        <section className="card">
          <strong>Note</strong>
          <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{order.note}</p>
        </section>
      )}

      <section className="card card-flush">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product ID</th>
                <th>Product</th>
                <th>Company</th>
                <th className="num">Sack</th>
                {hasSacks && <th className="num">Units</th>}
              </tr>
            </thead>
            <tbody>
              {order.items.map((i) => (
                <tr key={i.product}>
                  <td>{i.productId || <span className="muted">-</span>}</td>
                  <td>{i.name}</td>
                  <td className="muted">{i.company || '-'}</td>
                  <td className="num">
                    {i.quantity}
                    {(i.sackSize || 1) > 1 && <span className="sub-line">× {i.sackSize}</span>}
                  </td>
                  {hasSacks && <td className="num">{i.quantity * (i.sackSize || 1)}</td>}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>
                  <strong>
                    Total ({order.lineCount} {order.lineCount === 1 ? 'line' : 'lines'})
                  </strong>
                </td>
                <td className="num">
                  <strong>{order.totalSacks}</strong>
                </td>
                {hasSacks && (
                  <td className="num">
                    <strong>{order.totalUnits}</strong>
                  </td>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </>
  );
}
