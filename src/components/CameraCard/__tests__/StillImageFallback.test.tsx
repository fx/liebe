import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { StillImageFallback } from '../StillImageFallback'
import type { HomeAssistantState } from '../../../contexts/HomeAssistantContext'

function makeEntity(attributes: Record<string, unknown>): HomeAssistantState {
  return {
    entity_id: 'camera.demo',
    state: 'idle',
    attributes,
    last_changed: '2026-01-01T00:00:00Z',
    last_updated: '2026-01-01T00:00:00Z',
    context: { id: '1', parent_id: null, user_id: null },
  }
}

describe('StillImageFallback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the entity picture with a cache-busting counter and friendly-name alt text', () => {
    const entity = makeEntity({
      entity_picture: '/api/camera_proxy/camera.demo?token=abc',
      friendly_name: 'Demo Cam',
    })
    const { getByAltText } = render(<StillImageFallback entity={entity} />)

    const img = getByAltText('Demo Cam') as HTMLImageElement
    // The picture URL already has a query string, so the buster appends with '&'.
    expect(img.getAttribute('src')).toBe('/api/camera_proxy/camera.demo?token=abc&_ts=0')
    expect(img.style.objectFit).toBe('cover')
  })

  it('uses "?" as separator when the picture URL has no query string', () => {
    const entity = makeEntity({ entity_picture: '/local/still.jpg', friendly_name: 'Demo Cam' })
    const { getByAltText } = render(<StillImageFallback entity={entity} />)

    expect((getByAltText('Demo Cam') as HTMLImageElement).getAttribute('src')).toBe(
      '/local/still.jpg?_ts=0'
    )
  })

  it('falls back to the entity id for alt text without a friendly name', () => {
    const entity = makeEntity({ entity_picture: '/local/still.jpg' })
    const { getByAltText } = render(<StillImageFallback entity={entity} />)

    expect(getByAltText('camera.demo')).toBeInTheDocument()
  })

  it('applies the objectFit prop', () => {
    const entity = makeEntity({ entity_picture: '/local/still.jpg', friendly_name: 'Demo Cam' })
    const { getByAltText } = render(<StillImageFallback entity={entity} objectFit="contain" />)

    expect((getByAltText('Demo Cam') as HTMLImageElement).style.objectFit).toBe('contain')
  })

  it('refreshes the image every 10 seconds by bumping the cache-buster', () => {
    const entity = makeEntity({
      entity_picture: '/api/camera_proxy/camera.demo?token=abc',
      friendly_name: 'Demo Cam',
    })
    const { getByAltText } = render(<StillImageFallback entity={entity} />)
    const img = getByAltText('Demo Cam') as HTMLImageElement

    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(img.getAttribute('src')).toBe('/api/camera_proxy/camera.demo?token=abc&_ts=1')

    act(() => {
      vi.advanceTimersByTime(20_000)
    })
    expect(img.getAttribute('src')).toBe('/api/camera_proxy/camera.demo?token=abc&_ts=3')
  })

  it('stops refreshing after unmount', () => {
    const entity = makeEntity({ entity_picture: '/local/still.jpg' })
    const { unmount } = render(<StillImageFallback entity={entity} />)
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
    clearIntervalSpy.mockRestore()
  })

  it('shows the icon placeholder when the snapshot fails and retries on the next refresh', () => {
    const entity = makeEntity({ entity_picture: '/local/still.jpg', friendly_name: 'Demo Cam' })
    const { container, getByAltText, getByLabelText, queryByLabelText } = render(
      <StillImageFallback entity={entity} />
    )

    // The snapshot request fails: the broken image is replaced by the icon
    // placeholder.
    act(() => {
      ;(getByAltText('Demo Cam') as HTMLImageElement).dispatchEvent(new Event('error'))
    })
    expect(getByLabelText('No camera image available')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()

    // The next cache-buster tick produces a NEW src, which retries the image.
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    const retried = getByAltText('Demo Cam') as HTMLImageElement
    expect(retried.getAttribute('src')).toBe('/local/still.jpg?_ts=1')
    expect(queryByLabelText('No camera image available')).toBeNull()

    // A retry that fails again re-shows the placeholder (keyed per src).
    act(() => {
      retried.dispatchEvent(new Event('error'))
    })
    expect(getByLabelText('No camera image available')).toBeInTheDocument()
  })

  it('renders the video-icon placeholder when there is no entity picture', () => {
    const entity = makeEntity({ friendly_name: 'Demo Cam' })
    const { container, getByLabelText } = render(<StillImageFallback entity={entity} />)

    expect(getByLabelText('No camera image available')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()

    // No refresh interval is scheduled without a picture.
    expect(vi.getTimerCount()).toBe(0)
  })
})
