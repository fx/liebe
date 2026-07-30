import js from '@eslint/js'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'
import storybookPlugin from 'eslint-plugin-storybook'
import prettierConfig from 'eslint-config-prettier'

export default [
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.json',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'off',
      // react-hooks v7 rules, all enforced at error (change 0003, Groups A & B).
      'react-hooks/refs': 'error',
      'react-hooks/static-components': 'error',
      'react-hooks/incompatible-library': 'error',
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/preserve-manual-memoization': 'error',
      // Radix's portalled components default to `document.body`, which is
      // outside the shadow root and outside every layer the theming engine
      // injects there. `src/components/ui/portals.tsx` wraps each of them to
      // mount into the panel's portal host instead, and an overlay that reaches
      // for the raw component silently opts out of the theme and user layers —
      // a defect nothing else would catch, since it renders perfectly well on
      // the Default theme (docs/changes/0036-theming-contract-gaps.md).
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@radix-ui/themes',
              // Every portalling component Radix Themes ships, whether or not
              // the panel uses it today — `~/components/ui` re-exports the whole
              // library, so one left off this list stays reachable.
              importNames: [
                'AlertDialog',
                'ContextMenu',
                'Dialog',
                'DropdownMenu',
                'HoverCard',
                'Popover',
                'Select',
                'Tooltip',
              ],
              message:
                'Import portalled components from ~/components/ui/portals, so they mount inside the liebe-portal-root container where all three layers reach them.',
            },
          ],
        },
      ],
      /*
       * The effect hooks MUST be called through the imported binding, never as
       * `React.useEffect(...)` — because `react-hooks/set-state-in-effect`
       * cannot see the member-call form, so a state-writing effect written that
       * way is silently exempt from a rule the line above sets to `error`
       * (docs/changes/0040-test-harness-reliability.md, PR 3).
       *
       * This is an upstream defect rather than a configuration gap, which is
       * why the ban is the fix. The rule is one of the react-hooks v7
       * compiler-backed rules, and its validation pass reads the *receiver* of
       * a method call where it means the callee — so for `React.useEffect(fn)`
       * it type-checks `React`, an object, against "is this an effect hook?"
       * and gets `false`. The pass has no option that changes this, and the
       * same bundle's memory-effect inference does it correctly
       * (`callee = value.property`), so there is nothing to configure. Patching
       * a vendored 2 MB compiler build to fix it would make this gate's
       * correctness depend on a patch surviving every reinstall and every
       * plugin upgrade, unnoticed when it stopped applying — the exact class of
       * silently-degrading gate that change 0040 exists to remove.
       *
       * Scoped to the three hooks the rule inspects (`useEffect`,
       * `useLayoutEffect`, `useInsertionEffect`) so the ban is exactly as wide
       * as the blind spot. `React.useState` and friends are unaffected: the
       * member form of those resolves correctly, verified by probe.
       *
       * Keyed on the **property**, not on an object named `React`. The blind
       * spot is a property of the member call itself — the pass mis-reads the
       * receiver whatever the receiver is called — so a selector pinned to
       * `React` would let `import * as Hooks from 'react'; Hooks.useEffect(…)`
       * through, and the hole it was written to close would still be open under
       * a different name. The second selector is the same ban for the computed
       * spelling, `React['useEffect']`.
       *
       * The third selector covers `const { useEffect } = React`, which is the
       * subtle one: the call site is then a plain identifier, so there is no
       * member expression left to key on — and the rule stays silent too,
       * because the binding came from a namespace object rather than from an
       * import it recognises. That spelling therefore evades the rule *and*
       * both selectors above, which is why it is banned at the destructuring
       * rather than at the call.
       *
       * Nothing statically catches a fully dynamic access (`React[name]`), and
       * nothing needs to: that defeats the rule's own analysis too, so it is a
       * limitation of the underlying rule rather than of this ban.
       *
       * `exhaustive-deps` is the AST-based rule and does see member calls; only
       * the compiler-backed rules have this hole.
       */
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'MemberExpression[computed=false][property.name=/^use(Layout|Insertion)?Effect$/]',
          message:
            "Call the effect hooks through the imported binding — `import { useEffect } from 'react'` — not as a member call like `React.useEffect`. react-hooks/set-state-in-effect cannot see the member-call form, so writing it that way silently exempts the effect from that rule. See docs/changes/0040-test-harness-reliability.md.",
        },
        {
          // Both static computed spellings: a string literal carries `value`, a
          // no-substitution template literal carries `quasis.0.value.raw`.
          selector:
            'MemberExpression[computed=true]:matches([property.value=/^use(Layout|Insertion)?Effect$/], [property.quasis.length=1][property.quasis.0.value.raw=/^use(Layout|Insertion)?Effect$/])',
          message:
            "Call the effect hooks through the imported binding — `import { useEffect } from 'react'` — not as a computed member call like `React['useEffect']`. react-hooks/set-state-in-effect cannot see the member-call form, so writing it that way silently exempts the effect from that rule. See docs/changes/0040-test-harness-reliability.md.",
        },
        {
          // Every static key spelling: `{ useEffect }` / `{ useEffect: alias }`
          // carry an identifier key, `{ ['useEffect']: alias }` a string
          // literal, and the backtick form a template literal.
          selector:
            'ObjectPattern > Property:matches([key.name=/^use(Layout|Insertion)?Effect$/], [key.value=/^use(Layout|Insertion)?Effect$/], [key.quasis.length=1][key.quasis.0.value.raw=/^use(Layout|Insertion)?Effect$/])',
          message:
            "Import the effect hooks directly — `import { useEffect } from 'react'` — rather than destructuring them off the React namespace. A hook bound that way is a plain identifier at the call site, which react-hooks/set-state-in-effect does not recognise as an effect, so the state-writing check silently does not apply. See docs/changes/0040-test-harness-reliability.md.",
        },
      ],
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
  // Storybook's own rules for `*.stories.tsx` and `.storybook/` config files.
  ...storybookPlugin.configs['flat/recommended'],
  {
    ignores: [
      'node_modules/',
      '.output/',
      '.tanstack/',
      'dist/',
      'build/',
      'coverage/',
      '*.gen.ts',
      '.nitro/',
      '.vite-temp/',
      '.tailscale/',
      'storybook-static/',
      /*
       * Fixtures written by `src/__tests__/effectHookLintGate.test.ts`. They
       * contain the banned spellings on purpose, and the spec deletes them —
       * but a run killed between the write and the cleanup would otherwise
       * leave the merge-blocking lint gate failing on files that are not
       * anybody's diff, which is a miserable thing to debug. The spec opts
       * itself back in with `ignore: false`, so ignoring them here costs it
       * nothing.
       */
      'src/__lint-fixture__/',
    ],
  },
  prettierConfig,
]
