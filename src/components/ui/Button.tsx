'use client';

import React from 'react';
import Spinner from 'components/ui/Spinner';

export type ButtonVariant = 'primary' | 'cancel' | 'warning' | 'danger' | 'secondary';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[#4318FF] text-white shadow-md shadow-[#4318FF]/25 hover:bg-brand-600 focus-visible:ring-[#4318FF]/50',
  cancel:
    'bg-[#EF4444] text-white shadow-md shadow-red-500/25 hover:bg-[#DC2626] focus-visible:ring-red-500/50',
  warning:
    'bg-[#F97316] text-white shadow-md shadow-orange-500/25 hover:bg-[#EA580C] focus-visible:ring-orange-500/50',
  danger:
    'bg-[#DC2626] text-white shadow-md shadow-red-600/25 hover:bg-[#B91C1C] focus-visible:ring-red-600/50',
  secondary:
    'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400/40 dark:border-navy-600 dark:bg-navy-800 dark:text-gray-300 dark:hover:bg-navy-700',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-sm',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingText?: string;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

/**
 * Shared button with the project's colour variants. `loading` keeps the button
 * disabled and swaps the label for an inline spinner to prevent double submits.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    loadingText,
    icon,
    fullWidth = false,
    disabled,
    className = '',
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        'inline-flex cursor-pointer select-none items-center justify-center gap-2 rounded-xl font-bold transition-all duration-200 active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-navy-800',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? (
        <>
          <Spinner size={size === 'lg' ? 'md' : 'sm'} />
          <span>{loadingText ?? children}</span>
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
});

export default Button;
