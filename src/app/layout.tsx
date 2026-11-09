import React, { ReactNode } from 'react';
import { cookies } from 'next/headers';
import type { Metadata, Viewport } from 'next';
import { DM_Sans, Noto_Sans_Sinhala, Poppins } from 'next/font/google';
import 'styles/App.css';
import 'styles/Contact.css';
import 'styles/MiniCalendar.css';
import 'styles/index.css';
import AppWrappers from './AppWrappers';
import { getServerTranslator } from 'i18n/server';
import { LANGUAGE_COOKIE_KEY, LOCALE_TAGS, resolveLanguage } from 'i18n/languages';

const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '700'], display: 'swap', variable: '--font-dm-sans' });
const poppins = Poppins({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], display: 'swap', variable: '--font-poppins' });
// Appended to the Latin stacks rather than replacing them: Sinhala glyphs come
// from Noto, Latin text keeps the typeface the design system was built with.
const notoSinhala = Noto_Sans_Sinhala({ subsets: ['sinhala'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-noto-sans-sinhala' });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#4318FF',
};

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const language = resolveLanguage(cookieStore.get(LANGUAGE_COOKIE_KEY)?.value);
  const t = getServerTranslator(language, 'common');
  const title = t('meta.title');
  const description = t('meta.description');

  return {
    title: {
      default: title,
      template: `%s | ${title}`,
    },
    description,
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
    applicationName: title,
    manifest: '/manifest.json',
    openGraph: {
      type: 'website',
      locale: language === 'si' ? 'si_LK' : 'en_LK',
      siteName: title,
      title,
      description,
      images: [
        {
          url: '/img/spid/og-image.png?v=2',
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/img/spid/og-image.png?v=2'],
    },
    icons: {
      icon: [
        { url: '/favicon.ico?v=2', sizes: 'any' },
        { url: '/favicon.svg?v=2', type: 'image/svg+xml' },
        { url: '/icon-192.png?v=2', type: 'image/png', sizes: '192x192' },
        { url: '/icon-512.png?v=2', type: 'image/png', sizes: '512x512' },
      ],
      shortcut: '/favicon.ico?v=2',
      apple: [
        { url: '/apple-touch-icon.png?v=2', sizes: '180x180', type: 'image/png' },
      ],
    },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The language cookie lets the server paint the first frame in the saved
  // language; reading it makes this layout dynamic, which an authenticated
  // portal needs anyway.
  const cookieStore = await cookies();
  const initialLanguage = resolveLanguage(cookieStore.get(LANGUAGE_COOKIE_KEY)?.value);

  // The client provider applies this language before paint; the server only
  // needs it for <html lang> and metadata. Keeping i18next out of the RSC
  // bundle also means one request cannot change another request's language.
  return (
    <html lang={LOCALE_TAGS[initialLanguage]} className={`${dmSans.variable} ${poppins.variable} ${notoSinhala.variable}`} suppressHydrationWarning>
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
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-[#4318FF] focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
        >
          Skip to main content
        </a>
        <AppWrappers initialLanguage={initialLanguage}>{children}</AppWrappers>
      </body>
    </html>
  );
}
