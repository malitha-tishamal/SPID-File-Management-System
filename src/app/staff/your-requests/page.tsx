'use client';
import React from 'react';
import { MdListAlt } from 'react-icons/md';

export default function StaffYourRequestsPage() {
  return (
    <div className="mt-3 flex flex-col items-center justify-center gap-4 py-24">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-b from-[#4318FF] to-[#3B82F6] shadow-xl text-white">
        <MdListAlt className="h-10 w-10" />
      </div>
      <h1 className="text-2xl font-bold text-navy-700 dark:text-white">Your Requests</h1>
      <p className="text-sm text-gray-400 text-center max-w-sm">
        View and track all your submitted file requests and their approval status here.
      </p>
    </div>
  );
}
