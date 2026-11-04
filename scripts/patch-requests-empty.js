const { patchFile } = require('./patch-helper');

patchFile(
  './src/components/admin/files/FileRequestsTable.tsx',
  `  if (!refreshing && files.length === 0) {`,
  `  if (!loading && !refreshing && files.length === 0) {`,
);
