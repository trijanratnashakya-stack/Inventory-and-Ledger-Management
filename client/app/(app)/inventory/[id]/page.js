'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { canEdit, money, timeAgo } from '@/lib/format';
import { useUser } from '@/components/AppShell';
import ProductForm from '@/components/ProductForm';
import { Alert, Empty, StatusPill } from '@/components/ui';

export default function ProductDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const user = useUser();
  const editable = canEdit(user);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adjust, setAdjust] = useState({ mode: 'in', amount: '', note: '' });
  const [price, setPrice] = useState({ wholesalePrice: '', retailPrice: '' });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      api(`/products/${id}`)
        .then((d) => {
          setData(d);
          setPrice({ wholesalePrice: d.product.wholesalePrice, retailPrice: d.product.retailPrice });
        })
        .catch((e) => setError(e.message)),
    [id]
  );

  useEffect(() => {
    load();
  }, [load]);

  async function submitStock(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    const n = Number(adjust.amount);
    const body =
      adjust.mode === 'set' ? { set: n, note: adjust.note } : { delta: adjust.mode === 'in' ? n : -n, note: adjust.note };
    try {
      await api(`/products/${id}/stock`, { method: 'POST', body });
      setAdjust({ ...adjust, amount: '', note: '' });
      setNotice('Stock updated.');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeProduct() {
    setBusy(true);
    setError('');
    try {
      await api(`/products/${id}`, { method: 'DELETE' });
      router.push('/inventory');
    } catch (err) {
      setError(err.message);
      setConfirmDelete(false);
      setBusy(false);
    }
  }

  async function submitPrice(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      await api(`/products/${id}/price`, { method: 'PUT', body: price });
      setNotice('Prices updated.');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!data) return error ? <Alert>{error}</Alert> : <p className="muted">Loading…</p>;
  const p = data.product;
  const amount = Number(adjust.amount);
  const hasAmount = adjust.amount !== '' && Number.isFinite(amount);
  const after = !hasAmount ? null : adjust.mode === 'set' ? amount : adjust.mode === 'in' ? p.quantity + amount : p.quantity - amount;
  const invalid = hasAmount && (after < 0 || !Number.isInteger(amount) || amount < (adjust.mode === 'set' ? 0 : 1));
  const MODES = [
    ['in', '+', 'Add', 'seg-in'],
    ['out', '−', 'Remove', 'seg-out'],
    ['set', '=', 'Set exact', ''],
  ];
  const quick = [1, 5, 10, ...(p.stackSize > 1 ? [p.stackSize] : [])];
  const submitLabel = !hasAmount ? 'Update stock' : adjust.mode === 'set' ? `Set stock to ${amount}` : adjust.mode === 'in' ? `Add ${amount} to stock` : `Remove ${amount} from stock`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {p.productId ? `${p.productId} · ` : ''}
            {p.name}
          </h1>
          <p className="sub">
            <Link href="/inventory" className="link-btn">
              ← Back to inventory
            </Link>{' '}
            · {p.category === 'gem' ? 'Gems' : p.company && p.company.name}
          </p>
        </div>
        <StatusPill status={p.status} />
      </div>

      <Alert>{error}</Alert>
      <Alert kind="ok">{notice}</Alert>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="card">
          <h2>Details</h2>
          <ProductForm key={p.updatedAt} mode="edit" initial={p} readOnly={!editable} onSaved={load} />
        </section>

        <div>
          <section className="card">
            <h2>Stock</h2>
            <div className="stock-hero">
              <span className="big">{p.quantity}</span>
              <span className="muted">units on hand</span>
              <StatusPill status={p.status} />
            </div>
            <p className="hint" style={{ marginTop: 0 }}>
              Shows as Low Stock at {p.lowStockThreshold} or fewer.{p.sackSize > 1 ? ` One sack is ${p.sackSize} units.` : ''}
            </p>
            {editable ? (
              <form onSubmit={submitStock}>
                <div className="seg" role="group" aria-label="Type of change">
                  {MODES.map(([value, icon, label, cls]) => (
                    <button key={value} type="button" className={cls} aria-pressed={adjust.mode === value} onClick={() => setAdjust({ ...adjust, mode: value })}>
                      <span aria-hidden="true">{icon}</span> {label}
                    </button>
                  ))}
                </div>
                <div className="field">
                  <label htmlFor="amount">{adjust.mode === 'set' ? 'New stock level' : 'Units'}</label>
                  <input
                    id="amount"
                    type="number"
                    min={adjust.mode === 'set' ? 0 : 1}
                    step="1"
                    required
                    placeholder={adjust.mode === 'set' ? String(p.quantity) : 'How many?'}
                    value={adjust.amount}
                    onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })}
                  />
                  {adjust.mode !== 'set' && (
                    <div className="quick-row">
                      {quick.map((n) => (
                        <button key={n} type="button" className="chip" onClick={() => setAdjust({ ...adjust, amount: String((Number(adjust.amount) || 0) + n) })}>
                          +{n}
                          {n === p.sackSize && n > 1 ? ' (1 sack)' : ''}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {hasAmount && (
                  <div className={`stock-preview${invalid ? ' bad' : ''}`}>
                    {invalid
                      ? after < 0
                        ? `Only ${p.quantity} in stock, you can't remove ${amount}.`
                        : 'Enter a whole number.'
                      : `${p.quantity} → ${after} units`}
                  </div>
                )}
                <div className="field">
                  <label htmlFor="note">Note (optional)</label>
                  <input id="note" placeholder="Delivery, sale, damaged, count correction…" value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} />
                </div>
                <button className="btn" disabled={!hasAmount || invalid}>
                  {submitLabel}
                </button>
              </form>
            ) : (
              <p className="muted">You have view-only access.</p>
            )}
          </section>

          <section className="card">
            <h2>Prices</h2>
            <form onSubmit={submitPrice}>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="ws">Wholesale (Rs.)</label>
                  <input
                    id="ws"
                    type="number"
                    min="0"
                    step="any"
                    disabled={!editable}
                    value={price.wholesalePrice}
                    onChange={(e) => setPrice({ ...price, wholesalePrice: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="rt">Retail (Rs.)</label>
                  <input
                    id="rt"
                    type="number"
                    min="0"
                    step="any"
                    disabled={!editable}
                    value={price.retailPrice}
                    onChange={(e) => setPrice({ ...price, retailPrice: e.target.value })}
                  />
                </div>
              </div>
              {editable && <button className="btn">Update prices</button>}
            </form>
          </section>
        </div>
      </div>

      <section className="card card-flush">
        <div className="card-head">
          <h2>Stock history</h2>
        </div>
        {data.movements.length === 0 ? (
          <Empty>No stock movements yet.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th className="num">Change</th>
                  <th className="num">Quantity after</th>
                  <th>By</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {data.movements.map((m) => (
                  <tr key={m._id}>
                    <td title={new Date(m.createdAt).toLocaleString()}>{timeAgo(m.createdAt)}</td>
                    <td>{m.type}</td>
                    <td className="num">{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                    <td className="num">{m.quantityAfter}</td>
                    <td>{m.user ? m.user.username : '-'}</td>
                    <td className="muted">{m.note || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card card-flush">
        <div className="card-head">
          <h2>Price history</h2>
        </div>
        {data.priceHistory.length === 0 ? (
          <Empty>No price changes recorded.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Wholesale</th>
                  <th>Retail</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {data.priceHistory.map((h) => (
                  <tr key={h._id}>
                    <td title={new Date(h.createdAt).toLocaleString()}>{timeAgo(h.createdAt)}</td>
                    <td>
                      {money(h.oldWholesale)} → {money(h.newWholesale)}
                    </td>
                    <td>
                      {money(h.oldRetail)} → {money(h.newRetail)}
                    </td>
                    <td>{h.user ? h.user.username : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {user.role === 'admin' && (
        <section className="card danger-zone">
          <h2>Delete product</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Removes this product from inventory, the price list and order suggestions. Its stock and price history is kept, and the Product ID or name can be used again.
          </p>
          {!confirmDelete ? (
            <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              Delete this product
            </button>
          ) : (
            <div className="inline-form">
              <strong>Delete {p.name}?</strong>
              <button className="btn btn-danger" disabled={busy} onClick={removeProduct}>
                {busy ? 'Deleting…' : 'Yes, delete it'}
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
