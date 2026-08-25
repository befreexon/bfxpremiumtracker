/** Shared recharts styling for the dark canvas, so the charts read as one set. */

export const GRID = 'rgba(255,255,255,0.08)';
export const AXIS_TICK = { fill: 'rgba(255,255,255,0.5)', fontSize: 11 } as const;
export const SERIES_PRIMARY = '#dcb45c';
export const SERIES_SECONDARY = '#6f9bc4';

export const TOOLTIP_STYLE = {
  background: '#2d2f2c',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10,
  color: '#fff',
} as const;

export const TOOLTIP_LABEL_STYLE = { color: 'rgba(255,255,255,0.6)' } as const;

export const AXIS_PROPS = {
  tick: AXIS_TICK,
  axisLine: false,
  tickLine: false,
} as const;
