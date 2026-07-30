import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { MediaPlayerCard } from '.'
import { asUnavailable, createMediaPlayerEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../../.storybook/decorators'

const entityId = 'media_player.living_room_speaker'

type MediaPlayerCardStoryProps = ComponentProps<typeof MediaPlayerCard> & GridCellArgs

/**
 * The four canonical states × the four tiers × the option surface.
 *
 * The assertions below run: `src/__tests__/stories.test.tsx` composes every
 * story and executes its `play` function as part of `npm test`. This docblock
 * used to say the opposite — that nothing executed them and they were kept as
 * documentation — and six of them were wrong at the time it said so.
 */
const meta: Meta<MediaPlayerCardStoryProps> = {
  title: 'Cards/MediaPlayerCard',
  component: MediaPlayerCard,
  decorators: [withGridCell],
  argTypes: gridCellArgTypes,
  args: {
    entityId,
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
/**
 * The transport cluster's own pills, by the group the card puts them in.
 *
 * Scoped to that group rather than to every `.liebe-pill` on the card: the mute
 * toggle is a pill too, and it belongs to the volume presentation. Reading them
 * all made every exact-list assertion below wrong the moment mute arrived — and
 * nothing noticed, because until the story runner (docs/changes/0040-test-
 * harness-reliability.md) nothing executed them.
 */
const transport = (canvasElement: HTMLElement) => {
  const group = canvasElement.querySelector('[role="group"][aria-label="Media controls"]')
  return [...(group?.querySelectorAll('.liebe-pill') ?? [])].map((pill) =>
    pill.getAttribute('aria-label')
  )
}

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
  args: { gridWidth: 1, gridHeight: 1 },
  play: async ({ canvasElement }) => {
    await expect(nameLine(canvasElement)).toBe('Living Room Speaker')
    await expect(stateLine(canvasElement)).toBe('Espresso Bongo — Jimmy Smith')
    await expect(transport(canvasElement)).toEqual([])
  },
}

/** 2×1: the compact media row — one play/pause button, no prev/next. */
export const RowCompact: Story = {
  args: { gridWidth: 2, gridHeight: 1 },
  play: async ({ canvasElement }) => {
    await expect(nameLine(canvasElement)).toBe('Espresso Bongo')
    await expect(transport(canvasElement)).toEqual(['Pause'])
  },
}

/** 4×1: the option doc's "full transport row" — the cluster appears at ≥4 wide. */
export const RowWide: Story = {
  args: { gridWidth: 4, gridHeight: 1 },
  play: async ({ canvasElement }) => {
    await expect(transport(canvasElement)).toEqual(['Previous track', 'Pause', 'Next track'])
  },
}

/** 1×3: unspecified for this card, so it renders the `glance` layout. */
export const Tall: Story = {
  args: { gridWidth: 1, gridHeight: 3 },
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
  args: { gridWidth: 2, gridHeight: 1 },
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
  args: { gridWidth: 1, gridHeight: 1 },
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
  args: { gridWidth: 1, gridHeight: 1 },
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

/* ------------------------------------------------------------------ *
 * Volume, source, progress and background artwork (PR 2)
 * ------------------------------------------------------------------ */

/** PAUSE | VOLUME_SET | VOLUME_MUTE | PLAY — a speaker with a real slider. */
const VOLUME_SLIDER = 1 | 4 | 8 | 16384
/** PAUSE | VOLUME_STEP | PLAY — the player that can only step. */
const VOLUME_STEP_ONLY = 1 | 1024 | 16384
/** PAUSE | VOLUME_MUTE | PLAY — mute and nothing else. */
const VOLUME_MUTE_ONLY = 1 | 8 | 16384
/** PAUSE | SELECT_SOURCE | PLAY */
const SOURCE = 1 | 2048 | 16384
/** PAUSE | SEEK | PLAY */
const SEEKABLE = 1 | 2 | 16384

const volumeSlider = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('[role="slider"][aria-label="Volume"]')

/** The default: a slider with its mute toggle. */
export const VolumeSlider: Story = {
  parameters: {
    liebe: {
      entities: [
        createMediaPlayerEntity({
          attributes: { supported_features: VOLUME_SLIDER, volume_level: 0.42 },
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(volumeSlider(canvasElement)).toHaveAttribute('aria-valuetext', '42%')
  },
}

/**
 * The automatic degradation: this player advertises only `VOLUME_STEP`, so it
 * gets steppers even though the stored option still says `slider`.
 */
export const VolumeDegradesToButtons: Story = {
  parameters: {
    liebe: {
      entities: [createMediaPlayerEntity({ attributes: { supported_features: VOLUME_STEP_ONLY } })],
      itemConfig: { showVolume: 'slider' },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(volumeSlider(canvasElement)).toBeNull()
    await expect(within(canvasElement).getByLabelText('Volume up')).toBeInTheDocument()
  },
}

/** Further down the ladder: a player advertising only `VOLUME_MUTE`. */
export const VolumeMuteOnly: Story = {
  parameters: {
    liebe: {
      entities: [createMediaPlayerEntity({ attributes: { supported_features: VOLUME_MUTE_ONLY } })],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(volumeSlider(canvasElement)).toBeNull()
    await expect(within(canvasElement).getByLabelText('Mute')).toBeInTheDocument()
  },
}

/** The wide row — the only `row` form that carries volume at all. */
export const RowWideWithVolume: Story = {
  args: { gridWidth: 4, gridHeight: 1 },
  parameters: {
    liebe: {
      entities: [createMediaPlayerEntity({ attributes: { supported_features: VOLUME_SLIDER } })],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(volumeSlider(canvasElement)).not.toBeNull()
  },
}

export const SourcePicker: Story = {
  parameters: {
    liebe: {
      entities: [
        createMediaPlayerEntity({ attributes: { supported_features: SOURCE, source: 'Radio' } }),
      ],
      itemConfig: { showSourcePicker: true },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('Source')).toBeInTheDocument()
  },
}

/** Display-only: this player exposes a duration but no `SEEK` bit. */
export const ProgressReadOnly: Story = {
  parameters: {
    liebe: {
      entities: [
        createMediaPlayerEntity({
          state: 'paused',
          attributes: { supported_features: 1 | 16384, media_duration: 254, media_position: 37 },
        }),
      ],
      itemConfig: { showProgress: true },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[role="progressbar"]')).not.toBeNull()
  },
}

/** Seekable: the same session on a player that advertises `SEEK`. */
export const ProgressSeekable: Story = {
  parameters: {
    liebe: {
      entities: [
        createMediaPlayerEntity({
          state: 'paused',
          attributes: { supported_features: SEEKABLE, media_duration: 254, media_position: 37 },
        }),
      ],
      itemConfig: { showProgress: true },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[role="slider"][aria-label="Seek"]')).not.toBeNull()
  },
}

/** The showcase layout: full-bleed artwork under a scrim, controls over it. */
export const BackgroundArtwork: Story = {
  parameters: {
    liebe: {
      entities: [createMediaPlayerEntity({ attributes: { supported_features: VOLUME_SLIDER } })],
      itemConfig: { artworkMode: 'background', showProgress: true },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.liebe-media-backdrop')).not.toBeNull()
    await expect(canvasElement.querySelector('.liebe-media-scrim')).not.toBeNull()
  },
}

/** The same card at 2×1: background degrades to the thumbnail, option unchanged. */
export const BackgroundDegradesOnResize: Story = {
  args: { gridWidth: 2, gridHeight: 1 },
  parameters: {
    liebe: {
      entities: [createMediaPlayerEntity()],
      itemConfig: { artworkMode: 'background' },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.liebe-media-backdrop')).toBeNull()
    await expect(canvasElement.querySelector('img.liebe-media-artwork')).not.toBeNull()
  },
}

/**
 * Background artwork with the source picker — the densest thing `full` renders
 * over a photograph, and the one combination no story covered.
 *
 * It exists because that gap is why nobody saw the defect it now shows: the
 * `Select.Trigger` is a Radix control, so it colours itself from a Radix scale
 * and reads none of the foreground tokens the artwork scope overrides. In light
 * appearance it renders dark-on-dark over the scrim. Measured and tracked as a
 * task on docs/changes/0030-weather-forecast-legibility.md; the fix is an
 * appearance-scoping decision under the design-system scrim rule, not a
 * per-control override.
 */
export const BackgroundArtworkWithSourcePicker: Story = {
  parameters: {
    liebe: {
      entities: [
        createMediaPlayerEntity({
          attributes: { supported_features: VOLUME_SLIDER | SOURCE, source: 'Radio' },
        }),
      ],
      itemConfig: { artworkMode: 'background', showSourcePicker: true },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.liebe-media-scrim')).not.toBeNull()
    await expect(within(canvasElement).getByLabelText('Source')).toBeInTheDocument()
  },
}

/** Everything at once — the densest `full` card this option surface allows. */
export const FullyLoaded: Story = {
  args: { gridWidth: 4, gridHeight: 4 },
  parameters: {
    liebe: {
      entities: [
        createMediaPlayerEntity({
          attributes: {
            supported_features: 1 | 2 | 4 | 8 | 16 | 32 | 128 | 2048 | 16384,
            media_duration: 254,
            media_position: 37,
          },
        }),
      ],
      itemConfig: { showProgress: true, showSourcePicker: true },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(transport(canvasElement)).toEqual(['Previous track', 'Pause', 'Next track'])
    await expect(volumeSlider(canvasElement)).not.toBeNull()
    await expect(within(canvasElement).getByLabelText('Source')).toBeInTheDocument()
  },
}
