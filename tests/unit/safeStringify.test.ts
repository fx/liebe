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
})
