import { type ConsoleMessage, type Page, expect } from '@playwright/test'
import { getCredentials, HASS_URL } from '../../scripts/onboard.mjs'
import { safeStringify } from './safeStringify'

// Demo/helper entities the suite asserts against. The demo integration provides
// the light; the input_boolean is a deterministic helper from configuration.yaml.
export const DEMO_LIGHT = 'light.bed_light'
export const E2E_FLAG = 'input_boolean.e2e_flag'
// Synthetic ffmpeg camera fed by the go2rtc testsrc2 stream (docs/changes/0007).
export const E2E_CAMERA = 'camera.e2e_pattern'

// Deterministic dashboard configs seeded into localStorage before the panel
// boots, so cards render without any UI drag/drop. The panel reads `liebe-config`
// synchronously on load (see src/store/persistence.ts).

export interface SeedGridItem {
  id: string
  type: 'entity'
  entityId: string
  x: number
  y: number
  width: number
  height: number
}

export interface SeedConfig {
  version: string
  theme: string
  screens: Array<{
    id: string
    name: string
    slug: string
    type: 'grid'
    grid: {
      resolution: { columns: number; rows: number }
      items: SeedGridItem[]
    }
  }>
}

// Single-screen config builder shared by every seed below.
export function buildSeedConfig(screen: {
  id: string
  name: string
  slug: string
  items: SeedGridItem[]
}): SeedConfig {
  const { id, name, slug, items } = screen
  return {
    version: '1.0.0',
    theme: 'auto',
    screens: [
      {
        id,
        name,
        slug,
        type: 'grid',
        grid: {
          resolution: { columns: 12, rows: 8 },
          items,
        },
      },
    ],
  }
}

export function seedConfig(): SeedConfig {
  return buildSeedConfig({
    id: 'e2e-screen',
    name: 'E2E',
    slug: 'e2e',
    items: [
      { id: 'item-light', type: 'entity', entityId: DEMO_LIGHT, x: 0, y: 0, width: 2, height: 2 },
      { id: 'item-flag', type: 'entity', entityId: E2E_FLAG, x: 2, y: 0, width: 2, height: 2 },
    ],
  })
}

