/** @vitest-environment jsdom */
/**
 * The admin queue's filter toolbar, rendered against the real page.
 *
 * Three things have to stay true at once: the default screen is the queue exactly
 * as it has always been, the toolbar only decides which rows are visible and in
 * what order, and the competing ranking — shading, badges, who may be approved —
 * is always read off the FULL pending list so hiding a leader cannot promote the
 * row behind it. The network and the Supabase browser client are replaced, which
 * is as close to the browser as this environment allows.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const act = (
  React as unknown as {
    act: (callback: () => void | Promise<void>) => Promise<void>;
  }
).act;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const toasts = vi.hoisted(() => [] as { type?: string; title?: string }[]);
const showToast = vi.hoisted(() => (toast: { type?: string; title?: string }) => {
  toasts.push(toast);
});

vi.mock('components/toast/ToastContext', () => ({
  useToast: () => ({ showToast }),
}));

const realtime = vi.hoisted(() => ({ channels: [] as any[] }));

vi.mock('config/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    channel(name: string) {
      const ch: any = {
        name,
        handlers: [] as ((payload: any) => void)[],
        on(_event: string, _config: any, handler: (payload: any) => void) {
          ch.handlers.push(handler);
          return ch;
        },
        subscribe() {
          realtime.channels.push(ch);
          return ch;
        },
      };
      return ch;
    },
    removeChannel() {},
  }),
}));

import StaffFileRequestPage from '../src/app/admin/staff-file-request/page';
import { setQueryParam } from 'lib/deep-link';

type Row = Record<string, any>;

function pending(overrides: Row = {}): Row {
  return {
    file_id: 1,
    file_no: 'DE-01',
    file_name: 'Annual Plan',
    section_name: 'Planning',
    storage_location: 'Record Room A — Bay 3',
    requester_id: 'staff-1',
    requester_name: 'Saumya Silva',
    requester_email: 'saumya@spid.gov.lk',
    requester_section: 'Planning',
    request_date: '2026-11-20',
    duration_days: 7,
    priority: 'NORMAL',
    status: 'PENDING',
    admin_notes: null,
    created_at: '2026-11-01T08:00:00+05:30',
    ...overrides,
  };
}

/**
 * Two competing pairs, one single request and one same-priority pair, handed to
 * the page in an order that is deliberately not the grouped order:
 * 89/88 share DE-04 (HIGH beats LOW), 81/79 share DE-01 (HIGH beats NORMAL),
 * 85/86 share DE-03 (both NORMAL, so the earlier submission leads), 83 is alone.
 */
const FIXTURE: Row[] = [
  pending({ id: 83, file_id: 2, file_no: 'DE-02', file_name: 'Audit File', priority: 'LOW', created_at: '2026-11-01T07:00:00+05:30', requester_name: 'Nimal Fernando', requester_email: 'nimal@spid.gov.lk' }),
  pending({ id: 79, file_id: 1, priority: 'NORMAL', created_at: '2026-11-01T08:00:00+05:30' }),
  pending({ id: 85, file_id: 3, file_no: 'DE-03', file_name: 'Register of Works', priority: 'NORMAL', created_at: '2026-11-01T07:30:00+05:30', requester_name: 'Kamal Perera', requester_email: 'kamal@spid.gov.lk' }),
  pending({ id: 86, file_id: 3, file_no: 'DE-03', file_name: 'Register of Works', priority: 'NORMAL', created_at: '2026-11-01T08:30:00+05:30', requester_name: 'Kamal Perera', requester_email: 'kamal@spid.gov.lk' }),
  pending({ id: 81, file_id: 1, priority: 'HIGH', created_at: '2026-11-01T09:00:00+05:30' }),
  pending({ id: 88, file_id: 4, file_no: 'DE-04', file_name: 'Village Circulars', priority: 'LOW', created_at: '2026-11-01T06:00:00+05:30', requester_name: 'Nimal Fernando', requester_email: 'nimal@spid.gov.lk' }),
  pending({ id: 89, file_id: 4, file_no: 'DE-04', file_name: 'Village Circulars', priority: 'HIGH', created_at: '2026-11-01T06:30:00+05:30', requester_name: 'Kamal Perera', requester_email: 'kamal@spid.gov.lk' }),
];

const server: { requests: Row[]; patches: { id: number; body: any }[] } = {
  requests: [],
  patches: [],
};

let container: HTMLDivElement;
let root: Root;
let isMounted = false;

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

