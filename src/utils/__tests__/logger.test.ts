import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logger } from '../logger'

describe('logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    localStorage.clear()
  })

  describe('when the debug flag is off (production, no localStorage flag)', () => {
    beforeEach(() => {
      vi.stubEnv('DEV', false)
    })

    it('suppresses debug output', () => {
      logger.debug('hidden diagnostic')
      expect(logSpy).not.toHaveBeenCalled()
    })

    it('suppresses warn output', () => {
      logger.warn('hidden warning')
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('still emits errors', () => {
      logger.error('genuine failure')
      expect(errorSpy).toHaveBeenCalledWith('genuine failure')
    })
  })

  describe('runtime opt-in via localStorage', () => {
    beforeEach(() => {
      vi.stubEnv('DEV', false)
    })

    it('emits debug output once the liebe:debug flag is set', () => {
      logger.debug('before')
      expect(logSpy).not.toHaveBeenCalled()

      localStorage.setItem('liebe:debug', '1')
      logger.debug('after')
      expect(logSpy).toHaveBeenCalledWith('after')
    })
  })

  describe('when Vite dev mode is active', () => {
    beforeEach(() => {
      vi.stubEnv('DEV', true)
    })

    it('emits debug output without any localStorage flag', () => {
      logger.debug('dev diagnostic')
      expect(logSpy).toHaveBeenCalledWith('dev diagnostic')
    })
  })
})
