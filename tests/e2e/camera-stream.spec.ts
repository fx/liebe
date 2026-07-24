import { test, expect, type Page } from '@playwright/test'
import {
  openPanel,
  seedCameraConfig,
  gridItemCount,
  collectConsoleErrors,
  SERIALIZATION_FAILURE_PLACEHOLDER,
  type BenignMatcher,
} from './helpers'

// Camera streaming e2e (docs/changes/0007): a seeded CameraCard must play the
// synthetic go2rtc testsrc2 stream through HA's own <ha-camera-stream> element.
// HLS is the guaranteed path; which player wins (HLS vs WebRTC) is recorded
// informationally but never asserted. All evidence is DOM/console/REST — no
// screenshot reasoning.
//
// This spec ALSO proves the change-0008 no-reconnect property: in-app
// fullscreen is a pure CSS/position flip on a persistently-mounted container,
// so the <ha-camera-stream> node NEVER moves in the DOM and its inner HLS/WebRTC
// player is never torn down or renegotiated on a fullscreen toggle — in EITHER
// direction. The proof observes DOM movement directly (a MutationObserver on the
// stream host's parent chain) and negotiation directly (HLS master-playlist
// bootstraps + WebRTC offers), not proxies that survive a detach+reattach.
//
// HLS startup against the ffmpeg camera takes 5-10s+, so stream assertions use
// generous per-assertion timeouts instead of touching the global config.

// Console noise that is expected from the HA frontend/players during stream
// startup and teardown, and must not fail the suite. Everything else is fatal.
// Patterns are anchored on distinctive substrings of the SPECIFIC known-benign
// messages — never on player names (the collector appends source URLs like
// ha-hls-player.js, so a broad /hls/i would swallow real crashes in the
// players).
// Recoverable hls.js media-error details (regex alternation, used below).
const RECOVERABLE_HLS_BUFFER_DETAILS =
  'buffer(?:StalledError|AppendError|AppendingError|NudgeOnStall|SeekOverHole|FullError)'

// Recoverable hls.js network-error details during ffmpeg spin-up: the
// playlist/segments simply do not exist yet, and hls.js retries them into
// existence (manifest/level/frag load errors and their TimeOut variants).
const RECOVERABLE_HLS_NETWORK_DETAILS = '(?:manifest|level|frag)Load(?:Error|TimeOut)'

// A networkError payload is benign ONLY as the combination of the type AND a
// recognized spin-up load detail (order-insensitive) — a bare "networkError"
// with any other details, or a load-detail string on a different error type,
// still fails the suite. The consuming predicate additionally rejects
// payloads flagged "fatal": true (escalation past hls.js's own retries).
const RECOVERABLE_HLS_NETWORK_ERROR = new RegExp(
  `"type"\\s*:\\s*"networkError"[\\s\\S]*"details"\\s*:\\s*"${RECOVERABLE_HLS_NETWORK_DETAILS}"` +
    `|"details"\\s*:\\s*"${RECOVERABLE_HLS_NETWORK_DETAILS}"[\\s\\S]*"type"\\s*:\\s*"networkError"`
)

// hls.js recoverable mediaError payloads during spin-up: buffer hiccups
// (bufferStalledError, bufferAppendError, bufferAppendingError,
// bufferNudgeOnStall, bufferSeekOverHole, bufferFullError) that hls.js
// recovers from by nudging/flushing. Anchored on BOTH the mediaError type and
// a known recoverable details value (order-insensitive, since JSON key order
// is not guaranteed) — a mediaError with any other details string still fails
// the suite. Consumed by the predicate below, which additionally rejects
// fatal payloads.
const RECOVERABLE_HLS_MEDIA_ERROR = new RegExp(
  `"type"\\s*:\\s*"mediaError"[\\s\\S]*"details"\\s*:\\s*"${RECOVERABLE_HLS_BUFFER_DETAILS}"` +
    `|"details"\\s*:\\s*"${RECOVERABLE_HLS_BUFFER_DETAILS}"[\\s\\S]*"type"\\s*:\\s*"mediaError"`
)

