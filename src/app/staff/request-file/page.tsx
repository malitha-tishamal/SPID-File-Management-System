'use client';
import React from 'react';
import { MdAssignment } from 'react-icons/md';

export default function StaffRequestFilePage() {
  return (
    <div className="mt-3 flex flex-col items-center justify-center gap-4 py-24">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-b from-amber-500 to-orange-600 shadow-xl text-white">
        <MdAssignment className="h-10 w-10" />
      </div>
      <h1 className="text-2xl font-bold text-navy-700 dark:text-white">Request a File</h1>
      <p className="text-sm text-gray-400 text-center max-w-sm">
        Submit a file checkout or requisition request to the records office here.
      </p>
    </div>
  );
}
