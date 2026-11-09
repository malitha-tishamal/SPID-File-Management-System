import Image from 'next/image';

type AppLogoSize = 'sm' | 'md' | 'lg';

const SIZES: Record<AppLogoSize, { box: string; px: number }> = {
  sm: { box: 'h-9 w-9 rounded-lg p-1', px: 36 },
  md: { box: 'h-12 w-12 rounded-xl p-1.5', px: 48 },
  lg: { box: 'h-16 w-16 sm:h-20 sm:w-20 rounded-2xl p-1.5', px: 80 },
};

/**
 * The department emblem on a permanent white tile.
 *
 * The artwork has a transparent background, so it must never sit directly on a
 * dark surface. The tile is white in both themes; only the subtle ring adapts.
 */
export default function AppLogo({
  size = 'md',
  alt = 'SPID emblem',
  priority = false,
  className = '',
}: {
  size?: AppLogoSize;
  alt?: string;
  priority?: boolean;
  className?: string;
}) {
  const { box, px } = SIZES[size];

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-white shadow-sm ring-1 ring-black/5 dark:ring-white/15 ${box} ${className}`}
    >
      <Image
        src="/img/spid/spid-logo.png"
        width={px}
        height={px}
        alt={alt}
        priority={priority}
        draggable={false}
        className="h-full w-full object-contain select-none"
      />
    </span>
  );
}
