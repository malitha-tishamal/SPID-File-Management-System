const { patchFile } = require('./patch-helper');

patchFile(
  './src/components/admin/files/LocationDetailsButton.tsx',
  `className="flex max-h-[calc(100dvh-2rem)] w-full max-w-[460px] animate-fadeIn flex-col overflow-hidden`,
  `className="flex max-h-[calc(100dvh-2rem)] w-full max-w-[460px] flex-col overflow-hidden`,
);
