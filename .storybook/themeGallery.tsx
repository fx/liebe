import { createElement, type CSSProperties } from 'react'
import { Flex, Heading, Text, Theme } from '@radix-ui/themes'
import { getCardForDomain } from '~/components/cardRegistry'
import {
  createAllDomainEntities,
  createBinarySensorEntity,
  createClimateEntity,
  createCoverEntity,
  createFanEntity,
  createInputNumberEntity,
  createInputSelectEntity,
  createLightEntity,
  createSensorEntity,
  createSwitchEntity,
  createWeatherEntity,
  asUnavailable,
} from '~/test/fixtures'
import type { HassEntity } from '~/store/entityTypes'
import { gridCellSize } from './decorators'

/**
 * The theme gallery — the permanent visual acceptance surface for a built-in
 * theme (docs/changes/0013-built-in-themes.md, "Testing Requirements": "Each
 * theme MUST get a gallery story (mixed representative cards)").
 *
 * One mixed screenful of real cards, dispatched through the real card registry
 * and rendered in real grid cells, so what the gallery shows is what the panel
 * renders. The theme itself is not applied here: the preview's `withProviders`
 * decorator injects whichever theme the toolbar selects, so a gallery story
 * only has to pick its appearance and let the engine do the rest.
 *
 * Lives in `.storybook/` rather than beside the components, like
 * `anatomyStage.tsx`: workshop furniture, excluded from the panel bundle and
 * from the coverage denominator along with the rest of the config.
 */

/** Cell geometry for one gallery tile, in grid columns/rows. */
interface GalleryTile {
  entity: HassEntity
  width: number
  height: number
}

/**
 * The cards a gallery shows, in reading order.
 *
 * A deliberate spread rather than every domain: an active tinted card and an
 * inactive one (the two halves of the tint pattern), a card with an embedded
 * slider, one with pills, a big numeric readout, a card that paints its own
 * background (weather), and an unavailable card — between them they exercise
 * every surface token a theme can move. Cameras are left out: their tile is a
 * video stream, which says nothing about a theme and needs the stream mock.
 */
function galleryTiles(): GalleryTile[] {
  return [
    { entity: createLightEntity(), width: 3, height: 2 },
    { entity: createClimateEntity(), width: 3, height: 2 },
    { entity: createSensorEntity(), width: 2, height: 2 },
    { entity: createCoverEntity(), width: 3, height: 2 },
    { entity: createFanEntity(), width: 3, height: 2 },
    { entity: createSwitchEntity(), width: 2, height: 2 },
    { entity: createWeatherEntity(), width: 4, height: 3 },
    { entity: createInputSelectEntity(), width: 3, height: 2 },
    { entity: createInputNumberEntity(), width: 3, height: 2 },
    { entity: createBinarySensorEntity(), width: 2, height: 2 },
    {
      // A second light, so the gallery shows the unavailable treatment beside a
      // live one. Renamed as well as re-identified: the fixture's friendly name
      // is what the card renders, so reusing it unchanged would put two
      // "Living Room" tiles on screen.
      entity: asUnavailable(
        createLightEntity({
          entity_id: 'light.porch',
          attributes: { friendly_name: 'Porch' },
        })
      ),
      width: 2,
      height: 2,
    },
  ]
}

/**
 * Every entity a gallery story needs seeded, including the unavailable
 * stand-in — handed to the story's `liebe.entities` parameter.
 *
 * `createAllDomainEntities` is folded in so a gallery still renders if the tile
 * list and the fixture set drift apart; the extra entities are simply not
 * placed.
 */
export function galleryEntities(): HassEntity[] {
  const tiles = galleryTiles().map((tile) => tile.entity)
  const placed = new Set(tiles.map((entity) => entity.entity_id))
  return [...tiles, ...createAllDomainEntities().filter((e) => !placed.has(e.entity_id))]
}

/**
 * One card in a cell sized the way the real grid would size it.
 *
 * `createElement` rather than `<Card …>`, exactly as `GridView` does it: the
 * component comes out of the registry at render time, and JSX on a
 * locally-bound component is what `react-hooks/static-components` flags.
 */
function GalleryCell({ entity, width, height }: GalleryTile) {
  const domain = entity.entity_id.split('.')[0]
  const card = getCardForDomain(domain)
  const size = gridCellSize(width, height)

  if (!card) return null

  return (
    <div className="grid-item" style={{ display: 'grid', width: size.width, height: size.height }}>
      {createElement(card, { entityId: entity.entity_id, size: 'medium' })}
    </div>
  )
}

export interface ThemeGalleryProps {
  /**
   * Caption above the cards. Gallery stories that render both appearances at
   * once use it to name each pane.
   */
  title?: string
  /**
   * How many `liebe-section` blocks to spread the cards across. One by default,
   * which is what a screen renders today.
   *
   * More than one exists for the themes that style sections as a series — LCARS
   * alternates its bar colours and numbers each section from a CSS counter, and
   * neither is reviewable against a single section.
   */
  sections?: number
}

