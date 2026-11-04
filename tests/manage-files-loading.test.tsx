// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';

const { showToast } = vi.hoisted(() => ({
  showToast: vi.fn(),
}));

vi.mock('components/toast/ToastContext', () => ({
  useToast: () => ({ showToast }),
}));

vi.mock('lib/sectionsClient', () => ({
  fetchClientSections: async () => [],
}));

vi.mock('contexts/ProfileContext', () => ({
  useProfile: () => ({ profile: null }),
}));

import ManageSystemFilesPage from '../src/components/admin/files/ManageSystemFilesPage';
import type { FileRecordRow } from '../src/models/FileRepository';

const COUNTS = {
  totalArchives: 3,
  todayCount: 1,
  allFilesCount: 3,
  pendingCount: 1,
  rejectedCount: 1,
};

function makeFile(overrides: Partial<FileRecordRow>): FileRecordRow {
  return {
    id: 1,
    file_no: 'F-001',
    file_name: 'Irrigation Contract',
    section_name: 'Hydrology Division',
    status: 'PENDING',
    registrar_name: 'Staff Member',
    registrar_role: 'Staff',
    created_at: '2026-10-20T04:30:00.000Z',
    ...overrides,
  } as FileRecordRow;
}

const TAB_FILES: Record<string, FileRecordRow[]> = {
  requests: [makeFile({ file_no: 'F-REQ-01' })],
  all: [makeFile({ file_no: 'F-ALL-01', status: 'APPROVED' })],
  rejected: [makeFile({ file_no: 'F-REJ-01', status: 'REJECTED' })],
};

function okList(tab: string) {
  const files = TAB_FILES[tab] ?? [];
  return {
    ok: true,
    data: { files, total: files.length, totalPages: 1 },
  };
}

function jsonResponse(payload: unknown, ok = true): Response {
  return { ok, json: async () => payload } as Response;
}

type Handler = (url: string, init?: RequestInit) => Promise<Response>;

function makeFetchMock(handler: Handler) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('metaOnly=true')) {
      return jsonResponse({ ok: true, data: { counts: COUNTS, auto_approval: true } });
    }
    return handler(url, init);
  });
}

describe('Manage System Files loading circles', () => {
  beforeEach(() => {
    showToast.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows a centered loading circle with stable headers on each tab, then rows on success', async () => {
    let release: () => void = () => {};
    let gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchMock = makeFetchMock(async () => {
      await gate;
      return jsonResponse(okList('requests'));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ManageSystemFilesPage />);

    // Spinner visible with accessible status, headers stable, no premature empty state.
    expect(screen.getByRole('status').textContent).toContain('Loading file requests');
    expect(screen.getByRole('columnheader', { name: 'FILE NUMBER' })).toBeTruthy();
    expect(screen.queryByText('All Clear! No Pending Submissions')).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /File Requests/ }).getAttribute('aria-selected')).toBe('true');

    await act(async () => {
      release();
      await gate;
    });

    await screen.findByText('F-REQ-01');
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();

    // Switch to All Files: previous tab rows must be replaced by the spinner.
    let releaseAll: () => void = () => {};
    const gateAll = new Promise<void>((resolve) => {
      releaseAll = resolve;
    });
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('metaOnly=true')) {
        return jsonResponse({ ok: true, data: { counts: COUNTS, auto_approval: true } });
      }
      await gateAll;
      return jsonResponse(okList('all'));
    });

    fireEvent.click(screen.getByRole('tab', { name: /All Files/ }));

    expect(screen.getByRole('status').textContent).toContain('Loading files');
    expect(screen.queryByText('F-REQ-01')).toBeNull();
    expect(screen.getByRole('tab', { name: /All Files/ }).getAttribute('aria-selected')).toBe('true');

    await act(async () => {
      releaseAll();
      await gateAll;
    });

    await screen.findByText('F-ALL-01');

    // Switch to Rejected Files.
    let releaseRej: () => void = () => {};
    const gateRej = new Promise<void>((resolve) => {
      releaseRej = resolve;
    });
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('metaOnly=true')) {
        return jsonResponse({ ok: true, data: { counts: COUNTS, auto_approval: true } });
      }
      await gateRej;
      return jsonResponse(okList('rejected'));
    });

    fireEvent.click(screen.getByRole('tab', { name: /Rejected Files/ }));

    expect(screen.getByRole('status').textContent).toContain('Loading rejected files');
    expect(screen.queryByText('F-ALL-01')).toBeNull();

    await act(async () => {
      releaseRej();
      await gateRej;
    });

    await screen.findByText('F-REJ-01');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the error panel with Retry on initial failure, then recovers', async () => {
    let attempt = 0;
    const fetchMock = makeFetchMock(async () => {
      attempt += 1;
      if (attempt === 1) {
        return jsonResponse({ ok: false, message: 'Server exploded.' }, false);
      }
      return jsonResponse(okList('requests'));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ManageSystemFilesPage />);

    await screen.findByText('Failed to Load File Requests');
    expect(screen.getByText('Server exploded.')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));

    await screen.findByText('F-REQ-01');
    expect(screen.queryByText('Failed to Load File Requests')).toBeNull();
  });

  it('shows the empty state only after a successful empty response', async () => {
    const fetchMock = makeFetchMock(async () =>
      jsonResponse({ ok: true, data: { files: [], total: 0, totalPages: 1 } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<ManageSystemFilesPage />);

    await screen.findByText('All Clear! No Pending Submissions');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('Failed to Load File Requests')).toBeNull();
  });

  it('keeps existing rows visible with an inline alert when a refresh fails', async () => {
    let attempt = 0;
    const fetchMock = makeFetchMock(async () => {
      attempt += 1;
      if (attempt === 1) return jsonResponse(okList('requests'));
      return jsonResponse({ ok: false, message: 'Refresh failed.' }, false);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ManageSystemFilesPage />);

    await screen.findByText('F-REQ-01');

    // Trigger a refetch via the section filter; the second request fails.
    fireEvent.change(screen.getByLabelText('Filter by section'), {
      target: { value: 'Hydrology Division' },
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Refresh failed.');
    // Existing data stays visible alongside the inline alert.
    expect(screen.getByText('F-REQ-01')).toBeTruthy();
    expect(screen.queryByText('Failed to Load File Requests')).toBeNull();
  });

  it('ignores a stale response after the request is superseded', async () => {
    let releaseSlow: () => void = () => {};
    const slowGate = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });

    const fetchMock = makeFetchMock(async (url: string, init?: RequestInit) => {
      const tab = new URL(url, 'http://localhost').searchParams.get('tab') ?? 'requests';
      if (tab === 'requests') {
        await slowGate;
        if (init?.signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        return jsonResponse(okList('requests'));
      }
      return jsonResponse(okList('all'));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ManageSystemFilesPage />);

    expect(screen.getByRole('status')).toBeTruthy();

    // Switch tabs before the first request completes: it must be aborted and
    // its late response must not overwrite the new tab's data.
    fireEvent.click(screen.getByRole('tab', { name: /All Files/ }));

    await screen.findByText('F-ALL-01');
    expect(screen.queryByText('F-REQ-01')).toBeNull();

    await act(async () => {
      releaseSlow();
      await slowGate.catch(() => {});
    });

    await waitFor(() => {
      expect(screen.queryByText('F-REQ-01')).toBeNull();
    });
    expect(screen.getByText('F-ALL-01')).toBeTruthy();
  });
});
