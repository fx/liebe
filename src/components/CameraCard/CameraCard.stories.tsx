import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'
import { CameraCard } from './index'
import {
  asUnavailable,
  createBinarySensorEntity,
  createCameraEntity,
  type EntityOverrides,
} from '~/test/fixtures'
import type { GridItem } from '~/store/types'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../../.storybook/decorators'
import { MOCK_CAMERA_FRAME } from '../../../.storybook/mockCameraStream'

const entityId = 'camera.driveway'
const MOTION_ENTITY = 'binary_sensor.driveway_motion'

/**
 * Camera fixture wired to the workshop's stream mocks.
 *
 * Two story-only attributes drive them (see `.storybook/mockCameraStream.ts`
 * and `.storybook/mockCameraStreamReady.ts`): `mock_readiness` decides whether
 * the card renders the stream element or its still-image fallback, and
 * `mock_stream` decides how that element behaves. Everything else — the status
 * machine, the pill, the controls — is the card's real code.
 */
function camera(
  state: string,
  {
    stream = 'stream',
    readiness = 'ready',
    ...overrides
  }: EntityOverrides & { stream?: 'stream' | 'connecting' | 'error'; readiness?: string } = {}
) {
  return createCameraEntity({
    state,
    ...overrides,
    attributes: {
      entity_picture: MOCK_CAMERA_FRAME,
      mock_stream: stream,
      mock_readiness: readiness,
      ...overrides.attributes,
    },
  })
}

/**
 * The linked motion sensor for the `showLastMotion` stories.
 *
 * `last_changed` is set relative to now and half a minute off the boundary, so
 * the floored minute the card renders is stable rather than flipping under the
 * story as the clock crosses a minute.
 */
function motionSensor(state: string, minutesAgo = 12.5) {
  return createBinarySensorEntity({
    entity_id: MOTION_ENTITY,
    state,
    attributes: { friendly_name: 'Driveway Motion', device_class: 'motion' },
    last_changed: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  })
}

/** A grid item so the card's configuration surface (fit, matting) is reachable. */
function cameraItem(config: GridItem['config'] = {}): GridItem {
  return {
    id: 'story-camera',
    entityId,
    type: 'entity',
    x: 0,
    y: 0,
    width: CameraCard.defaultDimensions.width,
    height: CameraCard.defaultDimensions.height,
    config,
  }
}

type CameraCardStoryProps = ComponentProps<typeof CameraCard> & GridCellArgs

const meta: Meta<CameraCardStoryProps> = {
  title: 'Cards/CameraCard',
  component: CameraCard,
  decorators: [withGridCell],
  argTypes: gridCellArgTypes,
  args: {
    entityId,
    // A cell that derives `full`, because that is the only tier which mounts a
    // live feed at all: below 2×2 the card degrades to a still thumbnail, which
    // the degraded-tier stories below show on purpose.
    gridWidth: 4,
    gridHeight: 3,
  },
  parameters: {
    liebe: { entities: [camera('idle')] },
  },
}

export default meta
type Story = StoryObj<CameraCardStoryProps>

/** The gradient overlay's two lines, and the badge, as the DOM has them. */
const overlayName = (canvas: HTMLElement) =>
  canvas.querySelector('.camera-name-overlay .camera-overlay-name')?.textContent ?? null
const overlayState = (canvas: HTMLElement) =>
  canvas.querySelector('.camera-name-overlay .camera-overlay-state')?.textContent ?? null
const liveBadge = (canvas: HTMLElement) =>
  canvas.querySelector('.camera-live-badge')?.textContent ?? null
const overlayMotion = (canvas: HTMLElement) =>
  canvas.querySelector('.camera-name-overlay .camera-overlay-motion')?.textContent ?? null

/* ------------------------------------------------------------------ *
 * Stream states
 * ------------------------------------------------------------------ */

/**
 * The active state: frames are flowing, so the pill reads `STREAMING` and the
 * mute and fullscreen controls appear over the frame. A camera has no on/off
 * pair — a live stream and a resting camera showing only its last snapshot
 * (`StillImageFallback` below) are its representative states.
 *
 * Note that a live stream outranks the entity's own `idle` state in the pill:
 * `deriveCameraStatus` reports what the surface is actually doing.
 */
