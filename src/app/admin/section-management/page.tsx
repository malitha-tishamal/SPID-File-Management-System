'use client';
export default function SectionManagementPage() {
  return (
    <div className="mt-3 flex flex-col items-center justify-center gap-4 py-24">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-b from-teal-500 to-emerald-600 shadow-xl text-white">
        <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
      </div>
      <h1 className="text-2xl font-bold text-navy-700 dark:text-white">Section Management</h1>
      <p className="text-sm text-gray-400">Departmental section and division configuration will be available here.</p>
    </div>
  );
}
