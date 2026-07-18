import { describe, it, expect } from 'vitest'
import { useRef } from 'react'
import { render } from '@testing-library/react'
import { KeepAlive } from '../KeepAlive'

// Test harness: renders KeepAlive into a container ref, optionally switching
// between two containers to exercise the move-without-remount behavior.
function Harness({ cacheKey, useSecond = false }: { cacheKey: string; useSecond?: boolean }) {
  const first = useRef<HTMLDivElement>(null)
  const second = useRef<HTMLDivElement>(null)
  return (
    <div>
      <div data-testid="first" ref={first} />
      <div data-testid="second" ref={second} />
      <KeepAlive cacheKey={cacheKey} containerRef={useSecond ? second : first}>
        <span data-testid="child">content</span>
      </KeepAlive>
    </div>
  )
}

describe('KeepAlive', () => {
  it('portals children into a cached element inside the target container', () => {
    const { getByTestId } = render(<Harness cacheKey="k-portal" />)

    const first = getByTestId('first')
    const child = getByTestId('child')

    // Child renders inside the container's cached portal element.
    expect(first.contains(child)).toBe(true)
  })

  it('reuses the same DOM element (keeps children alive) when moved between containers', () => {
    const { getByTestId, rerender } = render(<Harness cacheKey="k-move" useSecond={false} />)

    const first = getByTestId('first')
    const second = getByTestId('second')
    const childBefore = getByTestId('child')
    const portalEl = childBefore.parentElement
    expect(first.contains(childBefore)).toBe(true)

    // Switch the container ref: the same portal element (and its children) moves.
    rerender(<Harness cacheKey="k-move" useSecond={true} />)

    const childAfter = getByTestId('child')
    expect(second.contains(childAfter)).toBe(true)
    expect(first.contains(childAfter)).toBe(false)
    // Same portal element instance was reused, not recreated.
    expect(childAfter.parentElement).toBe(portalEl)
  })
})
