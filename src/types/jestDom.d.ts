import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

/**
 * Types for the `@testing-library/jest-dom` matchers that `src/test/setup.ts`
 * registers at runtime.
 *
 * The package ships two augmentations of its own and, as of 7.0.1, neither is
 * usable here.
 *
 * `@testing-library/jest-dom` — the root entry the setup file imports —
 * augments the global `jest.Matchers` namespace and needs `@types/jest`, which
 * this repo does not install. vitest 4 bridged that gap anyway, because its own
 * `Assertion<T>` extended `jest.Matchers`; vitest 5 dropped the bridge, which
 * is what turned this bump red with 2245 `Property 'toBeInTheDocument' does not
 * exist` errors and nothing else.
 *
 * `@testing-library/jest-dom/vitest` is the entry that entry's absence points
 * at, and switching the setup file to it does make `tsc` pass — which is the
 * reason to say plainly why it is not the fix. It declares `interface
 * Assertion<T = any>`, one type parameter, where vitest 5's is
 * `Assertion<R, T>`; TypeScript merges an interface only when the type
 * parameter lists are identical, so that pairing is error TS2428, "All
 * declarations of 'Assertion' must have identical type parameters". The error
 * is raised inside `node_modules`, so `skipLibCheck: true` in `tsconfig.json`
 * hides it while TypeScript merges the members regardless. Verified both ways:
 * with that import and `--skipLibCheck false`, tsc reports TS2428 three times,
 * once at each declaration. Depending on it would make the type gate correct
 * only for as long as a compiler option keeps an error out of sight.
 *
 * So the matchers are declared here instead, against `Matchers` — the interface
 * vitest 5 documents as the extension point. Both `Assertion<R, T>` and
 * `AsymmetricMatchersContaining` extend it, so one declaration covers
 * `expect(el).toBeInTheDocument()`, `expect(el).not.…`, `expect.soft(…)` and
 * `await expect.poll(…)` alike. `R` is the assertion's return type, which is
 * what jest-dom's second parameter means; the first is the asymmetric-matcher
 * type widening `toHaveAccessibleName` and its four relatives to
 * `string | RegExp | E`. `never` is deliberate there, and tighter than the `any`
 * both of jest-dom's own augmentations pass: vitest types `expect.stringContaining`
 * and friends as `any`, and `any` is assignable to `string | RegExp`, so an
 * asymmetric matcher is still accepted while `toHaveAccessibleName(42)` is
 * rejected — which `any` and `unknown` both let through. `T` — the subject type — is
 * unused by these matchers and kept only because the parameter list below must
 * stay a verbatim copy of vitest's own, defaults, constraints and names
 * included, or TypeScript refuses the merge and every matcher goes missing
 * again.
 *
 * Unlike the suppressed one above, a mismatch here fails loudly: this file is
 * ours, so `skipLibCheck` does not cover it and a future vitest that reshapes
 * `Matchers` takes `npm run lint` down rather than going quiet.
 *
 * Delete this file once `@testing-library/jest-dom` ships a `/vitest` entry
 * matching vitest 5's signature, and import that entry from the setup file.
 */
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- an interface whose only job is to merge members into another declaration has none of its own; that is the augmentation idiom, not an oversight.
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- vitest's own declaration fixes this parameter's name and position; dropping it would break the merge.
    T = unknown,
  > extends TestingLibraryMatchers<never, R> {}
}
