import { useEffect, useState } from 'react';

/** Media queries in JS, because the table has to become a list, not just reflow. */
export function useMediaQuery(query: string): boolean {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [matches, setMatches] = useState(() => (supported ? window.matchMedia(query).matches : false));

  useEffect(() => {
    if (!supported) return;
    const list = window.matchMedia(query);
    const handle = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener('change', handle);
    return () => list.removeEventListener('change', handle);
  }, [query, supported]);

  return matches;
}

/** Below this the positions table collapses into a list. */
export function useIsNarrow(): boolean {
  return useMediaQuery('(max-width: 860px)');
}
