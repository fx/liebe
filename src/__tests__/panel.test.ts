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
})
