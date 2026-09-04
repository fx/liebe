import { describe, it, expect } from 'vitest'
import { isRouteTreeImporter, normalizeRouteSource, stubRoutePath } from './devRouteStubPlugin'

describe('isRouteTreeImporter', () => {
  it('matches posix ids', () => {
    expect(isRouteTreeImporter('/work/src/routeTree.gen.ts')).toBe(true)
    expect(isRouteTreeImporter('/other/src/router.tsx')).toBe(false)
  })

  it('matches windows-style separators', () => {
    expect(isRouteTreeImporter('C:\\work\\src\\routeTree.gen.ts')).toBe(true)
  })

  it('strips query suffixes before matching', () => {
    expect(isRouteTreeImporter('/work/src/routeTree.gen.ts?v=123')).toBe(true)
    expect(isRouteTreeImporter('/work/src/routeTree.gen.ts?t=1&v=2')).toBe(true)
  })
})

// The prod stub's route-path logic, directly: extension-normalized exact map,
// unknown sources fall through (never mis-stubbed as the wrong route), and the
// stub ids/paths mirror the real route modules.

describe('normalizeRouteSource', () => {
  it('strips ts/tsx extensions, passes the rest through', () => {
    expect(normalizeRouteSource('./routes/test-store')).toBe('./routes/test-store')
    expect(normalizeRouteSource('./routes/test-store.tsx')).toBe('./routes/test-store')
    expect(normalizeRouteSource('./routes/__root.test.performance')).toBe(
      './routes/__root.test.performance'
    )
    expect(normalizeRouteSource('./routes/$slug')).toBe('./routes/$slug')
  })
})

describe('stubRoutePath', () => {
  it('maps each dev source to its real route id and path', () => {
    expect(stubRoutePath('./routes/test-store')).toEqual({
      id: '/test-store',
      path: '/test-store',
    })
    expect(stubRoutePath('./routes/__root.test.performance')).toEqual({
      id: '/__root/test/performance',
      path: '/test/performance',
    })
  })

  it('returns null for anything else (never mis-stubbed)', () => {
    expect(stubRoutePath('./routes/$slug')).toBeNull()
    expect(stubRoutePath('./routes/index')).toBeNull()
    expect(stubRoutePath('./routes/other')).toBeNull()
  })

  it('strips query suffixes before mapping', () => {
    expect(normalizeRouteSource('./routes/test-store.tsx?v=123')).toBe('./routes/test-store')
    expect(
      stubRoutePath(normalizeRouteSource('./routes/__root.test.performance.tsx?import'))
    ).toEqual({ id: '/__root/test/performance', path: '/test/performance' })
    expect(stubRoutePath(normalizeRouteSource('./routes/$slug?v=1'))).toBeNull()
  })

  it('maps extension variants through normalizeRouteSource first', () => {
    expect(stubRoutePath(normalizeRouteSource('./routes/test-store.tsx'))).toEqual({
      id: '/test-store',
      path: '/test-store',
    })
    expect(stubRoutePath(normalizeRouteSource('./routes/__root.test.performance.tsx'))).toEqual({
      id: '/__root/test/performance',
      path: '/test/performance',
    })
  })
})
