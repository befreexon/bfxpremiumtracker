import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { alerts as alertsApi } from '../api/client';
import type { Alert, AlertSeverity } from '../api/types';
import logo from '../assets/logo.svg';
import { Button } from '../design/components';
import { useAuth } from '../state/authContext';
import { usePortfolios } from '../state/portfolioContext';

const ALERT_POLL_MS = 60_000;

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  success: 'var(--gain-on-dark)',
  warning: 'var(--accent-warning)',
  info: 'var(--on-dark-mute)',
};

const LAYERS = [
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/analyza', label: 'Analýza' },
  { to: '/ai', label: 'AI analýza' },
  { to: '/trhy', label: 'Trhy' },
  { to: '/jmeni', label: 'Čisté jmění' },
];

export function AppShell() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  // The switcher only means something where the figures are per-portfolio.
  const showsPortfolioSwitcher =
    location.pathname.startsWith('/portfolio') || location.pathname.startsWith('/analyza');

  return (
    <div
      style={{
        minHeight: '100%',
        background: 'var(--canvas-dark)',
        color: '#fff',
        fontFamily: 'var(--font-body)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          padding: '16px 32px',
          borderBottom: '1px solid var(--hairline-dark)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={logo} alt="" style={{ width: 26 }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600 }}>
            BFX Portfolio Pro
          </span>
        </div>

        <nav style={{ display: 'flex', gap: 6 }}>
          {LAYERS.map((layer) => (
            <NavLink
              key={layer.to}
              to={layer.to}
              style={({ isActive }) => ({
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 'var(--radius-full)',
                padding: '8px 18px',
                textDecoration: 'none',
                background: isActive ? 'var(--gold)' : 'transparent',
                color: isActive ? 'var(--on-gold)' : 'var(--on-dark-mute)',
                transition: 'background-color .15s ease-out, color .15s ease-out',
              })}
            >
              {layer.label}
            </NavLink>
          ))}
        </nav>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <AlertsBell />
          {showsPortfolioSwitcher && <PortfolioSwitcher />}
          <NavLink
            to="/nastaveni"
            style={({ isActive }) => ({
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              color: isActive ? 'var(--gold)' : 'var(--on-dark-mute)',
            })}
          >
            {user?.display_name || user?.email || 'Nastavení'}
          </NavLink>
          <Button size="sm" variant="outline-dark" onClick={() => void signOut()}>
            Odhlásit
          </Button>
        </div>
      </header>

      <main style={{ flex: 1, padding: '28px 32px 96px', maxWidth: 1180, width: '100%', margin: '0 auto' }}>
        <Outlet />
      </main>
    </div>
  );
}

function PortfolioSwitcher() {
  const { portfolios, selection, selectionLabel, select } = usePortfolios();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const isEverything = selection === null;

  return (
    <div ref={container} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 36,
          padding: '0 16px',
          borderRadius: 'var(--radius-full)',
          border: '1px solid var(--hairline-dark)',
          background: 'var(--surface-elevated)',
          color: '#fff',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {selectionLabel}
        <span style={{ color: 'var(--on-dark-mute)' }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 6,
            minWidth: 220,
            background: 'var(--surface-elevated)',
            border: '1px solid var(--hairline-dark)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            zIndex: 20,
          }}
        >
          <SwitcherOption
            label="Vše dohromady"
            active={isEverything}
            onClick={() => {
              select(null);
              setOpen(false);
            }}
          />
          <div style={{ height: 1, background: 'var(--hairline-dark)' }} />
          {portfolios.map((portfolio) => (
            <SwitcherOption
              key={portfolio.id}
              label={portfolio.name}
              hint={`${portfolio.transaction_count} transakcí`}
              active={!isEverything && selection?.includes(portfolio.id) && selection.length === 1}
              onClick={() => {
                select([portfolio.id]);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SwitcherOption({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        width: '100%',
        padding: '10px 16px',
        border: 'none',
        background: 'transparent',
        color: active ? 'var(--gold)' : '#fff',
        fontSize: 14,
        fontWeight: active ? 600 : 400,
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      {label}
      {hint && <span style={{ fontSize: 12, color: 'var(--on-dark-mute)' }}>{hint}</span>}
    </button>
  );
}

/**
 * A consolidated "needs your attention" feed — watchlist targets reached,
 * concentration, tax-test lots about to clear, missing price/FX — gathered
 * from screens that already show each individually. Always scoped to every
 * portfolio, independent of whatever the page-level switcher is showing.
 */
function AlertsBell() {
  const [items, setItems] = useState<Alert[]>([]);
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      alertsApi
        .list()
        .then((result) => {
          if (!cancelled) setItems(result);
        })
        .catch(() => {
          // A failed poll just leaves the previous list showing.
        });
    };
    load();
    const interval = setInterval(load, ALERT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={container} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-label={`Upozornění (${items.length})`}
        style={{
          position: 'relative',
          width: 36,
          height: 36,
          borderRadius: 'var(--radius-full)',
          border: '1px solid var(--hairline-dark)',
          background: 'var(--surface-elevated)',
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
        }}
      >
        🔔
        {items.length > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              minWidth: 16,
              height: 16,
              padding: '0 3px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--gold)',
              color: 'var(--on-gold)',
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 6,
            width: 340,
            maxHeight: 420,
            overflowY: 'auto',
            background: 'var(--surface-elevated)',
            border: '1px solid var(--hairline-dark)',
            borderRadius: 'var(--radius-md)',
            zIndex: 20,
          }}
        >
          {items.length === 0 ? (
            <div style={{ padding: 16, fontSize: 13, color: 'var(--on-dark-mute)' }}>
              Nic nečeká na tvou pozornost.
            </div>
          ) : (
            items.map((alert) => (
              <Link
                key={alert.id}
                to={alert.link}
                onClick={() => setOpen(false)}
                style={{
                  display: 'block',
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--hairline-dark)',
                  textDecoration: 'none',
                  color: '#fff',
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    width: 7,
                    height: 7,
                    borderRadius: 'var(--radius-full)',
                    background: SEVERITY_COLOR[alert.severity],
                    marginRight: 8,
                  }}
                />
                {alert.message}
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
