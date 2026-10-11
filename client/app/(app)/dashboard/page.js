'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { Alert, Empty, StatusPill } from '@/components/ui';

const STATS = [
  { key: 'total', label: 'Total Items', icon: '▣' },
  { key: 'inStock', label: 'In Stock Items', icon: '✓' },
  { key: 'outOfStock', label: 'Out of Stock Items', icon: '✕' },
  { key: 'lowStock', label: 'Low Stock Items', icon: '!' },
];

export default function DashboardPage() {
  const [category, setCategory] = useState('gem');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api(`/dashboard?category=${category}`)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError('');
        }
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [category]);

  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
      </div>

      <div className="tabs">
        {[
          ['gem', 'Gem Items'],
          ['non_gem', 'Non-Gem Items'],
        ].map(([value, label]) => (
          <button
            key={value}
            className={`tab${category === value ? ' tab-active' : ''}`}
            onClick={() => {
              setData(null);
              setCategory(value);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <Alert>{error}</Alert>

      <div className="stats">
        {STATS.map((s) => (
          <div className="stat" key={s.key}>
            <div>
              <div className="stat-label">{s.label}</div>
              <div className="stat-value">{data ? data.counts[s.key] : '–'}</div>
            </div>
            <div className="stat-icon">{s.icon}</div>
          </div>
        ))}
      </div>

      <section className="card card-flush">
        <div className="card-head row-between">
          <div>
            <h2>Alerts</h2>
            <p className="sub">Items requiring immediate attention</p>
          </div>
          <Link href="/orders/new" className="btn btn-small">
            Create order
          </Link>
        </div>
        {data && data.alerts.length === 0 ? (
          <Empty>Nothing needs restocking right now.</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>Company</th>
                  <th className="num">Quantity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(data ? data.alerts : []).map((a) => (
                  <tr key={a.id} className={a.status === 'out' ? 'row-out' : ''}>
                    <td>
                      <Link href={`/inventory/${a.id}`} className="link-btn">
                        {a.productId ? `${a.productId} · ` : ''}
                        {a.name}
                      </Link>
                    </td>
                    <td className="muted">{a.company || '-'}</td>
                    <td className="num">{a.quantity}</td>
                    <td>
                      <StatusPill status={a.status} />
                      {a.onOrder > 0 && (
                        <>
                          {' '}
                          <span className="badge" title="Units on open orders">
                            {a.onOrder} units on order
                          </span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card card-flush">
        <div className="card-head">
          <h2>Recent Activity</h2>
          <p className="sub">Latest updates to inventory and prices</p>
        </div>
        {data && data.activity.length === 0 ? (
          <Empty>No recent changes yet.</Empty>
        ) : (
          <ul className="activity">
            {(data ? data.activity : []).map((a) => (
              <li key={`${a.kind}-${a.id}`}>
                <div>
                  <strong>{a.productId ? `${a.productId} · ` : ''}{a.product}</strong>
                  <div className="muted">{a.kind === 'price' ? 'Price updated' : 'Stock updated'} — {a.detail}</div>
                </div>
                <small>{timeAgo(a.at)}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
