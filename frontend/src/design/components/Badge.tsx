import type { CSSProperties, ReactNode } from 'react';

type Tone = 'neutral' | 'gold' | 'success' | 'danger';

const tones: Record<Tone, CSSProperties> = {
  neutral: { background: 'var(--surface-soft)', color: 'var(--ink)' },
  gold: { background: 'var(--gold)', color: 'var(--on-gold)' },
  success: { background: 'rgba(63,122,79,0.12)', color: 'var(--accent-success-text)' },
  danger: { background: 'rgba(168,59,59,0.12)', color: 'var(--accent-danger-text)' },
};

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      style={{
        ...tones[tone],
        fontFamily: 'var(--font-body)',
        fontSize: 12,
        fontWeight: 600,
        borderRadius: 'var(--radius-full)',
        padding: '4px 12px',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      {children}
    </span>
  );
}
