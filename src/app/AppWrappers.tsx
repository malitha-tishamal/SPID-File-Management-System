'use client';
import React, { ReactNode } from 'react';
import { ToastProvider } from 'components/toast/ToastContext';

export default function AppWrappers({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
