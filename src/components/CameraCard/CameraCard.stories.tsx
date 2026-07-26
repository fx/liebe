import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
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
    size: { control: { type: 'inline-radio' }, options: ['small', 'medium', 'large'] },
  },
  args: {
    entityId,
    size: 'medium',
    gridWidth: 4,
    gridHeight: 3,
  },
  parameters: {
    liebe: { entities: [camera('idle')] },
  },
}

export default meta
type Story = StoryObj<CameraCardStoryProps>

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
}

/**
 * `recording` gets its own pill, ranked above streaming — as does an entity
 * reporting `streaming` while frames are flowing, which resolves to the same
 * pill.
 */
export const Recording: Story = {
  parameters: { liebe: { entities: [camera('recording')] } },
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
export const MissingEntity: Story = {
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
