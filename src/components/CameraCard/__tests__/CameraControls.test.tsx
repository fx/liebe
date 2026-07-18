import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { CameraControls } from '../CameraControls'
import type { CameraControlsProps } from '../CameraControls'

function renderControls(overrides: Partial<CameraControlsProps> = {}) {
  const props: CameraControlsProps = {
    friendlyName: 'Demo Cam',
    entity: { state: 'idle', attributes: {} },
    streamError: null,
    isRecording: false,
    isStreaming: false,
    isIdle: false,
    supportsStream: false,
    isEditMode: false,
    isMuted: true,
    isReconnecting: false,
    hasFrameWarning: false,
    handleToggleMute: vi.fn(),
    handleVideoFullscreen: vi.fn(),
    size: 'medium',
    ...overrides,
  }
  return { ...render(<CameraControls {...props} />), props }
}

// Every state below the one under test is also asserted true, proving the
// pill priority: ERROR > CONNECTING > NO SIGNAL > RECORDING > STREAMING >
// IDLE > raw state.
describe('CameraControls status pill priority', () => {
  it('ERROR wins over everything', () => {
    const { getByText } = renderControls({
      streamError: 'boom',
      isReconnecting: true,
      hasFrameWarning: true,
      isRecording: true,
      isStreaming: true,
      isIdle: true,
      supportsStream: true,
      entity: { state: 'streaming', attributes: {} },
    })
    expect(getByText('ERROR')).toBeInTheDocument()
  })

  it('CONNECTING (reconnecting) wins over NO SIGNAL and below', () => {
    const { getByText, container } = renderControls({
      isReconnecting: true,
      hasFrameWarning: true,
      isRecording: true,
      isStreaming: true,
      isIdle: true,
      supportsStream: true,
      entity: { state: 'streaming', attributes: {} },
    })
    expect(getByText('CONNECTING')).toBeInTheDocument()
    expect(container.querySelector('.rt-Spinner')).not.toBeNull()
  })

  it('CONNECTING also shows while a supported stream has not started', () => {
    const { getByText } = renderControls({
      supportsStream: true,
      isStreaming: false,
      hasFrameWarning: true,
      isRecording: true,
      isIdle: true,
    })
    expect(getByText('CONNECTING')).toBeInTheDocument()
  })

  it('NO SIGNAL wins over RECORDING and below', () => {
    const { getByText, container } = renderControls({
      hasFrameWarning: true,
      isRecording: true,
      isStreaming: true,
      isIdle: true,
      supportsStream: true,
      isEditMode: true, // hide buttons so the only svg is the warning icon
      entity: { state: 'streaming', attributes: {} },
    })
    expect(getByText('NO SIGNAL')).toBeInTheDocument()
    expect(container.querySelectorAll('svg')).toHaveLength(1)
    expect(container.querySelector('.rt-Spinner')).toBeNull()
    expect(container.querySelector('.recording-dot')).toBeNull()
  })

  it('RECORDING wins over STREAMING and IDLE while recording', () => {
    const { getByText, container } = renderControls({
      isRecording: true,
      isStreaming: true,
      isIdle: true,
      supportsStream: true,
    })
    expect(getByText('RECORDING')).toBeInTheDocument()
    expect(container.querySelector('.recording-dot')).not.toBeNull()
  })

  it('RECORDING also shows when the entity state is streaming', () => {
    const { getByText } = renderControls({
      isStreaming: true,
      supportsStream: true,
      entity: { state: 'streaming', attributes: {} },
    })
    expect(getByText('RECORDING')).toBeInTheDocument()
  })

  it('STREAMING wins over IDLE', () => {
    const { getByText } = renderControls({
      isStreaming: true,
      isIdle: true,
      supportsStream: true,
      entity: { state: 'idle', attributes: {} },
    })
    expect(getByText('STREAMING')).toBeInTheDocument()
  })

  it('IDLE wins over the raw entity state', () => {
    const { getByText, container } = renderControls({
      isIdle: true,
      entity: { state: 'unavailable', attributes: {} },
    })
    expect(getByText('IDLE')).toBeInTheDocument()
    // No spinner, warning, or recording dot for an idle camera.
    expect(container.querySelector('.rt-Spinner')).toBeNull()
    expect(container.querySelector('.recording-dot')).toBeNull()
    expect(container.querySelectorAll('svg')).toHaveLength(0)
  })

  it('falls back to the uppercased raw entity state', () => {
    const { getByText } = renderControls({ entity: { state: 'paused', attributes: {} } })
    expect(getByText('PAUSED')).toBeInTheDocument()
  })
})

describe('CameraControls buttons', () => {
  it('shows mute and fullscreen buttons for an active stream and fires the handlers', () => {
    const handleToggleMute = vi.fn()
    const handleVideoFullscreen = vi.fn()
    const { getByTitle } = renderControls({
      supportsStream: true,
      isStreaming: true,
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
      supportsStream: true,
      isStreaming: true,
      isMuted: false,
    })
    expect(getByTitle('Mute')).toBeInTheDocument()
    expect(queryByTitle('Unmute')).toBeNull()
  })

  it('hides the buttons in edit mode', () => {
    const { queryByTitle } = renderControls({
      supportsStream: true,
      isStreaming: true,
      isEditMode: true,
    })
    expect(queryByTitle('Unmute')).toBeNull()
    expect(queryByTitle('Toggle native fullscreen')).toBeNull()
  })

  it('hides the buttons when there is no active stream', () => {
    const { queryByTitle } = renderControls({ supportsStream: true, isStreaming: false })
    expect(queryByTitle('Unmute')).toBeNull()
  })

  it('highlights buttons on hover and restores on leave', () => {
    const { getByTitle } = renderControls({ supportsStream: true, isStreaming: true })

    for (const title of ['Unmute', 'Toggle native fullscreen']) {
      const button = getByTitle(title)
      fireEvent.mouseEnter(button)
      expect(button.style.backgroundColor).toBe('rgba(255, 255, 255, 0.2)')
      fireEvent.mouseLeave(button)
      expect(button.style.backgroundColor).toBe('rgba(255, 255, 255, 0.1)')
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
