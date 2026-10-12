// Hooks shared by the auth pages: site config, the lazily loaded Firebase kit, cooldowns.
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchConfig, type SiteConfig } from '../lib/api';
import { loadAuthKit, type AuthKit } from '../lib/auth-kit';

export type ConfigState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; config: SiteConfig };

/** GET /api/config (cached for the page). */
export function useSiteConfig(): ConfigState {
  const [state, setState] = useState<ConfigState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let live = true;
    fetchConfig().then(
      (config) => live && setState({ status: 'ready', config }),
      () => live && setState({ status: 'error', retry }),
    );
    return () => {
      live = false;
    };
  }, [attempt, retry]);

  return state;
}

export type KitState = { status: 'idle' | 'loading' | 'error' } | { status: 'ready'; kit: AuthKit };

/**
 * The Firebase kit, loaded as soon as the page knows it runs in "firebase" mode, so that the
 * Google button can open its popup straight from the click (popup blockers need that).
 */
export function useAuthKit(config: SiteConfig | null): KitState {
  const [state, setState] = useState<KitState>({ status: 'idle' });
  useEffect(() => {
    if (!config || config.authMode !== 'firebase') return;
    let live = true;
    setState({ status: 'loading' });
    loadAuthKit(config).then(
      (kit) => live && setState({ status: 'ready', kit }),
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [config]);
  return state;
}

/** A countdown in whole seconds: `start()` begins it, `remaining` is 0 when it has run out. */
export function useCooldown(seconds: number): { remaining: number; start: () => void } {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    if (until <= Date.now()) return;
    timer.current = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= until) clearInterval(timer.current);
    }, 1000);
    return () => clearInterval(timer.current);
  }, [until]);

  const start = useCallback(() => {
    const t = Date.now();
    setNow(t);
    setUntil(t + seconds * 1000);
  }, [seconds]);

  return { remaining: Math.max(0, Math.ceil((until - now) / 1000)), start };
}
