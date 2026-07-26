import type { Preview } from '@storybook/react-vite'
import { DEFAULT_THEME_ID, listThemes } from '~/theme/themeRegistry'
import { withProviders, withServiceCalls, withStoreSeed } from './decorators'
import { registerMockCameraStream } from './mockCameraStream'

// Custom elements are process-wide, so the stand-in for HA's
// <ha-camera-stream> is registered once for the whole preview rather than per
// story. Only camera stories that ask for the stream branch ever render it.
registerMockCameraStream()

// In the panel, `src/panel.ts` publishes the directory it was loaded from so
// cards can build asset URLs against it (WeatherCard's backgrounds). Nothing
// bootstraps the panel here, so without this the fallback `/` would resolve
// those assets against the origin root — fine at `localhost:6006`, broken on
// Pages where the workshop is published under `/liebe/storybook/`. Point it at
// the preview document's own directory instead, which is correct in both.
// The global itself is declared in `src/panel.ts`, the module that publishes it.
window.__LIEBE_ASSET_BASE_URL__ = new URL('./', document.baseURI).href

// The same style set the panel injects (src/panel.ts) — imported here directly
// because the panel entry also registers the custom element and starts the
// Home Assistant connection, neither of which may run in the preview.
// The token layers are part of that set and are imported in the same order the
// panel injects them (base → theme → user, per the theming spec); the
// stylesheets carry the `@layer` statement that makes the order binding.
import '@radix-ui/themes/styles.css'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import '~/styles/app.css'
import '~/styles/tokens.css'
import '~/theme/themes/default.css'

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
        order: ['Design System', 'Shell', 'Cards'],
      },
    },
    a11y: {
      // Audit every story, but report rather than fail: the first pass of this
      // workshop records the violations it finds as issues, and fixing them is
      // deliberately out of scope here (change 0009, PR 2).
      test: 'todo',
      config: {
        rules: [
          {
            // `region` reports a story-isolation artifact, not a card defect: a
            // story renders a bare card with no surrounding landmark, while the
            // real panel DOES provide one. Measured against the built workshop,
            // a stock `axe.run(document.body)` flags it on 127 of 165 stories
            // (301 nodes) — enough to bury the findings that ARE real defects,
            // `button-name` (critical, 35 stories) and `aria-input-field-name`
            // (serious, 6 stories), which stay reported and are tracked in
            // issues #191 and #192.
            //
            // addon-a11y disables `region` in its own default rule set for this
            // exact reason, so today this entry is a no-op for the addon's
            // runner; it is pinned here so the suppression is explicit and
            // survives a change to those addon defaults.
            //
            // Revisit if full-shell stories are ever added — a story that DOES
            // render the panel's landmarks could fail this rule meaningfully.
            id: 'region',
            enabled: false,
          },
        ],
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
