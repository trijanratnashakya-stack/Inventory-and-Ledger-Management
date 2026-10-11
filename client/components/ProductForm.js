'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Alert } from '@/components/ui';
import { useSettings } from '@/components/AppShell';

// Shared by "Add Product" and the details section of "Edit Product".
// mode="create" also collects quantity and prices; mode="edit" leaves those
// to the stock and price sections so every change is audited.
export default function ProductForm({ mode, initial, onSaved, readOnly = false }) {
  const { settings } = useSettings();
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState({
    category: 'gem',
    productId: '',
    name: '',
    quantity: 0,
    lowStockThreshold: settings.defaultLowStock ?? 12,
    sackSize: 1,
    wholesalePrice: '',
    retailPrice: '',
    ...(initial || {}),
    // The API returns a populated company object; the form needs just its id.
    company: (initial && initial.company && (initial.company._id || initial.company)) || '',
  });
  const [newCompany, setNewCompany] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  useEffect(() => {
    api('/companies').then((d) => setCompanies(d.companies)).catch(() => {});
  }, []);

  const isGem = form.category === 'gem';
  const locked = readOnly;

  async function addCompany() {
    if (!newCompany.trim()) return;
    try {
      const { company } = await api('/companies', { method: 'POST', body: { name: newCompany } });
      setCompanies((c) => [...c, company]);
      setForm((f) => ({ ...f, company: company._id }));
      setNewCompany('');
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      category: form.category,
      productId: form.productId,
      name: form.name,
      company: isGem ? null : form.company,
      lowStockThreshold: form.lowStockThreshold,
      sackSize: form.sackSize === '' ? 1 : form.sackSize,
    };
    if (mode === 'create') {
      body.quantity = form.quantity;
      body.wholesalePrice = form.wholesalePrice || 0;
      body.retailPrice = form.retailPrice || 0;
    }
    try {
      const path = mode === 'create' ? '/products' : `/products/${initial._id}`;
      const { product } = await api(path, { method: mode === 'create' ? 'POST' : 'PUT', body });
      setSaved(true);
      onSaved && onSaved(product);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Alert>{error}</Alert>
      <Alert kind="ok">{saved ? 'Saved.' : ''}</Alert>

      {mode === 'create' && (
        <div className="field">
          <label>Category</label>
          <div className="radio-row">
            {[
              ['gem', 'Gem item'],
              ['non_gem', 'Non-Gem item'],
            ].map(([value, label]) => (
              <label key={value} className={`radio-card${form.category === value ? ' radio-card-active' : ''}`}>
                <input
                  type="radio"
                  name="category"
                  value={value}
                  checked={form.category === value}
                  onChange={set('category')}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="field">
          <label htmlFor="pid">Product ID {isGem ? '' : '(optional)'}</label>
          <input id="pid" required={isGem} disabled={locked} value={form.productId || ''} onChange={set('productId')} />
          <div className="hint">{isGem ? 'Required and unique across all products.' : 'Leave blank if this item is identified by name.'}</div>
        </div>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" required disabled={locked} value={form.name} onChange={set('name')} />
        </div>
      </div>

      {!isGem && (
        <div className="field">
          <label htmlFor="company">Company</label>
          <select id="company" required disabled={locked} value={form.company || ''} onChange={set('company')}>
            <option value="">Select a company…</option>
            {companies.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
          {!locked && (
            <div className="inline-form" style={{ marginTop: 8 }}>
              <input
                style={{ width: 220 }}
                placeholder="New company name"
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
              />
              <button type="button" className="btn btn-ghost btn-small" onClick={addCompany}>
                Add company
              </button>
            </div>
          )}
        </div>
      )}

      {mode === 'create' && (
        <>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="qty">Starting quantity</label>
              <input id="qty" type="number" min="0" step="1" value={form.quantity} onChange={set('quantity')} />
            </div>
            <div className="field">
              <label htmlFor="low">Low-stock threshold</label>
              <input id="low" type="number" min="0" step="1" value={form.lowStockThreshold} onChange={set('lowStockThreshold')} />
              <div className="hint">At or below this quantity the item shows as Low Stock.</div>
            </div>
          </div>
          <div className="field" style={{ maxWidth: 360 }}>
            <label htmlFor="sack">Units per sack</label>
            <input id="sack" type="number" min="1" step="1" value={form.sackSize} onChange={set('sackSize')} />
            <div className="hint">Orders are placed in sacks. Receiving an order adds sacks × this number to stock. Use 1 if you count in single units.</div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="ws">Wholesale price (Rs.)</label>
              <input id="ws" type="number" min="0" step="any" value={form.wholesalePrice} onChange={set('wholesalePrice')} />
            </div>
            <div className="field">
              <label htmlFor="rt">Retail price (Rs.)</label>
              <input id="rt" type="number" min="0" step="any" value={form.retailPrice} onChange={set('retailPrice')} />
            </div>
          </div>
        </>
      )}

      {mode === 'edit' && (
        <div className="grid-2">
          <div className="field">
            <label htmlFor="low">Low-stock threshold</label>
            <input id="low" type="number" min="0" step="1" disabled={locked} value={form.lowStockThreshold} onChange={set('lowStockThreshold')} />
          </div>
          <div className="field">
            <label htmlFor="sack">Units per sack</label>
            <input id="sack" type="number" min="1" step="1" disabled={locked} value={form.sackSize} onChange={set('sackSize')} />
            <div className="hint">Orders are placed in sacks. Receiving an order adds sacks × this number to stock.</div>
          </div>
        </div>
      )}

      {!locked && (
        <button className="btn" disabled={busy}>
          {busy ? 'Saving…' : mode === 'create' ? 'Save Product' : 'Save Changes'}
        </button>
      )}
    </form>
  );
}
