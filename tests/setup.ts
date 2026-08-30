import { beforeEach, afterEach, vi } from 'vitest'

// Mock localStorage for tests
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(),
  get length() {
    return 0
  },
}

beforeEach(() => {
  // Reset mocks before each test
  vi.clearAllMocks()
  
  // Setup localStorage mock
  Object.defineProperty(global, 'localStorage', {
    value: localStorageMock,
    writable: true,
  })
})

afterEach(() => {
  // Cleanup after each test
  vi.restoreAllMocks()
})
