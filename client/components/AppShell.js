'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { BRAND } from '@/lib/format';

const UserContext = createContext(null);
export const useUser = () => useContext(UserContext);

// Company-wide settings (name for the header, defaults for forms). Changes from the Settings page call refresh().
const SettingsContext = createContext({ settings: {}, refresh: () => {} });
export const useSettings = () => useContext(SettingsContext);

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '▦' },
  { href: '/inventory', label: 'Inventory', icon: '▣' },
  { href: '/price-list', label: 'Price List', icon: '$' },
  { href: '/sales/new', label: 'New Sale', icon: '+', activeWhen: (p) => p === '/sales/new' },
  { href: '/sales', label: 'Sales', icon: '▤', activeWhen: (p) => p === '/sales' || (p.startsWith('/sales/') && p !== '/sales/new') },
  { href: '/orders/new', label: 'Create Order', icon: '⇡', activeWhen: (p) => p === '/orders/new' },
  { href: '/orders', label: 'Orders', icon: '☰', activeWhen: (p) => p === '/orders' || (p.startsWith('/orders/') && p !== '/orders/new') },
  { href: '/accounts', label: 'Ledger', icon: '≡', managerOnly: true },
  { href: '/settings', label: 'Settings', icon: '⚙' },
];

export default function AppShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState({});
  const refresh = useCallback(() => api('/settings').then((d) => setSettings(d.settings)).catch(() => {}), []);

  useEffect(() => {
    // Settings load together with the user so forms start with the right defaults.
    Promise.all([api('/auth/me'), api('/settings').catch(() => ({ settings: {} }))])
      .then(([me, s]) => {
        setSettings(s.settings);
        setUser(me.user);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/login');
  }

  if (!user) return <div className="boot">Loading…</div>;

  return (
    <UserContext.Provider value={user}>
      <SettingsContext.Provider value={{ settings, refresh }}>
      <header className="topbar">
        <div className="brand">{settings.companyName || BRAND}</div>
        <div className="topbar-user">
          <div className="topbar-user-text">
            <strong>{user.displayName}</strong>
            <span>{user.role}</span>
          </div>
          <button className="btn btn-ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <div className="shell">
        <aside className="sidebar">
          <div className="sidebar-title">Inventory System</div>
          <nav>
            {NAV.filter((n) => (!n.adminOnly || user.role === 'Owner') && (!n.managerOnly || user.role !== 'staff')).map((n) => {
              const active = n.activeWhen ? n.activeWhen(pathname) : pathname === n.href || pathname.startsWith(`${n.href}/`);
              if (n.soon) {
                return (
                  <span key={n.href} className="nav-item nav-disabled" title="Planned for Phase 2">
                    <span className="nav-icon">{n.icon}</span>
                    {n.label}
                    <em className="soon">Soon</em>
                  </span>
                );
              }
              return (
                <Link key={n.href} href={n.href} className={`nav-item${active ? ' nav-active' : ''}`}>
                  <span className="nav-icon">{n.icon}</span>
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="content">{children}</main>
      </div>
      </SettingsContext.Provider>
    </UserContext.Provider>
  );
}
