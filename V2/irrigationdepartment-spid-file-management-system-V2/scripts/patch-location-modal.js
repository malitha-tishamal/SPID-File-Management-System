const { patchFile } = require('./patch-helper');

patchFile(
  './src/components/admin/files/LocationDetailsButton.tsx',
  `                      Storage Location`,
  `                      Storage location`,
);
