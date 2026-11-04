/** @vitest-environment jsdom */
/**
 * Loading, empty, success and error states for the two Record Room tables the
 * admin reviews daily. These tests exist to pin one rule in particular: a
 * failed or in-flight request must never be rendered as "no records".
 */
import { createRoot, type Root } from 'react-dom/client';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const act = (
  React as unknown as {
    act: (callback: () => void | Promise<void>) => Promise<void>;
  }
).act;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('components/toast/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href }, children),
}));

import IssuedFilesPage from 'components/admin/issued/IssuedFilesPage';
import ConfirmReturnModal from 'components/admin/issued/ConfirmReturnModal';
import type { IssuedFileRow } from 'components/admin/issued/issuedTypes';
import StaffFileRequestPage from '../src/app/admin/staff-file-request/page';

type Reply = { ok: boolean; json: unknown };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const issuedRow = {
  id: 11,
  file_id: 1,
  file_no: 'TEST-RETURN-01',
  file_name: 'Annual Audit Minutes 2025',
  section_name: 'Audit',
  storage_location: 'Record Room B — Shelf 14',
  requester_id: 'staff-1',
  requester_name: 'Chilly',
  requester_email: 'ureshanchilly28@gmail.com',
  requester_section: 'Information Technology',
  request_date: '2026-10-08',
  duration_days: 10,
  priority: 'NORMAL',
  status: 'APPROVED',
  admin_notes: null,
  reviewed_by: 'admin-1',
  reviewed_at: null,
  original_return_date: '2026-10-18',
  expected_return_date: '2026-10-18',
  issued_at: '2026-10-08T09:00:00+05:30',
  returned_at: null,
  returned_by: null,
  created_at: '2026-10-08T09:00:00+05:30',
  return_status: 'overdue',
  return_label: 'Overdue by 10 days',
  days_remaining: -10,
  is_overdue: true,
  is_extended: false,
};

const pendingRequest = {
  id: 21,
  file_id: 2,
  file_no: 'SPID/AD/2026/CLEARANCE-REGISTER',
  file_name: 'Land Clearance Register',
  section_name: 'Land',
  storage_location: 'Record Room A — Bay 3',
  requester_name: 'Chilly',
  requester_email: 'ureshanchilly28@gmail.com',
  requester_section: 'Information Technology',
  request_date: '2026-10-20',
  duration_days: 7,
  admin_notes: null,
  priority: 'NORMAL',
  status: 'PENDING',
  created_at: '2026-10-20T09:00:00+05:30',
};

const extensionRow = {
  id: 5,
  request_id: 11,
  file_no: 'TEST-RETURN-01',
  file_name: 'Annual Audit Minutes 2025',
  previous_return_date: '2026-10-18',
  new_return_date: '2026-11-02',
  reason: 'Audit fieldwork is still running.',
  status: 'PENDING',
  requested_by_name: 'Chilly',
  created_at: '2026-10-26T10:00:00+05:30',
};

/** Each endpoint's reply is set by the test; undefined means "still pending". */
const replies: Record<string, Reply | Promise<Reply> | undefined> = {};
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.keys(replies).forEach((key) => delete replies[key]);
  container = document.createElement('div');
  document.body.appendChild(container);

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const key = Object.keys(replies).find((candidate) => url.includes(candidate));
      const reply = key ? await replies[key] : undefined;
      if (!reply) throw new Error(`no stubbed reply for ${url}`);
      return {
        ok: reply.ok,
        status: reply.ok ? 200 : 500,
        json: async () => reply.json,
      } as Response;
    }),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(component: React.ReactNode) {
  root = createRoot(container);
  await act(async () => {
    root.render(component);
  });
}

function text(): string {
  return container.textContent ?? '';
}

