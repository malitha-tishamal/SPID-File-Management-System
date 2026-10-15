import React, { ReactNode } from 'react';
import 'styles/App.css';
import 'styles/Contact.css';
import 'styles/MiniCalendar.css';
import 'styles/index.css';
import AppWrappers from './AppWrappers';

export const metadata = {
  title: 'Southern Provincial Irrigation Department File Management System',
  description:
    'Southern Provincial Irrigation Department File Management System - Official Document & Archive Portal',
  icons: {
    icon: '/img/spid/spid-logo.png',
    apple: '/img/spid/spid-logo.png',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body id={'root'}>
        <AppWrappers>{children}</AppWrappers>
      </body>
    </html>
  );
}
