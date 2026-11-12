const fs = require('fs');
const path = 'src/components/admin/files/ViewFileModal.tsx';
let c = fs.readFileSync(path, 'utf8');

c = c.replace(
  'useLocalizedFields([file?.file_name, file?.section_name, file?.reject_reason]);',
  'useLocalizedFields([file?.file_name, file?.section_name, file?.reject_reason, file?.shelf_name, file?.shelf_position, file?.archive_repository]);'
);

c = c.replace(
  '{[file.locker_no, file.shelf_name, file.shelf_position].filter(Boolean).join(\' / \')}',
  '{[file.locker_no, localizeField(file.shelf_name) || file.shelf_name, localizeField(file.shelf_position) || file.shelf_position].filter(Boolean).join(\' / \')}'
);

fs.writeFileSync(path, c, 'utf8');
console.log('Updated ViewFileModal.tsx successfully');
