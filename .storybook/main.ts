import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  // Enabled globally so every story is audited by axe as soon as it is opened
  // (spec: "the a11y addon MUST run on all stories").
  addons: ['@storybook/addon-a11y'],
  // Mock assets the stories serve to themselves (camera frames), so no story
  // depends on network access.
  staticDirs: ['./public'],
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
