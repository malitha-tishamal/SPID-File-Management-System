'use client';
export default function AddNewFilePage() {
  return (
    <div className="mt-3 flex flex-col items-center justify-center gap-4 py-24">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-b from-[#4318FF] to-brand-500 shadow-xl text-white">
        <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
      </div>
      <h1 className="text-2xl font-bold text-navy-700 dark:text-white">Add New File</h1>
      <p className="text-sm text-gray-400">This module is under construction. File upload and metadata entry will be available here.</p>
    </div>
  );
}
