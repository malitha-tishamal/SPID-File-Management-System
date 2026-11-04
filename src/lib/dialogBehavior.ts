'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Only the topmost dialog answers Escape, so stacked dialogs do not all close. */
const dialogStack: symbol[] = [];

/**
 * The last element focused outside any dialog. A dialog that moves focus to
 * its own first field (or autofocuses one) must still hand focus back to the
 * control the person actually used, so that control is remembered here rather
 * than read at open time.
 */
let lastFocusedOutsideDialog: HTMLElement | null = null;
let recorderAttached = false;

function attachFocusRecorder() {
  if (recorderAttached || typeof document === 'undefined') return;
  recorderAttached = true;
  document.addEventListener(
    'focusin',
    (event) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest?.('[role="dialog"][aria-modal="true"]')) {
        lastFocusedOutsideDialog = target;
      }
    },
    true,
  );
}

/**
 * Escape-to-close, initial focus, focus trap and focus return for a modal
 * panel. Attach the returned ref to the element that carries role="dialog"
 * and give it tabIndex={-1} so it can receive focus when it has no controls.
 */
export function useDialogBehavior<T extends HTMLElement>(
  open: boolean,
  close: () => void,
) {
  const panelRef = useRef<T | null>(null);
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    // Attached on mount, before any dialog opens, so the control that
    // triggered the dialog is already recorded when focus must be returned.
    attachFocusRecorder();

    if (!open) return;

    const panel = panelRef.current;
    if (!panel) return;

    const token = Symbol('dialog');
    dialogStack.push(token);

    (panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel).focus();

    const topmost = () => dialogStack[dialogStack.length - 1] === token;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !topmost()) return;
      event.preventDefault();
      closeRef.current();
    };

    const onFocusIn = (event: FocusEvent) => {
      if (!topmost()) return;
      const target = event.target as HTMLElement | null;
      if (!target || panel.contains(target)) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      (items.length > 0 ? items[0] : panel).focus();
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocusIn);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocusIn);
      const index = dialogStack.lastIndexOf(token);
      if (index !== -1) dialogStack.splice(index, 1);

      const restore = lastFocusedOutsideDialog;
      if (
        restore &&
        document.contains(restore) &&
        !restore.closest('[role="dialog"][aria-modal="true"]')
      ) {
        restore.focus();
      }
    };
  }, [open]);

  return panelRef;
}
