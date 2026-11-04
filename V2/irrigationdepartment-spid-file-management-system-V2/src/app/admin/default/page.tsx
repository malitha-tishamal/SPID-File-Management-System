'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LegacyDefaultRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/dashboard');
  }, [router]);
  return null;
}
