/** @vitest-environment jsdom */
import { createRoot, type Root } from 'react-dom/client';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// React 19 ships `act`, the bundled @types/react for this app predates it.
const act = (
  React as unknown as {
    act: (callback: () => void | Promise<void>) => Promise<void>;
  }
).act;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import NotificationBell from 'components/notifications/NotificationBell';

type Row = {
  id: number;
  title: string;
  body: string;
  type: string;
  link: string;
  read_at: string | null;
  created_at: string;
};

let rows: Row[] = [];
const posts: string[] = [];
let container: HTMLDivElement;
let root: Root;

function fixture(): Row[] {
  const now = Date.now();
  const at = (ms: number) => new Date(now - ms).toISOString();
  return [
    { id: 1, title: 'File due today', body: 'SPID/F/0001 is due today.', type: 'warning', link: '/admin/issued-files?file=1', read_at: null, created_at: at(60_000) },
    { id: 2, title: 'New staff file request', body: 'Chilly requested a file.', type: 'info', link: '/admin/staff-file-request?tab=pending&request=2', read_at: null, created_at: at(120_000) },
    { id: 3, title: 'Extension approved', body: 'Return date moved.', type: 'success', link: '/staff/your-requests?request=3', read_at: at(300_000), created_at: at(300_000) },
  ];
}

beforeEach(() => {
  rows = fixture();
  posts.length = 0;
  push.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if ((init?.method ?? 'GET') === 'POST') {
        posts.push(url);
        const id = Number(url.match(/notifications\/(\d+)/)?.[1]);
        const read = url.endsWith('/read');
        rows = rows.map((r) =>
          r.id === id ? { ...r, read_at: read ? new Date().toISOString() : null } : r,
        );
      }
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            notifications: rows,
            unreadCount: rows.filter((r) => !r.read_at).length,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function openPanel(): Promise<void> {
  act(() => {
    root = createRoot(container);
    root.render(<NotificationBell />);
  });
  const bell = container.querySelector('button[aria-label^="Notifications"]')!;
  await click(bell);
  await waitForRows();
}

function click(el: Element): Promise<void> {
  return act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // The read/unread write is a fetch followed by a state update, so the whole
    // microtask + macrotask chain has to settle before asserting.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function envelope(title: string): HTMLElement {
  const el = container.querySelector(
    `button[aria-label="Mark “${title}” as read"], button[aria-label="Mark “${title}” as unread"]`,
  );
  if (!el) throw new Error(`no envelope for ${title}`);
  return el as HTMLElement;
}

/** The record button inside a row; the envelope is its sibling. */
function rowTrigger(title: string): HTMLElement {
  const item = [...container.querySelectorAll('li')].find((li) =>
    li.textContent?.includes(title),
  )!;
  return [...item.querySelectorAll('button')].find((b) =>
    b.className.includes('text-left'),
  ) as HTMLElement;
}

async function waitForRows(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('NotificationBell read/unread envelope', () => {
  it('marks an unread notification read without navigating', async () => {
    await openPanel();
    expect(container.querySelectorAll('li').length).toBe(3);
    await click(envelope('File due today'));

    expect(posts).toContain('/api/notifications/1/read');
    expect(push).not.toHaveBeenCalled();
    expect(envelope('File due today').getAttribute('aria-label')).toBe(
      'Mark “File due today” as unread',
    );
  });

  it('marks a read notification unread again', async () => {
    await openPanel();
    await click(envelope('Extension approved'));
    expect(posts).toContain('/api/notifications/3/unread');
    expect(push).not.toHaveBeenCalled();
  });

  it('keeps the unread badge in sync with the last write', async () => {
    await openPanel();
    expect(container.querySelector('button[aria-label^="Notifications"]')?.getAttribute('aria-label')).toBe(
      'Notifications, 2 unread',
    );
    await click(envelope('File due today'));
    expect(container.querySelector('button[aria-label^="Notifications"]')?.getAttribute('aria-label')).toBe(
      'Notifications, 1 unread',
    );
  });

  it('navigates to the record destination and marks the row read', async () => {
    await openPanel();
    await click(rowTrigger('New staff file request'));
    expect(push).toHaveBeenCalledWith('/admin/staff-file-request?tab=pending&request=2');
    expect(posts).toContain('/api/notifications/2/read');
  });

  it('closes the panel after navigating', async () => {
    await openPanel();
    await click(rowTrigger('File due today'));
    expect(push).toHaveBeenCalledWith('/admin/issued-files?file=1');
    expect(container.querySelector('ul')).toBeNull();
  });
});
