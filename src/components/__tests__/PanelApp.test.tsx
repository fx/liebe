import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { PanelApp } from '../PanelApp'
import {
  cameraFullscreenStore,
  enterCameraFullscreen,
  exitCameraFullscreen,
} from '~/store/cameraFullscreenStore'
import { dashboardStore } from '~/store/dashboardStore'
import { THEME_STYLE_SLOT } from '~/theme/styleInjection'
import { DEFAULT_THEME_ID } from '~/theme/themeRegistry'

// Render the router as an inert marker: this test only exercises PanelApp's
// root-Theme stacking lift, not the routed app.
vi.mock('~/router', () => ({ router: {} }))
vi.mock('@tanstack/react-router', () => ({
  RouterProvider: () => <div data-testid="router" />,
}))

function getRootTheme(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-is-root-theme="true"]') as HTMLElement
}

describe('PanelApp theming', () => {
  afterEach(() => {
    dashboardStore.setState((state) => ({ ...state, theme: 'auto' }))
    // The theme layer belongs to the root, not to the React tree, so unmounting
    // deliberately leaves it behind — this suite has to clear it itself.
    document.head
      .querySelectorAll(`style[data-liebe="${THEME_STYLE_SLOT}"]`)
      .forEach((style) => style.remove())
  })

  it('renders the configured theme and the appearance it resolves to', () => {
    dashboardStore.setState((state) => ({ ...state, theme: 'dark' }))

    const { container } = render(<PanelApp />)

    const theme = getRootTheme(container)
    expect(theme.getAttribute('data-liebe-theme')).toBe(DEFAULT_THEME_ID)
    // Resolved, not inherited: the panel drives Radix's appearance so the
    // Radix-aliased tokens flip with the Liebe ones.
    expect(theme.getAttribute('data-appearance')).toBe('dark')
    expect(theme.classList.contains('dark')).toBe(true)
  })
})

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
