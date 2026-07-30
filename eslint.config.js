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
                'Import portalled components from ~/components/ui/portals, so they mount inside the shadow root where the theme and user layers reach them.',
            },
          ],
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
    ],
  },
  prettierConfig,
]
