import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
  resolve: {
    alias: {
      validators: fileURLToPath(new URL('./src/validators', import.meta.url)),
      types: fileURLToPath(new URL('./src/types', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