const BENIGN_CONSOLE_PATTERNS: BenignMatcher[] = [
  // The HLS playlist/segment endpoints 404/503 briefly while ffmpeg spins up;
  // hls.js retries and recovers. Chrome logs these as console errors. Scoped
  // to the camera-stream endpoints (HA's HLS proxy and camera_proxy stills,
  // whose URLs the collector appends as the entry source) — an HTTP failure
  // from any other resource still fails the suite.
  (text: string) =>
    /the server responded with a status of (404|5\d\d)/i.test(text) &&
    /\/api\/hls\/|\/api\/camera_proxy/i.test(text),
  // hls.js recoverable network-retry noise while ffmpeg spins up — benign
  // only as networkError + recognized load detail + an EXPLICIT
  // `"fatal": false` (a payload that omits the flag — e.g. truncated — is
  // NOT presumed nonfatal; see RECOVERABLE_HLS_NETWORK_ERROR above).
  (text: string) => RECOVERABLE_HLS_NETWORK_ERROR.test(text) && /"fatal"\s*:\s*false/.test(text),
  // HA's own frontend leaves the `camera/webrtc/offer` websocket promise
  // unhandled when the backend rejects it. In this stack the go2rtc `exec:`
  // producer trips a parse bug in HA's go2rtc client, so every offer fails
  // with {code: "unknown_error"} and <ha-camera-stream> falls back to HLS —
  // exactly the "WebRTC best-effort" contract of docs/changes/0007.
  // Anchored to the in-page recorder's unhandled-rejection prefix so a
  // "unknown_error" code inside any OTHER error channel still fails the
  // suite.
  /^unhandled rejection(?: \(object\))?: [\s\S]*"code"\s*:\s*"unknown_error"/,
  // Recoverable buffer mediaError — benign only with an EXPLICIT
  // `"fatal": false`: "fatal": true means recovery failed and playback is
  // escalating, and a payload missing the flag is not presumed nonfatal.
  // The collector's cycle-safe in-page stringifier guarantees ErrorData
  // always serializes to inspectable text containing type/details/fatal
  // whenever the argument is reachable at all, so no broad '<unserializable>'
  // escape hatch exists (or is needed) anymore.
  (text: string) => RECOVERABLE_HLS_MEDIA_ERROR.test(text) && /"fatal"\s*:\s*false/.test(text),
  // Serialization-failure placeholders from the media-player chunks: when
  // even the in-page safeStringify evaluation fails (the argument handle's
  // execution context was destroyed — typically a player logging during
  // teardown), the collector records SERIALIZATION_FAILURE_PLACEHOLDER,
  // which no content filter can ever match. Benign ONLY when the WHOLE entry
  // is such placeholders (no readable text beyond the collector's source
  // suffix) AND the recorded source is an hls/webrtc player chunk — the same
  // startup/teardown noise sources already benign-listed above when their
  // payloads serialize. Content-bearing entries from those chunks still fail
  // the suite, as does a bare placeholder from any other source.
  (text: string) => {
    const match = /^(.+) \(at (.+):\d+\)$/s.exec(text)
    if (!match) return false
    const [, body, sourceUrl] = match
    const onlyPlaceholders = body
      .split(SERIALIZATION_FAILURE_PLACEHOLDER)
      .every((rest) => rest.trim() === '')
    return onlyPlaceholders && /hls|web-?rtc/i.test(sourceUrl)
  },
]

// Minimal window/panel shape used by the in-page evaluations below.
interface PanelWindow {
  __liebePanel?: { shadowRoot: ShadowRoot | null }
}

// Snapshot of the element's inner <video> (shadow-pierced: ha-camera-stream →
// ha-hls-player/ha-web-rtc-player → video). `player` reports which player the
// element picked — informational only.
async function innerVideoInfo(page: Page): Promise<{
  found: boolean
  player: string | null
  videoWidth: number
  paused: boolean
}> {
  return page.evaluate(() => {
    const panel = (window as unknown as PanelWindow).__liebePanel
    const stream = panel?.shadowRoot?.querySelector('ha-camera-stream')
    const player = stream?.shadowRoot?.querySelector('ha-hls-player, ha-web-rtc-player') ?? null
    const video = player?.shadowRoot?.querySelector('video') ?? null
    return {
      found: Boolean(video),
      player: player?.tagName.toLowerCase() ?? null,
      videoWidth: video?.videoWidth ?? 0,
      paused: video?.paused ?? true,
    }
  })
}

