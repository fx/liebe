/**
 * Small diagnostic logger that is quiet in production by default.
 *
 * Enabled when Vite dev mode is active, or when the `liebe:debug` flag is
 * present in `localStorage` — the latter lets production builds opt in at
 * runtime (set the key, reload) without a rebuild. `error` is always emitted
 * because genuine failures should never be silenced.
 */
const DEBUG_STORAGE_KEY = 'liebe:debug'

function isEnabled(): boolean {
  if (import.meta.env.DEV) {
    return true
  }
  try {
    return localStorage.getItem(DEBUG_STORAGE_KEY) !== null
  } catch {
    // localStorage can throw (private mode, disabled storage) — treat as off.
    return false
  }
}

export const logger = {
  debug(...args: unknown[]): void {
    if (isEnabled()) {
      console.log(...args)
    }
  },
  warn(...args: unknown[]): void {
    if (isEnabled()) {
      console.warn(...args)
    }
  },
  error(...args: unknown[]): void {
    console.error(...args)
  },
}
