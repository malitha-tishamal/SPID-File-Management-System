'use client';

import React, { useEffect, useState, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Global Navigation Progress Bar
 * Provides instant tactile visual feedback on link and sidebar clicks
 * across the entire application, eliminating the feeling of "sluggish" transitions.
 */
export default function NavigationProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const stepTimerRef = useRef<NodeJS.Timeout | null>(null);

  // When pathname or search params change, complete the progress bar
  useEffect(() => {
    if (loading) {
      setProgress(100);
      const hideTimer = setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 200);
      return () => clearTimeout(hideTimer);
    }
  }, [pathname, searchParams]);

  const startProgress = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (stepTimerRef.current) clearInterval(stepTimerRef.current);

    setLoading(true);
    setProgress(20);

    // Smoothly step progress forward to simulate loading
    let current = 20;
    stepTimerRef.current = setInterval(() => {
      current += Math.max(1, Math.floor((90 - current) * 0.15));
      if (current >= 90) {
        if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      }
      setProgress(Math.min(90, current));
    }, 150);

    // Safety timeout: complete and reset after 4s in case of error or no navigation
    timerRef.current = setTimeout(() => {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      setProgress(100);
      setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 200);
    }, 4000);
  };

  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      // Find closest anchor tag
      const target = (e.target as HTMLElement)?.closest('a');
      if (!target) return;

      const href = target.getAttribute('href');
      const targetAttr = target.getAttribute('target');

      // Ignore external links, downloads, new tabs, or anchor jumps
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || targetAttr === '_blank') {
        return;
      }

      // Check if it's the exact same full path
      const currentFull = window.location.pathname + window.location.search;
      if (href === currentFull || href === window.location.pathname) {
        return;
      }

      // Only track internal site navigation
      if (href.startsWith('/') || href.startsWith(window.location.origin)) {
        startProgress();
      }
    };

    document.addEventListener('click', handleDocumentClick, { capture: true });
    return () => {
      document.removeEventListener('click', handleDocumentClick, { capture: true });
      if (timerRef.current) clearTimeout(timerRef.current);
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    };
  }, []);

  if (!loading && progress === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-[99999] pointer-events-none transition-opacity duration-200"
      style={{ opacity: loading ? 1 : 0 }}
    >
      <div
        className="h-[3px] bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400 shadow-[0_0_10px_rgba(67,24,255,0.7)] transition-all duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
