import type { ButtonHTMLAttributes, CSSProperties } from 'react';

type Variant = 'primary' | 'dark' | 'soft' | 'outline' | 'outline-dark';
type Size = 'lg' | 'md' | 'sm';

const base: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontWeight: 600,
  borderRadius: 'var(--radius-full)',
  border: 'none',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  transition: 'background-color .15s ease-out, color .15s ease-out',
};

const sizes: Record<Size, CSSProperties> = {
  lg: { fontSize: 18, fontFamily: 'var(--font-display)', padding: '14px 28px', height: 52 },
  md: { fontSize: 15, padding: '12px 22px', height: 44 },
  sm: { fontSize: 13, padding: '8px 16px', height: 36 },
};

const variants: Record<Variant, CSSProperties> = {
  primary: { background: 'var(--gold)', color: 'var(--on-gold)' },
  dark: { background: 'var(--canvas-dark)', color: '#fff' },
  soft: { background: 'var(--surface-soft)', color: 'var(--ink)' },
  outline: { background: 'transparent', color: 'var(--ink)', border: '1px solid var(--hairline-strong)' },
  'outline-dark': { background: 'transparent', color: '#fff', border: '1px solid #fff' },
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = 'primary', size = 'md', disabled, style, children, ...rest }: ButtonProps) {
  const combined: CSSProperties = {
    ...base,
    ...sizes[size],
    ...variants[variant],
    opacity: disabled ? 0.45 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
    ...style,
  };
  return (
    <button style={combined} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}
