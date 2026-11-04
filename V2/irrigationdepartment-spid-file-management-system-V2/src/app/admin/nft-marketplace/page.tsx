'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LegacyNftMarketplaceRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/manage-system-files');
  }, [router]);
  return null;
}
