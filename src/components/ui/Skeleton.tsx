import React from 'react';

const ROUNDED_CLASSES = {
  sm: 'rounded',
  md: 'rounded-lg',
  lg: 'rounded-2xl',
  full: 'rounded-full',
} as const;

/** Shimmer placeholder used while data is loading. */
export default function Skeleton({
  className = '',
  rounded = 'md',
}: {
  className?: string;
  rounded?: keyof typeof ROUNDED_CLASSES;
}) {
  return (
    <span
      data-skeleton=""
      aria-hidden="true"
      className={`relative block overflow-hidden bg-slate-200/80 dark:bg-navy-600/60 ${ROUNDED_CLASSES[rounded]} ${className}`}
    >
      <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/70 to-transparent motion-reduce:animate-none dark:via-white/10" />
    </span>
  );
}
