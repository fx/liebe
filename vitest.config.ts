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
        // Test setup, helpers, mocks, and dev-only test scaffolding — not
        // production code, so they must not inflate the denominator or fall
        // under the patch gate.
        'src/test/**',
        '**/test-setup.ts',
        'src/test-utils/**',
        'src/testUtils/**',
        'src/routes/test-store.tsx',
        'src/components/EntityBrowserPerformanceTest.tsx',
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
