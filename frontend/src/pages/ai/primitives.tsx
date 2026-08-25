/**
 * The small pieces this layer is built from.
 *
 * The AI layer sits on the dark canvas, where the light-canvas form controls of
 * the design system would read as holes in the page. So the fields here are
 * dark-canvas versions of the same shapes — same radius tokens, same hairline
 * borders, same pill buttons — and `Panel` is the design system's `Card` with
 * the dark surface and the hairline put back on.
 *
 * No drop shadows anywhere, and every transition is dropped when the reader has
 * asked for reduced motion.
 */

import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Card } from '../../design/components';

export const DARK = {
  canvas: 'var(--canvas-dark)',
  panel: 'var(--surface-deep)',
  raised: 'rgba(255,255,255,0.04)',
  hairline: 'var(--hairline-dark)',
  divider: 'var(--divider-soft)',
  text: 'var(--on-dark)',
  mute: 'var(--on-dark-mute)',
  faint: 'rgba(255,255,255,0.5)',
  gold: 'var(--gold)',
  goldBright: 'var(--gold-bright)',
} as const;

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handle = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', handle);
    return () => query.removeEventListener('change', handle);
  }, []);

  return reduced;
}

// --- Layout ----------------------------------------------------------------

interface PanelProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  padding?: number;
  children: ReactNode;
  style?: CSSProperties;
}

export function Panel({ title, subtitle, right, padding = 22, children, style }: PanelProps) {
  return (
    <Card
      elevated
      padding={padding}
      style={{
        background: DARK.panel,
        border: `1px solid ${DARK.hairline}`,
        color: DARK.text,
        ...style,
      }}
    >
      {(title || right) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: subtitle ? 6 : 16,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-heading-sm-size)',
              lineHeight: 'var(--text-heading-sm-lh)',
              fontWeight: 600,
              color: DARK.text,
            }}
          >
            {title}
          </h2>
          {right}
        </div>
      )}
      {subtitle && (
        <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.5, color: DARK.mute, maxWidth: '72ch' }}>
          {subtitle}
        </p>
      )}
      {children}
    </Card>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.09em',
        textTransform: 'uppercase',
        color: DARK.faint,
      }}
    >
      {children}
    </div>
  );
}

/** A horizontally scrollable shell so a wide table never widens the page. */
export function ScrollArea({ children, minWidth = 520 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}

// --- Values ----------------------------------------------------------------

interface StatTileProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  color?: string;
  minWidth?: number;
}

