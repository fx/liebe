import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CameraCard } from './index'
import { asUnavailable, createCameraEntity } from '~/test/fixtures'
import type { GridItem } from '~/store/types'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../../.storybook/decorators'

const entityId = 'camera.driveway'

/**
 * A stand-in camera frame.
 *
 * The workshop is not an HA frontend, so `ensureHaElement` can never define
 * `<ha-camera-stream>` — every camera story therefore renders the card's
 * still-image fallback, which is exactly the path a standalone dev server
 * takes. An inline data URI keeps that path network-free: the real
 * `/api/camera_proxy/...` URL would 404 and collapse straight to the
 * "no image" placeholder (see the `NoSnapshot` story for that state).
 */
const MOCK_FRAME =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
       <defs>
         <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0%" stop-color="#2b3a4a"/>
           <stop offset="100%" stop-color="#0e1418"/>
         </linearGradient>
       </defs>
       <rect width="320" height="180" fill="url(#g)"/>
       <rect x="0" y="128" width="320" height="52" fill="#1b2530"/>
       <circle cx="248" cy="52" r="22" fill="#f2d492" opacity="0.85"/>
       <path d="M0 128 L96 92 L168 128 Z" fill="#141c24"/>
     </svg>`
  )

function withSnapshot(state: string) {
  return createCameraEntity({ state, attributes: { entity_picture: MOCK_FRAME } })
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
    liebe: { entities: [withSnapshot('idle')] },
  },
}

export default meta
type Story = StoryObj<CameraCardStoryProps>

/**
 * Resting state: the camera is idle, so the pill reads `IDLE` over the latest
 * snapshot. A camera has no on/off pair — idle and streaming are its
 * equivalent representative states.
 */
export const Idle: Story = {
  parameters: { liebe: { entities: [withSnapshot('idle')] } },
}

/** The active state: a streaming camera tints the shell blue. */
export const Streaming: Story = {
  parameters: { liebe: { entities: [withSnapshot('streaming')] } },
}

/** `recording` gets its own pill, ranked above streaming. */
export const Recording: Story = {
  parameters: { liebe: { entities: [withSnapshot('recording')] } },
}

/**
 * No snapshot to fall back on: without `entity_picture` (or when the request
 * fails) the fallback shows its labelled placeholder icon instead of a broken
 * image.
 */
export const NoSnapshot: Story = {
  parameters: {
    liebe: {
      entities: [createCameraEntity({ state: 'idle', attributes: { entity_picture: undefined } })],
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
    liebe: {
      entities: [createCameraEntity({ state: 'idle', attributes: { supported_features: 0 } })],
    },
  },
}

/** `fit: 'contain'` letterboxes the frame instead of cropping it. */
export const ContainFit: Story = {
  args: { item: cameraItem({ fit: 'contain' }) },
  parameters: { liebe: { entities: [withSnapshot('streaming')] } },
}

/** `matting: 'none'` drops the card padding so the frame is edge to edge. */
export const NoMatting: Story = {
  args: { item: cameraItem({ matting: 'none' }) },
  parameters: { liebe: { entities: [withSnapshot('streaming')] } },
}

/** An unavailable camera keeps the last frame but reports `UNAVAILABLE`. */
export const Unavailable: Story = {
  parameters: { liebe: { entities: [asUnavailable(withSnapshot('idle'))] } },
}

export const Loading: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [], initialLoading: true } },
}

/**
 * The card reaches no service-call error (it calls no services), so its error
 * story is the disconnected state it reaches through `useEntity`.
 */
export const Disconnected: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [withSnapshot('idle')], connected: false } },
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
  parameters: { liebe: { entities: [withSnapshot('idle')], mode: 'edit' } },
}
