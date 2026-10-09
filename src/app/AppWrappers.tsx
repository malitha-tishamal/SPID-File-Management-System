'use client';
import React, { ReactNode } from 'react';
import 'styles/App.css';
import 'styles/Contact.css';
import 'styles/MiniCalendar.css';
import 'styles/index.css';

import dynamic from 'next/dynamic';
import { ToastProvider } from 'components/toast/ToastContext';

const _NoSSR = ({ children }: { children: ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

const NoSSR = dynamic(() => Promise.resolve(_NoSSR), {
  ssr: false,
});

export default function AppWrappers({ children }: { children: ReactNode }) {
  // @ts-ignore
  return <NoSSR>{children}</NoSSR>;
}
