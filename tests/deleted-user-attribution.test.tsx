/** @vitest-environment jsdom */
import { createRoot, type Root } from 'react-dom/client';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import AttributedUser from 'components/ui/AttributedUser';
import { attributedNameText } from 'utils/userDisplay';

const act = (
  React as unknown as {
    act: (callback: () => void | Promise<void>) => Promise<void>;
  }
).act;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
});

describe('deleted user attribution', () => {
  it('keeps the stored name and adds the muted deleted marker', async () => {
    await act(() =>
      root.render(<AttributedUser name="Kumari Perera" deleted />)
    );

    expect(container.textContent).toContain('Kumari Perera');
    expect(container.textContent).toContain('(Deleted user)');
  });

  it('shows a safe fallback when the record has no name', async () => {
    await act(() => root.render(<AttributedUser name={null} />));

    expect(container.textContent).toContain('Unknown user');
  });

  it('renders only the marker for cells that print the name inline', async () => {
    await act(() => root.render(<AttributedUser suffixOnly deleted />));

    expect(container.textContent).toBe('(Deleted user)');
  });

  it('appends the translated marker in plain-text exports', () => {
    expect(
      attributedNameText('Kumari Perera', { deleted: true, label: '(Deleted user)' })
    ).toBe('Kumari Perera (Deleted user)');
    expect(attributedNameText(null, { deleted: true, label: '(Deleted user)' })).toBe('');
  });
});
