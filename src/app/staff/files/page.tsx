'use client';
import React from 'react';
import { MdSearch } from 'react-icons/md';

export default function StaffFilesPage() {
  return (
    <div className="mt-3 flex flex-col items-center justify-center gap-4 py-24">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-b from-[#4318FF] to-[#3B82F6] shadow-xl text-white">
        <MdSearch className="h-10 w-10" />
      </div>
      <h1 className="text-2xl font-bold text-navy-700 dark:text-white">View &amp; Search Files</h1>
      <p className="text-sm text-gray-400 text-center max-w-sm">
        Browse and search all available system files. Full search functionality will be available here.
      </p>
    </div>
  );
}
