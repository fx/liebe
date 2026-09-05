import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    /*
     * Vitest's 5000 ms default sits inside the range the slowest legitimate
     * assertions in this suite occupy, so it fails them for being slow rather
     * than for being wrong. The card configuration modals are the class: each
     * mounts a Radix dialog over a seeded entity store and drives it through
     * `user-event`, and v8 coverage instrumentation roughly doubles that before
     * any contention is involved.
     *
     * The number is measured rather than picked (docs/changes/0040-test-harness-
     * reliability.md, PR 5). Five full `--coverage` runs, worst default-governed
     * test per run: 1632 / 1838 / 2019 / 2081 ms as load average rose from 3 to
     * 49, then 4923 ms on a deliberately oversubscribed run (96 workers on 32
     * cores). Two independent timeouts have been recorded against the 5000 ms
     * default, and the number is set against both rather than either:
     * `WeatherCard.configSave.test.tsx` at 5987 ms and
     * `CardConfig.controlStyle.test.tsx` at 5464 ms, each of which the runs
     * above independently reproduce as the worst default-governed test in at
     * least one run. 20 s clears the larger of the two by 3.3x and the
     * oversubscribed measurement by 4.1x.
     *
     * The cost of the headroom is bounded and was weighed: a genuinely hung
     * test now takes 20 s to report instead of 5 s, against a suite that
     * finishes in about 30 s, so a hang is still unmistakable. Specs needing
     * longer than this keep declaring it per-test — `panel.test.ts` at 30 s and
     * `hassService.test.ts`'s retry test at 10 s are deliberately slow rather
     * than load-sensitive, and stay excluded from the figures above.
     *
     * `hookTimeout` is deliberately left at its default: no hook in this suite
     * has been observed near it, and raising it too would be exactly the
     * unmeasured round number this change exists to argue against.
     */
    testTimeout: 20_000,
    // CSS is stubbed out by default, `?raw` imports included — which would
    // hand the theme registry an empty stylesheet and make every assertion
    // about a theme's payload vacuous. Process the theme sheets only: the
    // vendored stylesheets stay stubbed, so no test pays to parse 800kB of
    // Radix CSS in jsdom.
    css: { include: [/src\/theme\/themes\//] },
    // Playwright e2e specs live in tests/e2e and must not be picked up by the
    // vitest unit runner (they import @playwright/test).
    //
    // `.claude/worktrees/**` covers agent worktrees checked out INSIDE the repo.
    // `configDefaults.exclude` does not cover them, so without this a bare
    // `npm test` globs every worktree's specs alongside this checkout's own,
    // running another branch's tests against this branch's `node_modules`.
    //
    // The failure does not read as a path problem: stale worktrees predating
    // change 0044 produced 10837 failures and 44282 lint errors here, all
    // `selector is not a function` from an old `useDashboardStore()` call that
    // the narrowed store subscriptions made mandatory. CI clones fresh and
    // never sees it, so local gates go red while CI stays green with no shared
    // cause to find.
    exclude: [...configDefaults.exclude, 'tests/e2e/**', '.claude/worktrees/**'],
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
        // Storybook is development tooling: stories, the workshop config, and
        // the decorators/fixtures they rely on never ship in the panel bundle,
        // so they must not inflate the denominator or fall under the patch
        // gate. See docs/changes/0009-storybook-setup.md.
        // `.storybook/main.ts` loads `*.stories.@(ts|tsx)`, so both extensions
        // have to be excluded.
        '**/*.stories.{ts,tsx}',
        '.storybook/**',
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
