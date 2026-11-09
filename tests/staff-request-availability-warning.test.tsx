/** @vitest-environment jsdom */
/**
 * A staff member can always ask for a file that is already with someone else —
 * they just have to know who holds it and when it is due back.
 *
 * The warning is built from the live issuance row the API returns, and it must
 * never invent a date or turn into a block on the form.
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

const toasts: any[] = [];
const showToast = (toast: any) => {
  toasts.push(toast);
};

vi.mock('components/toast/ToastContext', () => ({
  useToast: () => ({ showToast }),
}));

/** The priority dialog reads the router; jsdom has no Next runtime. */
const navigation = vi.hoisted(() => ({
  router: {
    push: () => undefined,
    replace: () => undefined,
    refresh: () => undefined,
    back: () => undefined,
    forward: () => undefined,
    prefetch: () => undefined,
  },
  params: new URLSearchParams('file_no=DE-12'),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navigation.router,
  usePathname: () => '/staff/request-file',
  useSearchParams: () => navigation.params,
}));

/**
 * The context value must keep one identity: the page copies it into local state
 * inside an effect keyed on it, so a fresh object per render loops forever.
 */
const staffProfile = vi.hoisted(() => ({
  id: 'staff-2',
  full_name: 'Ashen Rashmika',
  email: 'ashen@example.com',
  role: 'Staff',
  section_name: 'Land',
  account_status: 'approved',
}));

vi.mock('contexts/ProfileContext', () => ({
  useProfile: () => ({ profile: staffProfile }),
}));

import StaffRequestFilePage from '../src/app/staff/request-file/page';

type Row = Record<string, any>;

const FILE = {
  id: 7,
  file_no: 'DE-12',
  file_name: 'Annual Expenditure 2022',
  section_name: 'Audit',
  status: 'APPROVED',
};

const ISSUANCE = {
  request_id: 11,
  file_no: 'DE-12',
  file_name: 'Annual Expenditure 2022',
  holder_id: 'staff-1',
  holder_name: 'Kaweesha Kiwi',
  issued_at: '2026-11-08T09:00:00+05:30',
  expected_return_date: '2026-11-18',
};

/** What /api/staff/file-requests answers for the selected file. */
const competing: Row = {};

let container: HTMLDivElement;
let root: Root;

async function flush(ms = 20): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

beforeEach(() => {
  toasts.length = 0;
  Object.keys(competing).forEach((key) => delete competing[key]);
  Object.assign(competing, {
    has_competing: false,
    count: 0,
    requests: [],
    own_pending: null,
    issuance: null,
  });

  window.history.pushState({}, '', '/staff/request-file?file_no=DE-12');
  container = document.createElement('div');
  document.body.appendChild(container);

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/staff/file-requests')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, data: competing }),
        } as Response;
      }
      if (url.includes('/api/staff/requestable-files')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, data: { files: [FILE] } }),
        } as Response;
      }
      throw new Error(`unstubbed request: ${url}`);
    }),
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render() {
  root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(StaffRequestFilePage));
  });
  await flush();
}

function text(): string {
  return container.textContent ?? '';
}

describe('Unavailable-file warning on the staff request form', () => {
  it('names the holder and the date the file is expected back', async () => {
    competing.issuance = ISSUANCE;
    await render();

    expect(text()).toContain('File Currently Unavailable');
    expect(text()).toContain('issued to another staff member (Kaweesha Kiwi)');
    expect(text()).toContain('DE-12');
    expect(text()).toContain('Current Holder');
    expect(text()).toContain('08 Nov 2026');
    expect(text()).toContain('Expected Available Date');
    expect(text()).toContain('18 Nov 2026');
    // Advisory only: the request can still be submitted.
    expect(text()).toContain('You can still submit this request');
    const submit = Array.from(container.querySelectorAll('button[type="submit"]'))[0];
    expect(submit?.hasAttribute('disabled')).toBe(false);
  });

  it('says the return date was not specified instead of guessing one', async () => {
    competing.issuance = { ...ISSUANCE, expected_return_date: null };
    await render();

    expect(text()).toContain('Expected return date has not been specified.');
    expect(text()).not.toMatch(/Expected Available Date[\s\S]*\d{2} \w{3} \d{4}/);
  });

  it('stays silent when nobody holds the file', async () => {
    await render();

    expect(text()).not.toContain('File Currently Unavailable');
  });

  it('keeps the competing-request notice alongside the availability notice', async () => {
    competing.issuance = ISSUANCE;
    competing.has_competing = true;
    competing.count = 1;
    competing.requests = [
      {
        id: 44,
        file_id: 7,
        file_no: 'DE-12',
        requester_name: 'Nethma Officer',
        requester_section: 'Finance',
        request_date: '2026-11-21',
        duration_days: 3,
        priority: 'HIGH',
        created_at: '2026-11-17T09:00:00+05:30',
      },
    ];
    await render();

    expect(text()).toContain('File Currently Unavailable');
    expect(text()).toContain('Active Competing Request Notice');
    expect(text()).toContain('Nethma Officer');
  });

  it('shows only its own pending request when the staff member holds the file', async () => {
    // The server reports no issuance for the caller's own copy of the file.
    competing.issuance = null;
    competing.own_pending = {
      id: 45,
      file_no: 'DE-12',
      priority: 'NORMAL',
      request_date: '2026-11-20',
      duration_days: 2,
      created_at: '2026-11-16T09:00:00+05:30',
    };
    await render();

    expect(text()).not.toContain('File Currently Unavailable');
    expect(text()).toContain('You already have a pending request for this file');
  });
});
