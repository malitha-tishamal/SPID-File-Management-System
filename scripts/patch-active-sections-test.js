const { patchFile } = require('./patch-helper');

patchFile(
  './tests/active-sections.test.ts',
  `function filesBuilder() {
  let rows = [...state.files];
  const chain: any = {
    select: () => chain,`,
  `function filesBuilder() {
  let rows = [...state.files];
  const chain: any = {
    select: () => chain,
    ilike: () => chain,`,
);
