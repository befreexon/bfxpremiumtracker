import { useState } from 'react';

interface SelectProps {
  label?: string;
  options?: string[];
  value?: string;
  onChange?: (value: string) => void;
}

export function Select({ label, options = [], value, onChange }: SelectProps) {
  const [open, setOpen] = useState(false);
  const selected = value ?? options[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--font-body)', position: 'relative', width: '100%' }}>
      {label && <span style={{ fontSize: 13, color: 'var(--charcoal)', fontWeight: 600 }}>{label}</span>}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          height: 52,
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--hairline-light)',
          padding: '0 16px',
          fontSize: 16,
          textAlign: 'left',
          background: 'var(--canvas-light)',
          color: 'var(--ink)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
        }}
      >
        {selected}
        <span style={{ color: 'var(--stone)' }}>▾</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: '#fff',
            border: '1px solid var(--hairline-light)',
            borderRadius: 'var(--radius-md)',
            marginTop: 4,
            zIndex: 10,
            boxShadow: 'var(--shadow-card)',
            maxHeight: 260,
            overflowY: 'auto',
          }}
        >
          {options.map((o) => (
            <div
              key={o}
              onClick={() => {
                setOpen(false);
                onChange?.(o);
              }}
              style={{ padding: '10px 16px', cursor: 'pointer', fontSize: 15 }}
            >
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
