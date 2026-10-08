import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Unit tests con vitest + jsdom. Se testea lógica (stores, clientes, interceptores,
// funciones puras); los componentes se cubren con los e2e de Playwright.
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['src/test-setup.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
