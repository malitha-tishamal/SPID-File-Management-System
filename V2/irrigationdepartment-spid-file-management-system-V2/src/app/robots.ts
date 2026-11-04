import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://spid.gov.lk';

  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/auth/sign-in',
          '/auth/sign-up',
          '/auth/forgot-password',
          '/auth/reset-password',
        ],
        disallow: ['/admin/', '/staff/', '/api/', '/rtl/'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
