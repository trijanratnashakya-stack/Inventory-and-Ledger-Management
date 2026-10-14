'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useDebounce } from '@/lib/hooks';
import { canEdit, CATEGORY_LABEL } from '@/lib/format';
import { useUser } from '@/components/AppShell';
import { Alert, Empty, Pager, StatusPill } from '@/components/ui';

const STATUSES = [
  ['', 'All Status'],
  ['in', 'In Stock'],
  ['low', 'Low Stock'],
  ['out', 'Out of Stock'],
];

function QuantityCell({ p, editable, onUpdate }) {
  const [val, setVal] = useState(String(p.quantity));
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null); // 'success' | 'error' | null
  const prevQtyRef = useRef(p.quantity);
  const debounceTimerRef = useRef(null);

  useEffect(() => {
    setVal(String(p.quantity));
    prevQtyRef.current = p.quantity;
  }, [p.quantity]);

  const commitChange = async (newQtyNum) => {
    if (newQtyNum === p.quantity) {
      setVal(String(p.quantity));
      return;
    }
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await api(`/products/${p._id}/stock`, {
        method: 'POST',
        body: { set: newQtyNum },
      });
      prevQtyRef.current = res.quantity;
      setVal(String(res.quantity));
      setSaving(false);
      setStatusMsg('success');
      setTimeout(() => setStatusMsg(null), 2000);
      onUpdate(p._id, res.quantity, res.status);
    } catch (err) {
      setVal(String(prevQtyRef.current));
      setSaving(false);
      setStatusMsg('error');
      setTimeout(() => setStatusMsg(null), 3000);
    }
  };

  const handleBlur = () => {
    const trimmed = val.trim();
    if (trimmed === '' || !/^\d+$/.test(trimmed)) {
      setVal(String(prevQtyRef.current));
      return;
    }
    const num = parseInt(trimmed, 10);
    if (num > 999999) {
      setVal(String(prevQtyRef.current));
      return;
    }
    commitChange(num);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    } else if (e.key === 'Escape') {
      setVal(String(prevQtyRef.current));
      e.target.blur();
    }
  };

  const handleChange = (e) => {
    let raw = e.target.value;
    // Strip invalid characters: letters, decimals, e, negative signs
    raw = raw.replace(/[^\d]/g, '');
    if (raw !== '' && parseInt(raw, 10) > 999999) {
      raw = '999999';
    }
    setVal(raw);
  };

  if (!editable) {
    return <span className="num"><strong>{p.quantity}</strong></span>;
  }

  return (
    <td className="num">
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end', opacity: saving ? 0.6 : 1 }}>
        <button
          type="button"
          className="btn btn-ghost btn-small"
          aria-label={`Remove one ${p.name}`}
          disabled={p.quantity <= 0 || saving}
          onClick={() => onUpdate(p._id, p.quantity - 1, null, -1)}
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          aria-label={`Quantity for ${p.name} (${p.productId || 'ID ' + p._id})`}
          value={val}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onFocus={(e) => e.target.select()}
          disabled={saving}
          style={{
            width: '64px',
            textAlign: 'center',
            fontWeight: 'bold',
            border: '1px solid transparent',
            background: 'transparent',
            padding: '2px 4px',
            borderRadius: '6px',
            transition: 'border-color 0.2s, background 0.2s',
          }}
          onMouseEnter={(e) => {
            if (document.activeElement !== e.target) {
              e.target.style.borderColor = '#d1d5db';
              e.target.style.background = '#fff';
            }
          }}
          onMouseLeave={(e) => {
            if (document.activeElement !== e.target) {
              e.target.style.borderColor = 'transparent';
              e.target.style.background = 'transparent';
            }
          }}
        />
        <button
          type="button"
          className="btn btn-ghost btn-small"
          aria-label={`Add one ${p.name}`}
          disabled={saving}
          onClick={() => onUpdate(p._id, p.quantity + 1, null, 1)}
        >
          +
        </button>
        {statusMsg === 'success' && <span title="Saved" style={{ color: 'var(--green)', fontSize: '12px', fontWeight: 'bold' }}>✓</span>}
        {statusMsg === 'error' && <span title="Failed to save" style={{ color: 'var(--red)', fontSize: '12px', fontWeight: 'bold' }}>✕</span>}
      </div>
    </td>
  );
}

