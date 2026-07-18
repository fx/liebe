import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Playwright e2e specs live in tests/e2e and must not be picked up by the
    // vitest unit runner (they import @playwright/test).
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Only production source counts toward the coverage denominator.
      include: ['src/**', 'app/**'],
      exclude: [
        // Test specs
        '**/__tests__/**',
        '**/*.test.*',
        'tests/e2e/**',
        // Test setup, helpers, and mocks that are imported only by tests and
        // never bundled — they must not inflate the denominator or fall under
        // the patch gate. Dev-only pages like src/routes/test-store.tsx and
        // src/components/EntityBrowserPerformanceTest.tsx are intentionally NOT
        // excluded: they are reachable from src/routeTree.gen.ts and ship in
        // the production bundle, so they belong in the denominator.
        'src/test/**',
        '**/test-setup.ts',
        'src/test-utils/**',
        'src/testUtils/**',
        // Build output, generated code, and config files
        'dist/**',
        '**/*.gen.ts',
        '**/*.config.{ts,js,mts,mjs,cts,cjs}',
      ],
    },
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src'),
    },
  },
})
