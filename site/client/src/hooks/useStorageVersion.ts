import { useEffect, useState } from 'react';

/**
 * A counter that changes whenever hub progress in localStorage may have changed under us:
 * another tab wrote to storage, the page came back from the back/forward cache (the usual way
 * back from a hub, which is a full navigation away), or the tab became visible again.
 * Components re-read local progress when it changes.
 */
export function useStorageVersion(): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((n) => n + 1);
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) bump();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') bump();
    };
    window.addEventListener('storage', bump);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('storage', bump);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return version;
}
