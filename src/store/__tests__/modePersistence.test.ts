import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saveDashboardMode, loadDashboardMode } from '../persistence'

describe('Mode Persistence', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear()
    // Clear console error mocks
    vi.clearAllMocks()
  })

  describe('saveDashboardMode', () => {
    it('saves view mode to localStorage', () => {
      saveDashboardMode('view')
      expect(localStorage.getItem('liebe-mode')).toBe('view')
    })

    it('saves edit mode to localStorage', () => {
      saveDashboardMode('edit')
      expect(localStorage.getItem('liebe-mode')).toBe('edit')
    })

    it('handles localStorage errors gracefully', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage full')
      })

      saveDashboardMode('edit')

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to save dashboard mode:',
        expect.any(Error)
      )

      setItemSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })
  })

  describe('loadDashboardMode', () => {
    it('loads view mode from localStorage', () => {
      localStorage.setItem('liebe-mode', 'view')
      expect(loadDashboardMode()).toBe('view')
    })

    it('loads edit mode from localStorage', () => {
      localStorage.setItem('liebe-mode', 'edit')
      expect(loadDashboardMode()).toBe('edit')
    })

    it('returns view as default when no mode is stored', () => {
      expect(loadDashboardMode()).toBe('view')
    })

    it('returns view as default when invalid mode is stored', () => {
      localStorage.setItem('liebe-mode', 'invalid-mode')
      expect(loadDashboardMode()).toBe('view')
    })

    it('handles localStorage errors gracefully', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage access denied')
      })

      expect(loadDashboardMode()).toBe('view')

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to load dashboard mode:',
        expect.any(Error)
      )

      getItemSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })
  })

  describe('Mode persistence integration', () => {
    it('persists mode across save and load', () => {
      saveDashboardMode('edit')
      expect(loadDashboardMode()).toBe('edit')

      saveDashboardMode('view')
      expect(loadDashboardMode()).toBe('view')
    })
  })
})
