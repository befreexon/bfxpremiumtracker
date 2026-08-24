import type { CSSProperties, ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  elevated?: boolean;
  padding?: number;
  style?: CSSProperties;
}

export function Card({ children, elevated = false, padding = 24, style }: CardProps) {
  return (
    <div
      style={{
        background: elevated ? 'var(--surface-elevated)' : 'var(--surface-card)',
        color: elevated ? '#fff' : 'var(--ink)',
        borderRadius: 'var(--radius-lg)',
        padding,
        border: elevated ? 'none' : '1px solid var(--hairline-light)',
        fontFamily: 'var(--font-body)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
