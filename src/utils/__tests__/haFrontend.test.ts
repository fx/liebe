import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ensureHaElement, resetEnsureHaElementForTests } from '../haFrontend'

// NOTE: jsdom cannot unregister custom elements, so the tests in this file are
// order-sensitive: every test that needs 'ha-camera-stream' to be UNDEFINED
// must run before the success-path test that defines it. The ladder's promise
// cache is reset per test via resetEnsureHaElementForTests().

interface CardHelpers {
  createCardElement: (config: Record<string, unknown>) => HTMLElement
}
type LoadCardHelpers = () => Promise<CardHelpers>

const TRIGGER_CONFIG = { type: 'picture-entity', entity: 'camera.demo', camera_view: 'live' }

function setLoadCardHelpers(fn: LoadCardHelpers | undefined) {
  ;(window as unknown as { loadCardHelpers?: LoadCardHelpers }).loadCardHelpers = fn
}

describe('ensureHaElement', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetEnsureHaElementForTests()
    setLoadCardHelpers(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    setLoadCardHelpers(undefined)
  })

  it('resolves false when loadCardHelpers never appears (poll timeout)', async () => {
    let settled: boolean | null = null
    ensureHaElement('ha-camera-stream', TRIGGER_CONFIG).then((value) => {
      settled = value
    })

    // Still polling after 1s.
    await vi.advanceTimersByTimeAsync(1000)
    expect(settled).toBeNull()

    // Poll gives up after 20 attempts x 250ms.
    await vi.advanceTimersByTimeAsync(250 * 20)
    expect(settled).toBe(false)
  })

  it('resolves false when loadCardHelpers rejects', async () => {
    setLoadCardHelpers(vi.fn().mockRejectedValue(new Error('boom')))

    const promise = ensureHaElement('ha-camera-stream', TRIGGER_CONFIG)
    await vi.advanceTimersByTimeAsync(0)
    await expect(promise).resolves.toBe(false)
  })

  it('resolves false when createCardElement throws', async () => {
    setLoadCardHelpers(
      vi.fn().mockResolvedValue({
        createCardElement: vi.fn(() => {
          throw new Error('bad card config')
        }),
      })
    )

    const promise = ensureHaElement('ha-camera-stream', TRIGGER_CONFIG)
    await vi.advanceTimersByTimeAsync(0)
    await expect(promise).resolves.toBe(false)
  })

  it('resolves false when the element is never defined after card creation', async () => {
    const createCardElement = vi.fn(() => document.createElement('div'))

    let settled: boolean | null = null
    ensureHaElement('ha-camera-stream', TRIGGER_CONFIG).then((value) => {
      settled = value
    })

    // loadCardHelpers appears only after a couple of poll attempts, covering
    // the poll-retry-then-found path.
    await vi.advanceTimersByTimeAsync(600)
    setLoadCardHelpers(vi.fn().mockResolvedValue({ createCardElement }))
    await vi.advanceTimersByTimeAsync(250)

    // The throwaway card was created but never defines the element; the
    // whenDefined timeout trips after 10s.
    expect(createCardElement).toHaveBeenCalledWith(TRIGGER_CONFIG)
    expect(settled).toBeNull()

    await vi.advanceTimersByTimeAsync(10_000)
    expect(settled).toBe(false)
  })

  it('caches the ladder per tag: same tag shares one run, other tags run their own', async () => {
    const createCardElement = vi.fn((config: Record<string, unknown>) => {
      if (config.entity === 'camera.first') {
        customElements.define('ha-camera-stream', class extends HTMLElement {})
      }
      return document.createElement('div')
    })
    const loadCardHelpers = vi.fn().mockResolvedValue({ createCardElement })
    setLoadCardHelpers(loadCardHelpers)

    // Same tag: every caller gets the very same promise, so only one ladder
    // runs and the first caller's trigger config wins.
    const first = ensureHaElement('ha-camera-stream', {
      ...TRIGGER_CONFIG,
      entity: 'camera.first',
    })
    expect(
      ensureHaElement('ha-camera-stream', { ...TRIGGER_CONFIG, entity: 'camera.second' })
    ).toBe(first)

    await vi.advanceTimersByTimeAsync(0)
    await expect(first).resolves.toBe(true)
    expect(loadCardHelpers).toHaveBeenCalledTimes(1)
    expect(createCardElement).toHaveBeenCalledTimes(1)
    expect(createCardElement).toHaveBeenCalledWith({ ...TRIGGER_CONFIG, entity: 'camera.first' })

    // A different tag is keyed separately and runs its own ladder.
    const otherTag = ensureHaElement('ha-other-element', TRIGGER_CONFIG)
    expect(otherTag).not.toBe(first)
    await vi.advanceTimersByTimeAsync(0)
    expect(loadCardHelpers).toHaveBeenCalledTimes(2)
    expect(createCardElement).toHaveBeenCalledTimes(2)
  })

  it('resolves true immediately when the element is already defined', async () => {
    // The previous test defined 'ha-camera-stream'; the cache was reset in
    // beforeEach, so this run takes the already-defined short-circuit.
    const loadCardHelpers = vi.fn()
    setLoadCardHelpers(loadCardHelpers as unknown as LoadCardHelpers)

    const promise = ensureHaElement('ha-camera-stream', TRIGGER_CONFIG)
    await vi.advanceTimersByTimeAsync(0)
    await expect(promise).resolves.toBe(true)
    expect(loadCardHelpers).not.toHaveBeenCalled()
  })
})