export function StatTile({ label, value, sub, color, minWidth = 132 }: StatTileProps) {
  return (
    <div
      style={{
        flex: `1 1 ${minWidth}px`,
        minWidth,
        border: `1px solid ${DARK.hairline}`,
        borderRadius: 'var(--radius-md)',
        padding: '12px 14px',
        background: DARK.raised,
      }}
    >
      <div style={{ fontSize: 12, color: DARK.faint, marginBottom: 6 }}>{label}</div>
      <div
        style={{
          fontSize: 19,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          color: color ?? DARK.text,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: DARK.mute, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/** A label/value pair on one line, the value right-aligned in tabular figures. */
export function Row({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 16,
        padding: '10px 0',
        borderBottom: `1px solid ${DARK.divider}`,
      }}
    >
      <div>
        <div style={{ fontSize: 14, color: DARK.text }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: DARK.faint, marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums', textAlign: 'right', color: DARK.text }}>
        {value}
      </div>
    </div>
  );
}

/** A quiet block of prose: notes, absences, things that are not errors. */
export function NoteBlock({
  children,
  tone = 'quiet',
}: {
  children: ReactNode;
  tone?: 'quiet' | 'gold' | 'warning';
}) {
  const accent =
    tone === 'gold' ? DARK.gold : tone === 'warning' ? 'var(--accent-warning)' : 'rgba(255,255,255,0.24)';
  return (
    <div
      style={{
        borderLeft: `2px solid ${accent}`,
        background: DARK.raised,
        borderRadius: '0 var(--radius-md) var(--radius-md) 0',
        padding: '12px 16px',
        fontSize: 14,
        lineHeight: 1.6,
        color: DARK.mute,
      }}
    >
      {children}
    </div>
  );
}

/** A small pill for enumerating things, e.g. the inputs that were missing. */
export function Chip({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 12,
        lineHeight: 1.4,
        color: DARK.mute,
        background: DARK.raised,
        border: `1px solid ${DARK.hairline}`,
        borderRadius: 'var(--radius-full)',
        padding: '4px 10px',
      }}
    >
      {children}
    </span>
  );
}

// --- Bars ------------------------------------------------------------------

export interface ScaleBand {
  from: number;
  to: number;
  color: string;
}

export interface ScaleMarker {
  value: number;
  color: string;
  caption?: string;
}

function positionPct(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || max <= min) return 0;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

/**
 * A value placed on a range: the price inside its 52-week band, the projection
 * percentiles, the analyst targets around today's price. Bands are filled
 * regions, markers are ticks with an optional caption underneath.
 */
export function ScaleBar({
  min,
  max,
  bands = [],
  markers = [],
  height = 10,
}: {
  min: number;
  max: number;
  bands?: ScaleBand[];
  markers?: ScaleMarker[];
  height?: number;
}) {
  const hasCaptions = markers.some((marker) => Boolean(marker.caption));
  return (
    <div>
      <div
        style={{
          position: 'relative',
          height,
          borderRadius: 'var(--radius-full)',
          background: 'rgba(255,255,255,0.07)',
          border: `1px solid ${DARK.hairline}`,
        }}
      >
        {bands.map((band, index) => {
          const left = positionPct(Math.min(band.from, band.to), min, max);
          const right = positionPct(Math.max(band.from, band.to), min, max);
          return (
            <div
              key={`band-${index}`}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${left}%`,
                width: `${Math.max(right - left, 0.4)}%`,
                background: band.color,
                borderRadius: 'var(--radius-full)',
              }}
            />
          );
        })}
        {markers.map((marker, index) => (
          <div
            key={`marker-${index}`}
            style={{
              position: 'absolute',
              top: -4,
              bottom: -4,
              left: `${positionPct(marker.value, min, max)}%`,
              width: 2,
              marginLeft: -1,
              background: marker.color,
              borderRadius: 1,
            }}
          />
        ))}
      </div>
      {hasCaptions && (
        <div style={{ position: 'relative', height: 20, marginTop: 6 }}>
          {markers.map((marker, index) => {
            if (!marker.caption) return null;
            const left = positionPct(marker.value, min, max);
            const shift = left < 12 ? '0' : left > 88 ? '-100%' : '-50%';
            return (
              <span
                key={`caption-${index}`}
                style={{
                  position: 'absolute',
                  left: `${left}%`,
                  transform: `translateX(${shift})`,
                  fontSize: 12,
                  whiteSpace: 'nowrap',
                  color: marker.color,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {marker.caption}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A 0-100 meter: sub-scores, confidence, a factor's share of its maximum. */
export function Meter({
  value,
  max = 100,
  color = DARK.gold,
  height = 6,
  track = 'rgba(255,255,255,0.10)',
}: {
  value: number | null;
  max?: number;
  color?: string;
  height?: number;
  track?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const filled = value === null || max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  return (
    <div
      style={{
        height,
        borderRadius: 'var(--radius-full)',
        background: track,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${filled * 100}%`,
          height: '100%',
          background: color,
          borderRadius: 'var(--radius-full)',
          transition: reduced ? 'none' : 'width .25s ease-out',
        }}
      />
    </div>
  );
}

// --- Dark-canvas form controls ---------------------------------------------

const fieldShell: CSSProperties = {
  height: 44,
  width: '100%',
  borderRadius: 'var(--radius-md)',
  border: `1px solid ${DARK.hairline}`,
  background: DARK.raised,
  color: DARK.text,
  padding: '0 14px',
  fontSize: 16,
  fontFamily: 'var(--font-body)',
  outline: 'none',
};

export function TextField({
  label,
  value,
  onChange,
  onEnter,
  placeholder,
  hint,
  uppercase = false,
  style,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  hint?: string;
  uppercase?: boolean;
  style?: CSSProperties;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      <Eyebrow>{label}</Eyebrow>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onEnter) onEnter();
        }}
        style={{
          ...fieldShell,
          textTransform: uppercase ? 'uppercase' : 'none',
          letterSpacing: uppercase ? '0.06em' : 'normal',
        }}
      />
      {hint && <span style={{ fontSize: 12, color: DARK.faint }}>{hint}</span>}
    </label>
  );
}

export interface Option {
  value: string;
  label: string;
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  hint,
  style,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  hint?: string;
  style?: CSSProperties;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      <Eyebrow>{label}</Eyebrow>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ ...fieldShell, cursor: 'pointer', appearance: 'none', paddingRight: 34 }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} style={{ color: '#1f2019', background: '#ffffff' }}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && <span style={{ fontSize: 12, color: DARK.faint }}>{hint}</span>}
    </label>
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  const reduced = usePrefersReducedMotion();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: DARK.text,
          fontSize: 14,
          fontFamily: 'var(--font-body)',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            width: 42,
            height: 24,
            flexShrink: 0,
            borderRadius: 'var(--radius-full)',
            background: checked ? DARK.gold : 'rgba(255,255,255,0.14)',
            border: `1px solid ${checked ? 'var(--gold-deep)' : DARK.hairline}`,
            position: 'relative',
            transition: reduced ? 'none' : 'background-color .15s ease-out',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: checked ? 20 : 2,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: checked ? 'var(--on-gold)' : '#ffffff',
              transition: reduced ? 'none' : 'left .15s ease-out',
            }}
          />
        </span>
        {label}
      </button>
      {hint && <span style={{ fontSize: 12, color: DARK.faint, paddingLeft: 52 }}>{hint}</span>}
    </div>
  );
}
