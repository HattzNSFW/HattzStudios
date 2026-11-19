import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Avoid loading two React copies (apps pin 19.2.0 while @testing-library/react hoists a
    // newer 19.x); duplicate React instances break hooks in component tests.
    dedupe: ['react', 'react-dom'],
    alias: {
      '@hattz/design-system/tokens.css': resolve(rootDir, 'packages/design-system/src/tokens.css'),
      '@hattz/core': resolve(rootDir, 'packages/core/src/index.ts'),
      '@hattz/contracts': resolve(rootDir, 'packages/contracts/src/index.ts'),
      '@hattz/design-system': resolve(rootDir, 'packages/design-system/src/index.ts'),
      '@hattz/permissions': resolve(rootDir, 'packages/permissions/src/index.ts'),
      '@hattz/validation': resolve(rootDir, 'packages/validation/src/index.ts'),
      '@hattz/shared-utils': resolve(rootDir, 'packages/shared-utils/src/index.ts'),
      // Subcaminho de TESTE: injeção isolada de autoridade de posse. NÃO existe no `exports` do
      // pacote, portanto não faz parte da interface pública de produção.
      '@hattz/local-store/testing': resolve(
        rootDir,
        'packages/local-store/src/trustedAuthority.ts',
      ),
      '@hattz/local-store': resolve(rootDir, 'packages/local-store/src/index.ts'),
      '@hattz/profile-view': resolve(rootDir, 'packages/profile-view/src/index.ts'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Studio tests drive real (fake) IndexedDB + React effects; the default 5s test timeout is
    // tight when the whole suite runs in parallel on a low-spec machine.
    testTimeout: 20_000,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  },
});
