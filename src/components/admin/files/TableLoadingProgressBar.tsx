'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * Indeterminate top progress bar for table data fetches.
 * Animates toward ~90% while active, completes to 100% when inactive.
 * Does not represent server-side completion percentage.
 */
export default function TableLoadingProgressBar({ active }: { active: boolean }) {
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (showTimerRef.current) clearTimeout(showTimerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    intervalRef.current = null;
    showTimerRef.current = null;
    hideTimerRef.current = null;

    if (active) {
      showTimerRef.current = setTimeout(() => {
        setVisible(true);
        setWidth(6);
      }, 140);

      intervalRef.current = setInterval(() => {
        setWidth((w) => (w >= 90 ? 90 : w + (90 - w) * 0.12));
      }, 180);

      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (showTimerRef.current) clearTimeout(showTimerRef.current);
      };
    }

    setWidth(100);
    hideTimerRef.current = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 320);

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [active]);

  if (!visible && width <= 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none mb-2 h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-navy-700"
      role="progressbar"
      aria-busy={active}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
      aria-valuetext={active ? 'Loading file records' : 'Load complete'}
    >
      <div
        className="h-full rounded-full bg-[#4318FF] transition-[width] duration-200 ease-out shadow-[0_0_8px_rgba(67,24,255,0.35)]"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
