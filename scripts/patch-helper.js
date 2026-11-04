const fs = require('fs');

function patchFile(filePath, oldSnippet, newSnippet) {
  const content = fs.readFileSync(filePath, 'utf8');
  const normContent = content.replace(/\r\n/g, '\n');
  const normOld = oldSnippet.replace(/\r\n/g, '\n');
  const normNew = newSnippet.replace(/\r\n/g, '\n');

  if (!normContent.includes(normOld)) {
    throw new Error(`Snippet not found in ${filePath}`);
  }

  const updated = normContent.replace(normOld, normNew).replace(/\n/g, '\r\n');
  fs.writeFileSync(filePath, updated, 'utf8');
  console.log(`Patched ${filePath} successfully.`);
}

module.exports = { patchFile };