// One strict-continuity checkpoint: the current inner <video> compared to the
// baseline instance pinned before the first toggle. `sameIdentity` false or a
// currentTime reset means the player was rebuilt (a reconnect).
interface ContinuitySample {
  found: boolean
  sameIdentity: boolean
  currentTime: number
  readyState: number
  paused: boolean
}

async function sampleContinuity(page: Page): Promise<ContinuitySample> {
  return page.evaluate(() => {
    const panel = (window as unknown as PanelWindow).__liebePanel
    const stream = panel?.shadowRoot?.querySelector('ha-camera-stream')
    const pl = stream?.shadowRoot?.querySelector('ha-hls-player, ha-web-rtc-player')
    const video = pl?.shadowRoot?.querySelector('video') ?? null
    const baseline =
      (window as unknown as { __continuityBaseline?: HTMLVideoElement | null })
        .__continuityBaseline ?? null
    return {
      found: !!video,
      sameIdentity: !!video && video === baseline,
      currentTime: video?.currentTime ?? 0,
      readyState: video?.readyState ?? 0,
      paused: video?.paused ?? true,
    }
  })
}

// The inner <video> must have real dimensions and be actively playing.
async function expectVideoPlaying(page: Page, timeout: number): Promise<void> {
  await expect
    .poll(
      async () => {
        const { videoWidth, paused } = await innerVideoInfo(page)
        return videoWidth > 0 && !paused
      },
      { timeout }
    )
    .toBe(true)
}

// Coordinates over Home Assistant's own chrome (its left sidebar) — NOT over the
// panel content. Before fullscreen a topmost hit-test here lands in HA's
// <ha-sidebar>; while the in-place fullscreen overlay is open the overlay must
// out-stack that chrome so the SAME points resolve into the camera overlay. A
// full-viewport getBoundingClientRect() alone cannot tell a covering overlay
// from one trapped behind a higher stacking context, hence this topmost check
// (change 0008). Kept inside the sidebar rail (x ≤ 30) so the points are HA
// chrome whether the sidebar is expanded or collapsed.
const CHROME_HIT_POINTS = [
  { label: 'sidebar top', x: 30, y: 8 },
  { label: 'sidebar left edge', x: 8, y: 360 },
  { label: 'sidebar mid', x: 30, y: 360 },
] as const

interface OverlayProbe {
  ancestors: string[]
  bodyChildOutsideHa: boolean
  overlayRect: { x: number; y: number; width: number; height: number } | null
  viewport: { width: number; height: number }
  chromeHits: { label: string; tag: string; withinOverlay: boolean }[]
}

