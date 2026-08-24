import type { ChangeEventHandler } from 'react';

interface InputProps {
  label?: string;
  placeholder?: string;
  type?: string;
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  error?: string;
}

export function Input({ label, placeholder, type = 'text', value, onChange, error }: InputProps) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--font-body)', width: '100%' }}>
      {label && <span style={{ fontSize: 13, color: 'var(--charcoal)', fontWeight: 600 }}>{label}</span>}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        style={{
          height: 52,
          borderRadius: 'var(--radius-md)',
          border: `1px solid ${error ? 'var(--accent-danger)' : 'var(--hairline-light)'}`,
          padding: '0 16px',
          fontSize: 16,
          fontFamily: 'var(--font-body)',
          color: 'var(--ink)',
          background: 'var(--canvas-light)',
          outline: 'none',
        }}
      />
      {error && <span style={{ fontSize: 12, color: 'var(--accent-danger-text)' }}>{error}</span>}
    </label>
  );
}
