'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';

/**
 * Global 404 Not Found page.
 * Required by Next.js 15.3+ for the /_not-found route.
 */
export default function NotFound() {
  const { t } = useTranslation('common');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontFamily: 'sans-serif',
        background: '#f7fafc',
        color: '#2d3748',
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <h1 style={{ fontSize: '4rem', fontWeight: 700, marginBottom: '0.5rem' }}>
        404
      </h1>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '1rem' }}>
        {t('notFound.title')}
      </h2>
      <p style={{ marginBottom: '2rem', color: '#718096' }}>
        {t('notFound.message')}
      </p>
      <Link
        href="/"
        style={{
          padding: '0.6rem 1.5rem',
          background: '#3182ce',
          color: '#fff',
          borderRadius: '0.375rem',
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        {t('notFound.goHome')}
      </Link>
    </div>
  );
}
