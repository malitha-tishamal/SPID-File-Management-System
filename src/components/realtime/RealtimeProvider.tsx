'use client';
/**
 * ONE shared Supabase Realtime mechanism for the whole app.
 *
 * `RealtimeProvider` owns the browser client, channel reference counting
 * and connection status. Pages subscribe through `useRealtimeTable` — they
 * never create their own channels. Events are NOT rendered directly; the
 * hook debounces bursts (~300 ms) and callers revalidate through their
 * normal authorised API fetches.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getSupabaseBrowserClient } from 'config/supabase/client';

export type RealtimeStatus = 'LIVE' | 'RECONNECTING' | 'OFFLINE';

interface ChannelEntry {
  channel: any;
  refs: number;
  listeners: Set<(payload: any) => void>;
}

interface RealtimeContextValue {
  status: RealtimeStatus;
  subscribe: (table: string, filter: string | undefined, cb: (p: any) => void) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);
const channels = new Map<string, ChannelEntry>();
const DEBOUNCE_MS = 300;

function channelKey(table: string, filter?: string) {
  return `${table}|${filter ?? '*'}`;
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<RealtimeStatus>('OFFLINE');
  const subscribedRef = useRef(false);
  const listenersRef = useRef(new Map<string, Set<(p: any) => void>>());

  const ensureChannel = useCallback((table: string, filter?: string) => {
    const key = channelKey(table, filter);
    let entry = channels.get(key);
    if (entry) return entry;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase.channel(`rt:${key}`);
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
      (payload: any) => {
        const set = listenersRef.current.get(key);
        set?.forEach((cb) => {
          try { cb(payload); } catch {}
        });
      }
    );
    entry = { channel, refs: 0, listeners: new Set() };
    channels.set(key, entry);
    listenersRef.current.set(key, entry.listeners);
    channel.subscribe((s: string) => {
      if (s === 'SUBSCRIBED') {
        subscribedRef.current = true;
        setStatus('LIVE');
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
        setStatus(subscribedRef.current ? 'RECONNECTING' : 'OFFLINE');
      }
    });
    return entry;
  }, []);

  const subscribe = useCallback(
    (table: string, filter: string | undefined, cb: (p: any) => void) => {
      const key = channelKey(table, filter);
      const entry = ensureChannel(table, filter);
      entry.refs += 1;
      entry.listeners.add(cb);
      return () => {
        entry.listeners.delete(cb);
        entry.refs -= 1;
        if (entry.refs <= 0) {
          channels.delete(key);
          listenersRef.current.delete(key);
          try { getSupabaseBrowserClient().removeChannel(entry.channel); } catch {}
        }
      };
    },
    [ensureChannel]
  );

  // Auth token for realtime + visibility/online catch-up.
  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (token && mounted) supabase.realtime.setAuth(token);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        channels.forEach((e) => e.listeners.forEach((cb) => { try { cb({ eventType: 'RESYNC' }); } catch {} }));
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, []);

  const value = useMemo(() => ({ status, subscribe }), [status, subscribe]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue | null {
  return useContext(RealtimeContext);
}

/**
 * Subscribe to Postgres Changes on one table. `onChange` fires at most once
 * per DEBOUNCE_MS burst; RESYNC pseudo-events fire on reconnect/visibility.
 */
export function useRealtimeTable(options: {
  table: string;
  filter?: string;
  onChange: (payload: any) => void;
  enabled?: boolean;
}) {
  const rt = useRealtime();
  const cbRef = useRef(options.onChange);
  cbRef.current = options.onChange;
  const { table, filter, enabled = true } = options;

  useEffect(() => {
    if (!rt || !enabled) return;
    let timer: number | undefined;
    const unsubscribe = rt.subscribe(table, filter, (payload) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => cbRef.current(payload), DEBOUNCE_MS);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [rt, table, filter, enabled]);
}

/** Connection indicator state for the top bar. */
export function useRealtimeStatus(): RealtimeStatus {
  return useRealtime()?.status ?? 'OFFLINE';
}
