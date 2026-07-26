import type { Preview } from '@storybook/react-vite'
import { DEFAULT_THEME_ID, listThemes } from '~/theme/themeRegistry'
import { withProviders, withServiceCalls, withStoreSeed } from './decorators'

// The same style set the panel injects (src/panel.ts) — imported here directly
// because the panel entry also registers the custom element and starts the
// Home Assistant connection, neither of which may run in the preview.
import '@radix-ui/themes/styles.css'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import '~/styles/app.css'

const preview: Preview = {
  // Outermost first: providers wrap the mock connection, which wraps the
  // seeded stores, which wrap the (opt-in) grid cell.
  decorators: [withProviders, withServiceCalls, withStoreSeed],
  parameters: {
    // The provider decorator paints the themed ground and supplies the
    // padding; Storybook's default `padded` layout would frame every story
    // with an unthemed white margin.
    layout: 'fullscreen',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    options: {
      storySort: {
        order: ['Shell', 'Cards'],
      },
    },
  },
  globalTypes: {
    theme: {
      description: 'Liebe theme',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        // Registry-driven: themes registered by later changes show up here
        // with no workshop changes.
        items: listThemes().map(({ id, label }) => ({ value: id, title: label })),
        dynamicTitle: true,
      },
    },
    appearance: {
      description: 'Dark or light appearance (forced for single-appearance themes)',
      toolbar: {
        title: 'Appearance',
        icon: 'mirror',
        items: [
          { value: 'dark', title: 'Dark', icon: 'moon' },
          { value: 'light', title: 'Light', icon: 'sun' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: DEFAULT_THEME_ID,
    appearance: 'dark',
  },
}

export default preview
