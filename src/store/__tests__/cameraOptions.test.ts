import { describe, it, expect } from 'vitest'
import {
  CAMERA_OPTION_DEFAULTS,
  CAMERA_OPTION_KEYS,
  cameraOptionsConfigSchema,
  readCameraOptions,
} from '../cameraOptions'

/**
 * The camera presentation option contract
 * (docs/specs/entity-cards/options/camera.md — "Options").
 *
 * Same split as its siblings: the schema is strict so a bad value is rejected at
 * the import gate naming the field, and the reader is total so a value that
 * reached storage some other way costs its own key rather than the render
 * (docs/specs/dashboard-config/index.md — "Forward Compatibility").
 */

describe('readCameraOptions', () => {
  it('defaults every key when there is no config', () => {
    expect(readCameraOptions(undefined)).toEqual(CAMERA_OPTION_DEFAULTS)
    expect(readCameraOptions({})).toEqual(CAMERA_OPTION_DEFAULTS)
  })

  it('shows the overlay and the badge, and links no sensor, out of the box', () => {
    // The option doc's defaults: a camera tile says which camera it is and
    // whether it is live without anybody configuring it — and the motion line
    // stays off, because it reads an entity only the user can name.
    expect(CAMERA_OPTION_DEFAULTS).toEqual({
      showNameOverlay: true,
      showLiveBadge: true,
      showLastMotion: false,
      motionEntity: '',
    })
  })

  it('reads a fully configured card', () => {
    expect(
      readCameraOptions({
        showNameOverlay: false,
        showLiveBadge: false,
        showLastMotion: true,
        motionEntity: 'binary_sensor.driveway_motion',
      })
    ).toEqual({
      showNameOverlay: false,
      showLiveBadge: false,
      showLastMotion: true,
      motionEntity: 'binary_sensor.driveway_motion',
    })
  })

  it.each([
    ['an overlay flag written as a string', { showNameOverlay: 'no' }],
    ['an overlay flag written as a number', { showNameOverlay: 0 }],
    ['a badge flag written as a string', { showLiveBadge: 'false' }],
    ['a badge flag that is null', { showLiveBadge: null }],
    ['a motion flag written as a string', { showLastMotion: 'yes' }],
    ['a motion entity that is not text', { motionEntity: ['binary_sensor.x'] }],
  ])('falls back to the default for %s', (_name, config) => {
    expect(readCameraOptions(config)).toEqual(CAMERA_OPTION_DEFAULTS)
  })

  it('keeps the key beside a bad one', () => {
    expect(readCameraOptions({ showLiveBadge: 'no', showNameOverlay: false })).toEqual({
      ...CAMERA_OPTION_DEFAULTS,
      showNameOverlay: false,
    })
  })

  it('ignores keys belonging to other cards and to the streaming spec', () => {
    // `fit`/`matting`/`showStats` are camera-streaming's, read straight off the
    // config by the card; they are deliberately not part of this contract.
    expect(readCameraOptions({ fit: 'contain', showStats: true, hideState: true })).toEqual(
      CAMERA_OPTION_DEFAULTS
    )
  })

  it('names exactly the keys it defaults', () => {
    expect([...CAMERA_OPTION_KEYS].sort()).toEqual(Object.keys(CAMERA_OPTION_DEFAULTS).sort())
  })
})

describe('cameraOptionsConfigSchema', () => {
  it('accepts what the form writes', () => {
    expect(
      cameraOptionsConfigSchema.safeParse({
        showNameOverlay: true,
        showLiveBadge: false,
        showLastMotion: true,
        motionEntity: 'binary_sensor.driveway_motion',
      }).success
    ).toBe(true)
  })

  it('accepts a config that sets nothing', () => {
    expect(cameraOptionsConfigSchema.safeParse({}).success).toBe(true)
  })

  it.each([
    ['a badge flag that is not a boolean', { showLiveBadge: 'no' }],
    ['an overlay flag that is not a boolean', { showNameOverlay: 1 }],
    ['a motion flag that is not a boolean', { showLastMotion: 'yes' }],
    ['a motion entity that is not a string', { motionEntity: 42 }],
  ])('rejects %s at the gate', (_name, config) => {
    // `showLiveBadge: "no"` in particular: silently falling back to the enabled
    // default would label a feed live in a document that asked for the opposite.
    expect(cameraOptionsConfigSchema.safeParse(config).success).toBe(false)
  })
})
