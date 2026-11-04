'use client';

import { useEffect } from 'react';

/**
 * Supabase falls back to the configured Site URL when the reset redirect is
 * not allow-listed, which lands the recovery tokens on "/" and then on the
 * sign-in page. Forward those tokens to the reset screen before any Supabase
 * client consumes them.
 */
export default function RecoveryLinkBridge() {
  useEffect(() => {
    const { pathname, search, hash } = window.location;
    if (pathname.startsWith('/auth/reset-password')) return;

    const hasRecoveryHash = /(^#|&)type=recovery(&|$)/.test(hash);
    const hasAuthCode = new URLSearchParams(search).has('code');
    if (!hasRecoveryHash && !hasAuthCode) return;

    const target = `/auth/reset-password${hasAuthCode ? search : ''}${hasRecoveryHash ? hash : ''}`;
    window.location.replace(target);
  }, []);

  return null;
}
