import { describe, it, expect } from 'vitest'
import {
  CAMERA_LIVE_BADGE_LABELS,
  cameraStateText,
  resolveCameraLiveBadge,
  resolveCameraName,
  resolveCameraOverlay,
} from '../overlay'
import type { CameraStatus } from '../CameraControls'

/**
 * The camera's presentation rules (docs/specs/entity-cards/options/camera.md —
 * "Rules"), which live in pure functions precisely so they can be asserted
 * without a stream, a status machine, or a DOM.
 */

describe('resolveCameraOverlay', () => {
  it('draws both lines on an unconfigured card', () => {
    expect(
      resolveCameraOverlay({
        hasFeed: true,
        showNameOverlay: true,
        hideName: false,
        hideState: false,
      })
    ).toEqual({ visible: true, showName: true, showState: true })
  })

  it('drops the name line for hideName and keeps the band', () => {
    expect(
      resolveCameraOverlay({
        hasFeed: true,
        showNameOverlay: true,
        hideName: true,
        hideState: false,
      })
    ).toEqual({ visible: true, showName: false, showState: true })
  })

  it('drops the state line for hideState and keeps the band', () => {
    expect(
      resolveCameraOverlay({
        hasFeed: true,
        showNameOverlay: true,
        hideName: false,
        hideState: true,
      })
    ).toEqual({ visible: true, showName: true, showState: false })
  })

  it('collapses the band entirely when both lines are hidden', () => {
    // The doc's own scenario: no gradient band is drawn, so the feed fills the
    // card exactly as if `showNameOverlay` were false. An empty gradient is not
    // a layout.
    expect(
      resolveCameraOverlay({
        hasFeed: true,
        showNameOverlay: true,
        hideName: true,
        hideState: true,
      })
    ).toEqual({ visible: false, showName: false, showState: false })
  })

  it.each([
    ['neither flag set', false, false],
    ['hideName set', true, false],
    ['hideState set', false, true],
    ['both flags set', true, true],
  ])('draws nothing with the overlay off — %s', (_name, hideName, hideState) => {
    expect(
      resolveCameraOverlay({ hasFeed: true, showNameOverlay: false, hideName, hideState })
    ).toEqual({
      visible: false,
      showName: false,
      showState: false,
    })
  })

  it('draws nothing with no feed to draw it over', () => {
    // The icon tile of a camera without stream support, and the error-and-Retry
    // branch. The name has to go somewhere, and `showName: false` is what sends
    // it back to the status pill.
    expect(
      resolveCameraOverlay({
        hasFeed: false,
        showNameOverlay: true,
        hideName: false,
        hideState: false,
      })
    ).toEqual({ visible: false, showName: false, showState: false })
  })
})

describe('resolveCameraLiveBadge', () => {
  it('presents a streaming feed as LIVE', () => {
    expect(
      resolveCameraLiveBadge({ showLiveBadge: true, streamMounted: true, status: 'streaming' })
    ).toBe('live')
  })

  it('keeps the recording variant of its own', () => {
    expect(
      resolveCameraLiveBadge({ showLiveBadge: true, streamMounted: true, status: 'recording' })
    ).toBe('recording')
  })

  it('renders nothing over a still image, even at a live status', () => {
    // The honesty rule, and the case a status check alone would miss:
    // `deriveCameraStatus` reports `recording` from the raw entity state, so a
    // camera whose element could not be bootstrapped reaches a live status with
    // nothing but a periodically refreshed snapshot on screen.
    expect(
      resolveCameraLiveBadge({ showLiveBadge: true, streamMounted: false, status: 'recording' })
    ).toBeNull()
    expect(
      resolveCameraLiveBadge({ showLiveBadge: true, streamMounted: false, status: 'streaming' })
    ).toBeNull()
  })

  it.each<CameraStatus>(['error', 'connecting', 'no-signal', 'idle', 'raw'])(
    'leaves the %s state to the status pill',
    (status) => {
      expect(
        resolveCameraLiveBadge({ showLiveBadge: true, streamMounted: true, status })
      ).toBeNull()
    }
  )

  it.each<CameraStatus>(['streaming', 'recording'])(
    'renders nothing when turned off (%s)',
    (status) => {
      expect(
        resolveCameraLiveBadge({ showLiveBadge: false, streamMounted: true, status })
      ).toBeNull()
    }
  )

  it('labels each variant', () => {
    expect(CAMERA_LIVE_BADGE_LABELS).toEqual({ live: 'LIVE', recording: 'REC' })
  })
})

describe('cameraStateText', () => {
  it.each([
    ['idle', 'Idle'],
    ['recording', 'Recording'],
    ['streaming', 'Streaming'],
    ['unavailable', 'Unavailable'],
    ['motion_detected', 'Motion Detected'],
  ])('sentence-cases %s', (state, expected) => {
    expect(cameraStateText(state)).toBe(expected)
  })

  it('renders an empty state as nothing rather than as stray punctuation', () => {
    expect(cameraStateText('')).toBe('')
    expect(cameraStateText('_')).toBe('')
  })
})

describe('resolveCameraName', () => {
  const entity = { entity_id: 'camera.driveway', attributes: { friendly_name: 'Driveway' } }

  it('prefers the universal name override', () => {
    expect(resolveCameraName('Gate', entity)).toBe('Gate')
  })

  it('falls back to the friendly name', () => {
    expect(resolveCameraName('', entity)).toBe('Driveway')
  })

  it.each([
    ['an absent friendly name', undefined],
    ['an empty friendly name', ''],
  ])('falls back to the entity id for %s', (_name, friendlyName) => {
    // An empty `friendly_name` is an integration that supplied nothing, not a
    // camera the user wants left anonymous over its own feed.
    expect(
      resolveCameraName('', {
        entity_id: 'camera.driveway',
        attributes: { friendly_name: friendlyName },
      })
    ).toBe('camera.driveway')
  })
})
