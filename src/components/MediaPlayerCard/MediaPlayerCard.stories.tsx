import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { MediaPlayerCard } from '.'
import { asUnavailable, createMediaPlayerEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../../.storybook/decorators'

const entityId = 'media_player.living_room_speaker'

type MediaPlayerCardStoryProps = ComponentProps<typeof MediaPlayerCard> & GridCellArgs

/**
 * The four canonical states × the four tiers × the option values PR 1 ships.
 *
 * Every story asserts rather than merely rendering: the tier matrix is the point
 * of this file, and a tier layout that silently stopped rendering its transport
 * cluster would still look like a card in a snapshot.
 */
const meta: Meta<MediaPlayerCardStoryProps> = {
  title: 'Cards/MediaPlayerCard',
  component: MediaPlayerCard,
  decorators: [withGridCell],
  argTypes: {
    ...gridCellArgTypes,
    tier: { control: { type: 'inline-radio' }, options: ['glance', 'row', 'tall', 'full'] },
  },
  args: {
    entityId,
    tier: 'full',
    span: { width: 2, height: 2 },
    gridWidth: 3,
    gridHeight: 3,
  },
  parameters: {
    liebe: { entities: [createMediaPlayerEntity()] },
  },
}

export default meta
type Story = StoryObj<MediaPlayerCardStoryProps>

/** Feature masks, as sums of the bits Home Assistant publishes. */
const FEATURES = {
  /** PAUSE | PREVIOUS_TRACK | NEXT_TRACK | TURN_ON | PLAY */
  full: 1 | 16 | 32 | 128 | 16384,
  /** PAUSE | PLAY — a receiver with no track concept. */
  playPauseOnly: 1 | 16384,
  /** PLAY only — the entity that makes a playing card's tap inert. */
  playOnly: 16384,
}

const nameLine = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('.liebe-name')?.textContent ?? ''
const stateLine = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('.liebe-state')?.textContent ?? ''
const artwork = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('img.liebe-media-artwork')
const iconCircle = (canvasElement: HTMLElement) => canvasElement.querySelector('.liebe-icon')
const transport = (canvasElement: HTMLElement) =>
  [...canvasElement.querySelectorAll('.liebe-pill')].map((pill) => pill.getAttribute('aria-label'))

/* ------------------------------------------------------------------ *
 * The four canonical states
 * ------------------------------------------------------------------ */

/** Mid-track, full-featured: artwork, both track lines, the whole cluster. */
export const Playing: Story = {
  play: async ({ canvasElement }) => {
    await expect(nameLine(canvasElement)).toBe('Espresso Bongo')
    await expect(stateLine(canvasElement)).toBe('Jimmy Smith')
    await expect(artwork(canvasElement)).not.toBeNull()
    await expect(transport(canvasElement)).toEqual(['Previous track', 'Pause', 'Next track'])
    // The active tint, which the option doc ties to `playing`.
    await expect(canvasElement.querySelector('.liebe-card')).toHaveAttribute('data-color', 'media')
  },
}

/** Paused: the same surface, with the play glyph and no tint. */
export const Paused: Story = {
  parameters: { liebe: { entities: [createMediaPlayerEntity({ state: 'paused' })] } },
  play: async ({ canvasElement }) => {
    await expect(transport(canvasElement)).toEqual(['Previous track', 'Play', 'Next track'])
    await expect(canvasElement.querySelector('.liebe-card')).toHaveAttribute(
      'data-color',
      'default'
    )
  },
}

/** Idle: nothing playing, so the state line falls back down the chain. */
export const Idle: Story = {
  parameters: {
    liebe: {
      entities: [
        createMediaPlayerEntity({
          state: 'idle',
          attributes: {
            media_title: undefined,
            media_artist: undefined,
            app_name: undefined,
            entity_picture: undefined,
          },
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(nameLine(canvasElement)).toBe('Living Room Speaker')
    await expect(stateLine(canvasElement)).toBe('idle')
    await expect(iconCircle(canvasElement)).not.toBeNull()
  },
}

/** Off: the tap becomes `turn_on`, and the button shows the power glyph. */
export const Off: Story = {
  parameters: {
    liebe: {
      entities: [
        createMediaPlayerEntity({
          state: 'off',
          attributes: { media_title: undefined, entity_picture: undefined },
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(transport(canvasElement)).toEqual(['Previous track', 'Turn on', 'Next track'])
  },
}

/* ------------------------------------------------------------------ *
 * Tiers
 * ------------------------------------------------------------------ */

/** 1×1: artwork, name and the compact one-line state. No embedded controls. */
export const Glance: Story = {
  args: { tier: 'glance', span: { width: 1, height: 1 }, gridWidth: 1, gridHeight: 1 },
  play: async ({ canvasElement }) => {
    await expect(nameLine(canvasElement)).toBe('Living Room Speaker')
    await expect(stateLine(canvasElement)).toBe('Espresso Bongo — Jimmy Smith')
    await expect(transport(canvasElement)).toEqual([])
  },
}

/** 2×1: the compact media row — one play/pause button, no prev/next. */
export const RowCompact: Story = {
  args: { tier: 'row', span: { width: 2, height: 1 }, gridWidth: 2, gridHeight: 1 },
  play: async ({ canvasElement }) => {
    await expect(nameLine(canvasElement)).toBe('Espresso Bongo')
    await expect(transport(canvasElement)).toEqual(['Pause'])
  },
}

/** 4×1: the option doc's "full transport row" — the cluster appears at ≥4 wide. */
export const RowWide: Story = {
  args: { tier: 'row', span: { width: 4, height: 1 }, gridWidth: 4, gridHeight: 1 },
  play: async ({ canvasElement }) => {
    await expect(transport(canvasElement)).toEqual(['Previous track', 'Pause', 'Next track'])
  },
}

/** 1×3: unspecified for this card, so it renders the `glance` layout. */
export const Tall: Story = {
  args: { tier: 'tall', span: { width: 1, height: 3 }, gridWidth: 1, gridHeight: 3 },
  play: async ({ canvasElement }) => {
    await expect(nameLine(canvasElement)).toBe('Living Room Speaker')
    await expect(stateLine(canvasElement)).toBe('Espresso Bongo — Jimmy Smith')
    await expect(transport(canvasElement)).toEqual([])
  },
}

/* ------------------------------------------------------------------ *
 * Options and gating
 * ------------------------------------------------------------------ */

/** `artworkMode: none` — always the icon circle, never the picture. */
export const ArtworkNone: Story = {
  parameters: {
    liebe: { entities: [createMediaPlayerEntity()], itemConfig: { artworkMode: 'none' } },
  },
  play: async ({ canvasElement }) => {
    await expect(artwork(canvasElement)).toBeNull()
    await expect(iconCircle(canvasElement)).not.toBeNull()
  },
}

/** No `entity_picture` at all: the icon circle stands in automatically. */
export const ArtworkMissing: Story = {
  parameters: {
    liebe: { entities: [createMediaPlayerEntity({ attributes: { entity_picture: undefined } })] },
  },
  play: async ({ canvasElement }) => {
    await expect(artwork(canvasElement)).toBeNull()
    await expect(iconCircle(canvasElement)).not.toBeNull()
  },
}

/**
 * `background` degrades to the thumbnail — required below `full` by the option
 * doc, and everywhere in this build because the full-bleed form is PR 2.
 */
export const ArtworkBackgroundDegrades: Story = {
  args: { tier: 'row', span: { width: 2, height: 1 }, gridWidth: 2, gridHeight: 1 },
  parameters: {
    liebe: { entities: [createMediaPlayerEntity()], itemConfig: { artworkMode: 'background' } },
  },
  play: async ({ canvasElement }) => {
    await expect(artwork(canvasElement)).not.toBeNull()
  },
}

/**
 * The option doc's gating scenario: an entity with PLAY/PAUSE but neither track
 * bit shows only play/pause — no disabled prev/next.
 */
export const TransportGated: Story = {
  parameters: {
    liebe: {
      entities: [
        createMediaPlayerEntity({ attributes: { supported_features: FEATURES.playPauseOnly } }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(transport(canvasElement)).toEqual(['Pause'])
  },
}

/**
 * Playing without `PAUSE`: the button is absent, exactly where the body tap is
 * inert. Both ask the one resolver, so they can never disagree.
 */
export const PlayingWithoutPause: Story = {
  parameters: {
    liebe: {
      entities: [
        createMediaPlayerEntity({ attributes: { supported_features: FEATURES.playOnly } }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(transport(canvasElement)).toEqual([])
  },
}

/** `showTransport: false` hides the cluster the entity could otherwise drive. */
export const TransportHidden: Story = {
  parameters: {
    liebe: { entities: [createMediaPlayerEntity()], itemConfig: { showTransport: false } },
  },
  play: async ({ canvasElement }) => {
    await expect(transport(canvasElement)).toEqual([])
  },
}

/**
 * `collapseWhenIdle` on an idle player: icon, name and state only — and the tile
 * keeps its 2×2 span, so neighbours never reflow when a speaker goes quiet.
 */
export const CollapsedWhenIdle: Story = {
  parameters: {
    liebe: {
      entities: [createMediaPlayerEntity({ state: 'idle' })],
      itemConfig: { collapseWhenIdle: true },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(artwork(canvasElement)).toBeNull()
    await expect(iconCircle(canvasElement)).not.toBeNull()
    await expect(transport(canvasElement)).toEqual([])
    await expect(nameLine(canvasElement)).toBe('Living Room Speaker')
    await expect(canvasElement.querySelector('.liebe-card')).toHaveAttribute('data-tier', 'full')
  },
}

/** A TV with no track metadata: the state line falls back to `app_name`. */
export const AppNameFallback: Story = {
  args: { tier: 'glance', span: { width: 1, height: 1 }, gridWidth: 1, gridHeight: 1 },
  parameters: {
    liebe: {
      entities: [
        createMediaPlayerEntity({
          attributes: { media_title: undefined, media_artist: undefined, app_name: 'Netflix' },
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(stateLine(canvasElement)).toBe('Netflix')
  },
}

/** A receiver publishing nothing at all: the chain reaches the raw state. */
export const RawStateFallback: Story = {
  args: { tier: 'glance', span: { width: 1, height: 1 }, gridWidth: 1, gridHeight: 1 },
  parameters: {
    liebe: {
      entities: [
        createMediaPlayerEntity({
          state: 'on',
          attributes: {
            media_title: undefined,
            media_artist: undefined,
            app_name: undefined,
            entity_picture: undefined,
          },
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(nameLine(canvasElement)).toBe('Living Room Speaker')
    await expect(stateLine(canvasElement)).toBe('on')
  },
}

export const Unavailable: Story = {
  parameters: { liebe: { entities: [asUnavailable(createMediaPlayerEntity())] } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('UNAVAILABLE')).toBeInTheDocument()
  },
}
