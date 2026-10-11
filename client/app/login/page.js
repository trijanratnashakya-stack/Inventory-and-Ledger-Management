'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { BRAND } from '@/lib/format';
import { Alert } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/auth/login', { method: 'POST', body: { username, password } });
      router.replace('/dashboard');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">{BRAND}</div>
        <h1>Welcome Back</h1>
        <p className="sub">Sign in to access the Inventory Management System</p>

        <Alert>{error}</Alert>

        {!showForgot ? (
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                autoComplete="username"
                autoFocus
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="field">
              <div className="row-between">
                <label htmlFor="password" style={{ margin: 0 }}>
                  Password
                </label>
                <button
                  type="button"
                  className="link-btn"
                  style={{ fontSize: '13px', fontWeight: 'normal' }}
                  onClick={() => setShowForgot(true)}
                >
                  Forgot password?
                </button>
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                style={{ marginTop: 6 }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button className="btn" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign In'}
            </button>
            <p className="hint" style={{ textAlign: 'center', marginTop: 16 }}>
              Accounts are created and managed by an administrator.
            </p>
          </form>
        ) : (
          <div style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px solid var(--line)', marginTop: 12 }}>
            <h2 style={{ fontSize: '16px', marginTop: 0 }}>Password Recovery</h2>
            <p style={{ fontSize: '14px', color: 'var(--ink)', lineHeight: 1.5 }}>
              This is a private company system. If you forgot your password:
            </p>
            <ul style={{ fontSize: '13px', color: '#4b5563', paddingLeft: 20, margin: '8px 0 16px', lineHeight: 1.6 }}>
              <li>
                <strong>Staff / Managers:</strong> Ask a system Administrator to reset your password from the <em>Settings → Users</em> tab.
              </li>
              <li>
                <strong>Default Seed Password:</strong> If you recently set up the system with demo seed data, the default password is:
                <br />
                <code style={{ display: 'inline-block', marginTop: 4, fontWeight: 'bold' }}>ChangeMe123!</code>
              </li>
            </ul>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: '100%' }}
              onClick={() => setShowForgot(false)}
            >
              ← Back to Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