// While fullscreen: assert (a) the overlay's fixed backdrop covers the viewport,
// (b) the stream element stays inside the <home-assistant>/liebe-panel tree, and
// (c) a topmost hit-test over HA chrome resolves INTO the overlay (change 0007
// coverage/ancestry + change 0008 topmost stacking, in one evaluate).
async function probeOverlay(page: Page): Promise<OverlayProbe> {
  return page.evaluate(
    ({ points }) => {
      // Shadow-piercing topmost hit-test: follow a point that resolves to a
      // shadow host into its shadow tree, returning the deepest painted element.
      const deepElementFromPoint = (x: number, y: number): Element | null => {
        let el = document.elementFromPoint(x, y)
        while (el && el.shadowRoot) {
          const inner = el.shadowRoot.elementFromPoint(x, y)
          if (!inner || inner === el) break
          el = inner
        }
        return el
      }
      // True when `el` is `ancestor` or nested inside it, crossing shadow
      // boundaries (walk parentNode, hop to the shadow host at each root).
      const isWithin = (el: Element | null, ancestor: Element): boolean => {
        let node: Node | null = el
        while (node) {
          if (node === ancestor) return true
          const parent: Node | null = node.parentNode
          if (parent) node = parent
          else if (node instanceof ShadowRoot) node = node.host
          else node = null
        }
        return false
      }

      const panel = (window as unknown as PanelWindow).__liebePanel
      const stream = panel?.shadowRoot?.querySelector('ha-camera-stream') ?? null

      // Walk up through parentNode, jumping shadow boundaries via .host, and
      // find the first fixed-position ancestor — the in-place overlay.
      const ancestors: string[] = []
      let overlay: Element | null = null
      let node: Node | null = stream
      while (node) {
        if (node instanceof Element) {
          ancestors.push(node.tagName.toLowerCase())
          if (!overlay && getComputedStyle(node).position === 'fixed') {
            overlay = node
          }
        }
        node = node.parentNode ?? (node instanceof ShadowRoot ? node.host : null)
      }

      const rect = overlay?.getBoundingClientRect() ?? null
      const chromeHits = points.map(({ label, x, y }) => {
        const hit = deepElementFromPoint(x, y)
        return {
          label,
          tag: hit?.tagName.toLowerCase() ?? 'none',
          withinOverlay: overlay ? isWithin(hit, overlay) : false,
        }
      })

      return {
        ancestors,
        bodyChildOutsideHa:
          !!stream && document.body.contains(stream) && !ancestors.includes('home-assistant'),
        overlayRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        chromeHits,
      }
    },
    { points: CHROME_HIT_POINTS.map((p) => ({ ...p })) }
  )
}

// Assert the overlay covers the viewport (±2 px), stays in-tree, and out-stacks
// HA chrome at every probe point. Shared by both open transitions.
function assertOverlayCoversChrome(probe: OverlayProbe): void {
  const { ancestors, bodyChildOutsideHa, overlayRect, viewport, chromeHits } = probe

  expect(
    ancestors,
    'stream element stays a descendant of <home-assistant> in fullscreen'
  ).toContain('home-assistant')
  expect(ancestors, 'stream element stays inside the liebe-panel shadow tree').toContain(
    'liebe-panel'
  )
  expect(
    bodyChildOutsideHa,
    'stream element is not portalled to document.body outside <home-assistant>'
  ).toBe(false)

  expect(overlayRect, 'fullscreen overlay has a fixed-position backdrop').not.toBeNull()
  const tolerance = 2
  expect(Math.abs((overlayRect?.x ?? NaN) - 0)).toBeLessThanOrEqual(tolerance)
  expect(Math.abs((overlayRect?.y ?? NaN) - 0)).toBeLessThanOrEqual(tolerance)
  expect(Math.abs((overlayRect?.width ?? NaN) - viewport.width)).toBeLessThanOrEqual(tolerance)
  expect(Math.abs((overlayRect?.height ?? NaN) - viewport.height)).toBeLessThanOrEqual(tolerance)

  // Topmost coverage: every point over HA chrome must hit the overlay, not HA
  // chrome trapped above a full-viewport-but-buried rect.
  for (const { label, withinOverlay, tag } of chromeHits) {
    expect(
      withinOverlay,
      `fullscreen overlay is topmost over HA chrome at "${label}" (hit <${tag}>)`
    ).toBe(true)
  }
}

