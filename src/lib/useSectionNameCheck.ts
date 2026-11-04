'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  findSectionDuplicate,
  sectionDuplicateMessage,
  type SectionNameLike,
} from 'lib/sectionName';

const DUPLICATE_CHECK_DEBOUNCE_MS = 300;

export interface SectionNameCheck {
  /** Non-null as soon as the debounced value duplicates an existing section. */
  message: string | null;
  duplicateId: number | string | null;
  /** True while the user is still typing inside the debounce window. */
  checking: boolean;
}

/**
 * Live, debounced duplicate check against ALL sections (disabled included).
 * The API enforces the same rule, so this is purely immediate feedback.
 */
export function useSectionNameCheck({
  name,
  sections,
  ignoreId,
  enabled = true,
}: {
  name: string;
  sections: readonly SectionNameLike[];
  ignoreId?: number | string | null;
  enabled?: boolean;
}): SectionNameCheck {
  const [debounced, setDebounced] = useState(name);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(name), DUPLICATE_CHECK_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [name]);

  return useMemo(() => {
    if (!enabled) return { message: null, duplicateId: null, checking: false };
    const duplicate = findSectionDuplicate(sections, debounced, ignoreId);
    return {
      message: duplicate ? sectionDuplicateMessage(debounced, duplicate) : null,
      duplicateId: duplicate?.section.id ?? null,
      checking: debounced !== name,
    };
  }, [enabled, sections, debounced, ignoreId, name]);
}
