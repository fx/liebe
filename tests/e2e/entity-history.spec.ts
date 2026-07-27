import { test, expect, type Page } from '@playwright/test'
import { openPanel, callService, E2E_LEVEL } from './helpers'
import {
  buildHistoryRequest,
  downsampleHistory,
  parseHistoryResponse,
  type HistoryResponse,
} from '../../src/services/historyData'

// The recorder's payload shape is the part of the history pipeline most likely
// to differ from assumption, so this asserts against a REAL
// `history/history_during_period` response from the dockerized instance — and
// then runs the panel's own parser and downsampler over it. Mocked unit tests
// cannot catch a compressed-row rename; this can.

// Values written to input_number.e2e_level, in order, after a baseline write.
// The baseline matters: this suite shares ONE Home Assistant whose recorder
// database persists, so a previous run left the helper at the last value here —
// and writing a value it already holds changes no state and records no row.
const BASELINE = 0
const WRITTEN = [10, 25, 60]

// Fetch a window through the panel's live, authenticated WebSocket connection —
// the same transport the hook uses.
async function fetchHistory(
  page: Page,
  request: Record<string, unknown>
): Promise<HistoryResponse> {
  return page.evaluate(async (message) => {
    const panel = (
      window as unknown as {
        __liebePanel?: { _hass?: { callWS?: (msg: unknown) => Promise<unknown> } }
      }
    ).__liebePanel
    const callWS = panel?._hass?.callWS
    if (!callWS) throw new Error('panel has no callWS')
    return (await callWS(message)) as HistoryResponse
  }, request)
}

test('fetches real recorder history through the panel websocket', async ({ page }) => {
  const { accessToken } = await openPanel(page)

  const start = Date.now()
  for (const value of [BASELINE, ...WRITTEN]) {
    await callService(accessToken, 'input_number', 'set_value', {
      entity_id: E2E_LEVEL,
      value,
    })
    // The recorder commits on an interval; spacing the writes keeps them as
    // separate rows rather than one coalesced state.
    await page.waitForTimeout(1500)
  }

  // Poll: the recorder writes asynchronously, so the last value may not have
  // been committed when the first request lands. The window opens before the
  // first write, so its first row is whatever the helper already held — the
  // assertion is on the tail this test actually produced.
  let parsed = parseHistoryResponse({}, E2E_LEVEL)
  await expect
    .poll(
      async () => {
        const response = await fetchHistory(
          page,
          buildHistoryRequest(E2E_LEVEL, start - 60_000, Date.now())
        )
        parsed = parseHistoryResponse(response, E2E_LEVEL)
        return parsed.samples.slice(-WRITTEN.length).map((sample) => sample.value)
      },
      { timeout: 30_000 }
    )
    .toEqual(WRITTEN)

  // Every value survived the parse as a finite number on a real timestamp.
  expect(parsed.nonNumeric).toBe(false)
  for (const sample of parsed.samples) {
    expect(Number.isFinite(sample.value)).toBe(true)
    expect(Number.isFinite(sample.t)).toBe(true)
    expect(sample.t).toBeLessThanOrEqual(Date.now())
  }
  // Ascending, as everything downstream assumes.
  const times = parsed.samples.map((sample) => sample.t)
  expect([...times].sort((a, b) => a - b)).toEqual(times)

  // And the downsampler produces a bounded series from the real samples.
  const end = Date.now()
  const points = downsampleHistory(parsed.samples, {
    start: end - 3_600_000,
    end,
    points: 20,
    mode: 'sample',
  })
  expect(points.length).toBeGreaterThan(0)
  expect(points.length).toBeLessThanOrEqual(20)
  expect(points.at(-1)?.value).toBe(WRITTEN.at(-1))
})

test('reports a non-numeric entity through the same parse path', async ({ page }) => {
  const { accessToken } = await openPanel(page)

  // Write a state so the window is guaranteed to contain rows, however long the
  // shared instance has been up. No other spec asserts on this helper.
  await callService(accessToken, 'input_select', 'select_option', {
    entity_id: 'input_select.e2e_mode',
    option: 'beta',
  })
  await page.waitForTimeout(1500)

  const end = Date.now()
  const response = await fetchHistory(
    page,
    buildHistoryRequest('input_select.e2e_mode', end - 24 * 3_600_000, end)
  )
  const parsed = parseHistoryResponse(response, 'input_select.e2e_mode')

  // The recorder happily returns this entity's states; none of them are
  // numeric, which is exactly how the hook resolves `unsupported`.
  expect(parsed.samples).toEqual([])
  expect(parsed.nonNumeric).toBe(true)
})
