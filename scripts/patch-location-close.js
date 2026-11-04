const { patchFile } = require('./patch-helper');

patchFile(
  './src/components/admin/files/LocationDetailsButton.tsx',
  `aria-label="Close storage location dialog"`,
  `aria-label="Close dialog"`,
);