beforeEach(() => {
  toasts.length = 0;
  realtime.channels.length = 0;
  server.requests = FIXTURE.map((row) => ({ ...row }));
  server.patches = [];
  // A clean address per test: the toolbar both reads and writes the query string.
  window.history.replaceState({}, '', '/admin/staff-file-request');

  container = document.createElement('div');
  document.body.appendChild(container);

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method || 'GET').toUpperCase();

      const patch = url.match(/\/api\/admin\/file-requests\/(\d+)$/);
      if (method === 'PATCH' && patch) {
        server.patches.push({ id: Number(patch[1]), body: JSON.parse(String(init?.body)) });
        return { ok: true, status: 200, json: async () => ({ ok: true, data: { request: {}, message: 'ok' } }) } as Response;
      }
      if (url.includes('/api/admin/file-request-extensions')) {
        return { ok: true, status: 200, json: async () => ({ ok: true, data: { extensions: [] } }) } as Response;
      }
      if (url.includes('/api/admin/file-requests')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            data: { requests: server.requests, counts: { pending: server.requests.length } },
          }),
        } as Response;
      }
      throw new Error(`unstubbed request: ${method} ${url}`);
    }),
  );
});

afterEach(async () => {
  if (isMounted) await act(async () => root.unmount());
  isMounted = false;
  container.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

async function render() {
  root = createRoot(container);
  isMounted = true;
  await act(async () => {
    root.render(React.createElement(StaffFileRequestPage));
  });
  await flush();
}

function searchBox(): HTMLInputElement {
  const input = container.querySelector('#admin-requests-search');
  if (!input) throw new Error('the search box is missing');
  return input as HTMLInputElement;
}

function prioritySelect(): HTMLSelectElement {
  return container.querySelector('#admin-requests-priority') as HTMLSelectElement;
}

function groupToggle(): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((el) =>
    (el.textContent ?? '').includes('Group same-file requests'),
  );
  if (!button) throw new Error('the grouping switch is missing');
  return button as HTMLButtonElement;
}

function rows(): HTMLTableRowElement[] {
  return Array.from(container.querySelectorAll('tbody tr'));
}

function visibleIds(): number[] {
  return rows().map((tr) => Number((tr.cells[0]?.textContent ?? '').replace('#', '')));
}

function classOf(id: number): string {
  const row = rows().find((tr) => (tr.cells[0]?.textContent ?? '').trim() === `#${id}`);
  return row ? (row.getAttribute('class') ?? '') : '';
}

async function type(value: string) {
  const input = searchBox();
  // React tracks the value it last rendered on its own descriptor, so writing
  // `input.value` directly would look like no change and never fire onChange.
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  await act(async () => {
    input.focus();
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function choosePriority(value: string) {
  await act(async () => {
    prioritySelect().value = value;
    prioritySelect().dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function dialog(): Element | undefined {
  return Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]')).find((el) =>
    (el.textContent ?? '').includes('Competing Request Allocation Notice'),
  );
}

function buttonIn(scope: ParentNode, label: string): HTMLButtonElement | undefined {
  return Array.from(scope.querySelectorAll('button')).find((el) =>
    (el.textContent ?? '').trim().startsWith(label),
  ) as HTMLButtonElement | undefined;
}

describe('The default screen is the queue as it always was', () => {
  it('shows every row in the order the API sent them, with the toolbar untouched', async () => {
    await render();

    expect(searchBox().value).toBe('');
    expect(prioritySelect().value).toBe('ALL');
    expect(groupToggle().getAttribute('aria-pressed')).toBe('false');
    // No filters means nothing to announce and nothing to add to the address.
    expect(container.querySelector('#admin-requests-count')).toBeNull();
    expect(window.location.search).toBe('');

    expect(visibleIds()).toEqual([83, 79, 85, 86, 81, 88, 89]);
    expect(classOf(81)).toContain('border-l-4 border-red-500');
    expect(classOf(88)).toContain('border-l-4 border-orange-300');
    expect(rows().map((tr) => tr.getAttribute('class') ?? '').join(' ')).not.toContain('inset_0_3px');
  });

  it('leaves the extensions tab without a toolbar, since it is a different list', async () => {
    await render();
    const extensionsTab = Array.from(container.querySelectorAll('button')).find((el) =>
      (el.textContent ?? '').includes('Extension Requests'),
    );
    expect(extensionsTab).toBeDefined();
    await click(extensionsTab!);
    expect(container.querySelector('#admin-requests-search')).toBeNull();
  });
});

describe('Priority filter', () => {
  it('narrows the rows and reports how many are shown', async () => {
    await render();
    await choosePriority('HIGH');

    expect(visibleIds()).toEqual([81, 89]);
    expect(container.querySelector('#admin-requests-count')?.textContent).toContain('Showing 2 of 7 requests');
    expect(classOf(81)).toContain('border-l-4 border-red-500');
  });

  it('keeps a row behind a hidden leader shaded but not approvable', async () => {
    await render();
    // 89, the leader for DE-04, is filtered out of sight entirely.
    await choosePriority('LOW');
    expect(visibleIds()).toEqual([83, 88]);

    // 88 lost to the hidden HIGH request, so it stays orange and 83 stays plain.
    expect(classOf(88)).toContain('border-l-4 border-orange-300');
    expect(classOf(88)).not.toContain('border-red');
    expect(classOf(83)).not.toContain('border-l-');

    const row88 = rows().find((tr) => (tr.cells[0]?.textContent ?? '').trim() === '#88');
    const approve = buttonIn(row88!, 'Approve')!;
    expect(approve.disabled).toBe(true);
    expect(approve.getAttribute('aria-disabled')).toBe('true');
    expect(approve.getAttribute('title')).toContain('higher priority request exists');
    // Reject and View stay available for a non-leader.
    expect(buttonIn(row88!, 'Reject')!.disabled).toBe(false);
    expect(row88!.querySelector('button[aria-label="View full request details"]')).toBeTruthy();

    await click(approve);

    // The client blocks the action outright and never reaches the server.
    expect(dialog()).toBeUndefined();
    expect(server.patches).toEqual([]);
  });

  it('restores the whole queue when switched back to All', async () => {
    await render();
    await choosePriority('NORMAL');
    expect(visibleIds()).toEqual([79, 85, 86]);
    await choosePriority('ALL');
    expect(visibleIds()).toEqual([83, 79, 85, 86, 81, 88, 89]);
    expect(window.location.search).toBe('');
  });
});

describe('Search box', () => {
  it('waits for the typing to settle before filtering', async () => {
    await render();

    await type('Saumya');
    // The keystroke lands immediately, the re-filter does not.
    expect(visibleIds()).toHaveLength(7);
    await flush(350);
    expect(visibleIds()).toEqual([79, 81]);
  });

  it('matches file number, file name and email too', async () => {
    await render();

    await type('DE-04');
    await flush(350);
    expect(visibleIds()).toEqual([88, 89]);

    await type('register of works');
    await flush(350);
    expect(visibleIds()).toEqual([85, 86]);

    await type('nimal@spid');
    await flush(350);
    expect(visibleIds()).toEqual([83, 88]);
  });

  it('finds a request by id with or without the #', async () => {
    await render();

    await type('#85');
    await flush(350);
    expect(visibleIds()).toEqual([85]);

    await type('85');
    await flush(350);
    expect(visibleIds()).toEqual([85]);
  });

  it('offers a clear button that empties the box', async () => {
    await render();
    await type('#85');
    await flush(350);
    expect(visibleIds()).toEqual([85]);

    const clearSearch = container.querySelector('[aria-label="Clear search"]');
    expect(clearSearch).toBeDefined();
    await click(clearSearch!);
    await flush(350);
    expect(searchBox().value).toBe('');
    expect(visibleIds()).toHaveLength(7);
  });

  it('combines with the priority filter', async () => {
    await render();
    await choosePriority('NORMAL');
    await type('saumya');
    await flush(350);
    // 79 is Saumya's NORMAL request; her HIGH one is filtered out by priority.
    expect(visibleIds()).toEqual([79]);
    expect(container.querySelector('#admin-requests-count')?.textContent).toContain('Showing 1 of 7 requests');
  });
});

describe('Group same-file requests', () => {
  it('puts each file together, leader first, groups by their leader', async () => {
    await render();
    await click(groupToggle());

    expect(groupToggle().getAttribute('aria-pressed')).toBe('true');
    // DE-04 leads (both HIGH, earlier submission), then DE-01, DE-03, then the lone LOW.
    expect(visibleIds()).toEqual([89, 88, 81, 79, 85, 86, 83]);
    expect(container.querySelector('#admin-requests-count')?.textContent).toContain('Showing 7 of 7 requests');

    // One separator where a new group starts: rows 81, 85 and 83.
    const breaks = rows().filter((tr) => (tr.getAttribute('class') ?? '').includes('inset_0_3px'));
    expect(breaks).toHaveLength(3);
    expect(breaks.map((tr) => (tr.cells[0]?.textContent ?? '').trim())).toEqual(['#81', '#85', '#83']);
  });

  it('groups only what the other filters leave visible', async () => {
    await render();
    await choosePriority('HIGH');
    await click(groupToggle());
    expect(visibleIds()).toEqual([89, 81]);

    await type('kamal');
    await flush(350);
    expect(visibleIds()).toEqual([89]);
    expect(classOf(89)).toContain('border-l-4 border-red-500');
  });

  it('switching back off restores the original order', async () => {
    await render();
    await click(groupToggle());
    expect(visibleIds()).toEqual([89, 88, 81, 79, 85, 86, 83]);

    await click(groupToggle());
    expect(visibleIds()).toEqual([83, 79, 85, 86, 81, 88, 89]);
    expect(rows().map((tr) => tr.getAttribute('class') ?? '').join(' ')).not.toContain('inset_0_3px');
  });
});

describe('No match, and clearing', () => {
  it('says nothing matched and offers to clear, without touching the ranking', async () => {
    await render();
    await type('not-a-file-anywhere');
    await flush(350);

    expect(container.textContent ?? '').toContain('No requests match your filters');
    expect(container.textContent ?? '').toContain('7 requests are still waiting');

    // The switch inside that card is the way back.
    const card = Array.from(container.querySelectorAll('div')).find((el) =>
      (el.textContent ?? '').startsWith('No requests match your filters'),
    );
    expect(card).toBeDefined();
    await click(buttonIn(card!, 'Clear filters')!);
    await flush(350);
    expect(visibleIds()).toHaveLength(7);
  });

  it('Clear filters empties every control and the address', async () => {
    await render();
    await type('#85');
    await choosePriority('HIGH');
    await click(groupToggle());
    await flush(350);
    // The box holds '#85'; the address carries it percent-encoded, and it reads
    // back decoded.
    expect(window.location.search).toContain('q=%2385');

    await click(buttonIn(container, 'Clear filters')!);
    await flush(350);

    expect(searchBox().value).toBe('');
    expect(prioritySelect().value).toBe('ALL');
    expect(groupToggle().getAttribute('aria-pressed')).toBe('false');
    expect(window.location.search).toBe('');
    expect(visibleIds()).toHaveLength(7);
    expect(container.querySelector('#admin-requests-count')).toBeNull();
  });
});

describe('Filters in the address', () => {
  it('defaults add nothing, choices are written as q, priority and group', async () => {
    await render();
    expect(window.location.search).toBe('');

    await choosePriority('HIGH');
    expect(window.location.search).toContain('priority=HIGH');

    await click(groupToggle());
    expect(window.location.search).toContain('group=1');

    await type('saumya');
    await flush(350);
    expect(window.location.search).toContain('q=saumya');
  });

  it('a reload of the same address comes back filtered', async () => {
    window.history.replaceState({}, '', '/admin/staff-file-request?priority=LOW&group=1&q=de-04');
    await render();

    expect(searchBox().value).toBe('de-04');
    expect(prioritySelect().value).toBe('LOW');
    expect(groupToggle().getAttribute('aria-pressed')).toBe('true');
    expect(visibleIds()).toEqual([88]);
    // Still shaded by the full list, so the hidden HIGH leader keeps its rank.
    expect(classOf(88)).toContain('border-l-4 border-orange-300');
  });

  it('an unknown priority in the address falls back to All', async () => {
    window.history.replaceState({}, '', '/admin/staff-file-request?priority=URGENT');
    await render();
    expect(prioritySelect().value).toBe('ALL');
    expect(visibleIds()).toHaveLength(7);
  });

  it('setQueryParam removes a parameter that returns to its default', () => {
    window.history.replaceState({}, '', '/x?priority=HIGH&group=1');
    setQueryParam('priority', null);
    expect(window.location.search).toBe('?group=1');
    setQueryParam('group', null);
    expect(window.location.search).toBe('');
    setQueryParam('group', '1');
    expect(window.location.search).toBe('?group=1');
  });
});

describe('Filters survive a realtime refresh', () => {
  it('keeps the narrowing, the caret and the typed text when rows reload', async () => {
    await render();
    await choosePriority('HIGH');
    await type('saumya');
    await flush(350);
    expect(visibleIds()).toEqual([81]);

    const input = searchBox();
    input.focus();
    const before = document.activeElement;

    // Another admin decision arrives: the queue refetches in the background.
    await act(async () => {
      realtime.channels[0].handlers[0]({
        eventType: 'UPDATE',
        new: { id: 89, status: 'REJECTED' },
      });
    });
    await flush(1200);

    expect(searchBox().value).toBe('saumya');
    expect(document.activeElement).toBe(before);
    expect(prioritySelect().value).toBe('HIGH');
    expect(visibleIds()).toEqual([81]);
    expect(window.location.search).toContain('q=saumya');
  });
});
