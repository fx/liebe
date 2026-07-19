import { describe, it, expect } from 'vitest'
import { safeStringify } from '../e2e/safeStringify'

// The e2e console collector's in-page stringifier. Lives outside tests/e2e's
// Playwright-only exclusion so its DAG-vs-cycle semantics are unit-testable:
// a visited-set implementation would mark shared (non-circular) references as
// '[circular]', hiding the type/details/fatal fields the benign filters
// inspect. Only true ancestor cycles may be marked.
describe('safeStringify', () => {
  it('serializes a DAG fully: the same object reached via two fields is not a cycle', () => {
    const shared = { type: 'mediaError', fatal: false }
    const value = { first: shared, second: shared }
    expect(JSON.parse(safeStringify(value))).toEqual({
      first: { type: 'mediaError', fatal: false },
      second: { type: 'mediaError', fatal: false },
    })
  })

  it('serializes shared references at different depths after the path stack unwinds', () => {
    const shared = { details: 'bufferStalledError' }
    const value = { a: { b: shared }, c: shared }
    expect(JSON.parse(safeStringify(value))).toEqual({
      a: { b: { details: 'bufferStalledError' } },
      c: { details: 'bufferStalledError' },
    })
  })

  it('serializes an array containing the same object twice without marking a cycle', () => {
    const shared = { id: 1 }
    expect(JSON.parse(safeStringify([shared, shared]))).toEqual([{ id: 1 }, { id: 1 }])
  })

  it('marks a true ancestor cycle as [circular]', () => {
    const node: { name: string; self?: unknown } = { name: 'loop' }
    node.self = node
    expect(JSON.parse(safeStringify(node))).toEqual({ name: 'loop', self: '[circular]' })
  })

  it('marks an indirect cycle through an array while keeping siblings intact', () => {
    const parent: { items: unknown[]; label: string } = { items: [], label: 'parent' }
    parent.items.push({ back: parent }, { ok: true })
    expect(JSON.parse(safeStringify(parent))).toEqual({
      items: [{ back: '[circular]' }, { ok: true }],
      label: 'parent',
    })
  })

  it('caps recursion at the depth limit', () => {
    const value = { l1: { l2: { l3: { l4: { l5: 'too deep' } } } } }
    expect(JSON.parse(safeStringify(value))).toEqual({
      l1: { l2: { l3: { l4: '[depth limit]' } } },
    })
  })

  it('stringifies errors to their stack and returns bare strings unquoted', () => {
    const err = new Error('boom')
    expect(safeStringify(err)).toBe(err.stack)
    const stackless = new Error('no stack')
    stackless.stack = ''
    expect(safeStringify(stackless)).toBe('Error: no stack')
    // Top-level strings pass through unquoted (they are already text).
    expect(safeStringify('plain')).toBe('plain')
  })

  it('encodes functions, bigints, symbols, undefined, and dates', () => {
    expect(
      JSON.parse(
        safeStringify({
          fn: function named() {},
          anon: () => {},
          big: 42n,
          sym: Symbol('tag'),
          missing: undefined,
          when: new Date('2026-01-02T03:04:05.000Z'),
        })
      )
    ).toEqual({
      fn: '[function named]',
      anon: '[function anon]',
      big: '42n',
      sym: 'Symbol(tag)',
      missing: '[undefined]',
      when: '2026-01-02T03:04:05.000Z',
    })
  })

  it('encodes Map and Set entries with tagged keys', () => {
    const value = { map: new Map([['k', 1]]), set: new Set(['a', 'b']) }
    expect(JSON.parse(safeStringify(value))).toEqual({
      map: { '[map] k': 1 },
      set: { '[set] 0': 'a', '[set] 1': 'b' },
    })
  })

  it('marks values whose getters throw as [unreadable]', () => {
    const value = {}
    Object.defineProperty(value, 'boom', {
      enumerable: true,
      get() {
        throw new Error('nope')
      },
    })
    expect(JSON.parse(safeStringify(value))).toEqual({ boom: '[unreadable]' })
  })

  it('caps oversized arrays with a deterministic truncation marker', () => {
    const parsed = JSON.parse(safeStringify(Array.from({ length: 120 }, (_, i) => i))) as unknown[]
    expect(parsed).toHaveLength(51)
    expect(parsed[0]).toBe(0)
    expect(parsed[49]).toBe(49)
    expect(parsed[50]).toBe('[+70 more entries]')
  })

  it('caps oversized objects, Maps, and Sets with a truncation marker', () => {
    const wide = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, i]))
    const parsedObject = JSON.parse(safeStringify(wide)) as Record<string, unknown>
    expect(Object.keys(parsedObject)).toHaveLength(51)
    expect(parsedObject['[truncated]']).toBe('+10 more entries')

    const map = new Map(Array.from({ length: 55 }, (_, i) => [`m${i}`, i]))
    const parsedMap = JSON.parse(safeStringify(map)) as Record<string, unknown>
    expect(parsedMap['[map] m0']).toBe(0)
    expect(parsedMap['[truncated]']).toBe('+5 more entries')

    const set = new Set(Array.from({ length: 53 }, (_, i) => i))
    const parsedSet = JSON.parse(safeStringify(set)) as Record<string, unknown>
    expect(parsedSet['[set] 0']).toBe(0)
    expect(parsedSet['[truncated]']).toBe('+3 more entries')
  })

  it('caps a huge Map at the entry budget with a truncation marker', () => {
    const huge = new Map(Array.from({ length: 100_000 }, (_, i) => [`m${i}`, i]))
    const parsed = JSON.parse(safeStringify(huge)) as Record<string, unknown>
    // Only maxEntries (50) entries serialize, plus the truncation marker.
    expect(Object.keys(parsed)).toHaveLength(51)
    expect(parsed['[map] m0']).toBe(0)
    expect(parsed['[map] m49']).toBe(49)
    expect(parsed['[map] m50']).toBeUndefined()
    expect(parsed['[truncated]']).toBe('+99950 more entries')
  })

  it('caps a huge Set at the entry budget with a truncation marker', () => {
    const huge = new Set(Array.from({ length: 100_000 }, (_, i) => i))
    const parsed = JSON.parse(safeStringify(huge)) as Record<string, unknown>
    expect(Object.keys(parsed)).toHaveLength(51)
    expect(parsed['[set] 0']).toBe(0)
    expect(parsed['[set] 49']).toBe(49)
    expect(parsed['[set] 50']).toBeUndefined()
    expect(parsed['[truncated]']).toBe('+99950 more entries')
  })

  it('stops pulling the Map/Set iterators at the budget instead of materializing the collection', () => {
    // Spreading (`[...map].slice(0, maxEntries)`) would materialize the whole
    // collection before truncating, defeating the budget — and the e2e
    // collector's 2s outer timeout cannot cancel in-page work already
    // underway. Count iterator pulls to prove the iteration itself stops.
    let mapPulls = 0
    const map = new Map(Array.from({ length: 10_000 }, (_, i) => [`k${i}`, i]))
    const mapIterator = Map.prototype[Symbol.iterator]
    Object.defineProperty(map, Symbol.iterator, {
      value: function* (this: Map<string, number>) {
        for (const entry of mapIterator.call(this)) {
          mapPulls += 1
          yield entry
        }
      },
    })
    const parsedMap = JSON.parse(safeStringify(map)) as Record<string, unknown>
    expect(Object.keys(parsedMap)).toHaveLength(51)
    // The loop pulls one entry past the budget to detect there is more, then
    // breaks — far from the 10k a spread would have materialized.
    expect(mapPulls).toBe(51)

    let setPulls = 0
    const set = new Set(Array.from({ length: 10_000 }, (_, i) => i))
    const setIterator = Set.prototype[Symbol.iterator]
    Object.defineProperty(set, Symbol.iterator, {
      value: function* (this: Set<number>) {
        for (const entry of setIterator.call(this)) {
          setPulls += 1
          yield entry
        }
      },
    })
    const parsedSet = JSON.parse(safeStringify(set)) as Record<string, unknown>
    expect(Object.keys(parsedSet)).toHaveLength(51)
    expect(setPulls).toBe(51)
  })

  it('keeps top-level fields inspectable in a wide typed-array-like payload', () => {
    // hls.js ErrorData can drag in typed arrays; their index keys are capped
    // per container while the leading diagnostic fields survive.
    const payload = {
      type: 'mediaError',
      details: 'bufferStalledError',
      fatal: false,
      buffer: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [i, 255])),
    }
    const text = safeStringify(payload)
    expect(text).toContain('"type":"mediaError"')
    expect(text).toContain('"fatal":false')
    expect(text).toContain('+450 more entries')
  })

  it('caps the final output length with an explicit marker', () => {
    const text = safeStringify({ blob: 'x'.repeat(30_000) })
    expect(text.length).toBe(20_000 + '[output truncated]'.length)
    expect(text.endsWith('[output truncated]')).toBe(true)
  })
})
