import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  // Enabled globally so every story is audited by axe as soon as it is opened
  // (spec: "the a11y addon MUST run on all stories").
  addons: ['@storybook/addon-a11y'],
  // Mock assets the stories serve to themselves (camera frames), so no story
  // depends on network access — plus the panel's own `public/`, which is where
  // bundled assets resolved through `__LIEBE_ASSET_BASE_URL__` live (LCARS's
  // Antonio woff2, the weather backgrounds). The workshop publishes them at the
  // same paths the built panel does, so a theme that loads a bundled font
  // renders in the workshop exactly as it will in Home Assistant.
  staticDirs: ['./public', '../public'],
  framework: {
    name: '@storybook/react-vite',
    options: {
      builder: {
        // Keep the workshop off the panel's Vite config — see
        // .storybook/vite.config.ts.
        viteConfigPath: '.storybook/vite.config.ts',
      },
    },
  },
  core: {
    disableTelemetry: true,
  },
}

export default config
