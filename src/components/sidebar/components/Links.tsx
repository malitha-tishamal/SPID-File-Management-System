/* eslint-disable */
'use client';
import React, { useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import NavLink from 'components/link/NavLink';
import DashIcon from 'components/icons/DashIcon';

export const SidebarLinks = (props: {
  routes: RoutesType[];
  onClickRoute?: () => void;
}): JSX.Element => {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { routes } = props;
  const [pendingPath, setPendingPath] = React.useState<string | null>(null);

  React.useEffect(() => {
    setPendingPath(null);
  }, [pathname]);

  const activeRoute = useCallback(
    (routePath: string) => pathname?.includes(routePath),
    [pathname]
  );

  const createLinks = (routes: RoutesType[]) => {
    return routes
      .filter((r) => r.layout === '/admin')
      .map((route, index) => {
        const targetHref = route.layout + '/' + route.path;
        const isActive = activeRoute(route.path);
        const isPending = pendingPath === targetHref && !isActive;

        return (
          <NavLink
            key={index}
            href={targetHref}
            prefetch={true}
            onClick={() => {
              if (!isActive) {
                setPendingPath(targetHref);
              }
              props.onClickRoute?.();
            }}
          >
            <div
              className={`relative mx-3 mb-1 flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 transition-all duration-150 cursor-pointer active:scale-[0.98] select-none
                ${isActive
                  ? 'bg-[#4318FF] text-white shadow-md shadow-indigo-500/30'
                  : 'text-slate-800 hover:bg-[#f4f7fe] dark:text-gray-200 dark:hover:bg-navy-800'
                }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`shrink-0 ${isActive ? 'text-white' : 'text-slate-600 dark:text-gray-400'}`}>
                  {route.icon ? route.icon : <DashIcon />}
                </span>
                <p className={`min-w-0 break-words text-sm font-bold leading-snug ${isActive ? 'text-white' : 'text-slate-800 dark:text-gray-200'}`}>
                  {t(`nav:menu.${route.path}`, route.name)}
                </p>
              </div>

              {isPending && (
                <span className="shrink-0 animate-spin inline-block w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full dark:border-indigo-400" />
              )}
            </div>
          </NavLink>
        );
      });
  };

  return <>{createLinks(routes)}</>;
};

export default SidebarLinks;
