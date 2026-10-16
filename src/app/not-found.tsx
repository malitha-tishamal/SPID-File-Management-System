import Link from 'next/link';

/**
 * Global 404 Not Found page.
 * Required by Next.js 15.3+ for the /_not-found route.
 */
export default function NotFound() {
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
        Page Not Found
      </h2>
      <p style={{ marginBottom: '2rem', color: '#718096' }}>
        The page you are looking for does not exist or has been moved.
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
        Go Home
      </Link>
    </div>
  );
}
