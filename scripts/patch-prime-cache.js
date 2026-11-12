const fs = require('fs');

const p = 'src/app/staff/request-file/page.tsx';
let c = fs.readFileSync(p, 'utf8');

// Add useLocalizedFields calls after the last state declaration block
// We'll insert after: const fileNameBoxRef = useRef<HTMLDivElement>(null);
const anchor = `  const fileNameBoxRef = useRef<HTMLDivElement>(null);`;
const insertion = `
  // Prime the Sinhala translation cache for all section_names and archive_repositories
  // that appear in search results, and for the selected file.
  useLocalizedFields([
    ...results.map((f) => f.section_name),
    ...results.map((f) => f.archive_repository ?? ''),
    ...nameResults.map((f) => f.section_name),
    ...nameResults.map((f) => f.archive_repository ?? ''),
    selectedFile?.section_name ?? '',
    selectedFile?.archive_repository ?? '',
    selectedFile?.shelf_name ?? '',
    selectedFile?.shelf_position ?? '',
  ]);`;

if (c.includes(anchor)) {
  c = c.replace(anchor, anchor + insertion);
  fs.writeFileSync(p, c, 'utf8');
  console.log('Added useLocalizedFields priming to request-file page');
} else {
  console.log('Anchor not found');
}
