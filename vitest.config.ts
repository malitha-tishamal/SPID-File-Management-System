import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
  resolve: {
    alias: {
      validators: fileURLToPath(new URL('./src/validators', import.meta.url)),
      types: fileURLToPath(new URL('./src/types', import.meta.url)),
      services: fileURLToPath(new URL('./src/services', import.meta.url)),
      controllers: fileURLToPath(new URL('./src/controllers', import.meta.url)),
      models: fileURLToPath(new URL('./src/models', import.meta.url)),
      lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
      config: fileURLToPath(new URL('./src/config', import.meta.url)),
      components: fileURLToPath(new URL('./src/components', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