export const Streaming: Story = {
  parameters: { liebe: { entities: [camera('idle')] } },
  play: async ({ canvasElement }) => {
    // Defaults: name and state in the gradient, and the live state presented as
    // the badge rather than as a STREAMING pill (change 0021's subsumption).
    await waitFor(() => expect(liveBadge(canvasElement)).toBe('LIVE'))
    await expect(overlayName(canvasElement)).toBe('Driveway')
    await expect(overlayState(canvasElement)).toBe('Idle')
    await expect(canvasElement.textContent).not.toContain('STREAMING')
  },
}

/**
 * `recording` gets its own pill, ranked above streaming — as does an entity
 * reporting `streaming` while frames are flowing, which resolves to the same
 * pill.
 */
export const Recording: Story = {
  parameters: { liebe: { entities: [camera('recording')] } },
  play: async ({ canvasElement }) => {
    // The recording variant survives the subsumption as its own badge label.
    await waitFor(() => expect(liveBadge(canvasElement)).toBe('REC'))
    await expect(overlayState(canvasElement)).toBe('Recording')
  },
}

/**
 * The stream element is mounted but has produced no frame yet: spinner over
 * the surface and a `CONNECTING` pill. Left alone it eventually expires into
 * the failure below — the card allows 20s of visible time before giving up.
 */
export const Connecting: Story = {
  parameters: { liebe: { entities: [camera('streaming', { stream: 'connecting' })] } },
}

/**
 * The stream fails to load, so the card replaces the surface with the error
 * text and a Retry button (which remounts the element — and fails again here).
 */
export const StreamError: Story = {
  parameters: { liebe: { entities: [camera('streaming', { stream: 'error' })] } },
  play: async ({ canvasElement }) => {
    // The one story that distinguishes the workshop's two frames — the one it
    // serves and the one it deliberately does not. Without an assertion here,
    // a runner that answered `load` for every image would render the streaming
    // surface for this fixture and nothing would say so.
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByRole('button', { name: /Retry/ })).toBeInTheDocument())
    await expect(liveBadge(canvasElement)).toBeNull()
  },
}

/* ------------------------------------------------------------------ *
 * Fallback and entity states
 * ------------------------------------------------------------------ */

/**
 * The resting state: when `<ha-camera-stream>` cannot be bootstrapped — a
 * standalone dev server, or an HA frontend that never defines the element —
 * the card falls back to the periodically refreshed snapshot, and the pill
 * reports the camera's own `IDLE` state.
 */
export const StillImageFallback: Story = {
  parameters: { liebe: { entities: [camera('idle', { readiness: 'unavailable' })] } },
  play: async ({ canvasElement }) => {
    // The name still belongs on the picture; the badge does not.
    await waitFor(() => expect(overlayName(canvasElement)).toBe('Driveway'))
    await expect(liveBadge(canvasElement)).toBeNull()
  },
}

/**
 * The badge's honesty rule, in the shape that actually bites: the pill resolves
 * `RECORDING` from the raw entity state alone, so a camera whose element could
 * not be bootstrapped reports a live state with nothing but a periodically
 * refreshed snapshot on screen. No badge renders — a snapshot must never be
 * labelled live — and the pill keeps saying `RECORDING` unsubsumed.
 */
export const RecordingStillImage: Story = {
  parameters: { liebe: { entities: [camera('recording', { readiness: 'unavailable' })] } },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.textContent).toContain('RECORDING'))
    await expect(liveBadge(canvasElement)).toBeNull()
  },
}

/**
 * The same fallback without a snapshot to show: no `entity_picture` (or a
 * failed request) renders the labelled placeholder icon rather than a broken
 * image.
 */
export const StillImageWithoutSnapshot: Story = {
  parameters: {
    liebe: {
      entities: [
        camera('idle', { readiness: 'unavailable', attributes: { entity_picture: undefined } }),
      ],
    },
  },
}

/**
 * A camera without `SUPPORT_STREAM` never renders a stream surface at all —
 * the card falls back to its icon-and-pill layout.
 */
export const WithoutStreamSupport: Story = {
  args: { gridHeight: 2 },
  parameters: {
    liebe: { entities: [camera('idle', { attributes: { supported_features: 0 } })] },
  },
}

/* ------------------------------------------------------------------ *
 * Presentation options (change 0021)
 * ------------------------------------------------------------------ */

/**
 * `showNameOverlay: false` leaves the feed uninterrupted — and hands the name
 * back to the status pill, which is the only place left for it.
 */
