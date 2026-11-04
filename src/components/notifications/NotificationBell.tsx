'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FiBell,
  FiCheckCircle,
  FiAlertCircle,
  FiInfo,
  FiXCircle,
} from 'react-icons/fi';
import { MdMarkEmailRead, MdMarkEmailUnread } from 'react-icons/md';

type NotificationType = 'info' | 'success' | 'warning' | 'error';

interface NotificationRow {
  id: number;
  title: string;
  body: string | null;
  type: NotificationType;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

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

function timeAgo(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 'just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
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
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          void load();
        }}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
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
                Notifications
              </h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-[#4318FF]/10 px-2 py-0.5 text-[10px] font-bold text-[#4318FF] dark:bg-brand-900/40 dark:text-brand-300">
                  {unreadCount} new
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
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[min(60vh,26rem)] overflow-y-auto bg-white dark:bg-navy-800">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <FiCheckCircle className="mx-auto h-7 w-7 text-slate-300 dark:text-navy-600" />
                <p className="mt-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  You&apos;re all caught up.
                </p>
                <p className="mt-1 text-[10px] text-slate-400">
                  File request updates will appear here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-navy-700/70">
                {notifications.map((item) => {
                  const unread = !item.read_at;
                  return (
                    <li
                      key={item.id}
                      className={`flex gap-3 px-4 py-3 transition-colors ${
                        unread
                          ? 'bg-[#4318FF]/[0.05] dark:bg-brand-900/20'
                          : 'bg-slate-50/70 dark:bg-navy-900/30'
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                          typeClass[item.type]
                        } ${unread ? '' : 'opacity-75'}`}
                      >
                        {typeIcon[item.type]}
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
                              {item.title}
                            </p>
                            {unread && (
                              <span
                                aria-label="Unread"
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
                          >
                            {item.body || 'No further details.'}
                          </p>
                          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
                            <span>{timeAgo(item.created_at)}</span>
                            {item.link && (
                              <span className="font-bold text-[#4318FF] dark:text-brand-300">
                                Open record
                              </span>
                            )}
                          </div>
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => void setReadState(item, !Boolean(item.read_at))}
                        aria-label={
                          unread
                            ? `Mark “${item.title}” as read`
                            : `Mark “${item.title}” as unread`
                        }
                        title={unread ? 'Mark as read' : 'Mark as unread'}
                        className="flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#4318FF] dark:text-slate-500 dark:hover:bg-navy-700 dark:hover:text-brand-300 cursor-pointer"
                      >
                        {unread ? (
                          <MdMarkEmailUnread className="h-[18px] w-[18px]" />
                        ) : (
                          <MdMarkEmailRead className="h-[18px] w-[18px]" />
                        )}
                      </button>
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
