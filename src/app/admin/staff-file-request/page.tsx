'use client';
export default function StaffFileRequestPage() {
  return (
    <div className="mt-3 flex flex-col items-center justify-center gap-4 py-24">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-b from-amber-500 to-orange-600 shadow-xl text-white">
        <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
      </div>
      <h1 className="text-2xl font-bold text-navy-700 dark:text-white">Staff File Request</h1>
      <p className="text-sm text-gray-400">Staff file requisition and checkout management will be available here.</p>
    </div>
  );
}
