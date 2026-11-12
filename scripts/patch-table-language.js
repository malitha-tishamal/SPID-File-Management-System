const fs = require('fs');

const files = [
  {
    path: 'src/components/admin/files/AllFilesTable.tsx',
    importAnchor: `import { formatSriLankaDate, formatSriLankaTime } from 'lib/datetime';`,
    hookAnchor: `  const { t } = useTranslation(`,
  },
  {
    path: 'src/components/admin/files/FileRequestsTable.tsx',
    importAnchor: `import { formatSriLankaDate, formatSriLankaTime } from 'lib/datetime';`,
    hookAnchor: `  const { t } = useTranslation(`,
  },
];

for (const { path, importAnchor, hookAnchor } of files) {
  let c = fs.readFileSync(path, 'utf8');
  let changed = false;

  if (!c.includes("from 'i18n/LanguageProvider'")) {
    if (c.includes(importAnchor)) {
      c = c.replace(importAnchor, importAnchor + `\nimport { useAppLanguage } from 'i18n/LanguageProvider';`);
      changed = true;
    } else {
      console.log(`Import anchor NOT FOUND in ${path}`);
      continue;
    }
  }

  if (!c.includes('useAppLanguage()')) {
    const idx = c.indexOf(hookAnchor);
    if (idx >= 0) {
      const lineStart = c.lastIndexOf('\n', idx);
      c = c.slice(0, lineStart + 1) + '  useAppLanguage(); // subscribe to language changes for date re-renders\n' + c.slice(lineStart + 1);
      changed = true;
    } else {
      console.log(`Hook anchor NOT FOUND in ${path}`);
      continue;
    }
  }

  if (changed) {
    fs.writeFileSync(path, c, 'utf8');
    console.log(`Patched: ${path}`);
  } else {
    console.log(`Already patched: ${path}`);
  }
}
