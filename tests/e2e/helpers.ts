import { type ConsoleMessage, type Locator, type Page, expect } from '@playwright/test'
import { getCredentials, HASS_URL } from '../../scripts/onboard.mjs'
import { HOLD_DURATION_MS } from '../../src/store/cardActions'
import { safeStringify } from './safeStringify'

// Demo/helper entities the suite asserts against. The demo integration provides
// the light; the input_boolean is a deterministic helper from configuration.yaml.
export const DEMO_LIGHT = 'light.bed_light'
export const E2E_FLAG = 'input_boolean.e2e_flag'
/*
 * Home Assistant's demo button. Its state IS its last-press timestamp, so a
 * press is observable over REST without any helper to read back — and a press
 * that never landed is equally observable, which is the point: `button.toggle`,
 * what the fallback card dispatches, is not a registered service.
 */
export const DEMO_BUTTON = 'button.push'
/*
 * Home Assistant's demo lock, which starts `locked`. It is the boundary case a
 * unit test cannot reach: the `lock` platform registers only `lock`, `unlock`
 * and `open` — there is no `lock.toggle` — so the fallback card's tap could
 * never have worked, and only a real instance can tell a service that landed
 * from one HA answered 400 to.
 */
export const DEMO_LOCK = 'lock.front_door'
// A `mode: password` helper from configuration.yaml: its state IS the secret,
// so it is what proves the detail dialog masks what the card masks.
export const E2E_SECRET = 'input_text.e2e_secret'
export const E2E_SECRET_VALUE = 'redaction-fixture-value'
// Synthetic ffmpeg camera fed by the go2rtc testsrc2 stream (docs/changes/0007).
export const E2E_CAMERA = 'camera.e2e_pattern'
/*
 * The demo integration's TV, and the only demo media player that publishes a
 * `media_position` WITH a `media_position_updated_at` alongside its duration and
 * artwork — which is exactly what the progress bar requires before it renders at
 * all. `walkman`, `kitchen` and `lounge_room` all carry a duration and no
 * position, so they render no bar; that is the card's rule working, not a
 * missing fixture.
 */
export const DEMO_MEDIA_PLAYER = 'media_player.living_room'
// A numeric helper from configuration.yaml. Its value is settable over REST and
// recorded, which is what makes it usable as a history fixture.
export const E2E_LEVEL = 'input_number.e2e_level'
// A select helper from configuration.yaml. Placed as a 1x1 tile, it is the
// no-operability-regression case: at `glance` the card renders no control at
// all, so the only way to change its option is the detail dialog its tap opens
// (docs/specs/entity-cards/options/input-helpers.md — the tier table).
export const E2E_MODE = 'input_select.e2e_mode'

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
  /**
   * The placed item's stored card options — the same `item.config` the grid
   * publishes to the card shell. Seeded here so a spec can assert behaviour that
   * only exists under a particular option, rather than only the defaults.
   */
  config?: Record<string, unknown>
}

// The theming engine's configuration (docs/changes/0012-theming-engine.md). A
// seed may still carry the pre-0012 scalar `theme`, which the loader migrates.
export interface SeedThemeConfig {
  id: string
  appearance: 'auto' | 'dark' | 'light'
  customCss: string
}

