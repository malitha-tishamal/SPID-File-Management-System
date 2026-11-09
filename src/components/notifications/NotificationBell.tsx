'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  FiBell,
  FiCheckCircle,
  FiAlertCircle,
  FiInfo,
  FiXCircle,
  FiFileText,
  FiDownload,
} from 'react-icons/fi';
import { MdMarkEmailRead, MdMarkEmailUnread } from 'react-icons/md';
import { resolveNotificationMessage } from 'lib/notificationMessage';
import { useLocalizedFields } from 'lib/useLocalizedFields';
import { getSupabaseBrowserClient } from 'config/supabase/client';

type NotificationType = 'info' | 'success' | 'warning' | 'error';

interface NotificationRow {
  id: number;
  title: string;
  body: string | null;
  title_key?: string | null;
  body_key?: string | null;
  params?: Record<string, unknown> | null;
  type: NotificationType;
  link: string | null;
  /** Semantic event kind + request reference (migration 0029). */
  kind?: string | null;
  ref_type?: string | null;
  ref_id?: number | null;
  status?: 'ACTIVE' | 'RESOLVED' | string | null;
  resolution?: 'APPROVED' | 'REJECTED' | 'CANCELLED' | string | null;
  resolved_by_name?: string | null;
  read_at: string | null;
  created_at: string;
}

/** Rows without a status column (pre-0029 databases) count as ACTIVE. */
function isActive(item: NotificationRow): boolean {
  return (item.status ?? 'ACTIVE') === 'ACTIVE';
}

/** Icon + colours per semantic kind; falls back to the severity styling. */
const kindMeta: Record<
  string,
  { icon: React.ReactNode; className: string }
> = {
  FILE_ADD_REQUESTED: {
    icon: <FiFileText className="h-4 w-4" />,
    className:
      'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
  },
  FILE_ISSUE_REQUESTED: {
    icon: <FiDownload className="h-4 w-4" />,
    className:
      'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300',
  },
  FILE_ADD_APPROVED: {
    icon: <FiCheckCircle className="h-4 w-4" />,
    className:
      'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  FILE_ISSUE_APPROVED: {
    icon: <FiCheckCircle className="h-4 w-4" />,
    className:
      'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  FILE_ADD_REJECTED: {
    icon: <FiXCircle className="h-4 w-4" />,
    className:
      'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
  },
  FILE_ISSUE_REJECTED: {
    icon: <FiXCircle className="h-4 w-4" />,
    className:
      'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
  },
};

const POLL_INTERVAL_MS = 30_000;

const typeIcon: Record<NotificationType, React.ReactNode> = {
  info: <FiInfo className="h-4 w-4" />,
  success: <FiCheckCircle className="h-4 w-4" />,
  warning: <FiAlertCircle className="h-4 w-4" />,
  error: <FiXCircle className="h-4 w-4" />,
};

const typeClass: Record<NotificationType, string> = {
  info: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300',
  success: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
  error: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
};

function timeAgo(
  value: string,
  t: (key: string, options?: { count: number }) => string,
): string {
  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return t('relative.justNow');
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return t('relative.justNow');
  if (minutes < 60) return t('relative.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('relative.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('relative.daysAgo', { count: days });
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  });
}

/**
 * Polls the authenticated user's own notifications. The API never returns
 * another user's rows, and read/unread is always written to the database first:
 * the panel optimistically repaints, then resynchronises from the server if the
 * write did not land.
 */
