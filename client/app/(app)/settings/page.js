'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useSettings, useUser } from '@/components/AppShell';
import { Alert } from '@/components/ui';

function Row({ label, hint, htmlFor, children }) {
  return (
    <div className="setting-row">
      <div>
        <label htmlFor={htmlFor} style={{ margin: 0 }}>
          {label}
        </label>
        {hint && <div className="hint">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

// One form for every company-wide setting group. `fields` lists which keys this group edits.
function SettingsForm({ title, intro, fields, children }) {
  const { settings, refresh } = useSettings();
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f, settings[f] ?? ''])));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/settings', { method: 'PUT', body: values });
      await refresh();
      setNotice('Settings saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const bind = (key, extra = {}) => ({
    id: `s-${key}`,
    value: values[key],
    onChange: (e) => setValues({ ...values, [key]: e.target.value }),
    ...extra,
  });

  return (
    <form className="card" style={{ maxWidth: 760 }} onSubmit={save}>
      <h2>{title}</h2>
      {intro && <p className="muted" style={{ marginTop: 0 }}>{intro}</p>}
      <Alert>{error}</Alert>
      <Alert kind="ok">{notice}</Alert>
      {children(bind)}
      <div style={{ marginTop: 16 }}>
        <button className="btn" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

function BusinessTab() {
  return (
    <SettingsForm
      title="Business profile"
      intro="Shown in the header and at the top of printed orders, statements and the price list."
      fields={['companyName', 'address', 'phone', 'panNumber']}
    >
      {(bind) => (
        <>
          <Row label="Company name" htmlFor="s-companyName">
            <input maxLength={100} {...bind('companyName')} />
          </Row>
          <Row label="Address" htmlFor="s-address">
            <input maxLength={200} {...bind('address')} />
          </Row>
          <Row label="Phone" htmlFor="s-phone">
            <input maxLength={40} {...bind('phone')} />
          </Row>
          <Row label="PAN / VAT number" htmlFor="s-panNumber">
            <input maxLength={30} {...bind('panNumber')} />
          </Row>
        </>
      )}
    </SettingsForm>
  );
}

function InventoryTab() {
  return (
    <SettingsForm
      title="Inventory, orders and sales"
      intro="Defaults used when adding products, building restock orders and generating sales invoices."
      fields={['defaultLowStock', 'reorderMultiplier', 'orderPrefix', 'invoicePrefix']}
    >
      {(bind) => (
        <>
          <Row label="Default low-stock level" hint="New products start with this. Each product can still have its own." htmlFor="s-defaultLowStock">
            <input type="number" min="0" step="1" required {...bind('defaultLowStock')} />
          </Row>
          <Row label="Reorder multiplier" hint="Suggested order = this × the low-stock level − current stock, rounded up to whole stacks." htmlFor="s-reorderMultiplier">
            <input type="number" min="1" max="10" step="0.5" required {...bind('reorderMultiplier')} />
          </Row>
          <Row label="Order number prefix" hint="Orders are numbered like ORD-0001. Letters and digits only, up to 6." htmlFor="s-orderPrefix">
            <input maxLength={6} required {...bind('orderPrefix')} />
          </Row>
          <Row label="Invoice number prefix" hint="Sales invoices are numbered like INV-0001. Letters and digits only, up to 6." htmlFor="s-invoicePrefix">
            <input maxLength={6} required {...bind('invoicePrefix')} />
          </Row>
        </>
      )}
    </SettingsForm>
  );
}

function AccountsTab() {
  return (
    <SettingsForm title="Accounts" intro="Defaults for new customers and vendors. Each account can be edited on its own ledger page." fields={['defaultCreditDays', 'defaultDiscount']}>
      {(bind) => (
        <>
          <Row label="Default credit days" hint="An invoice or bill is overdue this many days after its date." htmlFor="s-defaultCreditDays">
            <input type="number" min="0" max="365" step="1" required {...bind('defaultCreditDays')} />
          </Row>
          <Row label="Default customer discount %" hint="Applied to new customers. Vendors never get one." htmlFor="s-defaultDiscount">
            <input type="number" min="0" max="100" step="0.01" required {...bind('defaultDiscount')} />
          </Row>
        </>
      )}
    </SettingsForm>
  );
}

function UsersTab() {
  const me = useUser();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: '', password: '', role: 'staff' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resettingUser, setResettingUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  const load = useCallback(() => {
    api('/auth/users').then((d) => setUsers(d.users)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      await api('/auth/users', { method: 'POST', body: form });
      setNotice(`Created ${form.username}.`);
      setForm({ username: '', password: '', role: 'staff' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function patch(id, body) {
    setError('');
    setNotice('');
    try {
      await api(`/auth/users/${id}`, { method: 'PATCH', body });
      if (body.password) setNotice('Password changed.');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitPasswordReset(e) {
    e.preventDefault();
    if (!resettingUser || !newPassword) return;
    await patch(resettingUser.id, { password: newPassword });
    setResettingUser(null);
    setNewPassword('');
  }

  return (
    <>
      <Alert>{error}</Alert>
      <Alert kind="ok">{notice}</Alert>

      {resettingUser && (
        <form className="card" style={{ maxWidth: 760, border: '2px solid var(--accent)' }} onSubmit={submitPasswordReset}>
          <h2>Set new password for {resettingUser.username}</h2>
          <div className="field" style={{ maxWidth: 360 }}>
            <label htmlFor="modal-pwd">New password (at least 8 characters)</label>
            <input
              id="modal-pwd"
              type="password"
              required
              minLength={8}
              autoFocus
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="inline-form">
            <button className="btn" type="submit">
              Save password
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                setResettingUser(null);
                setNewPassword('');
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <section className="card" style={{ maxWidth: 760 }}>
        <h2>Add a user</h2>
        <form onSubmit={create}>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="u">Username</label>
              <input id="u" required minLength={3} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="p">Temporary password</label>
              <input id="p" type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <div className="hint">At least 8 characters.</div>
            </div>
          </div>
          <div className="field" style={{ maxWidth: 240 }}>
            <label htmlFor="r">Role</label>
            <select id="r" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="staff">Staff (view only)</option>
              <option value="manager">Manager (edit stock and prices)</option>
              <option value="Owner">Owner (everything)</option>
            </select>
          </div>
          <button className="btn">Create user</button>
        </form>
      </section>

      <section className="card card-flush">
        <div className="card-head">
          <h2>Users</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = u.id === me.id;
                return (
                  <tr key={u.id}>
                    <td>
                      {u.username} {self && <span className="muted">(you)</span>}
                    </td>
                    <td>
                      <select aria-label={`Role for ${u.username}`} value={u.role} disabled={self} style={{ width: 140 }} onChange={(e) => patch(u.id, { role: e.target.value })}>
                        <option value="staff">staff</option>
                        <option value="manager">manager</option>
                        <option value="Owner">Owner</option>
                      </select>
                    </td>
                    <td>{u.active ? 'Active' : 'Deactivated'}</td>
                    <td>
                      <div className="inline-form">
                        <button className="link-btn" onClick={() => setResettingUser(u)}>
                          Set password
                        </button>
                        {!self && (
                          <button className="link-btn" onClick={() => patch(u.id, { active: !u.active })}>
                            {u.active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function MyAccountTab() {
  const me = useUser();
  const [displayName, setDisplayName] = useState(me.displayName);
  const [form, setForm] = useState({ current: '', next: '', again: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function updateName(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      await api('/auth/me', { method: 'PATCH', body: { displayName } });
      setNotice('Name updated.');
    } catch (err) {
      setError(err.message);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    if (form.next !== form.again) return setError('The new passwords do not match');
    setBusy(true);
    try {
      await api('/auth/password', { method: 'POST', body: { current: form.current, next: form.next } });
      setForm({ current: '', next: '', again: '' });
      setNotice('Password changed. Use the new one next time you sign in.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card" style={{ maxWidth: 760 }}>
        <h2>Signed in as</h2>
        <form onSubmit={updateName}>
          <div className="field" style={{ maxWidth: 360 }}>
            <label htmlFor="display-name">Display Name</label>
            <input id="display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <button className="btn">Update name</button>
        </form>
      </section>
      <form className="card" style={{ maxWidth: 760 }} onSubmit={submit}>
        <h2>Change password</h2>
        <Alert>{error}</Alert>
        <Alert kind="ok">{notice}</Alert>
        <div className="field" style={{ maxWidth: 360 }}>
          <label htmlFor="pw-cur">Current password</label>
          <input id="pw-cur" type="password" required autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="pw-new">New password</label>
            <input id="pw-new" type="password" required minLength={8} autoComplete="new-password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
            <div className="hint">At least 8 characters.</div>
          </div>
          <div className="field">
            <label htmlFor="pw-again">Repeat new password</label>
            <input id="pw-again" type="password" required minLength={8} autoComplete="new-password" value={form.again} onChange={(e) => setForm({ ...form, again: e.target.value })} />
          </div>
        </div>
        <button className="btn" disabled={busy}>
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </>
  );
}

function DataTab() {
  return (
    <section className="card" style={{ maxWidth: 760 }}>
      <h2>Export your data</h2>
      <p className="muted" style={{ marginTop: 0 }}>Spreadsheet files (CSV) that open in Excel or Google Sheets. Use them for backups or to share with your accountant.</p>
      <Row label="Products" hint="Every active product with stock, stack size, prices and status. Same columns the importer reads.">
        <a className="btn btn-ghost" href="/api/export/products.csv" download>
          Download products.csv
        </a>
      </Row>
      <Row label="Accounts" hint="Customers and vendors with discount, credit days and current balance.">
        <a className="btn btn-ghost" href="/api/export/accounts.csv" download>
          Download accounts.csv
        </a>
      </Row>
      <Row label="Sales" hint="Every sales invoice with invoice number, date, customer, items, total and payment method.">
        <a className="btn btn-ghost" href="/api/export/sales.csv" download>
          Download sales.csv
        </a>
      </Row>
    </section>
  );
}

export default function SettingsPage() {
  const me = useUser();
  const isOwner = me.role === 'Owner';
  const isEditor = me.role !== 'staff';
  const tabs = [
    ...(isOwner ? [['business', 'Business', BusinessTab], ['inventory', 'Inventory and orders', InventoryTab], ['accounts', 'Accounts', AccountsTab], ['users', 'Users', UsersTab]] : []),
    ['me', 'My account', MyAccountTab],
    ...(isEditor ? [['data', 'Data export', DataTab]] : []),
  ];
  const [tab, setTab] = useState(tabs[0][0]);
  const Active = (tabs.find((t) => t[0] === tab) || tabs[0])[2];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="sub">{isOwner ? 'Company-wide settings, users and your own account.' : 'Your account and data.'}</p>
        </div>
      </div>
      <div className="settings-tabs" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={`chip${tab === key ? ' chip-active' : ''}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      <Active key={tab} />
    </>
  );
}
