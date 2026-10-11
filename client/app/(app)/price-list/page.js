'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useDebounce } from '@/lib/hooks';
import { BRAND, canEdit, money } from '@/lib/format';
import { useSettings, useUser } from '@/components/AppShell';
import { Alert, Empty } from '@/components/ui';

function PriceRow({ item, editable, showId, onSaved, onError }) {
  const [editing, setEditing] = useState(false);
  const [vals, setVals] = useState({ wholesalePrice: item.wholesalePrice, retailPrice: item.retailPrice });

  async function save() {
    try {
      await api(`/products/${item.id}/price`, { method: 'PUT', body: vals });
      setEditing(false);
      onSaved();
    } catch (e) {
      onError(e.message);
    }
  }

  return (
    <tr>
      {showId && <td>{item.productId || <span className="muted">-</span>}</td>}
      <td>{item.name}</td>
      <td className="muted">{item.company}</td>
      {editing ? (
        <>
          <td className="num">
            <input
              aria-label={`Wholesale price for ${item.name}`}
              type="number"
              min="0"
              step="any"
              style={{ width: 110 }}
              value={vals.wholesalePrice}
              onChange={(e) => setVals({ ...vals, wholesalePrice: e.target.value })}
            />
          </td>
          <td className="num">
            <input
              aria-label={`Retail price for ${item.name}`}
              type="number"
              min="0"
              step="any"
              style={{ width: 110 }}
              value={vals.retailPrice}
              onChange={(e) => setVals({ ...vals, retailPrice: e.target.value })}
            />
          </td>
          <td>
            <button className="btn btn-small" onClick={save}>
              Save
            </button>{' '}
            <button className="btn btn-ghost btn-small" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </td>
        </>
      ) : (
        <>
          <td className="num">{money(item.wholesalePrice)}</td>
          <td className="num">{money(item.retailPrice)}</td>
          <td>
            {editable && (
              <button className="link-btn" onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
          </td>
        </>
      )}
    </tr>
  );
}

export default function PriceListPage() {
  const user = useUser();
  const { settings } = useSettings();
  const editable = canEdit(user);
  const [category, setCategory] = useState('non_gem');
  const [company, setCompany] = useState('');
  const [q, setQ] = useState('');
  const [companies, setCompanies] = useState([]);
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState('');
  const dq = useDebounce(q);
  const isGem = category === 'gem';

  useEffect(() => {
    api('/companies').then((d) => setCompanies(d.companies)).catch(() => {});
  }, []);

  const load = useCallback(() => {
    const params = new URLSearchParams({ category });
    if (!isGem && company) params.set('company', company);
    if (dq) params.set('q', dq);
    return api(`/prices?${params}`)
      .then((d) => {
        setGroups(d.groups);
        setError('');
      })
      .catch((e) => setError(e.message));
  }, [category, company, dq, isGem]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className="print-only">
        <strong>{settings.companyName || BRAND}</strong>
        <div>{[settings.address, settings.phone, settings.panNumber && `PAN ${settings.panNumber}`].filter(Boolean).join(' · ')}</div>
        <div>Price list</div>
      </div>
      <div className="page-head">
        <div>
          <h1>Price List</h1>
          <p className="sub">Wholesale and retail prices{isGem ? ' for Gem items' : ', grouped by company'}</p>
        </div>
        <button className="btn btn-ghost no-print" onClick={() => window.print()}>
          Print price list
        </button>
      </div>

      <div className="tabs no-print">
        {[
          ['gem', 'Gem Items'],
          ['non_gem', 'Non-Gem Items'],
        ].map(([value, label]) => (
          <button
            key={value}
            className={`tab${category === value ? ' tab-active' : ''}`}
            onClick={() => {
              setGroups(null);
              setCompany('');
              setCategory(value);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="card no-print">
        <div className="filters" style={{ gridTemplateColumns: isGem ? '1fr' : '2fr 1fr' }}>
          <div>
            <label htmlFor="q">Search</label>
            <input id="q" type="search" placeholder="Search by Product ID or Name" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {!isGem && (
            <div>
              <label htmlFor="company">Company</label>
              <select id="company" value={company} onChange={(e) => setCompany(e.target.value)}>
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
      </section>

      <Alert>{error}</Alert>

      {groups && groups.length === 0 && (
        <section className="card">
          <Empty>No prices match your search.</Empty>
        </section>
      )}

      {(groups || []).map((g) => (
        <section className="card card-flush" key={g.key}>
          <div className="card-head">
            <h2 className="group-title">{g.isLocal ? g.title : `${g.title} Items`}</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {isGem && <th>Product ID</th>}
                  <th>Product Name</th>
                  <th>Company</th>
                  <th className="num">Wholesale Price</th>
                  <th className="num">Retail Price</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {g.items.map((item) => (
                  <PriceRow key={item.id} item={item} editable={editable} showId={isGem} onSaved={load} onError={setError} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
