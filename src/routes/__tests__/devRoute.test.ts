import { describe, it, expect } from 'vitest'
import { resolveDevRouteComponent } from '../devRoute'

// Both arms of the dev-route gate, directly callable: the route modules pass
// `import.meta.env.DEV` (statically replaced per build, untestable through
// them), so the helper takes the flag as an argument instead.

describe('resolveDevRouteComponent', () => {
  const devPage = () => null
  const prodPage = () => null

  it('renders the workshop page in development', () => {
    expect(resolveDevRouteComponent(true, devPage, prodPage)).toBe(devPage)
  })

  it('renders NotFound in production', () => {
    expect(resolveDevRouteComponent(false, devPage, prodPage)).toBe(prodPage)
  })
})
