import type { ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  title?: string;
  children: ReactNode;
  onClose: () => void;
}

export function Dialog({ open, title, children, onClose }: DialogProps) {
  if (!open) return null;
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,21,15,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: 28, width: 360, boxShadow: 'var(--shadow-elevated)', fontFamily: 'var(--font-body)' }}
      >
        {title && <h3 style={{ margin: '0 0 12px', fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--ink)' }}>{title}</h3>}
        <div style={{ color: 'var(--body-text)', fontSize: 15, lineHeight: 1.5 }}>{children}</div>
      </div>
    </div>
  );
}
