import React, { ReactNode } from 'react';
import { DM_Sans, Poppins } from 'next/font/google';
import 'styles/App.css';
import 'styles/Contact.css';
import 'styles/MiniCalendar.css';
import 'styles/index.css';
import AppWrappers from './AppWrappers';

const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '700'], display: 'swap', variable: '--font-dm-sans' });
const poppins = Poppins({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], display: 'swap', variable: '--font-poppins' });

export const metadata = {
  title: {
    default: 'SPID File Management System',
    template: '%s | SPID File Management System',
  },
  description:
    'Southern Provincial Irrigation Department File Management System — Official Document & Archive Portal',
  keywords: [
    'SPID',
    'Southern Provincial Irrigation Department',
    'File Management System',
    'Document Archive',
    'Record Room',
    'Sri Lanka Irrigation',
  ],
  authors: [{ name: 'Southern Provincial Irrigation Department' }],
  creator: 'Southern Provincial Irrigation Department',
  publisher: 'Southern Provincial Irrigation Department',
  openGraph: {
    type: 'website',
    locale: 'en_LK',
    siteName: 'SPID File Management System',
    title: 'SPID File Management System',
    description:
      'Southern Provincial Irrigation Department File Management System — Official Document & Archive Portal',
  },
  twitter: {
    card: 'summary',
    title: 'SPID File Management System',
    description:
      'Southern Provincial Irrigation Department File Management System — Official Document & Archive Portal',
  },
  icons: {
    icon: '/img/spid/spid-logo.png',
    apple: '/img/spid/spid-logo.png',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${poppins.variable}`} suppressHydrationWarning>
      <body id={'root'} suppressHydrationWarning>
        {/* Runs before hydration: a recovery link that lands on the site root must
            reach /auth/reset-password before any Supabase client consumes it. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{if(location.pathname.indexOf('/auth/reset-password')===0)return;" +
              "var h=location.hash||'',s=new URLSearchParams(location.search||''),keep=new URLSearchParams();" +
              "['code','token_hash','type','error','error_code','error_description','sb_flow_id']" +
              ".forEach(function(k){if(s.has(k))keep.set(k,s.get(k));});" +
              "var isRecovery=/type=recovery(&|$)/.test(h)||keep.get('type')==='recovery';" +
              "if(!isRecovery&&!keep.has('code')&&!keep.has('token_hash'))return;" +
              "location.replace('/auth/reset-password'+(keep.toString()?'?'+keep.toString():'')+h);" +
              "}catch(e){}})();",
          }}
        />
        <AppWrappers>{children}</AppWrappers>
      </body>
    </html>
  );
}