/**
 * The tiles split into `count` roughly equal, contiguous groups.
 *
 * The count is normalised rather than trusted: it reaches here from a story
 * arg, and a zero or a fraction would divide the tile list into no sections at
 * all — a gallery that renders nothing, which reads as a broken theme rather
 * than as a bad argument. It is clamped at the top end for the mirror-image
 * reason: a Storybook control can be dragged to any number, and more sections
 * than there are tiles would stamp empty `.liebe-section` blocks — a frame
 * around nothing, and arbitrarily much of it.
 *
 * The remainder is spread across the leading sections rather than piled into
 * the last one, so no section comes out empty at any count within the clamp.
 * Eleven tiles across three sections is 4/4/3, which is what the LCARS
 * section-frame story has always rendered.
 */
function tileSections(count: number): GalleryTile[][] {
  const tiles = galleryTiles()
  const requested = Number.isFinite(count) ? Math.floor(count) : 1
  // `|| 1` keeps the floor at one section if the tile list is ever empty:
  // one empty frame, rather than no render and a division by zero.
  const sections = Math.max(1, Math.min(requested, tiles.length || 1))
  const perSection = Math.floor(tiles.length / sections)
  const remainder = tiles.length % sections

  return Array.from({ length: sections }, (_, index) => {
    const start = index * perSection + Math.min(index, remainder)
    return tiles.slice(start, start + perSection + (index < remainder ? 1 : 0))
  })
}

/**
 * A screenful of mixed cards on the dashboard ground.
 *
 * The ground is painted from `--liebe-bg` exactly as `src/styles/app.css`
 * paints it — with `background`, not `background-color`, because a theme is
 * allowed to make the wallpaper a gradient and Liquid Glass does. Without this
 * the cards would float on the preview's flat backdrop and the whole point of a
 * glass theme (what is behind the glass) would be invisible.
 *
 * The two structural hooks of the stable selector contract are stamped here the
 * way the panel stamps them — `liebe-screen` on the surface a screen renders
 * into (`Dashboard`), `liebe-section` on the container of its cards
 * (`GridLayoutSection`) — so a theme that frames the console (LCARS) is
 * reviewable in the workshop rather than only in a running panel. Themes that
 * write no rule against them, which is Default and Liquid Glass, render exactly
 * as they did before the hooks existed.
 *
 * The gallery's own padding sits on the inner stack rather than on the screen,
 * because an inline declaration outranks every cascade layer: on the screen
 * element it would silently eat the gutter a theme reserves for its frame. It is
 * a literal rather than `--liebe-card-padding` for the same reason — the inset
 * is the gallery's own chrome, and a theme that pads its cards generously (LCARS
 * pads a card's left edge to clear its colour cap) should not have that inset
 * repeated around the whole screenful. 14px is what the token resolves to under
 * both `both`-appearance themes, so the existing galleries are unchanged.
 */
export function ThemeGallery({ title, sections = 1 }: ThemeGalleryProps) {
  const { gapX } = gridCellSize(1, 1)

  return (
    <div
      className="liebe-screen"
      style={{ background: 'var(--liebe-bg)', borderRadius: 'var(--liebe-card-radius)' }}
    >
      <Flex direction="column" gap="3" style={{ color: 'var(--liebe-fg)', padding: '14px' }}>
        {title ? (
          <Heading as="h2" size="4">
            {title}
          </Heading>
        ) : null}
        {tileSections(sections).map((tiles, index) => (
          <Flex
            // Sections have no identity of their own — they are a slice of one
            // fixed list, in a fixed order, and never reorder.
            key={index}
            className="liebe-section"
            wrap="wrap"
            align="start"
            style={{ '--liebe-grid-gap': `${gapX}px`, gap: gapX } as CSSProperties}
          >
            {tiles.map((tile) => (
              <GalleryCell key={tile.entity.entity_id} {...tile} />
            ))}
          </Flex>
        ))}
        <Text size="1" style={{ color: 'var(--liebe-muted)' }}>
          Cards are dispatched through the real card registry and read the entity store, so this is
          the panel&rsquo;s own rendering under the theme selected in the toolbar.
        </Text>
      </Flex>
    </div>
  )
}

/**
 * Both appearances in one view — the review surface a `both`-appearance theme
 * has to be judged on, since a token set is only right if it is right in dark
 * and light.
 *
 * Stacked rather than columned, unlike the anatomy stories' `AppearanceSplit`:
 * a gallery is a whole screenful of cards at real grid widths, and halving that
 * would reflow every tile into a layout the panel never produces — which is
 * exactly what the gallery exists to show. Full width each, one above the
 * other.
 *
 * Each pane is its own Radix `Theme`, which is the element the `--liebe-*`
 * tokens are declared on, so the two resolve independently of the toolbar's
 * appearance rather than sharing it.
 */
export function ThemeGallerySplit() {
  return (
    <Flex direction="column" gap="4">
      {(['dark', 'light'] as const).map((appearance) => (
        <Theme key={appearance} appearance={appearance} style={{ minWidth: 0 }}>
          <ThemeGallery title={appearance === 'dark' ? 'Dark' : 'Light'} />
        </Theme>
      ))}
    </Flex>
  )
}
