import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import logo from '../assets/logo.svg';
import { Button } from '../design/components';
import { useAuth } from '../state/authContext';
import { usePortfolios } from '../state/portfolioContext';

const LAYERS = [
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/analyza', label: 'Analýza' },
  { to: '/ai', label: 'AI analýza' },
  { to: '/trhy', label: 'Trhy' },
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
