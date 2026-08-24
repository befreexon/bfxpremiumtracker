interface CheckboxProps {
  label?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}

export function Checkbox({ label, checked = false, onChange }: CheckboxProps) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--ink)' }}>
      <span
        onClick={() => onChange?.(!checked)}
        style={{
          width: 20,
          height: 20,
          borderRadius: 'var(--radius-sm)',
          border: `1.5px solid ${checked ? 'var(--gold-deep)' : 'var(--hairline-strong)'}`,
          background: checked ? 'var(--gold)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {checked && <span style={{ color: 'var(--on-gold)', fontSize: 13, fontWeight: 700 }}>✓</span>}
      </span>
      {label}
    </label>
  );
}
