import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { CameraControls } from '../CameraControls'
import type { CameraControlsProps } from '../CameraControls'

function renderControls(overrides: Partial<CameraControlsProps> = {}) {
  const props: CameraControlsProps = {
    friendlyName: 'Demo Cam',
    status: 'idle',
    rawState: 'idle',
    showControls: false,
    isMuted: true,
    handleToggleMute: vi.fn(),
    handleVideoFullscreen: vi.fn(),
    size: 'medium',
    ...overrides,
  }
  return { ...render(<CameraControls {...props} />), props }
}

function getPill(container: HTMLElement): HTMLElement {
  // The pill is the second child of the entity-info column.
  const info = container.firstElementChild!.firstElementChild as HTMLElement
  return info.children[1] as HTMLElement
}

// Every status maps to exactly one label, icon, and color — the priority
// matrix itself lives in deriveCameraStatus (see the CameraCard tests).
describe('CameraControls status pill rendering', () => {
  it('renders ERROR in red with no icon', () => {
    const { getByText, container } = renderControls({ status: 'error' })
    expect(getByText('ERROR')).toBeInTheDocument()
    expect(getPill(container).style.color).toBe('var(--red-9)')
    expect(container.querySelector('.rt-Spinner')).toBeNull()
    expect(container.querySelector('.recording-dot')).toBeNull()
    expect(container.querySelectorAll('svg')).toHaveLength(0)
  })

  it('renders CONNECTING with a spinner', () => {
    const { getByText, container } = renderControls({ status: 'connecting' })
    expect(getByText('CONNECTING')).toBeInTheDocument()
    expect(container.querySelector('.rt-Spinner')).not.toBeNull()
    expect(getPill(container).style.color).toBe('var(--gray-9)')
  })

  it('renders NO SIGNAL with the warning icon', () => {
    const { getByText, container } = renderControls({ status: 'no-signal' })
    expect(getByText('NO SIGNAL')).toBeInTheDocument()
    expect(container.querySelectorAll('svg')).toHaveLength(1)
    expect(container.querySelector('.rt-Spinner')).toBeNull()
    expect(container.querySelector('.recording-dot')).toBeNull()
    expect(getPill(container).style.color).toBe('var(--blue-9)')
  })

  it('renders RECORDING with the pulsing dot in blue', () => {
    const { getByText, container } = renderControls({ status: 'recording' })
    expect(getByText('RECORDING')).toBeInTheDocument()
    expect(container.querySelector('.recording-dot')).not.toBeNull()
    expect(getPill(container).style.color).toBe('var(--blue-9)')
  })

  it('renders STREAMING with the pulsing dot in blue', () => {
    const { getByText, container } = renderControls({ status: 'streaming' })
    expect(getByText('STREAMING')).toBeInTheDocument()
    expect(container.querySelector('.recording-dot')).not.toBeNull()
    expect(getPill(container).style.color).toBe('var(--blue-9)')
  })

  it('renders IDLE without any icon', () => {
    const { getByText, container } = renderControls({ status: 'idle' })
    expect(getByText('IDLE')).toBeInTheDocument()
    expect(container.querySelector('.rt-Spinner')).toBeNull()
    expect(container.querySelector('.recording-dot')).toBeNull()
    expect(container.querySelectorAll('svg')).toHaveLength(0)
  })

  it('renders the uppercased raw entity state for the raw status', () => {
    const { getByText, container } = renderControls({ status: 'raw', rawState: 'paused' })
    expect(getByText('PAUSED')).toBeInTheDocument()
    expect(getPill(container).style.color).toBe('var(--gray-9)')
  })
})

describe('CameraControls buttons', () => {
  it('shows mute and fullscreen buttons and fires the handlers', () => {
    const handleToggleMute = vi.fn()
    const handleVideoFullscreen = vi.fn()
    const { getByTitle } = renderControls({
      status: 'streaming',
      showControls: true,
      handleToggleMute,
      handleVideoFullscreen,
    })

    fireEvent.click(getByTitle('Unmute'))
    expect(handleToggleMute).toHaveBeenCalledTimes(1)

    fireEvent.click(getByTitle('Toggle native fullscreen'))
    expect(handleVideoFullscreen).toHaveBeenCalledTimes(1)
  })

  it('shows the mute title and loud speaker icon when unmuted', () => {
    const { getByTitle, queryByTitle } = renderControls({
      status: 'streaming',
      showControls: true,
      isMuted: false,
    })
    expect(getByTitle('Mute')).toBeInTheDocument()
    expect(queryByTitle('Unmute')).toBeNull()
  })

  it('hides the buttons when showControls is off', () => {
    const { queryByTitle } = renderControls({ status: 'streaming', showControls: false })
    expect(queryByTitle('Unmute')).toBeNull()
    expect(queryByTitle('Toggle native fullscreen')).toBeNull()
  })

  it('styles both buttons via the shared hoverable class', () => {
    const { getByTitle } = renderControls({ status: 'streaming', showControls: true })
    for (const title of ['Unmute', 'Toggle native fullscreen']) {
      expect(getByTitle(title).className).toBe('camera-control-button')
    }
  })
})

describe('CameraControls sizing', () => {
  const getRoot = (container: HTMLElement) => container.firstElementChild as HTMLElement

  it('scales down for small cards', () => {
    const { container } = renderControls({ size: 'small' })
    expect(getRoot(container).style.fontSize).toBe('0.64em')
  })

  it('uses the medium scale factor by default', () => {
    const { container } = renderControls({ size: 'medium' })
    expect(getRoot(container).style.fontSize).toBe('0.8em')
  })

  it('scales up for large cards', () => {
    const { container } = renderControls({ size: 'large' })
    expect(getRoot(container).style.fontSize).toBe('0.96em')
  })

  it('inherits the font size in fullscreen', () => {
    const { container } = renderControls({ size: 'large', isFullscreen: true })
    expect(getRoot(container).style.fontSize).toBe('inherit')
  })
})
