'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useDebounce } from '@/lib/hooks';
import { Alert, Empty, StatusPill } from '@/components/ui';

// The draft survives a refresh or an accidental tab close, and is cleared once
// the order is placed.
const DRAFT_KEY = 'inventory-order-draft-v1';
const EMPTY_DRAFT = { items: [], note: '' };

function loadDraft() {
  if (typeof window === 'undefined') return EMPTY_DRAFT;
  try {
    const d = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null');
    if (d && Array.isArray(d.items)) {
      return {
        items: d.items.filter((i) => i && i.product && i.name),
        note: typeof d.note === 'string' ? d.note : '',
      };
    }
  } catch {
    // ignore a corrupt draft
  }
  return EMPTY_DRAFT;
}

const label = (x) => `${x.productId ? `${x.productId} · ` : ''}${x.name}`;

function fromSuggestion(s) {
  return {
    product: s.id,
    productId: s.productId,
    name: s.name,
    company: s.company,
    stock: s.quantity,
    sackSize: s.sackSize || s.stackSize || 1,
    quantity: s.suggestedQuantity,
  };
}

function fromProduct(p) {
  return {
    product: p._id,
    productId: p.productId,
    name: p.name,
    company: p.category === 'gem' ? 'Gems' : p.company ? p.company.name : '',
    stock: p.quantity,
    sackSize: p.sackSize || p.stackSize || 1,
    // Same rule the server uses for suggestions: top up to twice the low-stock level, in whole sacks.
    quantity: Math.max(Math.ceil(Math.max(p.lowStockThreshold * 2 - p.quantity, 1) / (p.sackSize || p.stackSize || 1)), 1),
  };
}

