import type { ReactNode } from 'react';

export function Tag({ children, onRemove }: { children: ReactNode; onRemove?: () => void }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--ink)',
        background: 'var(--surface-soft)',
        borderRadius: 'var(--radius-full)',
        padding: '6px 14px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {children}
      {onRemove && (
        <span onClick={onRemove} style={{ cursor: 'pointer', color: 'var(--ash)' }}>
          ✕
        </span>
      )}
    </span>
  );
}
