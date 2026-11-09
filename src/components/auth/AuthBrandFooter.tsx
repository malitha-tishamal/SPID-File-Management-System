'use client';
import React from 'react';
import { useTranslation } from 'react-i18next';

export default function AuthBrandFooter() {
  const { t } = useTranslation('auth');
  return (
    <footer className="mt-8 mb-6 text-center text-xs text-slate-500 dark:text-slate-400">
      <p>{t('brand.allRightsReserved')}</p>
      <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
        {t('brand.portalTagline')}
      </p>
    </footer>
  );
}