test('seeded camera card plays the synthetic stream and survives fullscreen', async ({ page }) => {
  // Stream startup + four fullscreen transitions (letterbox-click and ESC close
  // paths) do not fit the default 60s per-test budget; extend for this spec
  // only (global config untouched).
  test.setTimeout(240_000)

  const consoleErrors = await collectConsoleErrors(page, BENIGN_CONSOLE_PATTERNS)

  // --- Negotiation capture (change 0008) -----------------------------------
  // A player rebuild renegotiates the stream: a FRESH HLS session fetches a new
  // `master_playlist.m3u8` (per-session bootstrap; ongoing playback only
  // re-fetches the same session's playlist/segments), and a WebRTC path emits a
  // new `camera/webrtc/offer`. Capture both so the toggles can be proven to
  // trigger neither. Registered before openPanel so the HA websocket (opened
  // during navigation) is observed from the start.
  const hlsBootstraps: string[] = []
  page.on('request', (req) => {
    if (/\/api\/hls\/[^/]+\/master_playlist\.m3u8/.test(req.url())) {
      hlsBootstraps.push(req.url())
    }
  })
  let webrtcOffers = 0
  page.on('websocket', (ws) => {
    ws.on('framesent', (frame) => {
      const payload =
        typeof frame.payload === 'string' ? frame.payload : frame.payload.toString('utf8')
      if (/"type"\s*:\s*"camera\/webrtc\/offer"/.test(payload)) webrtcOffers += 1
    })
  })

  // 1. Open the panel with the dedicated camera seed. openPanel deep-links
  // straight into the panel in a fresh context (no Lovelace warm-up), so this
  // exercises the deep-link bootstrap ladder: window.loadCardHelpers is
  // undefined at first paint and the ladder must poll it into existence.
  await openPanel(page, seedCameraConfig())
  await expect(page).toHaveURL(/\/liebe\/e2e-camera$/)
  await expect.poll(() => gridItemCount(page), { timeout: 15_000 }).toBe(1)

  const card = page.locator('.camera-card')
  await expect(card, 'camera card renders').toHaveCount(1)

  // 2. The bootstrap ladder must define <ha-camera-stream> in the real panel
  // and the wrapper must mount it inside the card.
  await expect
    .poll(() => page.evaluate(() => Boolean(customElements.get('ha-camera-stream'))), {
      timeout: 30_000,
    })
    .toBe(true)
  await expect(
    page.locator('ha-camera-stream'),
    'ha-camera-stream is mounted inside the panel'
  ).toHaveCount(1, { timeout: 30_000 })

  // 3. The status pill must reach STREAMING (or RECORDING — the pill shows
  // RECORDING while the entity state is `streaming`/`recording`).
  await expect(card, 'status pill reaches STREAMING/RECORDING').toContainText(
    /STREAMING|RECORDING/,
    { timeout: 60_000 }
  )

  // 4. Shadow-pierce to the inner <video>: it must have real dimensions and be
  // playing. Which player won is NOT asserted.
  await expectVideoPlaying(page, 60_000)
  const { player } = await innerVideoInfo(page)
  test.info().annotations.push({ type: 'camera-player', description: player ?? 'unknown' })
  console.log(`[camera-stream] player in use: ${player ?? 'unknown'}`)

  // --- Guard: the chrome hit points really are HA chrome before fullscreen ---
  // If they weren't, the topmost check below would pass vacuously. Assert each
  // resolves into <ha-sidebar> (HA's own chrome) while the panel is normal.
  const preChrome = await page.evaluate(
    ({ points }) => {
      const deepElementFromPoint = (x: number, y: number): Element | null => {
        let el = document.elementFromPoint(x, y)
        while (el && el.shadowRoot) {
          const inner = el.shadowRoot.elementFromPoint(x, y)
          if (!inner || inner === el) break
          el = inner
        }
        return el
      }
      return points.map(({ label, x, y }) => {
        // Walk the host chain (shadow hosts) up to the document, collecting the
        // enclosing custom-element tags so we can prove the point is HA chrome.
        const chain: string[] = []
        let el: Element | null = deepElementFromPoint(x, y)
        while (el) {
          chain.push(el.tagName.toLowerCase())
          const root = el.getRootNode()
          el = root instanceof ShadowRoot ? root.host : null
        }
        return { label, chain }
      })
    },
    { points: CHROME_HIT_POINTS.map((p) => ({ ...p })) }
  )
  for (const { label, chain } of preChrome) {
    expect(
      chain,
      `hit point "${label}" is over HA chrome (ha-sidebar) before fullscreen`
    ).toContain('ha-sidebar')
  }

  // --- Arm the direct no-DOM-move observer (change 0008) --------------------
  // Watch childList across every root on the stream host's parent chain (shadow
  // roots included — a MutationObserver does not cross shadow boundaries, so
  // each root is observed separately). Any detach/reattach of <ha-camera-stream>
  // (or a wrapper containing it) in EITHER direction is recorded. Zero records
  // across all four transitions is the load-bearing proof: HA's players tear
  // down HLS/WebRTC only in their disconnected/connected callbacks, which fire
  // ONLY when the host node moves.
  await page.evaluate(() => {
    const panel = (window as unknown as PanelWindow).__liebePanel
    const stream = panel?.shadowRoot?.querySelector('ha-camera-stream')
    if (!stream) throw new Error('cannot arm observer: <ha-camera-stream> not found')

    const records: string[] = []
    ;(window as unknown as { __streamDomRecords: string[] }).__streamDomRecords = records

    const roots = new Set<Document | ShadowRoot>()
    let node: Node | null = stream
    while (node) {
      const root = node.getRootNode()
      if (root instanceof Document || root instanceof ShadowRoot) roots.add(root)
      node = root instanceof ShadowRoot ? root.host : null
    }

    const involvesStream = (n: Node) => n === stream || (n instanceof Element && n.contains(stream))

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type !== 'childList') continue
        m.removedNodes.forEach((rn) => {
          if (involvesStream(rn)) records.push(`removed:${rn.nodeName.toLowerCase()}`)
        })
        m.addedNodes.forEach((an) => {
          if (involvesStream(an)) records.push(`added:${an.nodeName.toLowerCase()}`)
        })
      }
    })
    roots.forEach((r) => observer.observe(r, { childList: true, subtree: true }))
    ;(window as unknown as { __streamObserver: MutationObserver }).__streamObserver = observer
  })

  // --- Strict playback-continuity baseline (change 0008) --------------------
  // Pin the inner <video> instance NOW, before any toggle. A reconnect rebuilds
  // the player and replaces this element (new instance, currentTime from ~0), so
  // proving the SAME instance keeps playing with a monotonically advancing
  // currentTime across every transition is strict continuity — deterministic,
  // sampled at each awaited transition (not on a wall clock). The old "recovers
  // to STREAMING within 30 s" allowed a sub-second reconnect; this does not.
  await page.evaluate(() => {
    const panel = (window as unknown as PanelWindow).__liebePanel
    const stream = panel?.shadowRoot?.querySelector('ha-camera-stream')
    const pl = stream?.shadowRoot?.querySelector('ha-hls-player, ha-web-rtc-player')
    ;(window as unknown as { __continuityBaseline: HTMLVideoElement | null }).__continuityBaseline =
      pl?.shadowRoot?.querySelector('video') ?? null
  })
  const continuity: ContinuitySample[] = []
  continuity.push(await sampleContinuity(page)) // checkpoint 0: pre-toggle

  const hlsBootstrapsBeforeToggles = hlsBootstraps.length
  const webrtcOffersBeforeToggles = webrtcOffers
  const exitHint = page.getByText('Click or press ESC to exit')

  // 5. TRANSITION 1 (open): tap the card → the in-place fullscreen overlay
  // promotes without moving the stream node.
  await page.locator('ha-camera-stream').click()
  await expect(exitHint, 'fullscreen overlay opens').toBeVisible({ timeout: 15_000 })
  assertOverlayCoversChrome(await probeOverlay(page))
  // The stream keeps playing in fullscreen — with NO renegotiation now, so the
  // recovery is immediate rather than after a sub-second reconnect.
  await expectVideoPlaying(page, 30_000)
  continuity.push(await sampleContinuity(page)) // checkpoint 1: opened

  // 6. TRANSITION 2 (letterbox close): click the letterbox area (top-left
  // corner — clear of the video controls at bottom-left and the exit hint at
  // top-right). ANY tap on the overlay must exit, not just taps on the video.
  await page.mouse.click(8, 8)
  await expect(exitHint, 'fullscreen overlay closes on letterbox click').toBeHidden({
    timeout: 15_000,
  })
  await expect(card, 'stream stays STREAMING/RECORDING after letterbox close').toContainText(
    /STREAMING|RECORDING/,
    { timeout: 30_000 }
  )
  await expectVideoPlaying(page, 30_000)
  continuity.push(await sampleContinuity(page)) // checkpoint 2: letterbox-closed

  // 7. TRANSITION 3 (reopen): the ESC path shares the same in-place overlay, but
  // the key handler wiring is only exercised in a real browser. Reopen first.
  await page.locator('ha-camera-stream').click()
  await expect(exitHint, 'fullscreen overlay reopens').toBeVisible({ timeout: 15_000 })
  assertOverlayCoversChrome(await probeOverlay(page))
  await expectVideoPlaying(page, 30_000)
  continuity.push(await sampleContinuity(page)) // checkpoint 3: reopened

  // 8. TRANSITION 4 (ESC close): the stream must keep playing in the card.
  await page.keyboard.press('Escape')
  await expect(exitHint, 'fullscreen overlay closes on Escape').toBeHidden({ timeout: 15_000 })
  await expect(card, 'stream stays STREAMING/RECORDING after ESC close').toContainText(
    /STREAMING|RECORDING/,
    { timeout: 30_000 }
  )
  await expectVideoPlaying(page, 30_000)
  continuity.push(await sampleContinuity(page)) // checkpoint 4: ESC-closed

  // --- Direct no-DOM-move assertion (change 0008) ---------------------------
  const domRecords = await page.evaluate(() => {
    const w = window as unknown as {
      __streamDomRecords: string[]
      __streamObserver?: MutationObserver
    }
    w.__streamObserver?.disconnect()
    return w.__streamDomRecords
  })
  expect(
    domRecords,
    'the <ha-camera-stream> node is never detached/reattached across the four fullscreen transitions'
  ).toEqual([])

  // --- No-renegotiation assertion (change 0008) -----------------------------
  expect(
    hlsBootstraps.length - hlsBootstrapsBeforeToggles,
    'no fresh HLS master-playlist bootstrap (player rebuild) is triggered by the toggles'
  ).toBe(0)
  expect(
    webrtcOffers - webrtcOffersBeforeToggles,
    'no new WebRTC offer (renegotiation) is triggered by the toggles'
  ).toBe(0)

  // --- Strict playback-continuity assertion (change 0008) -------------------
  // Every checkpoint (pre-toggle, then after each of the four transitions) must
  // be the SAME <video> instance, still playing (not paused, not in a loading
  // readyState), with a currentTime that never restarts and advances overall.
  // A reconnect would rebuild the player: a new instance from currentTime ~0.
  continuity.forEach((cp, i) => {
    expect(cp.found, `continuity checkpoint ${i}: inner <video> present`).toBe(true)
    expect(
      cp.sameIdentity,
      `continuity checkpoint ${i}: same <video> instance (no player rebuild)`
    ).toBe(true)
    expect(cp.paused, `continuity checkpoint ${i}: playback not paused`).toBe(false)
    // HAVE_CURRENT_DATA (2) or better: never HAVE_NOTHING/HAVE_METADATA, the
    // loading readyStates a fresh media element resets to.
    expect(
      cp.readyState,
      `continuity checkpoint ${i}: not re-entering a loading readyState`
    ).toBeGreaterThanOrEqual(2)
  })
  for (let i = 1; i < continuity.length; i++) {
    // No backward reset toward 0 (small negative jitter tolerated).
    expect(
      continuity[i].currentTime,
      `continuity checkpoint ${i}: currentTime never restarts (no reconnect)`
    ).toBeGreaterThanOrEqual(continuity[i - 1].currentTime - 0.25)
  }
  expect(
    continuity[continuity.length - 1].currentTime,
    'currentTime keeps advancing across the toggles'
  ).toBeGreaterThan(continuity[0].currentTime)

  // 9. No fatal console errors or unhandled rejections across the whole flow
  // (benign HA/player startup noise filtered by the collector).
  expect(await consoleErrors.fatalErrors(), 'no fatal console errors').toEqual([])
})
