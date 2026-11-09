const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */

// const withTM = require('next-transpile-modules')(['@babel/preset-react']);
//   '@fullcalendar/common',
//   '@fullcalendar/common',
//   '@fullcalendar/daygrid',
//   '@fullcalendar/interaction',
//   '@fullcalendar/react',

const path = require('path');

const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, './'),
  ...(process.env.NEXT_PUBLIC_BASE_PATH
    ? {
        basePath: process.env.NEXT_PUBLIC_BASE_PATH,
        assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH,
      }
    : {}),
  poweredByHeader: false,
  compress: true,
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? { exclude: ['error', 'warn'] }
        : false,
  },
  experimental: {
    optimizePackageImports: [
      'react-icons',
      '@chakra-ui/system',
      '@chakra-ui/modal',
      'framer-motion',
    ],
  },
  images: {
    domains: [
      'images.unsplash.com',
      'i.ibb.co',
      'scontent.fotp8-1.fna.fbcdn.net',
    ],
    // Make ENV
    unoptimized: true,
  },
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseWs = supabaseUrl.replace(/^http/, 'ws');
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src 'self' ${supabaseUrl} ${supabaseWs}`.trim(),
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ');
    const privateHeaders = [
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    ];
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
      // Authenticated areas must never be indexed — belt and suspenders
      // alongside the <meta name="robots"> tags in the admin/staff layouts.
      { source: '/admin/:path*', headers: privateHeaders },
      { source: '/staff/:path*', headers: privateHeaders },
      { source: '/rtl/:path*', headers: privateHeaders },
      { source: '/api/:path*', headers: privateHeaders },
    ];
  },
  webpack: (config, { dev, isServer }) => {
    // Increase chunk load timeout to prevent premature ChunkLoadError timeouts on Windows
    if (dev && !isServer) {
      config.output = config.output || {};
      config.output.chunkLoadTimeout = 300000; // 5 minutes
    }
    return config;
  },
};

module.exports = withBundleAnalyzer(nextConfig);
