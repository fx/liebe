import { beforeEach, vi } from 'vitest'

// Mock Vaul for tests
vi.mock('vaul')

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})
