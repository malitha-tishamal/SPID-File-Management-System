/* eslint-disable */
'use client';
import React, { useCallback } from 'react';
import { usePathname } from 'next/navigation';
import NavLink from 'components/link/NavLink';
import DashIcon from 'components/icons/DashIcon';

export const SidebarLinks = (props: { routes: RoutesType[] }): JSX.Element => {
  const pathname = usePathname();
  const { routes } = props;

  const activeRoute = useCallback(
    (routePath: string) => pathname?.includes(routePath),
    [pathname]
  );

  const createLinks = (routes: RoutesType[]) => {
    return routes
      .filter((r) => r.layout === '/admin')
      .map((route, index) => {
        const isActive = activeRoute(route.path);
        return (
          <NavLink key={index} href={route.layout + '/' + route.path}>
            <div
              className={`relative mx-3 mb-1 flex items-center gap-3 rounded-xl px-4 py-2.5 transition-all duration-150 cursor-pointer
                ${isActive
                  ? 'bg-[#4318FF] text-white shadow-md shadow-indigo-500/30'
                  : 'text-gray-500 hover:bg-[#f4f7fe] dark:text-gray-400 dark:hover:bg-navy-800'
                }`}
            >
              <span className={`shrink-0 ${isActive ? 'text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                {route.icon ? route.icon : <DashIcon />}
              </span>
              <p className={`text-sm font-semibold leading-tight ${isActive ? 'text-white' : 'text-gray-600 dark:text-gray-300'}`}>
                {route.name}
              </p>
            </div>
          </NavLink>
        );
      });
  };

  return <>{createLinks(routes)}</>;
};

export default SidebarLinks;
