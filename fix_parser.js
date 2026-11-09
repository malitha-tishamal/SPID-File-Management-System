const fs = require('fs');
const filePath = 'E:\\wamp\\www\\irrigationdepartment-spid-file-management-system-copy\\src\\utils\\fileImport.ts';
let content = fs.readFileSync(filePath, 'utf8');

const old = '    } else {\r\n      shelfPosition = \'Front\';\r\n    }';
const replacement = '    } else if (foundFields.has(\'shelf_position\')) {\r\n      // Column present but left empty — default to \'Front\' (Admin template)\r\n      shelfPosition = \'Front\';\r\n    }\r\n    // else: column not in file headers at all — null (Staff template)';

if (content.includes(old)) {
  content = content.replace(old, replacement);
  fs.writeFileSync(filePath, content);
  console.log('Replacement successful');
} else {
  console.log('Target string not found');
}
