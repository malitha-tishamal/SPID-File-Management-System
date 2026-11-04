const { patchFile } = require('./patch-helper');

patchFile(
  './src/components/admin/files/FileRequestsTable.tsx',
  `  if (loading) {
    return <FilesTableSkeleton />;
  }

  if (error && files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-rose-100 bg-white px-4 py-16 text-center dark:border-rose-900/40 dark:bg-navy-800">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-300">
          <FiAlertCircle className="h-7 w-7" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-800 dark:text-white">Failed to Load Requests</h4>`,
  `  if (error && files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-rose-100 bg-white px-4 py-16 text-center dark:border-rose-900/40 dark:bg-navy-800">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-300">
          <FiAlertCircle className="h-7 w-7" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-800 dark:text-white">Failed to Load File Requests</h4>`,
);