export default function NewOrderPage() {
  const router = useRouter();
  const [initial] = useState(loadDraft);
  const [items, setItems] = useState(initial.items);
  const [note, setNote] = useState(initial.note);
  const [suggestions, setSuggestions] = useState(null);
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dq = useDebounce(q);

  useEffect(() => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ items, note }));
    } catch {
      // storage unavailable, the draft just won't persist
    }
  }, [items, note]);

  useEffect(() => {
    let cancelled = false;
    api('/orders/suggestions?limit=30')
      .then((d) => !cancelled && setSuggestions(d.suggestions))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!dq.trim()) return undefined;
    let cancelled = false;
    api(`/products?q=${encodeURIComponent(dq.trim())}&limit=8`)
      .then((d) => !cancelled && setResults(d.items))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [dq]);

  const inList = useMemo(() => new Set(items.map((i) => i.product)), [items]);
  const visible = (suggestions || []).filter((s) => !filter || s.category === filter);
  // Items already on an open order are skipped by "Add all" so nothing is ordered twice by accident.
  const eligible = visible.filter((s) => !inList.has(s.id) && s.onOrder === 0);
  const stacks = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
  const units = items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (i.stackSize || 1), 0);
  const hasSacks = items.some((i) => (i.sackSize || 1) > 1);

  const addItem = (entry) => setItems((prev) => (prev.some((i) => i.product === entry.product) ? prev : [...prev, entry]));
  const addAll = () => setItems((prev) => [...prev, ...eligible.map(fromSuggestion)]);
  const setQty = (product, quantity) => setItems((prev) => prev.map((i) => (i.product === product ? { ...i, quantity } : i)));
  const remove = (product) => setItems((prev) => prev.filter((i) => i.product !== product));
  const clear = () => {
    setItems([]);
    setNote('');
  };

  async function submit(e) {
    e.preventDefault();
    setError('');
    for (const i of items) {
      const n = Number(i.quantity);
      if (!Number.isInteger(n) || n < 1) return setError(`Enter a whole number of stacks, 1 or more, for ${label(i)}`);
    }
    setBusy(true);
    try {
      const { order } = await api('/orders', {
        method: 'POST',
        body: { note: note.trim() || undefined, items: items.map((i) => ({ product: i.product, quantity: Number(i.quantity) })) },
      });
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }
      router.push(`/orders/${order._id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const showResults = q.trim().length > 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Create Order</h1>
          <p className="sub">Build a restock list from the low-stock suggestions, or search for any product.</p>
        </div>
        <Link href="/orders" className="btn btn-ghost">
          View orders
        </Link>
      </div>

      <Alert>{error}</Alert>

      <div className="order-layout">
        <div>
          <section className="card">
            <h2>Add a product</h2>
            <input
              type="search"
              aria-label="Search products to add"
              placeholder="Search by Product ID or Name"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {showResults && (
              <ul className="result-list">
                {results.map((p) => (
                  <li key={p._id}>
                    <div>
                      <strong>{label(p)}</strong>
                      <div className="muted">
                        {p.category === 'gem' ? 'Gems' : p.company ? p.company.name : '-'} · {p.quantity} in stock
                      </div>
                    </div>
                    <button type="button" className="btn btn-small" disabled={inList.has(p._id)} onClick={() => addItem(fromProduct(p))}>
                      {inList.has(p._id) ? 'Added' : 'Add'}
                    </button>
                  </li>
                ))}
                {results.length === 0 && dq.trim() === q.trim() && <li className="muted">No products found.</li>}
              </ul>
            )}
          </section>

          <form className="card card-flush" onSubmit={submit}>
            <div className="card-head row-between">
              <h2>Order list ({items.length})</h2>
              {items.length > 0 && (
                <button type="button" className="link-btn" onClick={clear}>
                  Clear list
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <Empty>Your order list is empty. Add items from the suggestions or the search above.</Empty>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Company</th>
                      <th className="num">In stock</th>
                      <th className="num">Sack</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.product}>
                        <td>{label(i)}</td>
                        <td className="muted">{i.company || '-'}</td>
                        <td className="num">{i.stock ?? '-'}</td>
                        <td className="num">
                          <input
                            className="qty-input"
                            type="number"
                            min="1"
                            step="1"
                            required
                            aria-label={`Sacks to order for ${i.name}`}
                            value={i.quantity}
                            onChange={(e) => setQty(i.product, e.target.value)}
                          />
                          {(i.sackSize || 1) > 1 && (
                            <span className="sub-line">
                              {i.sackSize} each = {(Number(i.quantity) || 0) * i.sackSize} units
                            </span>
                          )}
                        </td>
                        <td>
                          <button type="button" className="link-btn" aria-label={`Remove ${i.name}`} onClick={() => remove(i.product)}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="order-foot">
              <div>
                <label htmlFor="note">Note (optional)</label>
                <textarea id="note" rows={2} maxLength={500} placeholder="Supplier, delivery date, anything the buyer should know" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <div className="order-total">
                <span>
                  {items.length} {items.length === 1 ? 'line' : 'lines'}
                </span>
                <span>
                  {stacks} {stacks === 1 ? 'sack' : 'sacks'}
                  {hasSacks ? ` (${units} units)` : ''}
                </span>
              </div>
              <button className="btn" disabled={busy || items.length === 0}>
                {busy ? 'Placing order…' : 'Place order'}
              </button>
            </div>
          </form>
        </div>

        <aside>
          <section className="card card-flush">
            <div className="card-head">
              <h2>Suggested to reorder</h2>
              <p className="sub">Lowest stock first, the same items as your dashboard alerts. The suggested quantity tops stock up to twice the low-stock level.</p>
              <div className="chips" role="group" aria-label="Filter suggestions">
                {[
                  ['', 'All'],
                  ['gem', 'Gem'],
                  ['non_gem', 'Non-Gem'],
                ].map(([value, text]) => (
                  <button key={value} type="button" className={`chip${filter === value ? ' chip-active' : ''}`} onClick={() => setFilter(value)}>
                    {text}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <button type="button" className="btn btn-small" disabled={eligible.length === 0} onClick={addAll} title="Items already on an open order are skipped">
                  Add all ({eligible.length})
                </button>
              </div>
            </div>

            {suggestions === null ? (
              <p className="muted pad">Loading suggestions…</p>
            ) : visible.length === 0 ? (
              <Empty>Nothing is low on stock right now.</Empty>
            ) : (
              <ul className="suggest-list">
                {visible.map((s) => (
                  <li key={s.id} className="suggest-row">
                    <div>
                      <strong>{label(s)}</strong>
                      <div className="muted">
                        {s.company || '-'} · {s.quantity} in stock
                      </div>
                      <div className="suggest-tags">
                        <StatusPill status={s.status} />
                        {s.onOrder > 0 && <span className="badge">{s.onOrder} units already on order</span>}
                      </div>
                    </div>
                    <div className="suggest-side">
                      <span className="muted">
                        Suggest {s.suggestedQuantity} {s.suggestedQuantity === 1 ? 'sack' : 'sacks'}
                      </span>
                      <button type="button" className="btn btn-small" disabled={inList.has(s.id)} onClick={() => addItem(fromSuggestion(s))}>
                        {inList.has(s.id) ? 'Added' : 'Add'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
