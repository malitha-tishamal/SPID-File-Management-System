'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { attributedName } from 'utils/userDisplay';

/**
 * A user name on a historical record. Accounts are soft-deleted, so the stored
 * name always remains available; `deleted` only adds the muted marker and, for
 * avatars, swaps the coloured identity for a neutral placeholder.
 */
export function DeletedUserSuffix() {
  const { t } = useTranslation('common');
  return (
    <span className="ml-1 whitespace-nowrap text-[10px] font-semibold text-slate-400 dark:text-gray-500">
      {t('deletedUser')}
    </span>
  );
}

export default function AttributedUser({
  name,
  deleted,
  fallback,
  className,
  suffixOnly = false,
}: {
  name?: string | null;
  /** True when the account behind this attribution was soft-deleted. */
  deleted?: boolean;
  /** Copy used when the record stores no name (already translated). */
  fallback?: string;
  className?: string;
  /** Render only the marker, for cells that already print the name inline. */
  suffixOnly?: boolean;
}) {
  const { t } = useTranslation('common');

  if (suffixOnly) {
    return deleted ? <DeletedUserSuffix /> : null;
  }

  return (
    <>
      <span className={className}>{attributedName(name, fallback || t('unknownUser'))}</span>
      {deleted && <DeletedUserSuffix />}
    </>
  );
}
