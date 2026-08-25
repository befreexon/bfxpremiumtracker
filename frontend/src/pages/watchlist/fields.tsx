/**
 * Small form and message pieces the design kit does not ship.
 *
 * The shipped Input/Select are light-surface controls, so every form in this
 * layer sits on a white card: the writing surface is deliberately a different
 * material from the dark canvas the list lives on.
 */

import type { CSSProperties, ReactNode } from 'react';
import { CAPTION, HAIRLINE, MUTED } from './shared';

interface TextAreaProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  error?: string;
}

export function TextArea({ label, value, onChange, placeholder, rows = 4, error }: TextAreaProps) {
  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        fontFamily: 'var(--font-body)',
        width: '100%',
      }}
    >
      {label && <span style={{ fontSize: 13, color: 'var(--charcoal)', fontWeight: 600 }}>{label}</span>}
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        style={{
          borderRadius: 'var(--radius-md)',
          border: `1px solid ${error ? 'var(--accent-danger)' : 'var(--hairline-light)'}`,
          padding: '12px 16px',
          fontSize: 15,
          lineHeight: 1.5,
          fontFamily: 'var(--font-body)',
          color: 'var(--ink)',
          background: 'var(--canvas-light)',
          outline: 'none',
          resize: 'vertical',
        }}
      />
      {error && <span style={{ fontSize: 12, color: 'var(--accent-danger-text)' }}>{error}</span>}
    </label>
  );
}

/** A quiet explanation under a control, on a light surface. */
export function Hint({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: '4px 0 0', fontSize: 12, lineHeight: 1.45, color: 'var(--mute)' }}>{children}</p>
  );
}

/** The same, on the dark canvas. */
export function DarkHint({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <p style={{ margin: 0, ...CAPTION, ...style }}>{children}</p>;
}

/**
 * What went wrong and what to do about it. Never an apology — the reader
 * wants the next step, not sympathy.
 */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      style={{
        border: '1px solid var(--accent-danger)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 14px',
        fontSize: 14,
        lineHeight: 1.5,
        color: 'var(--accent-danger-text)',
        background: 'rgba(168,59,59,0.06)',
      }}
    >
      {children}
    </div>
  );
}

/** A banner on the dark canvas: gold for something that needs a person. */
export function DarkNotice({
  tone = 'neutral',
  children,
  action,
}: {
  tone?: 'neutral' | 'gold' | 'danger';
  children: ReactNode;
  action?: ReactNode;
}) {
  const border =
    tone === 'gold' ? 'var(--gold)' : tone === 'danger' ? 'var(--accent-danger)' : HAIRLINE;
  const background =
    tone === 'gold'
      ? 'rgba(220,180,92,0.10)'
      : tone === 'danger'
        ? 'rgba(168,59,59,0.14)'
        : 'transparent';

  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
        border: `1px solid ${border}`,
        background,
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
        fontSize: 14,
        lineHeight: 1.5,
        color: tone === 'neutral' ? MUTED : '#fff',
      }}
    >
      <div style={{ flex: '1 1 320px' }}>{children}</div>
      {action}
    </div>
  );
}

/** Label / value pair used for the pre-filled, non-editable parts of a dialog. */
export function ReadOnlyPair({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ash)' }}>
        {label}
      </span>
      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{value}</span>
    </div>
  );
}
