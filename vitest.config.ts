import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@hattz/design-system/tokens.css': resolve(rootDir, 'packages/design-system/src/tokens.css'),
      '@hattz/core': resolve(rootDir, 'packages/core/src/index.ts'),
      '@hattz/contracts': resolve(rootDir, 'packages/contracts/src/index.ts'),
      '@hattz/design-system': resolve(rootDir, 'packages/design-system/src/index.ts'),
      '@hattz/permissions': resolve(rootDir, 'packages/permissions/src/index.ts'),
      '@hattz/validation': resolve(rootDir, 'packages/validation/src/index.ts'),
      '@hattz/shared-utils': resolve(rootDir, 'packages/shared-utils/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  },
});
