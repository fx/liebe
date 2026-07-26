import { describe, it, expect, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { LiebeThemeProvider } from '../LiebeThemeProvider'
import {
  cameraFullscreenStore,
  enterCameraFullscreen,
  exitCameraFullscreen,
} from '~/store/cameraFullscreenStore'

function getRootTheme(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-is-root-theme="true"]') as HTMLElement
}

describe('LiebeThemeProvider', () => {
  beforeEach(() => {
    cameraFullscreenStore.setState(() => 0)
  })

  it('renders children inside the root Radix Theme', () => {
    const { container, getByTestId } = render(
      <LiebeThemeProvider>
        <span data-testid="child" />
      </LiebeThemeProvider>
    )

    expect(getRootTheme(container)).toBeInTheDocument()
    expect(getByTestId('child')).toBeInTheDocument()
  })

  it('leaves the appearance to the surrounding document when none is given', () => {
    const { container } = render(
      <LiebeThemeProvider>
        <span />
      </LiebeThemeProvider>
    )

    // Radix stamps the resolved appearance as a class; with no explicit
    // appearance the panel inherits, so neither class is forced.
    const theme = getRootTheme(container)
    expect(theme.classList.contains('dark')).toBe(false)
    expect(theme.classList.contains('light')).toBe(false)
  })

  it('applies an explicit appearance to the root Theme', () => {
    const { container } = render(
      <LiebeThemeProvider appearance="light">
        <span />
      </LiebeThemeProvider>
    )

    expect(getRootTheme(container).classList.contains('light')).toBe(true)
  })

  it('lifts the root Theme stacking while a camera overlay is open', () => {
    const { container } = render(
      <LiebeThemeProvider>
        <span />
      </LiebeThemeProvider>
    )
    const theme = getRootTheme(container)

    expect(theme.style.zIndex).toBe('')

    act(() => enterCameraFullscreen())
    expect(theme.style.position).toBe('relative')
    expect(theme.style.zIndex).toBe('99999')

    act(() => exitCameraFullscreen())
    expect(theme.style.zIndex).toBe('')
  })
})