export const WithoutNameOverlay: Story = {
  args: { item: cameraItem({ showNameOverlay: false }) },
  parameters: { liebe: { entities: [camera('idle')] } },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(liveBadge(canvasElement)).toBe('LIVE'))
    await expect(canvasElement.querySelector('.camera-name-overlay')).toBeNull()
    await expect(canvasElement.textContent).toContain('Driveway')
  },
}

/**
 * `showLiveBadge: false` gives the live state back to the pill it was subsumed
 * from — the pill's own resolution never changed, only which layer presents it.
 */
export const WithoutLiveBadge: Story = {
  args: { item: cameraItem({ showLiveBadge: false }) },
  parameters: { liebe: { entities: [camera('idle')] } },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.textContent).toContain('STREAMING'))
    await expect(liveBadge(canvasElement)).toBeNull()
  },
}

/**
 * The universal `hideName` takes the name line out of the gradient — and does
 * NOT hand it back to the pill, which would be the option doing nothing.
 */
export const OverlayWithoutName: Story = {
  args: { item: cameraItem({ hideName: true }) },
  parameters: { liebe: { entities: [camera('idle')] } },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(overlayState(canvasElement)).toBe('Idle'))
    await expect(overlayName(canvasElement)).toBeNull()
    await expect(canvasElement.textContent).not.toContain('Driveway')
  },
}

/**
 * The universal `hideState` takes the state line out. The stream-health pill is
 * a different thing — camera-streaming's, not the entity's state line — so it
 * stays; here the live state is on the badge.
 */
export const OverlayWithoutState: Story = {
  args: { item: cameraItem({ hideState: true }) },
  parameters: { liebe: { entities: [camera('idle')] } },
  play: async ({ canvasElement }) => {
    // The badge waits with the name rather than after it: the overlay renders
    // as soon as the card does, while `LIVE` follows the stream reaching its
    // streaming state, so asserting it outside the wait is a race this story
    // lost the first time anything ran it.
    await waitFor(() => {
      expect(overlayName(canvasElement)).toBe('Driveway')
      expect(liveBadge(canvasElement)).toBe('LIVE')
    })
    await expect(overlayState(canvasElement)).toBeNull()
  },
}

/**
 * Hiding both lines collapses the band entirely: an empty gradient over a feed
 * is a smudge, not a layout, so the picture fills the card as if the overlay
 * were switched off.
 */
export const OverlayCollapsed: Story = {
  args: { item: cameraItem({ hideName: true, hideState: true }) },
  parameters: { liebe: { entities: [camera('idle')] } },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(liveBadge(canvasElement)).toBe('LIVE'))
    await expect(canvasElement.querySelector('.camera-name-overlay')).toBeNull()
    await expect(canvasElement.textContent).not.toContain('Driveway')
  },
}

/* ------------------------------------------------------------------ *
 * Motion line (change 0021)
 * ------------------------------------------------------------------ */

/** A sensor that is currently seeing something. */
export const MotionDetected: Story = {
  args: { item: cameraItem({ showLastMotion: true, motionEntity: MOTION_ENTITY }) },
  parameters: { liebe: { entities: [camera('idle'), motionSensor('on')] } },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(overlayMotion(canvasElement)).toBe('Motion detected'))
    // Added to the state area, not in place of the state.
    await expect(overlayState(canvasElement)).toBe('Idle')
  },
}

/**
 * A clear sensor reads "Clear for X" — never "Motion X ago". `last_changed`
 * measures the state the sensor is in NOW, so after a Home Assistant restart it
 * marks that restart rather than a motion event; claiming an event from it would
 * invent one that never happened.
 */
export const MotionClear: Story = {
  args: { item: cameraItem({ showLastMotion: true, motionEntity: MOTION_ENTITY }) },
  parameters: { liebe: { entities: [camera('idle'), motionSensor('off')] } },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(overlayMotion(canvasElement)).toBe('Clear for 12 min'))
  },
}

/**
 * A sensor that is unavailable drops the line and nothing else — a camera card
 * must never take on a linked sensor's error state. Same for a `motionEntity`
 * naming an entity this Home Assistant does not have.
 */
export const MotionSensorUnavailable: Story = {
  args: { item: cameraItem({ showLastMotion: true, motionEntity: MOTION_ENTITY }) },
  parameters: {
    liebe: { entities: [camera('idle'), asUnavailable(motionSensor('off'))] },
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(overlayName(canvasElement)).toBe('Driveway'))
    await expect(overlayMotion(canvasElement)).toBeNull()
    await expect(canvasElement.querySelector('[data-error]')).toBeNull()
  },
}

