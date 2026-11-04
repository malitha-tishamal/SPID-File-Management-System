'use client';
import NextLink, { LinkProps as NextLinkProps } from 'next/link';
import {
  CSSProperties,
  ComponentProps,
  PropsWithChildren,
  useMemo,
} from 'react';

export type NavLinkProps = NextLinkProps &
  PropsWithChildren & {
    styles?: CSSProperties;
    borderRadius?: ComponentProps<typeof NextLink>['style']['borderRadius'];
  };

function NavLink({ className, children, styles, borderRadius, ...props }: any) {
  const memoizedStyles = useMemo(
    () => ({
      borderRadius: borderRadius || 0,
      ...styles,
    }),
    [borderRadius, styles],
  );

  const { prefetch = true, ...restProps } = props;

  return (
    <NextLink
      prefetch={prefetch}
      className={`${className}`}
      style={memoizedStyles}
      {...restProps}
    >
      {children}
    </NextLink>
  );
}

export default NavLink;
