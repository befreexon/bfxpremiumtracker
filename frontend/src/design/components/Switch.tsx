interface SwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
}

export function Switch({ checked = false, onChange, label }: SwitchProps) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--ink)' }}>
      <span
        onClick={() => onChange?.(!checked)}
        style={{
          width: 44,
          height: 26,
          borderRadius: 'var(--radius-full)',
          background: checked ? 'var(--gold)' : 'var(--faint)',
          position: 'relative',
          transition: 'background-color .15s ease-out',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 21 : 3,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left .15s ease-out',
            boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
          }}
        />
      </span>
      {label}
    </label>
  );
}
