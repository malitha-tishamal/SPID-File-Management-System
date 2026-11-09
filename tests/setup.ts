import { beforeAll } from 'vitest';

import { i18n } from 'i18n/config';

/**
 * Component tests render real components, which resolve copy through `t()`.
 * Without this the dictionaries are uninitialized and every assertion sees a
 * raw key. Tests always run in English; Sinhala is covered by the dictionary
 * parity and missing-key suites.
 */
beforeAll(async () => {
  if (i18n.language !== 'en') await i18n.changeLanguage('en');
});
