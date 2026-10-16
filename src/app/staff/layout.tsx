'use client';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
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

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  if (isWindowAvailable()) document.documentElement.dir = 'ltr';

  return (
    <div className="flex h-full w-full bg-background-100 dark:bg-background-900">
      <StaffSidebar routes={staffRoutes} open={open} setOpen={setOpen} />
      {/* Navbar & Main Content */}
      <div className="h-full w-full font-dm dark:bg-navy-900">
        {/* Main Content */}
        <main
          className={`mx-2.5 flex-none transition-all dark:bg-navy-900 
              md:pr-2 xl:ml-[296px]`}
        >
          {/* Routes */}
          <div>
            <Navbar
              onOpenSidenav={() => setOpen(!open)}
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
