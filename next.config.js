/** @type {import('next').NextConfig} */

// const withTM = require('next-transpile-modules')(['@babel/preset-react']);
//   '@fullcalendar/common',
//   '@fullcalendar/common',
//   '@fullcalendar/daygrid',
//   '@fullcalendar/interaction',
//   '@fullcalendar/react',

const nextConfig = {
  ...(process.env.NEXT_PUBLIC_BASE_PATH
    ? {
        basePath: process.env.NEXT_PUBLIC_BASE_PATH,
        assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH,
      }
    : {}),
  images: {
    domains: [
      'images.unsplash.com',
      'i.ibb.co',
      'scontent.fotp8-1.fna.fbcdn.net',
    ],
    // Make ENV
    unoptimized: true,
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

module.exports = nextConfig;
