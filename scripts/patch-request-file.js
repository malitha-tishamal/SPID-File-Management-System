const fs = require('fs');
const path = require('path');

// 1. Patch request-file/page.tsx
const reqFilePath = path.join(__dirname, '..', 'src', 'app', 'staff', 'request-file', 'page.tsx');
let reqFile = fs.readFileSync(reqFilePath, 'utf8');

// section_name in dropdown search list (the · separator)
reqFile = reqFile.replace(
  `{file.section_name ? \` A\u{fffd} \${file.section_name}\` : ''}`,
  `{file.section_name ? \` · \${localizeField(file.section_name)}\` : ''}`
);

// section_name readonly input value
reqFile = reqFile.replace(
  `value={selectedFile?.section_name ?? ''}`,
  `value={selectedFile?.section_name ? localizeField(selectedFile.section_name) : ''}`
);

fs.writeFileSync(reqFilePath, reqFile, 'utf8');
console.log('Patched request-file/page.tsx');

// 2. Patch your-requests/page.tsx
const yourReqPath = path.join(__dirname, '..', 'src', 'app', 'staff', 'your-requests', 'page.tsx');
let yourReq = fs.readFileSync(yourReqPath, 'utf8');

// Add localizeField import if not present
if (!yourReq.includes("from 'lib/useLocalizedFields'")) {
  yourReq = yourReq.replace(
    `import { formatSriLankaDate, formatSriLankaDateTime } from 'lib/datetime';`,
    `import { formatSriLankaDate, formatSriLankaDateTime } from 'lib/datetime';\nimport { localizeField } from 'lib/useLocalizedFields';`
  );
}

// storage_location display
yourReq = yourReq.replace(
  `{selectedDetailRequest.storage_location}`,
  `{localizeField(selectedDetailRequest.storage_location)}`
);

// section_name display (the one at line 784)
yourReq = yourReq.replace(
  `{selectedDetailRequest.section_name}`,
  `{localizeField(selectedDetailRequest.section_name)}`
);

fs.writeFileSync(yourReqPath, yourReq, 'utf8');
console.log('Patched your-requests/page.tsx');

// 3. Patch admin/staff-file-request/page.tsx
const adminReqPath = path.join(__dirname, '..', 'src', 'app', 'admin', 'staff-file-request', 'page.tsx');
let adminReq = fs.readFileSync(adminReqPath, 'utf8');

// Add localizeField import if not present
if (!adminReq.includes("from 'lib/useLocalizedFields'")) {
  adminReq = adminReq.replace(
    `import { formatSriLankaDate, formatSriLankaDateTime } from 'lib/datetime';`,
    `import { formatSriLankaDate, formatSriLankaDateTime } from 'lib/datetime';\nimport { localizeField } from 'lib/useLocalizedFields';`
  );
}

// All occurrences of section_name bare display in table rows (non-title/non-variable)
// Lines 1274, 1418, 1955, 2218 all use: {request.section_name} or {selectedDetailRequest.section_name}
adminReq = adminReq.replaceAll(
  `{request.section_name}`,
  `{localizeField(request.section_name)}`
);

adminReq = adminReq.replace(
  `{selectedDetailRequest.section_name}`,
  `{localizeField(selectedDetailRequest.section_name)}`
);

adminReq = adminReq.replace(
  `{approvalTarget.section_name}`,
  `{localizeField(approvalTarget.section_name)}`
);

// storage_location in detail modal
adminReq = adminReq.replace(
  `{selectedDetailRequest.storage_location}`,
  `{localizeField(selectedDetailRequest.storage_location)}`
);

// storage_location in table rows (title attr + display)
// title={request.storage_location} → localizeField
adminReq = adminReq.replace(
  `title={request.storage_location}`,
  `title={localizeField(request.storage_location)}`
);

// getLocationParts(request.storage_location) → getLocationParts(localizeField(request.storage_location))
adminReq = adminReq.replaceAll(
  `getLocationParts(request.storage_location)`,
  `getLocationParts(localizeField(request.storage_location))`
);

fs.writeFileSync(adminReqPath, adminReq, 'utf8');
console.log('Patched admin/staff-file-request/page.tsx');
