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
  // hls.js retries and recovers. Chrome logs these as console errors.
  /the server responded with a status of (404|5\d\d)/i,
  // hls.js recoverable network-retry noise while ffmpeg spins up: structured
  // error payloads like {type: "networkError", details: "manifestLoadError"}
  // (also levelLoadError/fragLoadError and their TimeOut variants) that
  // resolve once the playlist/segments exist.
  /"type"\s*:\s*"networkError"/,
  /"(manifest|level|frag)Load(Error|TimeOut)"/,
  // HA's own frontend leaves the `camera/webrtc/offer` websocket promise
  // unhandled when the backend rejects it. In this stack the go2rtc `exec:`
  // producer trips a parse bug in HA's go2rtc client, so every offer fails
  // with {code: "unknown_error"} and <ha-camera-stream> falls back to HLS —
  // exactly the "WebRTC best-effort" contract of docs/changes/0007.
  /"code"\s*:\s*"unknown_error"/,
  // Recoverable buffer mediaError — but NEVER when hls.js flags it fatal:
  // "fatal": true means recovery failed and playback is escalating, which
  // must fail the suite even when the details value is a "recoverable" one.
  // The collector's cycle-safe in-page stringifier guarantees ErrorData
  // always serializes to inspectable text containing type/details/fatal
  // whenever the argument is reachable at all, so no broad '<unserializable>'
  // escape hatch exists (or is needed) anymore.
  (text: string) => RECOVERABLE_HLS_MEDIA_ERROR.test(text) && !/"fatal"\s*:\s*true/.test(text),
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

test('seeded camera card plays the synthetic stream and survives fullscreen', async ({ page }) => {
  // Stream startup + four fullscreen renegotiations (letterbox-click and ESC
  // close paths) do not fit the default 60s per-test budget; extend for this
  // spec only (global config untouched).
  test.setTimeout(240_000)

  const consoleErrors = await collectConsoleErrors(page, BENIGN_CONSOLE_PATTERNS)

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

  // 5. Tap the card → the fullscreen overlay opens (in-tree portal decision).
  await page.locator('ha-camera-stream').click()
  const exitHint = page.getByText('Click or press ESC to exit')
  await expect(exitHint, 'fullscreen overlay opens').toBeVisible({ timeout: 15_000 })

  // Runtime verification of the in-tree portal decision:
  // (a) the fixed-position overlay backdrop must cover the viewport (no HA
  //     ancestor creates a containing block that shrinks it), and
  // (b) the stream element must still be a DOM descendant of <home-assistant>
  //     (walking parent/host chains through shadow roots), i.e. NOT portalled
  //     to document.body outside the HA tree.
  const portalInfo = await page.evaluate(() => {
    const panel = (window as unknown as PanelWindow).__liebePanel
    const stream = panel?.shadowRoot?.querySelector('ha-camera-stream')

    // Walk up through parentNode, jumping shadow boundaries via .host.
    const ancestors: string[] = []
    let overlay: Element | null = null
    let node: Node | null = stream ?? null
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
    return {
      ancestors,
      overlayRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      bodyChildOutsideHa:
        !!stream && document.body.contains(stream) && !ancestors.includes('home-assistant'),
    }
  })

  expect(
    portalInfo.ancestors,
    'stream element stays a descendant of <home-assistant> in fullscreen'
  ).toContain('home-assistant')
  expect(portalInfo.ancestors, 'stream element stays inside the liebe-panel shadow tree').toContain(
    'liebe-panel'
  )
  expect(
    portalInfo.bodyChildOutsideHa,
    'stream element is not portalled to document.body outside <home-assistant>'
  ).toBe(false)

  const { overlayRect, viewport } = portalInfo
  expect(overlayRect, 'fullscreen overlay has a fixed-position backdrop').not.toBeNull()
  const tolerance = 2
  expect(Math.abs((overlayRect?.x ?? NaN) - 0)).toBeLessThanOrEqual(tolerance)
  expect(Math.abs((overlayRect?.y ?? NaN) - 0)).toBeLessThanOrEqual(tolerance)
  expect(Math.abs((overlayRect?.width ?? NaN) - viewport.width)).toBeLessThanOrEqual(tolerance)
  expect(Math.abs((overlayRect?.height ?? NaN) - viewport.height)).toBeLessThanOrEqual(tolerance)

  // The stream must keep playing in fullscreen (one sub-second renegotiation
  // on the container swap is accepted — hence the generous timeout).
  await expectVideoPlaying(page, 30_000)

  // 6. Close fullscreen by clicking the letterbox area (top-left corner —
  // clear of the video controls at bottom-left and the exit hint at
  // top-right): ANY tap on the overlay must exit, not just taps landing on
  // the video itself. The stream must recover in the card.
  await page.mouse.click(8, 8)
  await expect(exitHint, 'fullscreen overlay closes on letterbox click').toBeHidden({
    timeout: 15_000,
  })

  await expect(card, 'stream recovers to STREAMING/RECORDING after fullscreen').toContainText(
    /STREAMING|RECORDING/,
    { timeout: 30_000 }
  )
  await expectVideoPlaying(page, 30_000)

  // 7. Reopen and close via Escape: the ESC path must keep working end-to-end
  // (both exits share FullscreenModal, but the key handler wiring is only
  // exercised in a real browser), and the stream must recover again.
  await page.locator('ha-camera-stream').click()
  await expect(exitHint, 'fullscreen overlay reopens').toBeVisible({ timeout: 15_000 })
  await expectVideoPlaying(page, 30_000)

  await page.keyboard.press('Escape')
  await expect(exitHint, 'fullscreen overlay closes on Escape').toBeHidden({ timeout: 15_000 })

  await expect(card, 'stream recovers to STREAMING/RECORDING after ESC close').toContainText(
    /STREAMING|RECORDING/,
    { timeout: 30_000 }
  )
  await expectVideoPlaying(page, 30_000)

  // 8. No fatal console errors or unhandled rejections across the whole flow
  // (benign HA/player startup noise filtered by the collector).
  expect(await consoleErrors.fatalErrors(), 'no fatal console errors').toEqual([])
})
