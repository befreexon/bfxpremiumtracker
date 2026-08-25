import { useCallback, useEffect, useState } from 'react';

interface State<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Runs one analysis call and keeps its three states apart.
 *
 * These calls reach out to a market data provider, so a failure is ordinary
 * rather than exceptional and has to render as a sentence the user can act on.
 */
export function useQuant<T>(call: () => Promise<T>, deps: unknown[], enabled = true) {
  const [state, setState] = useState<State<T>>({ data: null, loading: enabled, error: null });

  const run = useCallback(async () => {
    setState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      setState({ data: await call(), loading: false, error: null });
    } catch (err) {
      setState({
        data: null,
        loading: false,
        error: err instanceof Error ? err.message : 'Analýzu se nepodařilo spočítat.',
      });
    }
    // The caller controls when this re-runs through `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    void (async () => {
      await run();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, enabled]);

  return { ...state, reload: run };
}
