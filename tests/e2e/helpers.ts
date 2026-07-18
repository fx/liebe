import { type Page, expect } from '@playwright/test'
import { getCredentials, HASS_URL } from '../../scripts/onboard.mjs'

// Demo/helper entities the suite asserts against. The demo integration provides
// the light; the input_boolean is a deterministic helper from configuration.yaml.
export const DEMO_LIGHT = 'light.bed_light'
export const E2E_FLAG = 'input_boolean.e2e_flag'
// Synthetic ffmpeg camera fed by the go2rtc testsrc2 stream (docs/changes/0007).
export const E2E_CAMERA = 'camera.e2e_pattern'

// A deterministic dashboard config seeded into localStorage before the panel
// boots, so cards render without any UI drag/drop. The panel reads `liebe-config`
// synchronously on load (see src/store/persistence.ts).
export function seedConfig() {
  return {
    version: '1.0.0',
    theme: 'auto',
    screens: [
      {
        id: 'e2e-screen',
        name: 'E2E',
        slug: 'e2e',
        type: 'grid',
        grid: {
          resolution: { columns: 12, rows: 8 },
          items: [
            {
              id: 'item-light',
              type: 'entity',
              entityId: DEMO_LIGHT,
              x: 0,
              y: 0,
              width: 2,
              height: 2,
            },
            {
              id: 'item-flag',
              type: 'entity',
              entityId: E2E_FLAG,
              x: 2,
              y: 0,
              width: 2,
              height: 2,
            },
          ],
        },
      },
    ],
  }
}

// DEDICATED camera seed — a separate screen/config from seedConfig() so the
// camera spec cannot perturb the deterministic seed the existing serial specs
// assert against. Places camera.e2e_pattern as a single 4x2 grid item.
export function seedCameraConfig() {
  return {
    version: '1.0.0',
    theme: 'auto',
    screens: [
      {
        id: 'e2e-camera-screen',
        name: 'E2E Camera',
        slug: 'e2e-camera',
        type: 'grid',
        grid: {
          resolution: { columns: 12, rows: 8 },
          items: [
            {
              id: 'item-camera',
              type: 'entity',
              entityId: E2E_CAMERA,
              x: 0,
              y: 0,
              width: 4,
              height: 2,
            },
          ],
        },
      },
    ],
  }
}

// Open the Liebe panel in a real HA session. Optionally seeds a dashboard config
// into localStorage first. Returns an access token for REST state mutation.
//
// Each call mints a fresh, single-use auth code; HA does not persist tokens for
// externally-authed panels, so every navigation needs its own code.
//
// Navigation is a direct deep link to the panel URL in a fresh context — no
// Lovelace warm-up — so specs relying on this exercise the panel's deep-link
// bootstrap path (window.loadCardHelpers undefined at first paint).
export async function openPanel(
  page: Page,
  config?: ReturnType<typeof seedConfig> | ReturnType<typeof seedCameraConfig>
): Promise<{ accessToken: string }> {
  const { panelUrl, accessToken } = await getCredentials()

  // Neutralize service-worker registration. The HA frontend reloads the page
  // when its service worker first takes control (~4s after load in a fresh
  // browser context), and tokens from the panel's single-use auth code are
  // not persisted — so that reload bounces the panel to the login screen and
  // kills any test still running past it (e.g. anything waiting on camera
  // stream startup). Keeping navigator.serviceWorker present but making
  // register() never settle prevents installation without breaking HA
  // frontend code that touches the API unguarded.
  await page.addInitScript(() => {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.register = () => new Promise<never>(() => {})
    }
  })

  if (config) {
    await page.addInitScript((cfgJson: string) => {
      localStorage.setItem('liebe-config', cfgJson)
      localStorage.setItem('liebe-mode', 'view')
    }, JSON.stringify(config))
  }

  await page.goto(panelUrl)

  // Wait until the custom element has mounted and its websocket is connected.
  await page.waitForFunction(
    () => {
      const panel = (window as unknown as { __liebePanel?: PanelHandle }).__liebePanel
      return Boolean(panel?._hass?.connection?.connected)
    },
    undefined,
    { timeout: 30_000 }
  )

  // When a dashboard was seeded, also wait for its cards to actually render so
  // callers can assert against them without their own render race.
  if (config) {
    await page.waitForFunction(
      () => {
        const panel = (window as unknown as { __liebePanel?: PanelHandle }).__liebePanel
        return (panel?.shadowRoot?.querySelectorAll('.grid-item').length ?? 0) > 0
      },
      undefined,
      { timeout: 30_000 }
    )
  }

  return { accessToken }
}

