const fs = require('fs');

const p = 'src/app/staff/request-file/page.tsx';
let c = fs.readFileSync(p, 'utf8');

// Patch getLocation: archive_repository should go through localizeField
const oldGetLocation = `    file.archive_repository || t('page.locationFallback'),`;
const newGetLocation = `    localizeField(file.archive_repository || '') || t('page.locationFallback'),`;

if (c.includes(oldGetLocation)) {
  c = c.replace(oldGetLocation, newGetLocation);
  fs.writeFileSync(p, c, 'utf8');
  console.log('Patched getLocation archive_repository');
} else {
  console.log('NOT FOUND:', JSON.stringify(oldGetLocation));
}
