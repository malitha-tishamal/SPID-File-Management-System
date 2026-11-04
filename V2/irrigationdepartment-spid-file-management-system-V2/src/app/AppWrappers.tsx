'use client';

import React, { ReactNode, Suspense } from 'react';
import { ToastProvider } from 'components/toast/ToastContext';
import { ProfileProvider } from 'contexts/ProfileContext';
import NavigationProgressBar from 'components/navigation/NavigationProgressBar';

export default function AppWrappers({ children }: { children: ReactNode }) {
  return (
    <ProfileProvider>
      <ToastProvider>
        <Suspense fallback={null}>
          <NavigationProgressBar />
        </Suspense>
        {children}
      </ToastProvider>
    </ProfileProvider>
  );
}
