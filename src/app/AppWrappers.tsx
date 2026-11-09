'use client';

import React, { ReactNode, Suspense } from 'react';
import LanguageProvider from 'i18n/LanguageProvider';
import type { AppLanguage } from 'i18n/languages';
import { ToastProvider } from 'components/toast/ToastContext';
import { ProfileProvider } from 'contexts/ProfileContext';
import NavigationProgressBar from 'components/navigation/NavigationProgressBar';

export default function AppWrappers({
  children,
  initialLanguage,
}: {
  children: ReactNode;
  initialLanguage?: AppLanguage;
}) {
  return (
    <LanguageProvider initialLanguage={initialLanguage}>
      <ProfileProvider>
        <ToastProvider>
          <Suspense fallback={null}>
            <NavigationProgressBar />
          </Suspense>
          {children}
        </ToastProvider>
      </ProfileProvider>
    </LanguageProvider>
  );
}
