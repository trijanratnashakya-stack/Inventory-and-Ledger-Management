'use client';
import { useCallback, useEffect, useState } from 'react';
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

  async function adjust(id, delta) {
    try {
      await api(`/products/${id}/stock`, { method: 'POST', body: { delta } });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

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
                    <td className="num">
                      {editable && (
                        <button
                          className="btn btn-ghost btn-small"
                          aria-label={`Remove one ${p.name}`}
                          disabled={p.quantity <= 0}
                          onClick={() => adjust(p._id, -1)}
                        >
                          −
                        </button>
                      )}{' '}
                      <strong>{p.quantity}</strong>{' '}
                      {editable && (
                        <button className="btn btn-ghost btn-small" aria-label={`Add one ${p.name}`} onClick={() => adjust(p._id, 1)}>
                          +
                        </button>
                      )}
                    </td>
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
