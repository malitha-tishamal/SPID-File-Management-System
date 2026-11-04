// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

vi.mock('lib/sectionsClient', () => ({
  fetchClientSections: vi.fn(async () => [
    { id: 1, name: 'Accounting', status: 'approved' },
    { id: 2, name: 'Agree', status: 'disabled' },
    { id: 3, name: 'Information Technology', status: 'approved' },
  ]),
}));

import AddSectionModal from '../src/components/modals/AddSectionModal';

function typeName(value: string) {
  const input = screen.getByLabelText(/Section Name/);
  fireEvent.change(input, { target: { value } });
}

async function flushDuplicateCheck() {
  await act(async () => {
    vi.advanceTimersByTime(400);
  });
}

describe('AddSectionModal duplicate protection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('blocks an active duplicate, case- and space-insensitively', async () => {
    render(<AddSectionModal isOpen onClose={() => {}} onCreated={() => {}} />);
    await act(async () => {});

    typeName('  accounting ');
    await flushDuplicateCheck();

    expect(screen.getByText("Section 'Accounting' already exists.")).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: /Create Section/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('explains when the duplicate section is disabled', async () => {
    render(<AddSectionModal isOpen onClose={() => {}} onCreated={() => {}} />);
    await act(async () => {});

    typeName('agree');
    await flushDuplicateCheck();

    expect(
      screen.getByText(
        'This section already exists but is disabled. Enable it from Section Management.',
      ),
    ).toBeTruthy();
  });

  it('detects duplicates that differ only by internal whitespace', async () => {
    render(<AddSectionModal isOpen onClose={() => {}} onCreated={() => {}} />);
    await act(async () => {});

    typeName('information    technology');
    await flushDuplicateCheck();

    expect(screen.getByText("Section 'Information Technology' already exists.")).toBeTruthy();
  });

  it('allows a new section once the name is unique', async () => {
    render(<AddSectionModal isOpen onClose={() => {}} onCreated={() => {}} />);
    await act(async () => {});

    typeName('Engineering Central Registry');
    await flushDuplicateCheck();

    expect(screen.queryByText(/already exists/i)).toBeNull();
    expect(
      (screen.getByRole('button', { name: /Create Section/ }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
