'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useDebounce } from '@/lib/hooks';
import { money } from '@/lib/format';
import { bsToAd, longBs, todayBs } from '@/lib/bs';
import { Alert, Empty } from '@/components/ui';

const DRAFT_KEY = 'inventory-sale-draft-v1';
const EMPTY_DRAFT = {
  customerId: '',
  customerName: '',
  customerPhone: '',
  customerAddress: '',
  customerPan: '',
  bsDate: '',
  paymentType: 'cash',
  paidAmount: '',
  discountPercent: 0,
  items: [],
  note: '',
};

function loadDraft() {
  if (typeof window === 'undefined') return { ...EMPTY_DRAFT, bsDate: todayBs() };
  try {
    const d = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null');
    if (d && Array.isArray(d.items)) {
      return {
        ...EMPTY_DRAFT,
        ...d,
        bsDate: d.bsDate || todayBs(),
      };
    }
  } catch {
    // ignore
  }
  return { ...EMPTY_DRAFT, bsDate: todayBs() };
}

const label = (x) => `${x.productId ? `${x.productId} · ` : ''}${x.name}`;

export default function NewSalePage() {
  const router = useRouter();
  const [initial] = useState(loadDraft);
  const [customers, setCustomers] = useState([]);
  const [isWalkIn, setIsWalkIn] = useState(!initial.customerId);
  const [customerId, setCustomerId] = useState(initial.customerId || '');
  const [customerName, setCustomerName] = useState(initial.customerName || '');
  const [customerPhone, setCustomerPhone] = useState(initial.customerPhone || '');
  const [customerAddress, setCustomerAddress] = useState(initial.customerAddress || '');
  const [customerPan, setCustomerPan] = useState(initial.customerPan || '');
  const [bsDate, setBsDate] = useState(initial.bsDate || todayBs());
  const [paymentType, setPaymentType] = useState(initial.paymentType || 'cash');
  const [paidAmount, setPaidAmount] = useState(initial.paidAmount || '');
  const [discountPercent, setDiscountPercent] = useState(initial.discountPercent ?? 0);
  const [items, setItems] = useState(initial.items || []);
  const [note, setNote] = useState(initial.note || '');

  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dq = useDebounce(q);

  // Load customer parties
  useEffect(() => {
    let cancelled = false;
    api('/parties?type=customer')
      .then((d) => {
        if (!cancelled) setCustomers(d.items || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Product search
  useEffect(() => {
    if (!dq.trim()) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    api(`/products?q=${encodeURIComponent(dq.trim())}&limit=8`)
      .then((d) => !cancelled && setResults(d.items || []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [dq]);

  // Persist draft
  useEffect(() => {
    try {
      window.localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          customerId,
          customerName,
          customerPhone,
          customerAddress,
          customerPan,
          bsDate,
          paymentType,
          paidAmount,
          discountPercent,
          items,
          note,
        })
      );
    } catch {
      // storage unavailable
    }
  }, [customerId, customerName, customerPhone, customerAddress, customerPan, bsDate, paymentType, paidAmount, discountPercent, items, note]);

  // Handle customer selection
  function onSelectCustomer(id) {
    setCustomerId(id);
    if (!id) {
      setIsWalkIn(true);
      return;
    }
    setIsWalkIn(false);
    const selected = customers.find((c) => c._id === id);
    if (selected) {
      setCustomerName(selected.name);
      setCustomerPhone(selected.phone || '');
      setCustomerAddress(selected.address || '');
      setCustomerPan(selected.panNumber || '');
      setDiscountPercent(selected.discountPercent || 0);
    }
  }

  function toggleWalkIn(val) {
    setIsWalkIn(val);
    if (val) {
      setCustomerId('');
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      setCustomerPan('');
      setDiscountPercent(0);
      if (paymentType === 'credit') setPaymentType('cash');
    }
  }

  const inList = useMemo(() => new Set(items.map((i) => i.product)), [items]);

  function addProduct(p) {
    if (inList.has(p._id)) return;
    const price = p.retailPrice || p.wholesalePrice || 0;
    const newItem = {
      product: p._id,
      productId: p.productId,
      name: p.name,
      company: p.category === 'gem' ? 'Gems' : p.company ? p.company.name : '',
      stock: p.quantity,
      retailPrice: p.retailPrice || 0,
      wholesalePrice: p.wholesalePrice || 0,
      priceType: 'retail',
      unitPrice: price,
      quantity: 1,
    };
    setItems((prev) => [...prev, newItem]);
    setQ('');
  }

  function updateItem(productId, field, value) {
    setItems((prev) =>
      prev.map((i) => {
        if (i.product !== productId) return i;
        const updated = { ...i, [field]: value };
        if (field === 'priceType') {
          if (value === 'retail') updated.unitPrice = i.retailPrice;
          else if (value === 'wholesale') updated.unitPrice = i.wholesalePrice;
        }
        return updated;
      })
    );
  }

  function removeItem(productId) {
    setItems((prev) => prev.filter((i) => i.product !== productId));
  }

  function clearItems() {
    setItems([]);
  }

  // Calculations
  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0),
    [items]
  );
  const discountAmt = useMemo(
    () => Math.round((subtotal * ((Number(discountPercent) || 0) / 100) + Number.EPSILON) * 100) / 100,
    [subtotal, discountPercent]
  );
  const grandTotal = Math.max(0, subtotal - discountAmt);
  const totalUnits = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

  async function submit(e) {
    e.preventDefault();
    setError('');

    if (items.length === 0) {
      return setError('Add at least one product to the sale');
    }

    const adDate = bsToAd(bsDate);
    if (!adDate) {
      return setError('Enter a valid Bikram Sambat date as YYYY-MM-DD (e.g. 2083-06-19)');
    }

    const finalName = isWalkIn ? customerName.trim() || 'Walk-in Customer' : customerName;
    if (!finalName) {
      return setError('Please provide a customer name');
    }

    if (paymentType === 'credit' && isWalkIn) {
      return setError('Credit sales require a registered customer account. Select a customer from the list.');
    }

    for (const i of items) {
      const qNum = Number(i.quantity);
      if (!Number.isInteger(qNum) || qNum < 1) {
        return setError(`Enter a valid whole quantity (1 or more) for ${label(i)}`);
      }
      if (i.stock < qNum) {
        return setError(`Not enough stock for ${i.name}. Available: ${i.stock}, Requested: ${qNum}`);
      }
    }

    setBusy(true);
    try {
      const payload = {
        date: adDate,
        customerId: isWalkIn ? undefined : customerId || undefined,
        customerName: finalName,
        customerPhone: customerPhone.trim() || undefined,
        customerAddress: customerAddress.trim() || undefined,
        customerPan: customerPan.trim() || undefined,
        discountPercent: Number(discountPercent) || 0,
        paymentType,
        paidAmount: paymentType === 'partial' ? Number(paidAmount) || 0 : undefined,
        note: note.trim() || undefined,
        items: items.map((i) => ({
          product: i.product,
          quantity: Number(i.quantity),
          priceType: i.priceType,
          unitPrice: Number(i.unitPrice),
        })),
      };

      const { sale } = await api('/sales', {
        method: 'POST',
        body: payload,
      });

      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }

      router.push(`/sales/${sale._id}`);
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
          <h1>New Sale</h1>
          <p className="sub">Record a sale, deduct inventory, and post to customer ledger if on credit.</p>
        </div>
        <Link href="/sales" className="btn btn-ghost">
          View sales
        </Link>
      </div>

      <Alert>{error}</Alert>

      <form onSubmit={submit}>
        <div className="order-layout">
          <div>
            {/* Customer & Date Info */}
            <section className="card">
              <h2>Customer & Date</h2>
              <div className="radio-row" style={{ marginBottom: 16 }}>
                <label className={`radio-card${isWalkIn ? ' radio-card-active' : ''}`}>
                  <input
                    type="radio"
                    name="cust-type"
                    checked={isWalkIn}
                    onChange={() => toggleWalkIn(true)}
                  />
                  Walk-in / Cash Customer
                </label>
                <label className={`radio-card${!isWalkIn ? ' radio-card-active' : ''}`}>
                  <input
                    type="radio"
                    name="cust-type"
                    checked={!isWalkIn}
                    onChange={() => toggleWalkIn(false)}
                  />
                  Customer Account
                </label>
              </div>

              <div className="grid-2">
                {!isWalkIn ? (
                  <div className="field">
                    <label htmlFor="c-select">Select Customer *</label>
                    <select
                      id="c-select"
                      required
                      value={customerId}
                      onChange={(e) => onSelectCustomer(e.target.value)}
                    >
                      <option value="">-- Choose Customer --</option>
                      {customers.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.name} {c.phone ? `(${c.phone})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="field">
                    <label htmlFor="c-name">Customer Name</label>
                    <input
                      id="c-name"
                      placeholder="Walk-in Customer"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </div>
                )}

                <div className="field">
                  <label htmlFor="s-date">Date (BS) *</label>
                  <input
                    id="s-date"
                    required
                    placeholder="2083-06-19"
                    value={bsDate}
                    onChange={(e) => setBsDate(e.target.value)}
                  />
                  <div className="hint">{bsToAd(bsDate) ? longBs(bsDate) : 'YYYY-MM-DD'}</div>
                </div>

                <div className="field">
                  <label htmlFor="c-phone">Phone</label>
                  <input
                    id="c-phone"
                    maxLength={30}
                    placeholder="98XXXXXXXX"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="c-addr">Address</label>
                  <input
                    id="c-addr"
                    maxLength={200}
                    placeholder="Location / City"
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                  />
                </div>
              </div>
            </section>

            {/* Product search */}
            <section className="card">
              <h2>Add Products</h2>
              <input
                type="search"
                aria-label="Search products to add"
                placeholder="Search by Product ID or Name..."
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
                          {p.category === 'gem' ? 'Gems' : p.company ? p.company.name : '-'} ·{' '}
                          <span style={{ color: p.quantity > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                            {p.quantity} in stock
                          </span>{' '}
                          · Retail: {money(p.retailPrice)} · Wholesale: {money(p.wholesalePrice)}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={inList.has(p._id) || p.quantity === 0}
                        onClick={() => addProduct(p)}
                      >
                        {inList.has(p._id) ? 'Added' : p.quantity === 0 ? 'Out of Stock' : '+ Add'}
                      </button>
                    </li>
                  ))}
                  {results.length === 0 && dq.trim() === q.trim() && (
                    <li className="muted">No products found.</li>
                  )}
                </ul>
              )}
            </section>

            {/* Sale Items Table */}
            <section className="card card-flush">
              <div className="card-head row-between">
                <h2>Items ({items.length})</h2>
                {items.length > 0 && (
                  <button type="button" className="link-btn" onClick={clearItems}>
                    Clear list
                  </button>
                )}
              </div>

              {items.length === 0 ? (
                <Empty>No products added to this sale yet. Search above to add items.</Empty>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th className="num">In stock</th>
                        <th>Price Type</th>
                        <th className="num">Unit Price</th>
                        <th className="num">Qty</th>
                        <th className="num">Total</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((i) => {
                        const isOverStock = i.stock < (Number(i.quantity) || 0);
                        const lineTotal = (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0);
                        return (
                          <tr key={i.product} className={isOverStock ? 'row-out' : undefined}>
                            <td>
                              <strong>{label(i)}</strong>
                              <span className="sub-line muted">{i.company || '-'}</span>
                            </td>
                            <td className="num">
                              <span style={{ fontWeight: 600, color: isOverStock ? 'var(--red)' : 'inherit' }}>
                                {i.stock}
                              </span>
                            </td>
                            <td>
                              <select
                                style={{ width: '120px', padding: '4px 6px', fontSize: '13px' }}
                                value={i.priceType}
                                onChange={(e) => updateItem(i.product, 'priceType', e.target.value)}
                              >
                                <option value="retail">Retail ({money(i.retailPrice)})</option>
                                <option value="wholesale">Wholesale ({money(i.wholesalePrice)})</option>
                                <option value="custom">Custom Price</option>
                              </select>
                            </td>
                            <td className="num">
                              <input
                                className="qty-input"
                                type="number"
                                min="0"
                                step="0.01"
                                required
                                value={i.unitPrice}
                                onChange={(e) => updateItem(i.product, 'unitPrice', e.target.value)}
                              />
                            </td>
                            <td className="num">
                              <input
                                className="qty-input"
                                type="number"
                                min="1"
                                max={i.stock > 0 ? i.stock : undefined}
                                step="1"
                                required
                                value={i.quantity}
                                onChange={(e) => updateItem(i.product, 'quantity', e.target.value)}
                              />
                              {isOverStock && (
                                <span className="sub-line" style={{ color: 'var(--red)', fontWeight: 600 }}>
                                  Exceeds stock!
                                </span>
                              )}
                            </td>
                            <td className="num">
                              <strong>{money(lineTotal)}</strong>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="link-btn"
                                onClick={() => removeItem(i.product)}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          {/* Right Sidebar: Summary & Checkout */}
          <aside>
            <section className="card">
              <h2>Payment & Summary</h2>

              <div className="field">
                <label htmlFor="pay-type">Payment Method *</label>
                <select
                  id="pay-type"
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value)}
                >
                  <option value="cash">Cash (Paid in full)</option>
                  <option value="bank">Bank Transfer / QR</option>
                  {!isWalkIn && <option value="credit">Credit (Bill to account)</option>}
                  {!isWalkIn && <option value="partial">Partial Payment</option>}
                </select>
                <div className="hint">
                  {paymentType === 'credit'
                    ? 'Full amount will be debited to customer ledger.'
                    : paymentType === 'partial'
                    ? 'Enter amount paid now; balance will be debited to ledger.'
                    : 'Full payment received immediately.'}
                </div>
              </div>

              {paymentType === 'partial' && (
                <div className="field">
                  <label htmlFor="p-paid">Amount Paid Now (Rs.)</label>
                  <input
                    id="p-paid"
                    type="number"
                    min="0"
                    max={grandTotal}
                    step="0.01"
                    required
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                  />
                  <div className="hint">
                    Remaining {money(Math.max(0, grandTotal - (Number(paidAmount) || 0)))} on credit.
                  </div>
                </div>
              )}

              <div className="field">
                <label htmlFor="s-disc">Discount %</label>
                <input
                  id="s-disc"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="s-note">Sale Note (optional)</label>
                <textarea
                  id="s-note"
                  rows={2}
                  maxLength={500}
                  placeholder="PO number, delivery notes, remarks..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              <div
                style={{
                  borderTop: '1px solid var(--line)',
                  paddingTop: 16,
                  marginTop: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div className="row-between">
                  <span className="muted">Subtotal ({totalUnits} units)</span>
                  <strong>{money(subtotal)}</strong>
                </div>
                {discountAmt > 0 && (
                  <div className="row-between" style={{ color: 'var(--accent-dark)' }}>
                    <span>Discount ({discountPercent}%)</span>
                    <span>-{money(discountAmt)}</span>
                  </div>
                )}
                <div
                  className="row-between"
                  style={{
                    fontSize: '20px',
                    fontWeight: 800,
                    borderTop: '2px solid var(--line)',
                    paddingTop: 10,
                    marginTop: 4,
                  }}
                >
                  <span>Grand Total</span>
                  <span>{money(grandTotal)}</span>
                </div>
              </div>

              <button
                type="submit"
                className="btn"
                style={{ width: '100%', marginTop: 20, padding: '12px' }}
                disabled={busy || items.length === 0}
              >
                {busy ? 'Processing Sale…' : '✓ Complete Sale'}
              </button>
            </section>
          </aside>
        </div>
      </form>
    </>
  );
}
