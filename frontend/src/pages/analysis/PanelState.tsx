import { Button } from '../../design/components';

interface PanelStateProps {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  busyLabel?: string;
}

/** The loading and error halves of a panel, so every panel fails the same way. */
export function PanelState({ loading, error, onRetry, busyLabel = 'Počítám…' }: PanelStateProps) {
  if (loading) {
    return <div style={{ color: 'var(--on-dark-mute)', fontSize: 15, padding: '24px 0' }}>{busyLabel}</div>;
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start', padding: '16px 0' }}>
        <div style={{ color: 'var(--loss-on-dark)', fontSize: 15, lineHeight: 1.5, maxWidth: 560 }}>{error}</div>
        <Button size="sm" variant="outline-dark" onClick={onRetry}>
          Zkusit znovu
        </Button>
      </div>
    );
  }

  return null;
}
