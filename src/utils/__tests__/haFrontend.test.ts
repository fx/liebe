import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ensureHaElement, isHaFrontendContext, resetEnsureHaElementForTests } from '../haFrontend'

// NOTE: jsdom cannot unregister custom elements, so every test uses its OWN
// unique tag (registrations leak across tests within the file). That keeps the
// tests order-independent: a tag a test needs UNDEFINED is never defined by
// any other test. The ladder's promise cache is reset per test via
// resetEnsureHaElementForTests().

interface CardHelpers {
  createCardElement: (config: Record<string, unknown>) => HTMLElement
}
type LoadCardHelpers = () => Promise<CardHelpers>

const TRIGGER_CONFIG = { type: 'picture-entity', entity: 'camera.demo', camera_view: 'live' }

function setLoadCardHelpers(fn: LoadCardHelpers | undefined) {
  ;(window as unknown as { loadCardHelpers?: LoadCardHelpers }).loadCardHelpers = fn
}

describe('ensureHaElement', () => {
  // Simulated HA frontend root: its presence is what distinguishes the
  // panel-in-HA case from standalone dev (see isHaFrontendContext).
  let haRoot: HTMLElement

  beforeEach(() => {
    vi.useFakeTimers()
    resetEnsureHaElementForTests()
    setLoadCardHelpers(undefined)
    haRoot = document.createElement('home-assistant')
    document.body.appendChild(haRoot)
  })

  afterEach(() => {
    vi.useRealTimers()
    setLoadCardHelpers(undefined)
    haRoot.remove()
  })

  it('isHaFrontendContext reflects the presence of the <home-assistant> root', () => {
    expect(isHaFrontendContext()).toBe(true)
    haRoot.remove()
    expect(isHaFrontendContext()).toBe(false)
  })

  it('standalone (no <home-assistant>): resolves false immediately and caches it permanently', async () => {
    haRoot.remove()
    const loadCardHelpers = vi.fn()
    setLoadCardHelpers(loadCardHelpers as unknown as LoadCardHelpers)

    // Resolves without any timer advancement: the 5s helpers poll never runs.
    const promise = ensureHaElement('ha-standalone-element', TRIGGER_CONFIG)
    await expect(promise).resolves.toBe(false)
    expect(loadCardHelpers).not.toHaveBeenCalled()

    // Standalone can never become HA: the negative result stays cached (no
    // eviction, unlike transient HA-context failures).
    expect(ensureHaElement('ha-standalone-element', TRIGGER_CONFIG)).toBe(promise)
  })

  it('standalone still short-circuits true when the element is already defined', async () => {
    haRoot.remove()
    customElements.define('ha-standalone-defined', class extends HTMLElement {})

    const promise = ensureHaElement('ha-standalone-defined', TRIGGER_CONFIG)
    await expect(promise).resolves.toBe(true)
  })

  it('resolves false when loadCardHelpers never appears (poll timeout)', async () => {
    let settled: boolean | null = null
    ensureHaElement('ha-poll-timeout-element', TRIGGER_CONFIG).then((value) => {
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

    const promise = ensureHaElement('ha-helpers-reject-element', TRIGGER_CONFIG)
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

    const promise = ensureHaElement('ha-card-throws-element', TRIGGER_CONFIG)
    await vi.advanceTimersByTimeAsync(0)
    await expect(promise).resolves.toBe(false)
  })

  it('resolves false when the element is never defined after card creation', async () => {
    const createCardElement = vi.fn(() => document.createElement('div'))

    let settled: boolean | null = null
    ensureHaElement('ha-never-defined-element', TRIGGER_CONFIG).then((value) => {
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

  it('does not cache a false resolution: the next caller retries the ladder', async () => {
    // First run: helpers never appear → false (e.g. slow HA load missed the
    // poll window).
    let first: boolean | null = null
    ensureHaElement('ha-retry-element', TRIGGER_CONFIG).then((value) => {
      first = value
    })
    await vi.advanceTimersByTimeAsync(250 * 20)
    expect(first).toBe(false)

    // The failed entry was evicted: a new caller (e.g. a remounted camera
    // card) re-runs the ladder, which now succeeds.
    const createCardElement = vi.fn(() => {
      customElements.define('ha-retry-element', class extends HTMLElement {})
      return document.createElement('div')
    })
    setLoadCardHelpers(vi.fn().mockResolvedValue({ createCardElement }))

    const second = ensureHaElement('ha-retry-element', TRIGGER_CONFIG)
    await vi.advanceTimersByTimeAsync(0)
    await expect(second).resolves.toBe(true)
    expect(createCardElement).toHaveBeenCalledTimes(1)

    // Only the successful resolution stays cached.
    expect(ensureHaElement('ha-retry-element', TRIGGER_CONFIG)).toBe(second)
  })

  it('caches the ladder per tag: same tag shares one run, other tags run their own', async () => {
    const createCardElement = vi.fn((config: Record<string, unknown>) => {
      if (config.entity === 'camera.first') {
        customElements.define('ha-shared-tag-element', class extends HTMLElement {})
      }
      return document.createElement('div')
    })
    const loadCardHelpers = vi.fn().mockResolvedValue({ createCardElement })
    setLoadCardHelpers(loadCardHelpers)

    // Same tag: every caller gets the very same promise, so only one ladder
    // runs and the first caller's trigger config wins.
    const first = ensureHaElement('ha-shared-tag-element', {
      ...TRIGGER_CONFIG,
      entity: 'camera.first',
    })
    expect(
      ensureHaElement('ha-shared-tag-element', { ...TRIGGER_CONFIG, entity: 'camera.second' })
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
    // Define the tag up front (own tag, so no cross-test coupling): the
    // ladder takes the already-defined short-circuit without ever touching
    // loadCardHelpers.
    customElements.define('ha-predefined-element', class extends HTMLElement {})
    const loadCardHelpers = vi.fn()
    setLoadCardHelpers(loadCardHelpers as unknown as LoadCardHelpers)

    const promise = ensureHaElement('ha-predefined-element', TRIGGER_CONFIG)
    await vi.advanceTimersByTimeAsync(0)
    await expect(promise).resolves.toBe(true)
    expect(loadCardHelpers).not.toHaveBeenCalled()
  })
})
