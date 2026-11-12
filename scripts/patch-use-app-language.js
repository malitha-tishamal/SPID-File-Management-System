const fs = require('fs');

const files = [
  {
    path: 'src/components/admin/files/AllFilesTable.tsx',
    importAnchor: `import { formatSriLankaDate } from 'lib/datetime';`,
    hookAnchor: `  const { t } = useTranslation(`,
  },
  {
    path: 'src/components/admin/files/FileRequestsTable.tsx',
    importAnchor: `import { formatSriLankaDate } from 'lib/datetime';`,
    hookAnchor: `  const { t } = useTranslation(`,
  },
  {
    path: 'src/app/staff/your-requests/page.tsx',
    importAnchor: `import { formatSriLankaDate, formatSriLankaDateTime } from 'lib/datetime';`,
    hookAnchor: `  const { t } = useTranslation(`,
  },
  {
    path: 'src/app/admin/staff-file-request/page.tsx',
    importAnchor: `import { formatSriLankaDate, formatSriLankaDateTime } from 'lib/datetime';`,
    hookAnchor: `  const { t } = useTranslation(`,
  },
  {
    path: 'src/app/staff/request-file/page.tsx',
    importAnchor: `import { formatSriLankaDate, formatSriLankaDateTime } from 'lib/datetime';`,
    hookAnchor: `  const { t } = useTranslation(`,
  },
];

for (const { path, importAnchor, hookAnchor } of files) {
  let c = fs.readFileSync(path, 'utf8');
  let changed = false;

  // Add import if not present
  if (!c.includes("from 'i18n/LanguageProvider'")) {
    if (c.includes(importAnchor)) {
      c = c.replace(importAnchor, importAnchor + `\nimport { useAppLanguage } from 'i18n/LanguageProvider';`);
      changed = true;
    } else {
      console.log(`Import anchor NOT FOUND in ${path}`);
      continue;
    }
  }

  // Add hook call if not present
  if (!c.includes('useAppLanguage()')) {
    // Find the hookAnchor line
    const idx = c.indexOf(hookAnchor);
    if (idx >= 0) {
      // Insert before the hookAnchor line (find the newline before it)
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
