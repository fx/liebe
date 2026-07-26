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
      try {
        document.body.appendChild(panel)
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

  // Mounts the panel with `scriptSrc` standing in for the served bundle and
  // asserts it publishes `expectedBaseUrl`. The panel keeps global state
  // (`window.__LIEBE_ASSET_BASE_URL__`, a `<link>` in `document.head`), so this
  // snapshots the document first and restores exactly what it changed —
  // nothing pre-existing is deleted or clobbered.
  const expectAssetBaseUrl = async (scriptSrc: string, expectedBaseUrl: string) => {
    await import('../panel')

    const cssHref = `${expectedBaseUrl}liebe.css`
    const cssLinkSelector = `link[href="${cssHref}"]`
    const preExistingLinks = new Set(document.head.querySelectorAll(cssLinkSelector))
    const hadBaseUrl = '__LIEBE_ASSET_BASE_URL__' in window
    const previousBaseUrl = window.__LIEBE_ASSET_BASE_URL__

    // `document.currentScript` is null outside a running script, so the panel
    // falls back to locating its own <script> by src — the path that matters
    // in Home Assistant, where the bundle is served from an arbitrary base.
    const script = document.createElement('script')
    script.src = scriptSrc

    const { elementName } = getPanelConfig()
    const panel = document.createElement(elementName)

    try {
      // The panel takes the *first* `script[src*="panel.js"]` in tree order.
      // Inserting at the top of <head> puts this stub ahead of anything else in
      // the document; the assertion proves it rather than assuming it.
      document.head.insertBefore(script, document.head.firstChild)
      expect(document.querySelector('script[src*="panel.js"]')).toBe(script)

      document.body.appendChild(panel)

      // WeatherCard reads this global to resolve its background images.
      expect(window.__LIEBE_ASSET_BASE_URL__).toBe(expectedBaseUrl)
      expect(panel.shadowRoot?.querySelector(cssLinkSelector)).not.toBeNull()
    } finally {
      panel.remove()
      script.remove()
      document.head.querySelectorAll(cssLinkSelector).forEach((link) => {
        if (!preExistingLinks.has(link)) link.remove()
      })
      if (hadBaseUrl) {
        window.__LIEBE_ASSET_BASE_URL__ = previousBaseUrl
      } else {
        delete window.__LIEBE_ASSET_BASE_URL__
      }
    }
  }

  // Same module-loading budget as above: the import is cached by now, but the
  // first test to run pays for the graph and either may go first.
  it(
    'publishes the directory panel.js was served from as the asset base URL',
    { timeout: 30_000 },
    async () => {
      await expectAssetBaseUrl(
        'http://localhost/local/liebe/panel.js',
        'http://localhost/local/liebe/'
      )
    }
  )

  // Same module-loading budget as above.
  it('ignores a cache-busting query string on the panel.js URL', { timeout: 30_000 }, async () => {
    // `module_url: https://host/local/liebe/panel.js?v=123` is a normal thing
    // to configure in Home Assistant to defeat browser caching. The base URL
    // must still resolve to the directory, not carry the query into every
    // asset URL derived from it.
    await expectAssetBaseUrl(
      'http://localhost/local/liebe/panel.js?v=123',
      'http://localhost/local/liebe/'
    )
  })
})