export interface SeedConfig {
  version: string
  theme: string | SeedThemeConfig
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

// Single-screen config builder shared by every seed below. `theme` defaults to
// the legacy scalar so existing seeds keep exercising the migration path.
export function buildSeedConfig(screen: {
  id: string
  name: string
  slug: string
  items: SeedGridItem[]
  theme?: string | SeedThemeConfig
}): SeedConfig {
  const { id, name, slug, items, theme = 'auto' } = screen
  return {
    version: '1.0.0',
    theme,
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

/*
 * DEDICATED action-card seed, on its own screen for the same reason the
 * detail-dialog seed has one: this spec presses a button, and a shared screen
 * would perturb the deterministic seed the other serial specs assert against.
 */
export function seedActionCardConfig(): SeedConfig {
  return buildSeedConfig({
    id: 'e2e-action-screen',
    name: 'E2E Action',
    slug: 'e2e-action',
    items: [
      {
        id: 'item-button',
        type: 'entity',
        entityId: DEMO_BUTTON,
        x: 0,
        y: 0,
        // 2x1 rather than the family's 1x1 default: `clickCardTitle` finds the
        // card by its visible name, and the name is what a 1x1 glance tile
        // keeps, but the wider tile keeps the click target away from the edge.
        width: 2,
        height: 1,
      },
    ],
  })
}

/**
 * The lock card's own screen, carrying the demo lock at 3x1 so the `row` tier
 * renders its Lock/Unlock pair.
 */
export function seedLockCardConfig(): SeedConfig {
  return buildSeedConfig({
    id: 'e2e-lock-screen',
    name: 'E2E Lock',
    slug: 'e2e-lock',
    items: [
      {
        id: 'item-lock',
        type: 'entity',
        entityId: DEMO_LOCK,
        x: 0,
        y: 0,
        width: 3,
        height: 1,
      },
    ],
  })
}

// DEDICATED detail-dialog seed — its own screen, so the hold gestures below
// cannot perturb the deterministic seed the existing serial specs assert
// against. Carries the flag (a card whose tap toggles, to prove a hold does
// not) and the password helper (to prove the dialog redacts).
export function seedDetailDialogConfig(): SeedConfig {
  return buildSeedConfig({
    id: 'e2e-detail-screen',
    name: 'E2E Detail',
    slug: 'e2e-detail',
    items: [
      { id: 'item-flag', type: 'entity', entityId: E2E_FLAG, x: 0, y: 0, width: 2, height: 2 },
      { id: 'item-secret', type: 'entity', entityId: E2E_SECRET, x: 2, y: 0, width: 3, height: 2 },
      // Deliberately 1x1 — the `glance` tier, where the card carries no control.
      { id: 'item-mode', type: 'entity', entityId: E2E_MODE, x: 0, y: 2, width: 1, height: 1 },
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

// DEDICATED theming seed — its own screen, for the same reason the camera seed
// has one: the theming spec switches appearance and imports a whole foreign
// configuration, neither of which may perturb the deterministic seed the other
// serial specs assert against.
export function seedThemeConfig(theme: SeedThemeConfig): SeedConfig {
  return buildSeedConfig({
    id: 'e2e-theme-screen',
    name: 'E2E Theme',
    slug: 'e2e-theme',
    theme,
    items: [
      {
        id: 'item-theme-flag',
        type: 'entity',
        entityId: E2E_FLAG,
        x: 0,
        y: 0,
        width: 2,
        height: 2,
      },
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
/**
 * Whether the boolean helper's card is showing its `on` state.
 *
 * Reads the tile, not a discrete switch: `controlStyle` defaults to `tile`, so
 * an unconfigured `input_boolean` card renders no switch at all and the whole
 * tile is the toggle (docs/specs/entity-cards/options/input-helpers.md). The
 * shell stamps `data-active` on the card either way, which is the affordance
 * every style shares.
 *
 * `null` when the card is not on screen yet, so a poll for `false` cannot pass
 * against a dashboard that has not rendered.
 */
export async function flagCardActive(page: Page): Promise<boolean | null> {
  return page.evaluate(() => {
    const panel = (window as unknown as { __liebePanel?: PanelHandle }).__liebePanel
    const card = panel?.shadowRoot?.querySelector('[data-domain="input_boolean"]')
    if (!card) return null
    // Absent rather than `false` when inactive — the shell omits the attribute.
    return card.getAttribute('data-active') === 'true'
  })
}

/** Whether a discrete switch control is rendered anywhere in the panel. */
export async function flagSwitchPresent(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const panel = (window as unknown as { __liebePanel?: PanelHandle }).__liebePanel
    return Boolean(panel?.shadowRoot?.querySelector('[role="switch"]'))
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

// How long a press is held. Derived from the product threshold rather than
// spelled as a literal, so raising HOLD_DURATION_MS cannot silently leave this
// press too short to trigger a hold. A margin is needed at all because a real
// browser timer fires late under load, and the release must land unambiguously
// past the threshold — the exact multiple is not significant.
const HOLD_PRESS_MS = HOLD_DURATION_MS * 2

// Press and hold the card for the given friendly name with a real, trusted
// mouse gesture. The gesture is what this exercises: touch/pointer semantics
// inside HA's shadow DOM are exactly what a jsdom test cannot stand in for.
export async function holdCardTitle(page: Page, title: string): Promise<void> {
  const card = page.locator('.grid-item').filter({ hasText: title })
  await expect(card, `card titled "${title}" should be present`).toHaveCount(1)

  // `hover()` rather than a raw `mouse.move()` to the element's box: hover runs
  // Playwright's actionability checks and leaves the pointer genuinely over the
  // element. A bare move followed immediately by `mouse.down()` hit-tests
  // against a position the renderer has not settled on yet, and the press lands
  // on the document element instead of the card.
  await card.getByText(title, { exact: true }).hover()
  await page.mouse.down()
  await page.waitForTimeout(HOLD_PRESS_MS)
  await page.mouse.up()
}

// --- Theming readers (docs/specs/theming) ---

// The panel root the theming contract stamps and declares its tokens on.
// Everything below reads through it, so a stamp landing on some other element
// would fail these specs rather than pass them by accident.
function themeRootSelector(): string {
  return '.liebe-root'
}

// What the panel says it is rendering: the theme that actually applied (an
// unregistered id falls back to Default) and the resolved appearance.
export async function themeStamp(page: Page): Promise<{
  themeId: string | null
  appearance: string | null
}> {
  return page.evaluate((selector) => {
    const panel = (window as unknown as { __liebePanel?: PanelHandle }).__liebePanel
    const root = panel?.shadowRoot?.querySelector(selector)
    return {
      themeId: root?.getAttribute('data-liebe-theme') ?? null,
      appearance: root?.getAttribute('data-appearance') ?? null,
    }
  }, themeRootSelector())
}

// A `--liebe-*` token as it actually computes on the panel root. This is the
// assertion that separates "the stamp changed" from "the cascade re-resolved":
// the token values differ per appearance and per layer, so reading the computed
// value proves which layer won.
export async function themeToken(page: Page, token: string): Promise<string> {
  return page.evaluate(
    ({ selector, name }) => {
      const panel = (window as unknown as { __liebePanel?: PanelHandle }).__liebePanel
      const root = panel?.shadowRoot?.querySelector(selector)
      return root ? getComputedStyle(root).getPropertyValue(name).trim() : ''
    },
    { selector: themeRootSelector(), name: token }
  )
}

// The panel ground as the browser actually paints it — always a resolved
// `rgb(...)`, unlike a custom property, so it says what the whole token chain
// (`--liebe-bg` → Radix gray step → appearance) came out as.
export async function themeBackgroundColor(page: Page): Promise<string> {
  return page.evaluate((selector) => {
    const panel = (window as unknown as { __liebePanel?: PanelHandle }).__liebePanel
    const root = panel?.shadowRoot?.querySelector(selector)
    return root ? getComputedStyle(root).backgroundColor : ''
  }, themeRootSelector())
}

// The injected user layer's CSS text, exactly as the sanitizer serialized it.
export async function userLayerCss(page: Page): Promise<string> {
  return page.evaluate(() => {
    const panel = (window as unknown as { __liebePanel?: PanelHandle }).__liebePanel
    return panel?.shadowRoot?.querySelector('style[data-liebe="user"]')?.textContent ?? ''
  })
}

// The `theme` field as persisted, read back from localStorage — what a further
// export would carry.
export async function storedTheme(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('liebe-config')
    if (!raw) return null
    return (JSON.parse(raw) as { theme?: unknown }).theme ?? null
  })
}

// Computed styles of an element inside the panel's shadow root, optionally of
// one of its pseudo-elements — which is where a theme that draws chrome puts
// everything it paints, since the contract gives it hooks to hang decoration on
// rather than elements to fill. `null` when the selector matches nothing, so a
// hook that stopped being stamped fails the assertion instead of quietly
// reading back a record of empty strings.
export async function shadowComputedStyle(
  page: Page,
  selector: string,
  properties: string[],
  pseudoElement?: string
): Promise<Record<string, string> | null> {
  return page.evaluate(
    ({ selector: sel, properties: names, pseudoElement: pseudo }) => {
      const panel = (window as unknown as { __liebePanel?: PanelHandle }).__liebePanel
      const element = panel?.shadowRoot?.querySelector(sel)
      if (!element) return null
      const style = getComputedStyle(element, pseudo ?? null)
      const values: Record<string, string> = {}
      for (const name of names) values[name] = style.getPropertyValue(name).trim()
      return values
    },
    { selector, properties, pseudoElement }
  )
}

// An attribute of an element inside the shadow root. Used to read back what a
// card resolved its `data-color` to, so a theme's remap can be asserted against
// the triplet the card actually asked for rather than against a guess.
export async function shadowAttribute(
  page: Page,
  selector: string,
  attribute: string
): Promise<string | null> {
  return page.evaluate(
    ({ selector: sel, attribute: attr }) => {
      const panel = (window as unknown as { __liebePanel?: PanelHandle }).__liebePanel
      return panel?.shadowRoot?.querySelector(sel)?.getAttribute(attr) ?? null
    },
    { selector, attribute }
  )
}

// The document-level `@font-face` registration a theme's bundled typeface got
// (src/theme/fontRegistration.ts). It lives in Home Assistant's document, not in
// the shadow root — a shadow root does not load faces declared inside it — and
// its `url()`s are the asset base as the real install resolved it.
export async function fontRegistrationCss(page: Page, themeId: string): Promise<string> {
  return page.evaluate(
    (id) =>
      document.head.querySelector(`style[data-liebe="fonts"][data-liebe-theme="${id}"]`)
        ?.textContent ?? '',
    themeId
  )
}

// The families the document has REGISTERED a face for, from `@font-face` rules
// in any of its stylesheets plus anything added to the set programmatically.
//
// `document.fonts` is the registration set, not the availability set: a family
// merely installed on the host is resolved by the font matcher and never
// appears here. That is what makes this usable as a baseline — it cannot be
// satisfied by a machine that happens to ship the typeface under test — and it
// reads the mechanism directly, since document-level registration is the whole
// reason a shadow-root theme can render in a bundled face at all.
export async function documentFontFamilies(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.fonts).map((face) => face.family.replace(/^['"]|['"]$/g, ''))
  )
}

// Whether the document has actually LOADED a face, rather than merely been
// handed a rule declaring it: `load()` fetches, so this comes back false if the
// bundled woff2 is missing or its URL resolved somewhere that 404s.
export async function documentFontLoaded(page: Page, font: string): Promise<boolean> {
  return page.evaluate(async (spec) => {
    // Fonts are subset by `unicode-range`, so both calls are made against text
    // the dashboard really renders rather than against the whole face.
    //
    // `check()` on its own would be vacuous: it answers TRUE when no registered
    // face matches the query at all — an unregistered family is simply resolved
    // to a system fallback, which is always "available" — so an assertion built
    // on it alone passes hardest when the registration is missing. What `load()`
    // resolves with is the corrective: a non-empty result means there was a face
    // to load, and a rejection (a `url()` that 404s) means there was not.
    const faces = await document.fonts.load(spec, 'Liebe').catch(() => [])
    return faces.length > 0 && document.fonts.check(spec, 'Liebe')
  }, font)
}

// Open the taskbar's configuration menu. Its content portals to document.body,
// outside the panel's shadow root — Playwright's engines pierce both.
export async function openConfigurationMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Configuration menu' }).click()
  await expect(page.getByRole('menu')).toBeVisible()
}

// Activate a theme the way a user does: through the picker in the configuration
// menu. Seeding the id into localStorage would prove the loader works and
// nothing about live application, which is the half a real browser is needed
// for. `name` matches the item's accessible name as a substring, so a theme
// whose item also carries a caveat (Liquid Glass) is addressed by its label.
export async function selectTheme(page: Page, name: string): Promise<void> {
  await openConfigurationMenu(page)
  await page.getByRole('menuitemradio', { name }).click()
  await expect(page.getByRole('menu')).toBeHidden()
}

// The open menu read as a portalled overlay: whether it really did escape the
// shadow root, and what the requested tokens compute to out there. This is the
// only place the layer mirroring can be judged by its effect rather than by the
// presence of a `<style>` element.
export async function overlayTokens(
  page: Page,
  tokens: string[]
): Promise<{ outsideShadowRoot: boolean; values: Record<string, string> }> {
  return page.evaluate((names) => {
    const menu = document.querySelector('[role="menu"]')
    if (!menu) return { outsideShadowRoot: false, values: {} }
    const style = getComputedStyle(menu)
    const values: Record<string, string> = {}
    for (const name of names) values[name] = style.getPropertyValue(name).trim()
    return { outsideShadowRoot: menu.getRootNode() === document, values }
  }, tokens)
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

// Force the password helper's state via REST. `initial:` in configuration.yaml
// only seeds the value on a fresh HA restore, and this suite shares ONE Home
// Assistant instance across specs that DO mutate each other's state (#208) — so
// a spec asserting the ABSENCE of the secret must first put the secret there,
// or it passes without proving anything.
export async function setSecret(token: string, value: string): Promise<void> {
  await callService(token, 'input_text', 'set_value', { entity_id: E2E_SECRET, value })
}

/**
 * The grid item holding that entity's card — the thing a resize drags.
 *
 * Shared rather than per-spec: the camera spec resizes a card for a different
 * reason (proving no stream is mounted below 2×2) and must drag it exactly the
 * way the tier spec does, or the two would be testing two different gestures.
 */
export function gridItemFor(page: Page, name: string): Locator {
  return page.locator('.grid-item').filter({ hasText: name })
}

/**
 * Drags a grid item's south-east resize handle to a point, in two moves:
 * react-grid-layout starts the drag on the first and follows on the second, and
 * a single jump can be swallowed as the start event.
 */
export async function dragResizeHandle(page: Page, item: Locator, to: { x: number; y: number }) {
  await expect(item, 'the card should be laid out').toHaveCount(1)
  const handle = item.locator('.react-resizable-handle-se')
  await expect(handle, 'edit mode should expose a resize handle').toHaveCount(1)

  const handleBox = (await handle.boundingBox())!
  /*
   * ONE origin for the whole gesture: the handle's centre, which is where the
   * press lands. The midpoint used to be computed from the handle's top-left
   * instead, so the first move started from a point the cursor was never at —
   * skewing it by half the handle, and skewing it differently as the handle's
   * size or position changed. That is the shape of a harness that fails
   * intermittently and gets blamed on the code under test.
   */
  const from = { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 })
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.up()
}
