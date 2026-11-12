const fs = require('fs');

// 1. request-file: section_name in dropdown
const p1 = 'src/app/staff/request-file/page.tsx';
let c1 = fs.readFileSync(p1, 'utf8');
const old1 = "{file.section_name ? ` \u00b7 ${file.section_name}` : ''}";
const new1 = "{file.section_name ? ` \u00b7 ${localizeField(file.section_name)}` : ''}";
if (c1.includes(old1)) {
  c1 = c1.replace(old1, new1);
  fs.writeFileSync(p1, c1, 'utf8');
  console.log('request-file: section_name dropdown patched');
} else {
  // try the middot as literal \u00b7
  const lines = c1.split('\n');
  const idx = lines.findIndex(l => l.includes('section_name ?') && l.includes('file.section_name'));
  if (idx >= 0) {
    console.log('Found at line', idx+1, ':', JSON.stringify(lines[idx]));
    // Replace file.section_name (second occurrence) with localizeField(...)
    lines[idx] = lines[idx].replace('${file.section_name}`', '${localizeField(file.section_name)}`');
    c1 = lines.join('\n');
    fs.writeFileSync(p1, c1, 'utf8');
    console.log('request-file: section_name dropdown patched (line method)');
  } else {
    console.log('NOT FOUND in request-file');
  }
}
