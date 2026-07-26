import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { getPanelConfig } from '../config/panel'

// Importing src/panel.ts registers the custom element and starts its interval
// guardians; fake timers keep those inert for the test.

describe('LiebePanel custom element', () => {
  beforeAll(() => {
    vi.useFakeTimers()
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  // `import('../panel')` pulls the whole application module graph — React, Radix
  // Themes, react-grid-layout and their CSS — through Vitest's transform. That
  // costs ~1s in isolation and several times more under full-suite worker
  // contention, so the 5s default timeout fails this test in CI while it passes
  // when the file is run alone. The budget is generous on purpose: it is sized
  // for module loading, not for the assertions, and still catches a real hang.
  it(
    'mounts a shadow root whose React container is tagged data-liebe-root',
    { timeout: 30_000 },
    async () => {
      await import('../panel')

      const { elementName } = getPanelConfig()
      expect(customElements.get(elementName)).toBeTruthy()

      const panel = document.createElement(elementName)
      document.body.appendChild(panel)
      try {
        const container = panel.shadowRoot?.querySelector('[data-liebe-root]') as HTMLElement | null
        // Contract with resolvePanelPortalContainer: the tagged div is the
        // React root that in-panel portals target.
        expect(container).not.toBeNull()
        expect(container?.style.height).toBe('100%')
        expect(container?.parentNode).toBe(panel.shadowRoot)
      } finally {
        panel.remove()
      }
    }
  )

  // Same module-loading budget as above: the import is cached by now, but the
  // first test to run pays for the graph and either may go first.
  it(
    'publishes the directory panel.js was served from as the asset base URL',
    { timeout: 30_000 },
    async () => {
      await import('../panel')

      // `document.currentScript` is null outside a running script, so the panel
      // falls back to locating its own <script> by src — the path that matters
      // in Home Assistant, where the bundle is served from an arbitrary base.
      const script = document.createElement('script')
      script.src = 'http://localhost/local/liebe/panel.js'
      document.head.appendChild(script)

      const { elementName } = getPanelConfig()
      const panel = document.createElement(elementName)
      document.body.appendChild(panel)
      try {
        // WeatherCard reads this global to resolve its background images.
        expect(window.__LIEBE_ASSET_BASE_URL__).toBe('http://localhost/local/liebe/')
        expect(
          panel.shadowRoot?.querySelector('link[href="http://localhost/local/liebe/liebe.css"]')
        ).not.toBeNull()
      } finally {
        panel.remove()
        script.remove()
        document.head.querySelectorAll('link[href*="/local/liebe/"]').forEach((l) => l.remove())
        delete window.__LIEBE_ASSET_BASE_URL__
      }
    }
  )
})
