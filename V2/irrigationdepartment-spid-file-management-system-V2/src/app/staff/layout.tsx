'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import staffRoutes from 'staffRoutes';
import {
  getActiveRoute,
  getActiveNavbar,
  isWindowAvailable,
} from 'utils/navigation';
import React from 'react';
import Navbar from 'components/navbar';
import StaffSidebar from 'components/staffSidebar';
import Footer from 'components/footer/Footer';
import SessionWatchdog from 'components/auth/SessionWatchdog';

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Default open on desktop (>= 1280px), closed on mobile
  const [open, setOpen] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleResize = () => {
        if (window.innerWidth < 1280) {
          setOpen(false);
        }
      };
      if (window.innerWidth < 1280) {
        setOpen(false);
      }
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  // Auto-close drawer on route navigation on mobile devices
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1280) {
      setOpen(false);
    }
  }, [pathname]);

  if (isWindowAvailable()) document.documentElement.dir = 'ltr';

  return (
    <div className="flex h-full w-full bg-background-100 dark:bg-background-900">
      <SessionWatchdog />
      <StaffSidebar routes={staffRoutes} open={open} setOpen={setOpen} />
      {/* Navbar & Main Content */}
      <div className="h-full w-full font-dm dark:bg-navy-900">
        {/* Main Content */}
        <main
          className={`mx-2.5 flex-none transition-all duration-300 ease-in-out dark:bg-navy-900 
              md:pr-2 ${open ? 'xl:ml-[296px]' : 'xl:ml-4'}`}
        >
          {/* Routes */}
          <div>
            <Navbar
              onOpenSidenav={() => setOpen(!open)}
              isSidebarOpen={open}
              brandText={getActiveRoute(staffRoutes as any, pathname)}
              secondary={getActiveNavbar(staffRoutes as any, pathname)}
            />
            <div className="mx-auto min-h-screen p-2 !pt-[10px] md:p-2">
              {children}
            </div>
            <div className="p-3">
              <Footer />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