export default function InventoryPage() {
  const user = useUser();
  const editable = canEdit(user);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [company, setCompany] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('');
  const [page, setPage] = useState(1);
  const [companies, setCompanies] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const dq = useDebounce(q);

  // Track pending adjustments for rapid button clicks / debouncing
  const pendingAdjustmentsRef = useRef(new Map()); // productId -> { deltaSum, timer }

  useEffect(() => {
    api('/companies').then((d) => setCompanies(d.companies)).catch(() => {});
  }, []);

  // Any filter change goes back to page 1.
  const filter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const load = useCallback(() => {
    const params = new URLSearchParams({ page, limit: 25 });
    if (dq) params.set('q', dq);
    if (category) params.set('category', category);
    if (company) params.set('company', company);
    if (status) params.set('status', status);
    if (sort) params.set('sort', sort);
    return api(`/products?${params}`)
      .then((d) => {
        setResult(d);
        setError('');
      })
      .catch((e) => setError(e.message));
  }, [dq, category, company, status, sort, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Compute derived status based on quantity and threshold (matches server stockStatus)
  const computeStatus = (qty, threshold) => {
    if (qty <= 0) return 'out';
    if (qty <= threshold) return 'low';
    return 'in';
  };

  const handleProductUpdate = (id, newQty, newStatus, delta = null) => {
    if (!result) return;

    // Update local result items immediately for instant UI feedback without page reload
    const updatedItems = result.items.map((p) => {
      if (p._id === id) {
        const qty = delta !== null ? p.quantity + delta : newQty;
        const stat = newStatus || computeStatus(qty, p.lowStockThreshold);
        return { ...p, quantity: qty, status: stat };
      }
      return p;
    });

    // If status filter is active, check if item still matches filter
    let filteredItems = updatedItems;
    if (status) {
      filteredItems = updatedItems.filter((p) => p.status === status);
    }

    setResult({
      ...result,
      items: filteredItems,
    });

    if (delta !== null) {
      // Debounce delta requests for rapid + / - button clicks
      const existing = pendingAdjustmentsRef.current.get(id);
      if (existing) {
        existing.deltaSum += delta;
        clearTimeout(existing.timer);
      } else {
        pendingAdjustmentsRef.current.set(id, { deltaSum: delta, timer: null });
      }

      const entry = pendingAdjustmentsRef.current.get(id);
      entry.timer = setTimeout(async () => {
        const sum = entry.deltaSum;
        pendingAdjustmentsRef.current.delete(id);
        try {
          const res = await api(`/products/${id}/stock`, { method: 'POST', body: { delta: sum } });
          // Re-sync with server response
          setResult((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              items: prev.items.map((p) => (p._id === id ? { ...p, quantity: res.quantity, status: res.status } : p)),
            };
          });
        } catch (e) {
          setError(e.message);
          load(); // reload on error to restore correct state
        }
      }, 400);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Inventory Management</h1>
          <p className="sub">{result ? `${result.total} products` : 'Loading…'}</p>
        </div>
        {editable && (
          <div className="inline-form">
            <Link href="/inventory/import" className="btn btn-ghost">
              Import CSV
            </Link>
            <Link href="/inventory/new" className="btn">
              + Add Product
            </Link>
          </div>
        )}
      </div>

      <section className="card">
        <div className="filters" style={category === 'gem' ? { gridTemplateColumns: '2fr 1fr' } : undefined}>
          <div>
            <label htmlFor="search">Search</label>
            <input
              id="search"
              type="search"
              placeholder="Search by Product ID or Name"
              value={q}
              onChange={(e) => filter(setQ)(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="type">Product Type</label>
            <select
              id="type"
              value={category}
              onChange={(e) => {
                // Gem items have no company, so a company filter left over from Non-Gem must not linger.
                if (e.target.value === 'gem') setCompany('');
                filter(setCategory)(e.target.value);
              }}
            >
              <option value="">All types</option>
              <option value="gem">Gem</option>
              <option value="non_gem">Non-Gem</option>
            </select>
          </div>
          {category !== 'gem' && (
            <div>
              <label htmlFor="company">Company</label>
              <select id="company" value={company} onChange={(e) => filter(setCompany)(e.target.value)}>
                <option value="">All companies</option>
                {companies.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="chips" role="group" aria-label="Stock status">
          {STATUSES.map(([value, label]) => (
            <button
              key={value}
              className={`chip${status === value ? ' chip-active' : ''}`}
              onClick={() => filter(setStatus)(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <Alert>{error}</Alert>

      <section className="card card-flush">
        {result && result.items.length === 0 ? (
          <Empty>No products match these filters.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product ID</th>
                  <th>
                    <button className="link-btn" onClick={() => filter(setSort)(sort === 'name' ? '-name' : 'name')}>
                      Product Name {sort === 'name' ? '↑' : sort === '-name' ? '↓' : ''}
                    </button>
                  </th>
                  <th>Type</th>
                  <th>Company</th>
                  <th className="num">
                    <button className="link-btn" onClick={() => filter(setSort)(sort === 'quantity' ? '-quantity' : 'quantity')}>
                      Quantity {sort === 'quantity' ? '↑' : sort === '-quantity' ? '↓' : ''}
                    </button>
                  </th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(result ? result.items : []).map((p) => (
                  <tr key={p._id} className={p.status === 'out' ? 'row-out' : ''}>
                    <td>{p.productId || <span className="muted">-</span>}</td>
                    <td>{p.name}</td>
                    <td className="muted">{CATEGORY_LABEL[p.category]}</td>
                    <td className="muted">{p.category === 'gem' ? 'Gems' : p.company ? p.company.name : '-'}</td>
                    <QuantityCell p={p} editable={editable} onUpdate={handleProductUpdate} />
                    <td>
                      <StatusPill status={p.status} />
                    </td>
                    <td>
                      <Link href={`/inventory/${p._id}`} className="link-btn">
                        {editable ? 'Edit' : 'View'}
                      </Link>
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
