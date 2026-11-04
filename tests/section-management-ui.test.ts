// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  cleanup,
  within,
} from '@testing-library/react';

const { showToast, broadcastAdminSync, invalidateClientSectionsCache } = vi.hoisted(() => ({
  showToast: vi.fn(),
  broadcastAdminSync: vi.fn(),
  invalidateClientSectionsCache: vi.fn(),
}));

vi.mock('components/toast/ToastContext', () => ({
  useToast: () => ({ showToast }),
}));

vi.mock('config/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  }),
}));

vi.mock('components/admin/AccountDirectoryPage', () => ({
  broadcastAdminSync,
}));

vi.mock('lib/sectionsClient', () => ({
  invalidateClientSectionsCache,
}));

import SectionManagementPage from '../src/app/admin/section-management/page';

const SECTIONS = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  name: `Section ${String(index + 1).padStart(2, '0')}`,
  status: 'approved' as const,
  section_lead: index % 2 === 0 ? 'K. Perera' : null,
  created_at: '2026-01-15T00:00:00.000Z',
}));

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => payload,
  } as Response;
}

describe('Section Management page interactions', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let store: typeof SECTIONS;
  let releaseInitialLoad: () => void;
  let initialLoadGate: Promise<void>;

  beforeEach(() => {
    showToast.mockReset();
    broadcastAdminSync.mockReset();
    invalidateClientSectionsCache.mockReset();
    store = SECTIONS.map((section) => ({ ...section }));
    initialLoadGate = new Promise<void>((resolve) => {
      releaseInitialLoad = resolve;
    });
    let getCount = 0;

    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (method === 'GET') {
        getCount += 1;
        if (getCount === 1) await initialLoadGate;
        return jsonResponse({ ok: true, data: { sections: store } });
      }

      const id = Number(url.split('/').pop());

      if (method === 'DELETE') {
        store = store.filter((section) => section.id !== id);
        return jsonResponse({ ok: true, message: 'Section deleted.' });
      }

      const patch = init?.body ? JSON.parse(String(init.body)) : {};
      const target = store.find((section) => section.id === id);
      const updated = { ...target, ...patch };
      store = store.map((section) => (section.id === id ? updated : section));
      return jsonResponse({
        ok: true,
        data: { section: updated },
        message: 'Section updated.',
      });
    });

    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('loads once and mutates rows locally without refetching the list', async () => {
    render(React.createElement(SectionManagementPage));

    const sectionsTable = screen.getByRole('table', { name: 'Sections' });
    const tableRegion = sectionsTable.parentElement as HTMLElement;
    expect(tableRegion.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('Loading sections…')).toBeTruthy();
    expect(document.querySelectorAll('[data-skeleton]').length).toBeGreaterThan(10);

    await act(async () => {
      releaseInitialLoad();
      await initialLoadGate;
    });
    await screen.findByText('Section 01');
    await waitFor(() => {
      expect(tableRegion.getAttribute('aria-busy')).not.toBe('true');
    });
    expect(document.querySelectorAll('[data-skeleton]').length).toBe(0);
    expect(screen.getByText('Page 1 of 2')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Add New Section' }));
    const addDialog = await screen.findByRole('dialog');
    expect(addDialog.contains(document.activeElement)).toBe(true);
    const addCancel = within(addDialog).getByRole('button', { name: 'Cancel' });
    expect(addCancel.className).toContain('bg-[#EF4444]');
    expect(addCancel.className).toContain('hover:bg-[#DC2626]');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    fireEvent.click(screen.getByLabelText('Next page'));
    expect(screen.getByText('Section 11')).toBeTruthy();
    expect(screen.getByText('Section 12')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Search sections'), {
      target: { value: 'Section 12' },
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 320));
    });

    expect(screen.getByText('Section 12')).toBeTruthy();
    expect(screen.queryByText('Section 11')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const table = () => screen.getByRole('table', { name: 'Sections' });

    fireEvent.click(screen.getByLabelText('Edit section'));
    fireEvent.change(screen.getByLabelText(/Section Name/), {
      target: { value: 'Section 12 Updated' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update Section' }));

    await waitFor(() => {
      expect(within(table()).getByText('Section 12 Updated')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Update Section' })).toBeNull();
    });

    fireEvent.click(screen.getByLabelText('Disable section'));
    const disableDialog = await screen.findByRole('dialog');
    expect(disableDialog.className).toContain('backdrop-blur-[20px]');
    expect(disableDialog.className).toContain('from-orange-500/15');
    expect(
      within(disableDialog).getByText(/Pending workflow will remain/),
    ).toBeTruthy();
    const disableCancel = within(disableDialog).getByRole('button', { name: 'Cancel' });
    expect(disableCancel.className).toContain('bg-[#EF4444]');
    const disableConfirm = within(disableDialog).getByRole('button', {
      name: 'Disable Section',
    });
    expect(disableConfirm.className).toContain('bg-[#F97316]');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    fireEvent.click(screen.getByLabelText('Disable section'));
    fireEvent.click(screen.getByRole('button', { name: 'Disable Section' }));

    await waitFor(() => {
      expect(within(table()).getByText('Disabled')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Disable Section' })).toBeNull();
    });

    fireEvent.click(screen.getByLabelText('Activate / Approve Section'));

    await waitFor(() => {
      expect(within(table()).getByText('Active')).toBeTruthy();
      expect(screen.queryByLabelText('Updating section')).toBeNull();
    });

    fireEvent.click(screen.getByLabelText('Delete section'));
    const deleteDialog = await screen.findByRole('dialog');
    expect(
      within(deleteDialog).getByRole('button', { name: 'Cancel' }).className,
    ).toContain('bg-[#EF4444]');
    fireEvent.click(screen.getByRole('button', { name: 'Delete Section' }));

    await waitFor(() => {
      expect(screen.queryByText('Section 12 Updated')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Delete Section' })).toBeNull();
    });

    // Only section-list requests count; the spelling dictionary is a static
    // asset fetched lazily after typing and is not a list refetch.
    const getCalls = fetchMock.mock.calls.filter(
      ([input, init]) =>
        String(input).includes('/api/admin/sections') &&
        (!init?.method || init.method === 'GET')
    );
    expect(getCalls).toHaveLength(1);
    expect(broadcastAdminSync).toHaveBeenCalledTimes(4);
    expect(broadcastAdminSync).toHaveBeenCalledWith('SECTIONS_UPDATED');
    expect(invalidateClientSectionsCache).toHaveBeenCalledTimes(4);
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', title: 'Section Updated' })
    );
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', title: 'Section Disabled' })
    );
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', title: 'Section Activated' })
    );
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', title: 'Section Deleted' })
    );
  });
});
