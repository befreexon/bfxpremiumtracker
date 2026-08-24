import { useState } from 'react';

interface TabsProps {
  items: string[];
  active?: number;
  onChange?: (index: number) => void;
}

export function Tabs({ items, active, onChange }: TabsProps) {
  const [internalActive, setInternalActive] = useState(0);
  const current = active ?? internalActive;

  return (
    <div style={{ display: 'flex', gap: 8, fontFamily: 'var(--font-body)', flexWrap: 'wrap' }}>
      {items.map((item, i) => (
        <button
          key={item}
          type="button"
          onClick={() => {
            setInternalActive(i);
            onChange?.(i);
          }}
          style={{
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 'var(--radius-full)',
            padding: '8px 18px',
            background: current === i ? 'var(--ink)' : 'var(--surface-soft)',
            color: current === i ? '#fff' : 'var(--ink)',
            transition: 'background-color .15s ease-out',
          }}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
