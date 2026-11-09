/** @vitest-environment jsdom */
/**
 * The staff side of the competing queue.
 *
 * Staff members see the same rank, the same row shading and the same badge
 * words as the admin queue, because `RequestsTable` reads the shared helper
 * rather than deciding anything itself. These render the real component so a
 * regression that re-introduces a second ranking shows up here.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCompetingInfo } from 'lib/competing-requests';
import RequestsTable from 'components/staff/requests/RequestsTable';
import type { StaffRequestRow } from 'types/staffRequests';

const act = (
  React as unknown as {
    act: (callback: () => void | Promise<void>) => Promise<void>;
  }
).act;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function row(overrides: Partial<StaffRequestRow> & { id: number }): StaffRequestRow {
  return {
    file_id: 5,
    file_no: 'DE-12',
    file_name: 'Annual Exp-2022',
    section_name: 'Accounting',
    storage_location: 'Central Record Room (B-02)',
    requester_name: 'Staff Member',
    request_date: '2026-11-06',
    duration_days: 3,
    priority: 'NORMAL',
    status: 'PENDING',
    admin_notes: null,
    created_at: '2026-11-05T08:00:00+05:30',
    ...overrides,
  } as StaffRequestRow;
}

/** Rows as the owner-scoped API returns them: each carries its shared rank info. */
function withCompeting(rows: StaffRequestRow[]): StaffRequestRow[] {
  const info = getCompetingInfo(rows);
  return rows.map((row) => ({ ...row, competing: info.get(row.id) ?? null }));
}

let container: HTMLDivElement;
let root: Root;

async function renderRows(rows: StaffRequestRow[]) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(() => {
    root.render(
      React.createElement(RequestsTable, {
        requests: rows,
        tab: 'pending',
        loading: false,
        refreshing: false,
        error: '',
        onRetry: vi.fn(),
        cancellingId: null,
        onCancel: vi.fn(),
        onDetails: vi.fn(),
        onExtend: vi.fn(),
        highlightId: null,
        isFiltered: false,
        onClearFilters: vi.fn(),
        page: 1,
        limit: 10,
        total: rows.length,
        totalPages: 1,
        onPageChange: vi.fn(),
      }),
    );
  });
}

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
});

/** Rows render in the order the API sends them, so position identifies one. */
function rowAt(index: number): Element {
  return container.querySelectorAll('tbody tr')[index] as Element;
}

describe('Staff request list shows the shared competing rank', () => {
  it('shades the leader red and the later request orange, with the queue badges', async () => {
    await renderRows(
      withCompeting([
        row({ id: 81, requester_name: 'test hh', priority: 'HIGH' }),
        row({ id: 79, requester_name: 'Chilly', priority: 'NORMAL' }),
      ]),
    );

    const leader = rowAt(0);
    const waiter = rowAt(1);

    expect(leader.className).toContain('border-l-4 border-red-500');
    expect(waiter.className).toContain('border-l-4 border-orange-300');
    expect(leader.getAttribute('data-state')).toBe('leader');
    expect(waiter.getAttribute('data-state')).toBe('next');
    // The two rows are one group, so both carry the count notice.
    expect(leader.textContent).toContain('Competing: 2 requests for this file');
    expect(waiter.textContent).toContain('Competing: 2 requests for this file');
    // Same words the admin queue renders.
    expect(leader.textContent).toContain('⚡ Highest Priority');
    expect(waiter.textContent).toContain('⚠️ Lower Priority');
  });

  it('leaves a request nobody is competing with untouched', async () => {
    await renderRows(withCompeting([row({ id: 80, requester_name: 'Alone' })]));

    const alone = rowAt(0);

    expect(alone.className).not.toContain('border-red');
    expect(alone.className).not.toContain('border-orange');
    expect(alone.getAttribute('data-state')).toBeNull();
    expect(alone.textContent).not.toContain('Competing:');
    expect(alone.textContent).not.toContain('Highest Priority');
  });

  it('names the tie leader by submission order, not by row order', async () => {
    await renderRows(
      withCompeting([
        row({
          id: 90,
          requester_name: 'Asked later',
          priority: 'HIGH',
          created_at: '2026-11-05T10:00:00+05:30',
        }),
        row({
          id: 89,
          requester_name: 'Asked first',
          priority: 'HIGH',
          created_at: '2026-11-05T09:00:00+05:30',
        }),
      ]),
    );

    // The rows arrive newest-first, yet the earlier submission still leads.
    expect(rowAt(0).textContent).toContain('⚠️ Same Priority (Later)');
    expect(rowAt(1).textContent).toContain('★ Tie Leader (FIFO)');
    expect(rowAt(0).className).toContain('border-l-4 border-orange-300');
    expect(rowAt(1).className).toContain('border-l-4 border-red-500');
  });
});