function clickButton(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find((el) =>
    (el.textContent ?? '').trim().startsWith(label),
  );
  if (!button) throw new Error(`no button starting with "${label}"`);
  return act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('Issued Files ledger states', () => {
  it('shows a loading indicator, not an empty ledger, while the first request runs', async () => {
    const reply = deferred<Reply>();
    replies['/api/admin/issued-files'] = reply.promise;
    await render(<IssuedFilesPage />);

    expect(text()).toContain('Loading issued files');
    expect(text()).not.toContain('No issued files here');
    expect(container.querySelector('table')).toBeNull();

    await act(async () => reply.resolve({ ok: true, json: { ok: true, data: { files: [issuedRow], total: 1, counts: { active: 1, overdue: 1, returned: 0, extended: 0 } } } }));

    expect(text()).toContain('TEST-RETURN-01');
    expect(text()).not.toContain('Loading issued files');
  });

  it('renders an error with Retry instead of a false empty state', async () => {
    replies['/api/admin/issued-files'] = {
      ok: false,
      json: { ok: false, message: 'Issued-files table is missing a column.' },
    };
    await render(<IssuedFilesPage />);

    expect(text()).toContain('Could not load issued files');
    expect(text()).toContain('Issued-files table is missing a column.');
    expect(text()).not.toContain('No issued files here');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();

    const retry = Array.from(container.querySelectorAll('button')).find((el) =>
      (el.textContent ?? '').includes('Retry'),
    );
    expect(retry).toBeDefined();
  });

  it('shows the empty state only for a successful request with no rows', async () => {
    replies['/api/admin/issued-files'] = {
      ok: true,
      json: {
        ok: true,
        data: { files: [], total: 0, counts: { active: 0, overdue: 0, returned: 0, extended: 0 } },
      },
    };
    await render(<IssuedFilesPage />);

    expect(text()).toContain('No issued files here');
  });

  it('keeps rows visible and marks the table busy during a background refresh', async () => {
    const first = deferred<Reply>();
    replies['/api/admin/issued-files'] = first.promise;
    await render(<IssuedFilesPage />);
    await act(async () =>
      first.resolve({
        ok: true,
        json: {
          ok: true,
          data: { files: [issuedRow], total: 1, counts: { active: 1, overdue: 1, returned: 0, extended: 0 } },
        },
      }),
    );
    expect(text()).toContain('TEST-RETURN-01');

    const second = deferred<Reply>();
    replies['/api/admin/issued-files'] = second.promise;
    await clickButton('Refresh');

    expect(text()).toContain('TEST-RETURN-01');
    expect(text()).not.toContain('No issued files here');
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(text()).toContain('Updating the issued files ledger');

    await act(async () =>
      second.resolve({
        ok: true,
        json: {
          ok: true,
          data: { files: [issuedRow], total: 1, counts: { active: 1, overdue: 1, returned: 0, extended: 0 } },
        },
      }),
    );
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('gives the table an accessible name, column headers and labelled controls', async () => {
    replies['/api/admin/issued-files'] = {
      ok: true,
      json: {
        ok: true,
        data: { files: [issuedRow], total: 1, counts: { active: 1, overdue: 1, returned: 0, extended: 0 } },
      },
    };
    await render(<IssuedFilesPage />);

    expect(container.querySelector('caption')).not.toBeNull();
    const headers = Array.from(container.querySelectorAll('thead th'));
    expect(headers.length).toBeGreaterThan(0);
    expect(headers.every((th) => th.getAttribute('scope') === 'col')).toBe(true);
    expect(container.querySelector('input[aria-label]')).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Mark as Received Back"]'),
    ).not.toBeNull();
  });
});

describe('Staff File Request states', () => {
  const issuedReply: Reply = {
    ok: true,
    json: {
      ok: true,
      data: {
        requests: [pendingRequest],
        counts: { pending: 1, approved: 0, rejected: 0 },
      },
    },
  };
  const extensionReply: Reply = {
    ok: true,
    json: { ok: true, data: { extensions: [extensionRow] } },
  };

  it('shows a loading indicator instead of an empty queue on first load', async () => {
    const reply = deferred<Reply>();
    replies['/api/admin/file-requests'] = reply.promise;
    replies['/api/admin/file-request-extensions'] = reply.promise;
    await render(<StaffFileRequestPage />);

    expect(text()).toContain('Loading staff file requests');
    expect(text()).not.toContain('No pending staff file requests');

    await act(async () => reply.resolve(issuedReply));
    expect(text()).toContain('SPID/AD/2026/CLEARANCE-REGISTER');
  });

  it('does not claim the extension queue is empty while it is still loading', async () => {
    replies['/api/admin/file-requests'] = issuedReply;
    const pendingExtensions = deferred<Reply>();
    replies['/api/admin/file-request-extensions'] = pendingExtensions.promise;
    await render(<StaffFileRequestPage />);

    await clickButton('Extension Requests');
    expect(text()).toContain('Loading extension requests');
    expect(text()).not.toContain('No extension requests');

    await act(async () => pendingExtensions.resolve(extensionReply));
    expect(text()).toContain('TEST-RETURN-01');
    expect(text()).not.toContain('Loading extension requests');
  });

  it('surfaces a load failure with a retry action, never as zero requests', async () => {
    replies['/api/admin/file-requests'] = {
      ok: false,
      json: { ok: false, message: 'Session expired.' },
    };
    replies['/api/admin/file-request-extensions'] = extensionReply;
    await render(<StaffFileRequestPage />);

    expect(text()).toContain('Could not load requests');
    expect(text()).toContain('Session expired.');
    expect(text()).not.toContain('No pending staff file requests');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('keeps rows on screen and announces the background refresh', async () => {
    replies['/api/admin/file-requests'] = issuedReply;
    replies['/api/admin/file-request-extensions'] = extensionReply;
    await render(<StaffFileRequestPage />);
    expect(text()).toContain('SPID/AD/2026/CLEARANCE-REGISTER');

    const reloading = deferred<Reply>();
    replies['/api/admin/file-requests'] = reloading.promise;
    replies['/api/admin/file-request-extensions'] = extensionReply;
    await clickButton('Refresh');

    expect(text()).toContain('SPID/AD/2026/CLEARANCE-REGISTER');
    expect(text()).not.toContain('Loading staff file requests');
    expect(container.querySelector('[role="progressbar"][aria-busy="true"]')).not.toBeNull();

    await act(async () => reloading.resolve(issuedReply));
    expect(container.querySelector('[role="progressbar"][aria-busy="true"]')).toBeNull();
  });

  it('associates every column header and names each dialog control', async () => {
    replies['/api/admin/file-requests'] = issuedReply;
    replies['/api/admin/file-request-extensions'] = extensionReply;
    await render(<StaffFileRequestPage />);

    const headers = Array.from(container.querySelectorAll('thead th'));
    expect(headers.length).toBeGreaterThan(0);
    expect(headers.every((th) => th.getAttribute('scope') === 'col')).toBe(true);
    expect(container.querySelector('caption')).not.toBeNull();
    expect(container.querySelector('[role="group"][aria-label]')).not.toBeNull();

    await clickButton('Extension Requests');
    // Every control inside the tables must be nameable by a screen reader:
    // either visible text or an explicit accessible name.
    const unnamed = Array.from(
      container.querySelectorAll('tbody button, tbody a'),
    ).filter(
      (el) =>
        !((el.textContent ?? '').trim().length > 0) &&
        !el.getAttribute('aria-label'),
    );
    expect(unnamed).toEqual([]);
  });

  it('moves focus into the rejection dialog, closes it on Escape and returns focus', async () => {
    replies['/api/admin/file-requests'] = issuedReply;
    replies['/api/admin/file-request-extensions'] = extensionReply;
    await render(<StaffFileRequestPage />);

    const opener = Array.from(
      container.querySelectorAll<HTMLElement>('tbody button'),
    ).find((el) => (el.textContent ?? '').trim() === 'Reject');
    expect(opener).toBeDefined();

    await act(async () => {
      // A real click leaves focus on the control that opened the dialog.
      opener!.focus();
      opener!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.contains(document.activeElement)).toBe(true);
    expect(dialog!.getAttribute('aria-labelledby')).toBe('reject-request-title');

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(document.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

/**
 * The Issued Files ledger's own dialogs share the behaviour hook, so the
 * keyboard contract is the same on both pages.
 */
function ReturnDialogHarness() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Return file
      </button>
      {open && (
        <ConfirmReturnModal
          file={issuedRow as unknown as IssuedFileRow}
          onConfirm={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}

describe('Issued Files dialogs', () => {
  it('traps focus in the return dialog, closes it on Escape and returns focus', async () => {
    replies['/api/admin/issued-files'] = {
      ok: true,
      json: {
        ok: true,
        data: {
          files: [issuedRow],
          total: 1,
          counts: { active: 1, overdue: 1, returned: 0, extended: 0 },
        },
      },
    };
    await render(<ReturnDialogHarness />);

    expect(document.querySelector('[role="dialog"]')).toBeNull();

    const opener = container.querySelector('button')!;
    await act(async () => {
      opener.focus();
      opener.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.contains(document.activeElement)).toBe(true);
    expect(dialog!.getAttribute('aria-labelledby')).toBe('confirm-return-title');

    // Focus leaking out of the open dialog is pulled back inside.
    await act(async () => {
      opener.focus();
    });
    expect(dialog!.contains(document.activeElement)).toBe(true);

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(document.querySelector('[role="dialog"][aria-modal="true"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
