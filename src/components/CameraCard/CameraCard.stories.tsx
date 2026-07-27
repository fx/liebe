import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'
import { CameraCard } from './index'
import { asUnavailable, createCameraEntity, type EntityOverrides } from '~/test/fixtures'
import type { GridItem } from '~/store/types'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../../.storybook/decorators'
import { MOCK_CAMERA_FRAME } from '../../../.storybook/mockCameraStream'

const entityId = 'camera.driveway'

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
  argTypes: {
    ...gridCellArgTypes,
    tier: { control: { type: 'inline-radio' }, options: ['glance', 'row', 'tall', 'full'] },
  },
  args: {
    entityId,
    tier: 'row',
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
    await waitFor(() => expect(overlayName(canvasElement)).toBe('Driveway'))
    await expect(overlayState(canvasElement)).toBeNull()
    await expect(liveBadge(canvasElement)).toBe('LIVE')
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
 * An entity id that is not in the store. `useEntity` cannot tell "not loaded
 * yet" from "does not exist", so the card holds its skeleton indefinitely
 * rather than reporting the entity as missing.
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