export default function NotificationBell() {
  const router = useRouter();
  const { t } = useTranslation('notifications');
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const containerRef = useRef<HTMLDivElement>(null);

  // Only free-text parameters are translated. Names, file numbers and dates
  // keep the values the server stored.
  const contentParams = useMemo(
    () =>
      notifications.flatMap((item) => {
        const params = item.params ?? {};
        const values: string[] = [];
        if (typeof params.fileName === 'string') values.push(params.fileName);
        if (typeof params.reason === 'string') values.push(params.reason);
        if (typeof params.priority === 'string') values.push(params.priority);
        return values;
      }),
    [notifications],
  );
  const localizedParams = useLocalizedFields(contentParams);
  const paramMap = useMemo(() => {
    const map = new Map<string, string>();
    contentParams.forEach((value, index) => map.set(value, localizedParams[index]));
    return map;
  }, [contentParams, localizedParams]);
  const localizeParam = useCallback(
    (value: string) => paramMap.get(value) ?? value,
    [paramMap],
  );

  const load = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store' });
      if (!response.ok) return;
      const json = await response.json();
      if (!json?.ok) return;
      setNotifications(json.data?.notifications ?? []);
      setUnreadCount(json.data?.unreadCount ?? 0);
    } catch {
      // A failed poll keeps the last known list rather than clearing it.
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  // Supabase Realtime: any change to this user's notification rows (RLS already
  // limits postgres_changes to rows the session may SELECT) reloads the list
  // and badge, debounced to absorb bursts. The 30s poll above remains as the
  // fallback while the channel is not subscribed.
  useEffect(() => {
    let supabase: ReturnType<typeof getSupabaseBrowserClient> | null = null;
    let channel: { unsubscribe: () => void } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      supabase = getSupabaseBrowserClient();
      channel = supabase
        .channel('notifications-bell')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications' },
          () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => void load(), 300);
          },
        )
        .subscribe();
    } catch {
      // Realtime unavailable (missing env or client) — polling still works.
    }
    return () => {
      if (timer) clearTimeout(timer);
      try {
        if (channel && supabase) void supabase.removeChannel(channel as never);
      } catch {
        // best-effort cleanup
      }
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickAway);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  /** Writes the read state, and only keeps the repaint if the server agreed. */
  const setReadState = useCallback(
    async (item: NotificationRow, read: boolean) => {
      const stamp = new Date().toISOString();
      setNotifications((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? { ...entry, read_at: read ? (entry.read_at ?? stamp) : null }
            : entry,
        ),
      );
      setUnreadCount((count) =>
        Math.max(0, count + (read ? -1 : 1)),
      );

      try {
        const response = await fetch(
          `/api/notifications/${item.id}/${read ? 'read' : 'unread'}`,
          { method: 'POST' },
        );
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.ok) throw new Error('write failed');
        if (typeof json.data?.unreadCount === 'number') {
          setUnreadCount(Math.max(0, json.data.unreadCount));
        }
      } catch {
        void load();
      }
    },
    [load],
  );

  const markAllRead = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/notifications/read-all', { method: 'POST' });
      if (!response.ok) void load();
      else {
        const now = new Date().toISOString();
        setNotifications((current) =>
          current.map((item) => ({ ...item, read_at: item.read_at ?? now })),
        );
        setUnreadCount(0);
      }
    } catch {
      void load();
    } finally {
      setLoading(false);
    }
  };

  /** Row click: goes to the record the notification is about, and marks it read. */
  const openNotification = (item: NotificationRow) => {
    if (!item.read_at) void setReadState(item, true);
    if (item.link) {
      setOpen(false);
      router.push(item.link);
      return;
    }
    setExpandedId((id) => (id === item.id ? null : item.id));
  };

  const visible = notifications.filter(
    (item) => isActive(item) === (tab === 'active'),
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          void load();
        }}
        aria-label={
          unreadCount
            ? t('bell.ariaLabelUnread', { count: unreadCount })
            : t('bell.ariaLabel')
        }
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-navy-700 cursor-pointer"
      >
        <FiBell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white shadow-sm">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-navy-700 dark:bg-navy-800">
          <div className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3 dark:border-navy-700 dark:bg-navy-800">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-extrabold text-slate-800 dark:text-white">
                {t('panel.title')}
              </h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-[#4318FF]/10 px-2 py-0.5 text-[10px] font-bold text-[#4318FF] dark:bg-brand-900/40 dark:text-brand-300">
                  {t('panel.newCount', { count: unreadCount })}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                disabled={loading}
                className="text-[10px] font-bold text-slate-500 underline-offset-2 hover:text-[#4318FF] hover:underline dark:text-slate-400 disabled:opacity-50 cursor-pointer"
              >
                {t('panel.markAllRead')}
              </button>
            )}
          </div>

          <div className="flex gap-1 border-b border-slate-100 bg-slate-50 px-3 py-1.5 dark:border-navy-700 dark:bg-navy-900/40">
            {(['active', 'history'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={`rounded-lg px-3 py-1 text-[10px] font-bold transition-colors cursor-pointer ${
                  tab === value
                    ? 'bg-white text-[#4318FF] shadow-sm dark:bg-navy-800 dark:text-brand-300'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {value === 'active' ? t('panel.tabActive') : t('panel.tabHistory')}
              </button>
            ))}
          </div>

          <div className="max-h-[min(60vh,26rem)] overflow-y-auto bg-white dark:bg-navy-800">
            {visible.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <FiCheckCircle className="mx-auto h-7 w-7 text-slate-300 dark:text-navy-600" />
                <p className="mt-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  {tab === 'active'
                    ? t('panel.allCaughtUp')
                    : t('panel.historyEmpty')}
                </p>
                {tab === 'active' && (
                  <p className="mt-1 text-[10px] text-slate-400">
                    {t('panel.allCaughtUpHint')}
                  </p>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-navy-700/70">
                {visible.map((item) => {
                  const active = isActive(item);
                  const unread = active && !item.read_at;
                  const title = resolveNotificationMessage(item, 'title', localizeParam);
                  const body = resolveNotificationMessage(item, 'body', localizeParam);
                  const kind = item.kind ? kindMeta[item.kind] : undefined;
                  const icon = kind?.icon ?? typeIcon[item.type];
                  const iconClass =
                    kind?.className ?? typeClass[item.type];
                  return (
                    <li
                      key={item.id}
                      className={`flex gap-3 px-4 py-3 transition-colors ${
                        !active
                          ? 'bg-slate-50/40 dark:bg-navy-900/20'
                          : unread
                            ? 'bg-[#4318FF]/[0.05] dark:bg-brand-900/20'
                            : 'bg-slate-50/70 dark:bg-navy-900/30'
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                          iconClass
                        } ${unread || !active ? '' : 'opacity-75'}`}
                      >
                        {icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => openNotification(item)}
                          className="w-full text-left cursor-pointer"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={`text-[11px] leading-snug ${
                                unread
                                  ? 'font-extrabold text-slate-800 dark:text-white'
                                  : 'font-semibold text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {title}
                            </p>
                            {unread && (
                              <span
                                aria-label={t('item.unread')}
                                className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#4318FF] dark:bg-brand-300"
                              />
                            )}
                          </div>
                          <p
                            className={`mt-1 break-words text-[11px] leading-relaxed ${
                              expandedId === item.id
                                ? ''
                                : 'line-clamp-2'
                            } ${
                              unread
                                ? 'text-slate-500 dark:text-slate-400'
                                : 'text-slate-400 dark:text-slate-500'
                            }`}
                            title={body || undefined}
                          >
                            {body || t('item.noDetails')}
                          </p>
                          {!active && item.resolution && (
                            <p className="mt-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                              {t(`item.resolved.${item.resolution}`, {
                                name: item.resolved_by_name || '—',
                              })}
                            </p>
                          )}
                          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
                            <span>{timeAgo(item.created_at, t)}</span>
                            {item.link && (
                              <span className="font-bold text-[#4318FF] dark:text-brand-300">
                                {t('item.openRecord')}
                              </span>
                            )}
                          </div>
                        </button>
                      </div>
                      {active && (
                      <button
                        type="button"
                        onClick={() => void setReadState(item, !Boolean(item.read_at))}
                        aria-label={
                          unread
                            ? t('item.markAsReadAria', { title })
                            : t('item.markAsUnreadAria', { title })
                        }
                        title={unread ? t('item.markAsRead') : t('item.markAsUnread')}
                        className="flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#4318FF] dark:text-slate-500 dark:hover:bg-navy-700 dark:hover:text-brand-300 cursor-pointer"
                      >
                        {unread ? (
                          <MdMarkEmailUnread className="h-[18px] w-[18px]" />
                        ) : (
                          <MdMarkEmailRead className="h-[18px] w-[18px]" />
                        )}
                      </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
