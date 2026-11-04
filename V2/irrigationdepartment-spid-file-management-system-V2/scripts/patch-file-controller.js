const { patchFile } = require('./patch-helper');

const oldSnippet = `  const section = await repo.findByName(sectionName);
  if (!section) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'The selected section is not recognized.',
    );
  }
  if (!isActiveSection(section)) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      section.status === 'disabled'
        ? 'Selected section is disabled.'
        : 'Selected section is not active yet.',
    );
  }`;

const newSnippet = `  const section = await repo.findByName(sectionName);
  if (!section || isActiveSection(section)) return;
  throw new ApiError(
    400,
    'VALIDATION_ERROR',
    section.status === 'disabled'
      ? 'Selected section is disabled.'
      : 'Selected section is not active yet.',
  );`;

patchFile('./src/controllers/FileController.ts', oldSnippet, newSnippet);
