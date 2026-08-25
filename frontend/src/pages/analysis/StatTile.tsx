import { Card } from '../../design/components';
import { NUMERIC_STYLE, TONE_COLOR_ON_DARK, arrowFor, toneFor } from '../../lib/format';

interface StatTileProps {
  label: string;
  value: string;
  /** Supply the raw number when the figure has a direction worth colouring. */
  signal?: number | null;
  hint?: string;
}

export function StatTile({ label, value, signal, hint }: StatTileProps) {
  const tone = signal === undefined ? 'flat' : toneFor(signal);
  const arrow = signal === undefined ? '' : arrowFor(signal);

  return (
    <Card elevated style={{ flex: '1 1 150px', minWidth: 140 }}>
      <div style={{ fontSize: 12, color: 'var(--on-dark-mute)', marginBottom: 8 }}>{label}</div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 24,
          color: TONE_COLOR_ON_DARK[tone],
          ...NUMERIC_STYLE,
          textAlign: 'left',
        }}
      >
        {arrow && <span style={{ fontSize: 14, marginRight: 6 }}>{arrow}</span>}
        {value}
      </div>
      {hint && (
        <div style={{ fontSize: 12, color: 'var(--on-dark-mute)', marginTop: 6, lineHeight: 1.4 }}>
          {hint}
        </div>
      )}
    </Card>
  );
}
