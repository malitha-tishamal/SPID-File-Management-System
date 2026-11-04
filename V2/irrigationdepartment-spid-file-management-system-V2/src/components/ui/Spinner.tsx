import React from 'react';

const SIZE_CLASSES = {
  xs: 'h-3 w-3 border-2',
  sm: 'h-3.5 w-3.5 border-2',
  md: 'h-5 w-5 border-[3px]',
  lg: 'h-8 w-8 border-4',
  xl: 'h-11 w-11 border-4',
} as const;

const TONE_CLASSES = {
  current: 'border-current border-t-transparent',
  // SPID dashboard spec: violet arc on a lavender track.
  brand: 'border-[#EDE9FF] border-t-[#4F20FF] dark:border-navy-600',
} as const;

export type SpinnerSize = keyof typeof SIZE_CLASSES;
export type SpinnerTone = keyof typeof TONE_CLASSES;

/**
 * Lightweight loading spinner. The `current` tone inherits the parent's text
 * colour (use inside coloured buttons); the `brand` tone renders the SPID
 * dashboard loading style (#4F20FF arc on a #EDE9FF track).
 */
export default function Spinner({
  size = 'sm',
  tone = 'current',
  className = '',
  label,
}: {
  size?: SpinnerSize;
  tone?: SpinnerTone;
  className?: string;
  label?: string;
}) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`inline-block shrink-0 animate-spin rounded-full motion-reduce:animate-none ${TONE_CLASSES[tone]} ${SIZE_CLASSES[size]} ${className}`}
    />
  );
}
