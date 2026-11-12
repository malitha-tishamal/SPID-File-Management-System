const fs = require('fs');

// 1. Patch EditUserModal
const p1 = 'src/components/modals/EditUserModal.tsx';
let c1 = fs.readFileSync(p1, 'utf8');

// Add localizeField import
if (!c1.includes("from 'lib/useLocalizedFields'")) {
  c1 = c1.replace(
    "import Button from 'components/ui/Button';",
    "import Button from 'components/ui/Button';\nimport { localizeField, useLocalizedFields } from 'lib/useLocalizedFields';"
  );
}

// Replace {s.name} with {localizeField(s.name)} in section dropdown
c1 = c1.replace('{s.name}', '{localizeField(s.name)}');

// Add useLocalizedFields call to prime section name translations
// Find the component function body start
const hookAnchor = '  const [sectionId, setSectionId] = useState<number | null>(user.section_id);';
if (c1.includes(hookAnchor)) {
  c1 = c1.replace(hookAnchor, hookAnchor + '\n  useLocalizedFields(sections.map((s) => s.name));');
}

fs.writeFileSync(p1, c1, 'utf8');
console.log('EditUserModal patched');

// Verify
c1.split('\n').forEach((l, i) => {
  if (l.includes('localizeField') || l.includes('useLocalizedFields')) {
    console.log((i+1) + ':', l.trim());
  }
});
