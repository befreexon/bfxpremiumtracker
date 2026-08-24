import { Card } from '../../design/components';

interface StatCardProps {
  label: string;
  value: string;
  tone?: 'positive' | 'negative' | 'neutral';
}

const toneColor = {
  positive: '#7fbf8f',
  negative: '#e3897f',
  neutral: '#fff',
};

export function StatCard({ label, value, tone = 'neutral' }: StatCardProps) {
  return (
    <Card elevated style={{ flex: '1 1 160px', minWidth: 150 }}>
      <div style={{ fontSize: 13, color: 'var(--on-dark-mute)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: toneColor[tone] }}>{value}</div>
    </Card>
  );
}
