'use client';
import React, { ReactNode } from 'react';
import 'styles/App.css';
import 'styles/Contact.css';
import 'styles/MiniCalendar.css';
import 'styles/index.css';

import { ToastProvider } from 'components/toast/ToastContext';

export default function AppWrappers({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
