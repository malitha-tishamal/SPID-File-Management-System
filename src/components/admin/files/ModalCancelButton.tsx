'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';

/** Red destructive-style Cancel action shared by every file modal. */
export default function ModalCancelButton({
  onClick,
  disabled = false,
  children,
  className = '',
}: {
  onClick: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  const { t } = useTranslation('files');

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 cursor-pointer rounded-xl border border-rose-600 bg-rose-600 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-600/20 transition-colors hover:border-rose-700 hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-rose-300 disabled:bg-rose-300 disabled:text-white/80 disabled:shadow-none dark:focus-visible:ring-offset-navy-800 ${className}`}
    >
      {children ?? t('common:buttons.cancel')}
    </button>
  );
}