// Minimal shape of the panel element exposed on window by src/panel.ts.
interface PanelHandle {
  _hass?: {
    connection?: { connected?: boolean }
    states?: Record<string, { state: string } | undefined>
  }
  shadowRoot: ShadowRoot | null
}

// Read a live entity state from the mounted panel's in-memory hass object.
export async function readHassState(page: Page, entityId: string): Promise<string | null> {
  return page.evaluate((id) => {
    const panel = (window as unknown as { __liebePanel?: PanelHandle }).__liebePanel
    return panel?._hass?.states?.[id]?.state ?? null
  }, entityId)
}

// Snapshot of high-level panel status for the "panel loads" assertions.
export async function panelInfo(page: Page): Promise<{
  defined: boolean
  mounted: boolean
  inline: boolean
  connected: boolean
  stateCount: number
}> {
  return page.evaluate(() => {
    const panel = (window as unknown as { __liebePanel?: PanelHandle }).__liebePanel
    const states = panel?._hass?.states
    return {
      defined: Boolean(customElements.get('liebe-panel')),
      mounted: Boolean(panel),
      inline: !document.querySelector('iframe'),
      connected: Boolean(panel?._hass?.connection?.connected),
      stateCount: states ? Object.keys(states).length : 0,
    }
  })
}

// Count rendered grid-item cards inside the panel's shadow DOM.
export async function gridItemCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const panel = (window as unknown as { __liebePanel?: PanelHandle }).__liebePanel
    return panel?.shadowRoot?.querySelectorAll('.grid-item').length ?? 0
  })
}

// Read the aria-checked value of the input_boolean card's switch.
export async function flagSwitchChecked(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const panel = (window as unknown as { __liebePanel?: PanelHandle }).__liebePanel
    const sw = panel?.shadowRoot?.querySelector('[role="switch"]')
    return sw?.getAttribute('aria-checked') ?? null
  })
}

// Click the title of the card for the given friendly name via a real, trusted
// Playwright click. Clicking the card body (not the switch) triggers exactly one
// service call — clicking the switch itself would bubble to the card and
// double-toggle. Playwright's CSS locators pierce the panel's open shadow root.
export async function clickCardTitle(page: Page, title: string): Promise<void> {
  const card = page.locator('.grid-item').filter({ hasText: title })
  await expect(card, `card titled "${title}" should be present`).toHaveCount(1)
  await card.getByText(title, { exact: true }).click()
}

// --- REST helpers (bypass the UI to set up / verify state deterministically) ---

export async function callService(
  token: string,
  domain: string,
  service: string,
  data: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`${HASS_URL}/api/services/${domain}/${service}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const { ok, status } = res
  if (!ok) {
    throw new Error(`service ${domain}.${service} failed: ${status} ${await res.text()}`)
  }
}

export async function getRestState(token: string, entityId: string): Promise<string> {
  const res = await fetch(`${HASS_URL}/api/states/${entityId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const { ok, status } = res
  if (!ok) {
    throw new Error(`get state ${entityId} failed: ${status}`)
  }
  const { state } = (await res.json()) as { state: string }
  return state
}

// Force an input_boolean to a known state via REST, for deterministic setup.
export async function setFlag(token: string, on: boolean): Promise<void> {
  await callService(token, 'input_boolean', on ? 'turn_on' : 'turn_off', {
    entity_id: E2E_FLAG,
  })
}
