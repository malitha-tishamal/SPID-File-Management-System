const fs = require('fs');

const p = 'src/components/admin/files/ViewFileModal.tsx';
let c = fs.readFileSync(p, 'utf8');

// Add useAppLanguage() call inside the component, right after const { t } = useTranslation('files');
const anchor = `  const { t } = useTranslation('files');`;
const insertion = `
  // Subscribe to language changes so formatSriLankaDate/Time re-renders correctly
  useAppLanguage();`;

if (c.includes(anchor)) {
  c = c.replace(anchor, anchor + insertion);
  fs.writeFileSync(p, c, 'utf8');
  console.log('Added useAppLanguage() to ViewFileModal');
} else {
  console.log('Anchor not found');
}