// DEDICATED camera seed — a separate screen/config from seedConfig() so the
// camera spec cannot perturb the deterministic seed the existing serial specs
// assert against. Places camera.e2e_pattern as a single 4x2 grid item.
export function seedCameraConfig(): SeedConfig {
  return buildSeedConfig({
    id: 'e2e-camera-screen',
    name: 'E2E Camera',
    slug: 'e2e-camera',
    items: [
      { id: 'item-camera', type: 'entity', entityId: E2E_CAMERA, x: 0, y: 0, width: 4, height: 2 },
    ],
  })
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
export async function openPanel(page: Page, config?: SeedConfig): Promise<{ accessToken: string }> {
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

// The cycle-safe stringifier lives in ./safeStringify (still self-contained —
// its source text is what gets serialized into the page) so its DAG-vs-cycle
// semantics can be unit-tested outside the Playwright runner.

// Installed as an init script (serialized to source text, composed with
// safeStringify): records unhandled rejection reasons in-page so their
// real payloads survive — Chromium's pageerror channel collapses plain-object
// reasons to the useless literal "Object". Records are tagged '(object)' ONLY
// for plain-object reasons (`[object Object]` toString tag, not an Error):
// that is exactly the shape Chromium surfaces as a bare "Object" pageerror,
// so fatalErrors() can dedupe one placeholder per tagged record. Arrays,
// Dates, Maps, and class-tagged reasons produce distinguishable pageerrors of
// their own and must NOT consume a placeholder.
function installRejectionRecorder(stringify: (value: unknown) => string): void {
  const rejections: string[] = []
  ;(window as unknown as { __e2eRejections: string[] }).__e2eRejections = rejections
  window.addEventListener('unhandledrejection', (event) => {
    const { reason } = event
    const detail = stringify(reason)
    const isPlainObjectReason =
      !(reason instanceof Error) && Object.prototype.toString.call(reason) === '[object Object]'
    rejections.push(
      isPlainObjectReason
        ? `unhandled rejection (object): ${detail}`
        : `unhandled rejection: ${detail}`
    )
  })
}

// Collector for fatal browser-side errors: console errors (with object
// arguments fully serialized — msg.text() renders them as the useless literal
// "Object"), pageerrors, and unhandled promise rejections (whose plain-object
// reasons surface through pageerror as "Object", so the real payloads are
// recorded in-page and read back at the end). Must be installed BEFORE the
// page navigates (it registers an init script). Benign matchers — regexes or
// predicates — are filtered out of fatalErrors(); everything else is fatal.
export type BenignMatcher = RegExp | ((text: string) => boolean)

// Emitted when even the in-page safeStringify evaluation failed for a console
// argument (e.g. the argument's execution context was destroyed at teardown).
// Such entries carry NO inspectable content, so content-based benign filters
// can never match them — they stay fatal by default; a spec may scope a
// narrow benign predicate to purely-placeholder entries from a known source.
export const SERIALIZATION_FAILURE_PLACEHOLDER = '<failed to serialize console argument>'

// Upper bound on a single console-argument serialization round-trip. A hung
// jsonValue()/evaluate() must not be ABANDONED (a dropped entry could let a
// fatal error pass silently): past the bound the entry is recorded as the
// failure placeholder instead, which stays fatal unless a spec's narrowly
// scoped placeholder predicate matches it.
const SERIALIZATION_TIMEOUT_MS = 2000

export interface ConsoleErrorCollector {
  /** Collected non-benign errors; await at the end of the test. */
  fatalErrors: () => Promise<string[]>
}

export async function collectConsoleErrors(
  page: Page,
  benignPatterns: BenignMatcher[] = []
): Promise<ConsoleErrorCollector> {
  const collected: string[] = []
  // In-flight console-arg serializations; fatalErrors() awaits them so late
  // errors are never silently dropped.
  const pendingSerializations = new Set<Promise<void>>()
  // Bare "Object" pageerrors: object-reason unhandled rejections surface here
  // AND in the in-page records below; synchronous `throw {…}` surfaces ONLY
  // here. Kept separately so fatalErrors() can dedupe against the in-page
  // records instead of dropping (or double-reporting) them.
  const objectPageErrors: string[] = []

  const onConsoleMessage = (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return
    // msg.text() renders object arguments as the literal "Object"; serialize
    // the argument values so the benign filter sees the real payload.
    const { url, lineNumber } = msg.location()
    // Exactly ONE entry is recorded per console error, whichever settles
    // first: the real serialization or the timeout's failure placeholder (a
    // serialization landing after the timeout must not add a second entry).
    let recorded = false
    const record = (text: string) => {
      if (recorded) return
      recorded = true
      collected.push(`${text} (at ${url}:${lineNumber})`)
    }
    const serialization = Promise.all(
      msg.args().map((arg) =>
        arg
          .jsonValue()
          .then((value) => (typeof value === 'string' ? value : JSON.stringify(value)))
          // jsonValue() rejects on values Playwright cannot serialize (and
          // JSON.stringify throws on reconstructed cycles) — circular hls.js
          // ErrorData in particular. Stringify in-page instead so the payload
          // stays inspectable ("type"/"details"/"fatal" survive for the
          // benign filter) rather than collapsing to an unfilterable
          // placeholder. safeStringify is passed as the page function itself
          // (self-contained), never referenced from a closure.
          .catch(() =>
            arg
              .evaluate(safeStringify as (value: unknown) => string)
              .catch(() => SERIALIZATION_FAILURE_PLACEHOLDER)
          )
      )
    ).then((parts) => record(parts.length > 0 ? parts.join(' ') : msg.text()))
    // Bound every serialization individually: a hung round-trip resolves to
    // the failure placeholder instead of being abandoned, so fatalErrors()
    // can await ALL pending work and every console error stays represented.
    const bounded = new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        record(SERIALIZATION_FAILURE_PLACEHOLDER)
        resolve()
      }, SERIALIZATION_TIMEOUT_MS)
      void serialization.then(() => {
        clearTimeout(timer)
        resolve()
      })
    })
    pendingSerializations.add(bounded)
    void bounded.finally(() => pendingSerializations.delete(bounded))
  }
  page.on('console', onConsoleMessage)

  page.on('pageerror', (err) => {
    const text = err.stack || err.message
    if (text === 'Object') {
      // A thrown/rejected plain object renders as the useless "Object". Never
      // drop it outright: record a placeholder that fatalErrors() dedupes
      // against the in-page rejection records (a leftover means a synchronous
      // object throw the in-page recorder cannot see).
      objectPageErrors.push('pageerror: [unserializable object]')
      return
    }
    collected.push(text)
  })

  // addInitScript(fn) cannot close over helpers, so the recorder and the
  // stringifier are composed as source text (both are self-contained).
  await page.addInitScript(`(${installRejectionRecorder.toString()})(${safeStringify.toString()})`)

  return {
    fatalErrors: async () => {
      // Freeze collection first: detaching the console listener means no new
      // work can be added while (or after) the pending set drains, so the
      // final read below is deterministic.
      page.off('console', onConsoleMessage)
      // Every pending serialization is individually bounded (real payload or
      // failure placeholder within SERIALIZATION_TIMEOUT_MS), so awaiting
      // them all cannot hang — and no console error can be dropped.
      await Promise.all([...pendingSerializations])
      const rejections = await page.evaluate(
        () => (window as unknown as { __e2eRejections?: string[] }).__e2eRejections ?? []
      )
      // Each plain-object-reason rejection produced both an in-page record
      // and a bare "Object" pageerror: drop one placeholder per such record.
      // The recorder tags exactly those records ("(object)"), so this count
      // is exact. Any placeholder left over came from a synchronous object
      // throw that only the pageerror channel saw — keep it so it can fail
      // the test.
      const objectRejectionCount = rejections.filter((text) =>
        text.startsWith('unhandled rejection (object):')
      ).length
      const unmatchedObjectPageErrors = objectPageErrors.slice(objectRejectionCount)
      return [...collected, ...unmatchedObjectPageErrors, ...rejections].filter(
        (text) =>
          !benignPatterns.some((matcher) =>
            typeof matcher === 'function' ? matcher(text) : matcher.test(text)
          )
      )
    },
  }
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
