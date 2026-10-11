'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useUser } from '@/components/AppShell';
import { Alert, Empty, Pager } from '@/components/ui';
import { OrderPill } from '@/components/orderUi';

export default function OrdersPage() {
  const user = useUser();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api(`/orders?page=${page}&limit=25`)
      .then((d) => {
        if (!cancelled) {
          setResult(d);
          setError('');
        }
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [page]);

  async function deleteOrder(id, number) {
    if (!window.confirm(`Delete order ${number}? This cannot be undone.`)) return;
    setError('');
    try {
      await api(`/orders/${id}`, { method: 'DELETE' });
      setResult(r => ({ ...r, items: r.items.filter(i => i._id !== id), total: r.total - 1 }));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Orders</h1>
          <p className="sub">{result ? `${result.total} orders` : 'Loading…'}</p>
        </div>
        <Link href="/orders/new" className="btn">
          + Create Order
        </Link>
      </div>

      <Alert>{error}</Alert>

      <section className="card card-flush">
        {result && result.items.length === 0 ? (
          <Empty>No orders yet. Create the first one from the low-stock suggestions.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Created</th>
                  <th>By</th>
                  <th className="num">Lines</th>
                  <th className="num">Sacks</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(result ? result.items : []).map((o) => (
                  <tr key={o._id}>
                    <td>
                      <Link href={`/orders/${o._id}`} className="link-btn">
                        {o.number}
                      </Link>
                    </td>
                    <td title={new Date(o.createdAt).toLocaleString()}>{new Date(o.createdAt).toLocaleDateString()}</td>
                    <td className="muted">{o.createdBy || '-'}</td>
                    <td className="num">{o.lineCount}</td>
                    <td className="num">
                      {o.totalSacks ?? o.totalUnits}
                      {o.totalSacks !== undefined && o.totalUnits !== o.totalSacks && <span className="sub-line">{o.totalUnits} units</span>}
                    </td>
                    <td>
                      <OrderPill status={o.status} />
                    </td>
                    <td className="inline-form" style={{ gap: '1rem' }}>
                      <Link href={`/orders/${o._id}`} className="link-btn">
                        View
                      </Link>
                      {(user.role === 'admin' || user.role === 'manager') && (
                        <button className="btn btn-danger btn-small" onClick={() => deleteOrder(o._id, o.number)}>
                          Delete
                        </button>
                      )}
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