/* ------------------------------------------------------------------ *
 * Degraded tiers (change 0021)
 * ------------------------------------------------------------------ */

/**
 * 1×1. Below 2×2 a live feed is illegible, so the card mounts NO stream at all
 * and stands the `entity_picture` snapshot in its place — the omit-never-clip
 * rule applied to video. The overlay and the LIVE badge go with it; a gradient
 * band over a tile this size would be furniture with no room to stand on.
 * Tapping still opens fullscreen, where the stream is mounted lazily.
 */
export const GlanceTier: Story = {
  args: { gridWidth: 1, gridHeight: 1 },
  parameters: { liebe: { entities: [camera('idle')] } },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('.camera-thumb')).not.toBeNull())
    await expect(canvasElement.querySelector('ha-camera-stream')).toBeNull()
    await expect(canvasElement.querySelector('.camera-name-overlay')).toBeNull()
    await expect(liveBadge(canvasElement)).toBeNull()
    await expect(canvasElement.querySelector('.liebe-name')?.textContent).toBe('Driveway')
    // One cell wide: the name alone, no state line to clip.
    await expect(canvasElement.querySelector('.liebe-state')).toBeNull()
  },
}

/** ≥2×1 — the one degraded tier with the width for a state line beside the name. */
export const RowTier: Story = {
  args: { gridWidth: 3, gridHeight: 1 },
  parameters: { liebe: { entities: [camera('idle')] } },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('.camera-thumb')).not.toBeNull())
    await expect(canvasElement.querySelector('ha-camera-stream')).toBeNull()
    await expect(canvasElement.querySelector('.liebe-name')?.textContent).toBe('Driveway')
    await expect(canvasElement.querySelector('.liebe-state')?.textContent).toBe('Idle')
  },
}

/** 1×≥2 — thumbnail on top, name below; the same degradation as `glance`. */
export const TallTier: Story = {
  args: { gridWidth: 1, gridHeight: 3 },
  parameters: { liebe: { entities: [camera('idle')] } },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('.camera-thumb')).not.toBeNull())
    await expect(canvasElement.querySelector('ha-camera-stream')).toBeNull()
    await expect(canvasElement.querySelector('.liebe-state')).toBeNull()
  },
}

/**
 * `hideName` on a degraded tile leaves the picture alone — an image-only tile,
 * which the tier table requires to stay a valid layout.
 */
export const GlanceTierImageOnly: Story = {
  args: {
    gridWidth: 1,
    gridHeight: 1,
    item: cameraItem({ hideName: true }),
  },
  parameters: { liebe: { entities: [camera('idle')] } },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('.camera-thumb')).not.toBeNull())
    await expect(canvasElement.querySelector('.liebe-name')).toBeNull()
  },
}

/** `fit: 'contain'` letterboxes the frame instead of cropping it. */
export const ContainFit: Story = {
  args: { item: cameraItem({ fit: 'contain' }) },
  parameters: { liebe: { entities: [camera('streaming')] } },
}

/** `matting: 'none'` drops the card padding so the frame is edge to edge. */
export const NoMatting: Story = {
  args: { item: cameraItem({ matting: 'none' }) },
  parameters: { liebe: { entities: [camera('streaming')] } },
}

/**
 * An unavailable entity reports `UNAVAILABLE` immediately rather than tearing
 * the stream down — a short HA reconnect blip usually plays straight through.
 */
export const Unavailable: Story = {
  parameters: { liebe: { entities: [asUnavailable(camera('idle'))] } },
}

export const Loading: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [], initialLoading: true } },
}

/**
 * The card calls no services, so its error story other than the stream failure
 * above is the disconnected state it reaches through `useEntity`.
 */
export const Disconnected: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [camera('idle')], connected: false } },
}

/**
 * An entity id that is not in the store, on a live connection whose snapshot has
 * already landed — a card left pointing at an entity that was renamed or
 * removed. The card reports it missing and names it, rather than holding a
 * skeleton that reads as progress towards a load that will never finish
 * (docs/specs/entity-state — "Consumer Hooks").
 */
export const UnknownEntity: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [] } },
}

/**
 * Edit mode makes the stream surface inert (no fullscreen toggle) and exposes
 * the configure and delete affordances.
 */
export const EditMode: Story = {
  args: { onDelete: () => {}, item: cameraItem() },
  parameters: { liebe: { entities: [camera('idle')], mode: 'edit' } },
}
