import { useCallback, useEffect, useState } from 'react';
import { CatalogError, fetchCatalog, type HubEntry } from '../lib/catalog';

export type CatalogState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; hubs: HubEntry[] };

/** Loads `/catalog.json` once per mount; `retry()` loads it again after an error. */
export function useCatalog(): { state: CatalogState; retry: () => void } {
  const [state, setState] = useState<CatalogState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchCatalog(controller.signal).then(
      (hubs) => {
        if (!controller.signal.aborted) setState({ status: 'ready', hubs });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return; // unmounted or superseded: not a real failure
        const message = error instanceof CatalogError ? error.message : 'Something went wrong.';
        setState({ status: 'error', message });
      },
    );
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}
