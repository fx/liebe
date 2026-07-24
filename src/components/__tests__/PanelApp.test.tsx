import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { PanelApp } from '../PanelApp'
import {
  cameraFullscreenStore,
  enterCameraFullscreen,
  exitCameraFullscreen,
} from '~/store/cameraFullscreenStore'

// Render the router as an inert marker: this test only exercises PanelApp's
// root-Theme stacking lift, not the routed app.
vi.mock('~/router', () => ({ router: {} }))
vi.mock('@tanstack/react-router', () => ({
  RouterProvider: () => <div data-testid="router" />,
}))

function getRootTheme(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-is-root-theme="true"]') as HTMLElement
}

describe('PanelApp root-Theme stacking lift', () => {
  beforeEach(() => {
    cameraFullscreenStore.setState(() => 0)
  })

  it('leaves the root Theme unstyled while no camera overlay is open', () => {
    const { container } = render(<PanelApp />)
    const theme = getRootTheme(container)
    expect(theme).toBeInTheDocument()
    expect(theme.style.zIndex).toBe('')
  })

  it('lifts the root Theme stacking while a camera overlay is open and restores it on close', () => {
    const { container } = render(<PanelApp />)
    const theme = getRootTheme(container)

    act(() => enterCameraFullscreen())
    expect(theme.style.zIndex).toBe('99999')
    expect(theme.style.position).toBe('relative')

    act(() => exitCameraFullscreen())
    expect(theme.style.zIndex).toBe('')
  })
})
