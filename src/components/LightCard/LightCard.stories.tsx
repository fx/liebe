import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { LightCard } from './index'
import { asUnavailable, createLightEntity } from '~/test/fixtures'
import type { GridItem } from '~/store/types'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../../.storybook/decorators'

const entityId = 'light.living_room'

type LightCardStoryProps = ComponentProps<typeof LightCard> & GridCellArgs

const meta: Meta<LightCardStoryProps> = {
  title: 'Cards/LightCard',
  component: LightCard,
  decorators: [withGridCell],
  argTypes: gridCellArgTypes,
  args: {
    entityId,
    gridWidth: 2,
    gridHeight: 1,
  },
  parameters: {
    liebe: { entities: [createLightEntity()] },
  },
}

export default meta
type Story = StoryObj<LightCardStoryProps>

/** Resting state. Clicking the card calls `light.turn_on`. */
export const Off: Story = {
  parameters: {
    liebe: { entities: [createLightEntity({ state: 'off', attributes: { brightness: 0 } })] },
  },
}

/** Active state with the brightness slider — dragging commits `light.turn_on`. */
export const On: Story = {
  parameters: { liebe: { entities: [createLightEntity()] } },
}

/** A light without `supported_color_modes` renders no brightness control. */
export const OnWithoutBrightness: Story = {
  parameters: {
    liebe: {
      entities: [
        createLightEntity({
          attributes: { supported_color_modes: ['onoff'], supported_features: 0, brightness: 255 },
        }),
      ],
    },
  },
}

export const Unavailable: Story = {
  parameters: { liebe: { entities: [asUnavailable(createLightEntity())] } },
}

/** First load: the store is still filling, so the card shows its skeleton. */
export const Loading: Story = {
  parameters: { liebe: { entities: [], initialLoading: true } },
}

/**
 * The card's reachable error state: every service call fails, so toggling the
 * light surfaces `ERROR`. `HassService` retries three times with 1s/2s/4s
 * backoff, so the error appears a few seconds after the click.
 */
export const ServiceCallFailure: Story = {
  parameters: {
    liebe: {
      entities: [createLightEntity({ state: 'off' })],
      serviceCall: 'error',
      serviceCallError: 'light.turn_on is not available',
    },
  },
}

/** Connection lost — the card falls back to the disconnected error display. */
export const Disconnected: Story = {
  parameters: { liebe: { entities: [createLightEntity()], connected: false } },
}

/**
 * An entity id that is not in the store, on a live connection whose snapshot has
 * already landed — a card left pointing at an entity that was renamed or
 * removed. The card reports it missing and names it, rather than holding a
 * skeleton that reads as progress towards a load that will never finish
 * (docs/specs/entity-state — "Consumer Hooks").
 */
export const UnknownEntity: Story = {
  parameters: { liebe: { entities: [] } },
}

/*
 * The universal display options on a real card, published the way the grid
 * publishes a placed item's stored options
 * (docs/specs/entity-cards/options/common.md — "Universal options"). The card
 * itself knows nothing about them: it keeps rendering its friendly name, its
 * sun glyph and its state into the shell's slots, and the shell applies what is
 * configured. Each option is shown at both/all values across these stories and
 * the shell's own gallery in `Shell/GridCard`.
 */

/** `name` — the card renders "Reading lamp" instead of the entity's own name. */
export const NamedOverride: Story = {
  parameters: {
    liebe: { entities: [createLightEntity()], itemConfig: { name: 'Reading lamp' } },
  },
}

/** `icon` — the configured glyph replaces the card's sun. */
export const IconOverride: Story = {
  parameters: {
    liebe: { entities: [createLightEntity()], itemConfig: { icon: 'Bulb' } },
  },
}

/** `hideState` — the name and the brightness slider stay, the state line goes. */
export const StateHidden: Story = {
  parameters: {
    liebe: { entities: [createLightEntity()], itemConfig: { hideState: true } },
  },
}

/**
 * `hideName` and `hideState` together: the icon-only tile the spec requires to
 * stay a valid layout. The brightness slider is a control, not a line, so it
 * stays.
 */
export const IconOnly: Story = {
  parameters: {
    liebe: {
      entities: [createLightEntity()],
      itemConfig: { hideName: true, hideState: true },
    },
  },
}

/**
 * `color` — pinned to `cool`, so the card stays sky-blue instead of taking the
 * light domain's amber.
 */
export const ColorPinned: Story = {
  parameters: {
    liebe: { entities: [createLightEntity()], itemConfig: { color: 'cool' } },
  },
}

/*
 * The light card's own options (docs/specs/entity-cards/options/light.md).
 * Unlike the universal keys above — which the shell reads out of the placed
 * item's context — these are the card's own, so the stories hand it a placed
 * `item` the way `GridView` does.
 */

/** A placed light card carrying stored options, as the grid would supply it. */
const placedLight = (config: Record<string, unknown>): GridItem => ({
  id: 'story-light',
  type: 'entity',
  entityId,
  x: 0,
  y: 0,
  width: 2,
  height: 2,
  config,
})

/**
 * `showBrightnessSlider: true` — the default. Explicit here so the option's two
 * values sit side by side in the workshop; it renders exactly like `On`.
 */
export const BrightnessSliderShown: Story = {
  args: { item: placedLight({ showBrightnessSlider: true }) },
}

/**
 * `showBrightnessSlider: false` — the slider goes, the tile keeps its toggle.
 * This is what a dashboard configured before the rename, with the legacy
 * `enableBrightness: false`, loads as: the loader rewrites the key on the way
 * in, so the card only ever sees this one.
 */
export const BrightnessSliderHidden: Story = {
  args: { item: placedLight({ showBrightnessSlider: false }) },
}

/* ------------------------------------------------------------------ *
 * `sliderPlacement` (docs/specs/entity-cards/options/common.md — "Shared
 * slider placement"; the light's own row is in options/light.md). One story per
 * value, each on the cell where that value is visible: `auto` and `vertical`
 * differ only on a wide tile, and `auto` and `horizontal` only on a tall one.
 * `background` arrives with change 0034's second task.
 * ------------------------------------------------------------------ */

/** `auto` — the tier decides, which on a 3×1 is the slider across the row. */
export const PlacementAuto: Story = {
  args: { gridWidth: 3, gridHeight: 1, item: placedLight({ sliderPlacement: 'auto' }) },
}

/** `vertical` — the same wide tile, with the dimmer stood up on its trailing edge. */
export const PlacementVertical: Story = {
  args: { gridWidth: 3, gridHeight: 1, item: placedLight({ sliderPlacement: 'vertical' }) },
}

/** `horizontal` — a 1×3 tile that would have stood the dimmer up, laid across instead. */
export const PlacementHorizontal: Story = {
  args: { gridWidth: 1, gridHeight: 3, item: placedLight({ sliderPlacement: 'horizontal' }) },
}

/**
 * `background` — the tile itself is the dimmer, edge to edge behind the body.
 * Shown at `glance`, the tier no inline placement renders in, and at `full`,
 * where the surface still consumes no layout space. The icon-only companion
 * shows the composition the contract requires: the fill IS the state tint.
 */
export const PlacementBackgroundGlance: Story = {
  args: { gridWidth: 1, gridHeight: 1, item: placedLight({ sliderPlacement: 'background' }) },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector('.liebe-slider[data-placement="background"]')
    ).toBeInTheDocument()
  },
}

export const PlacementBackgroundFull: Story = {
  args: { gridWidth: 3, gridHeight: 2, item: placedLight({ sliderPlacement: 'background' }) },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector('.liebe-slider[data-placement="background"]')
    ).toBeInTheDocument()
  },
}

export const PlacementBackgroundIconOnly: Story = {
  args: {
    gridWidth: 2,
    gridHeight: 2,
    item: placedLight({ sliderPlacement: 'background', iconOnly: true }),
  },
  parameters: {
    // The shell reads the universal keys off the placed-item context while the
    // card reads its own keys off the item prop — both routes carry the same
    // config, the way GridView supplies one.
    liebe: {
      entities: [createLightEntity()],
      itemConfig: { sliderPlacement: 'background', iconOnly: true },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.liebe-card')).toHaveAttribute(
      'data-icon-tile',
      'true'
    )
    await expect(
      canvasElement.querySelector('.liebe-slider[data-placement="background"]')
    ).toBeInTheDocument()
  },
}

/**
 * The option is inert against an entity that cannot dim — an `onoff`-only light
 * has no slider to hide, and `true` cannot conjure one (common contract,
 * convention 3).
 */
export const BrightnessSliderUnsupported: Story = {
  args: { item: placedLight({ showBrightnessSlider: true }) },
  parameters: {
    liebe: {
      entities: [createLightEntity({ attributes: { supported_color_modes: ['onoff'] } })],
    },
  },
}

/*
 * `useLightColor` (docs/specs/entity-cards/options/light.md — "Light-color
 * theming"). The option recolours existing content rather than adding any, so
 * what each story below shows is one pair of parts — the icon circle and the
 * slider fill — and every one of them asserts that the two AGREE. That is the
 * property the workshop cannot show by eye at a glance and the one most worth
 * pinning: they take the same colour from different places.
 */

/** The inline custom property a data-driven hue produces, or `''` when there is none. */
const partHue = (canvasElement: HTMLElement, selector: string) =>
  (canvasElement.querySelector(selector) as HTMLElement | null)?.style.getPropertyValue(
    '--part-color'
  ) ?? null

const iconHue = (canvasElement: HTMLElement) => partHue(canvasElement, '.liebe-icon')
const sliderHue = (canvasElement: HTMLElement) => partHue(canvasElement, '.liebe-slider')

/** A colour bulb, reporting a real `rgb_color`. */
const colorBulb = (attributes: Record<string, unknown> = {}, state = 'on') =>
  createLightEntity({
    state,
    attributes: {
      supported_color_modes: ['hs', 'rgb'],
      rgb_color: [64, 120, 255],
      ...attributes,
    },
  })

/**
 * `useLightColor: true` — the default. The icon and the slider both leave the
 * amber domain token and take the bulb's blue.
 */
export const BulbColorFollowed: Story = {
  args: { item: placedLight({ useLightColor: true }) },
  parameters: { liebe: { entities: [colorBulb()] } },
  play: async ({ canvasElement }) => {
    await expect(iconHue(canvasElement)).toBe('rgb(64, 120, 255)')
    await expect(sliderHue(canvasElement)).toBe(iconHue(canvasElement))
  },
}

/**
 * `useLightColor: false` — the same bulb, reporting the same colour, held on the
 * light domain's amber. Neither part carries a data-driven hue.
 */
export const BulbColorIgnored: Story = {
  args: { item: placedLight({ useLightColor: false }) },
  parameters: { liebe: { entities: [colorBulb()] } },
  play: async ({ canvasElement }) => {
    await expect(iconHue(canvasElement)).toBe('')
    await expect(sliderHue(canvasElement)).toBe('')
  },
}

/**
 * The RGB fallback: a bulb publishing only `hs_color` still resolves to a tint,
 * derived rather than reported. Both parts get the derived value.
 */
export const BulbColorFromHue: Story = {
  args: { item: placedLight({ useLightColor: true }) },
  parameters: {
    liebe: {
      entities: [colorBulb({ rgb_color: undefined, hs_color: [120, 100] })],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(iconHue(canvasElement)).not.toBe('')
    await expect(sliderHue(canvasElement)).toBe(iconHue(canvasElement))
  },
}

/**
 * The lightness clamp. A bulb set to a very dark red would tint the active card
 * almost black — indistinguishable from inactive, at exactly the moment it is
 * most obviously on — so the tint is lifted while its hue is preserved.
 */
export const BulbColorClamped: Story = {
  args: { item: placedLight({ useLightColor: true }) },
  parameters: { liebe: { entities: [colorBulb({ rgb_color: [40, 0, 0] })] } },
  play: async ({ canvasElement }) => {
    const hue = iconHue(canvasElement)
    // Lifted well clear of the near-black it reported, and still red.
    await expect(hue).not.toBe('rgb(40, 0, 0)')
    await expect(hue).toMatch(/^rgb\(\d+, 0, 0\)$/)
    await expect(sliderHue(canvasElement)).toBe(hue)
  },
}

/**
 * The option is inert on a bulb with no colour to report: a `brightness`-only
 * light falls back to the domain token however `useLightColor` is set (common
 * contract, convention 3 — an option cannot conjure a capability).
 */
export const BulbColorUnavailable: Story = {
  args: { item: placedLight({ useLightColor: true }) },
  parameters: {
    liebe: {
      entities: [createLightEntity({ attributes: { supported_color_modes: ['brightness'] } })],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(iconHue(canvasElement)).toBe('')
    await expect(sliderHue(canvasElement)).toBe('')
  },
}

/**
 * An explicit universal `color` outranks the bulb. The card is pinned to `cool`
 * and stays there, which is the precedence the option doc requires — a named
 * value pins the active treatment predictably.
 */
export const BulbColorLosesToPinnedColor: Story = {
  args: { item: placedLight({ useLightColor: true, color: 'cool' }) },
  parameters: {
    liebe: { entities: [colorBulb()], itemConfig: { useLightColor: true, color: 'cool' } },
  },
  play: async ({ canvasElement }) => {
    await expect(iconHue(canvasElement)).toBe('')
    await expect(sliderHue(canvasElement)).toBe('')
    await expect(canvasElement.querySelector('.liebe-card')).toHaveAttribute('data-color', 'cool')
  },
}

/**
 * A light that is off carries no tint even though its colour attributes are
 * still there — Home Assistant leaves the last colour on the entity. The
 * inactive treatment is the domain token, which is what makes "on" legible.
 */
export const BulbColorWhileOff: Story = {
  args: { item: placedLight({ useLightColor: true }) },
  parameters: {
    liebe: { entities: [colorBulb({ brightness: 0 }, 'off')] },
  },
  play: async ({ canvasElement }) => {
    await expect(iconHue(canvasElement)).toBe('')
    // No slider while off, per the tier contract — so there is nothing to
    // disagree with the icon here.
    await expect(canvasElement.querySelector('.liebe-slider')).toBeNull()
  },
}

/*
 * The `full`-tier colour controls (docs/specs/entity-cards/options/light.md —
 * "Color temperature" and "Color"). Both are `full` only, so every story below
 * asks for that tier the only way it can: with a cell the decorator derives it
 * from.
 */

/** A bulb that does colour and colour temperature, with a real reported range. */
const fullColorBulb = (attributes: Record<string, unknown> = {}, state = 'on') =>
  createLightEntity({
    state,
    attributes: {
      supported_color_modes: ['color_temp', 'hs', 'rgb'],
      min_color_temp_kelvin: 2000,
      max_color_temp_kelvin: 6500,
      color_temp_kelvin: 3000,
      ...attributes,
    },
  })

/** The cell those stories are shown in; the meta's 2×1 default derives `row`. */
const FULL: Partial<LightCardStoryProps> = { gridWidth: 3, gridHeight: 2 }

const tempThumb = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('[aria-label="Colour temperature"]')
const swatchGroup = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('[role="group"][aria-label="Light colour"]')

/**
 * Both controls at rest. The temperature slider spans the range this bulb
 * reports — 2000–6500 K — and the swatch row sits beneath it.
 */
export const ColorControls: Story = {
  args: { ...FULL, item: placedLight({}) },
  parameters: { liebe: { entities: [fullColorBulb()] } },
  play: async ({ canvasElement }) => {
    await expect(tempThumb(canvasElement)).toHaveAttribute('aria-valuemin', '2000')
    await expect(tempThumb(canvasElement)).toHaveAttribute('aria-valuemax', '6500')
    await expect(swatchGroup(canvasElement)!.querySelectorAll('button')).toHaveLength(6)
  },
}

/**
 * A different bulb, a different span. The point of the story is that the two
 * numbers come from the entity rather than from Liebe — a tighter bulb gets a
 * tighter track, and nothing is hardcoded.
 */
export const ColorTempNarrowRange: Story = {
  args: { ...FULL, item: placedLight({}) },
  parameters: {
    liebe: {
      entities: [fullColorBulb({ min_color_temp_kelvin: 2700, max_color_temp_kelvin: 4000 })],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(tempThumb(canvasElement)).toHaveAttribute('aria-valuemin', '2700')
    await expect(tempThumb(canvasElement)).toHaveAttribute('aria-valuemax', '4000')
  },
}

/**
 * A `color_temp` bulb that publishes no bounds. The control is withheld rather
 * than given an invented range — the option doc's "never a hardcoded range",
 * seen from the outside.
 */
export const ColorTempWithoutRange: Story = {
  args: { ...FULL, item: placedLight({}) },
  parameters: {
    liebe: {
      entities: [
        createLightEntity({
          attributes: { supported_color_modes: ['color_temp'], color_temp_kelvin: 3000 },
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(tempThumb(canvasElement)).toBeNull()
  },
}

/** `showColorTempControl: false` — the swatches stay, the temperature slider goes. */
export const ColorTempHidden: Story = {
  args: { ...FULL, item: placedLight({ showColorTempControl: false }) },
  parameters: { liebe: { entities: [fullColorBulb()] } },
  play: async ({ canvasElement }) => {
    await expect(tempThumb(canvasElement)).toBeNull()
    await expect(swatchGroup(canvasElement)).not.toBeNull()
  },
}

/** `showColorControl: false` — the mirror image: the slider stays, the swatches go. */
export const ColorSwatchesHidden: Story = {
  args: { ...FULL, item: placedLight({ showColorControl: false }) },
  parameters: { liebe: { entities: [fullColorBulb()] } },
  play: async ({ canvasElement }) => {
    await expect(swatchGroup(canvasElement)).toBeNull()
    await expect(tempThumb(canvasElement)).not.toBeNull()
  },
}

/**
 * The swatch the bulb actually reports renders selected. Only an exact
 * `rgb_color` counts — a colour derived from `hs_color` tints the card but
 * claims no swatch.
 */
export const ColorSwatchSelected: Story = {
  args: { ...FULL, item: placedLight({}) },
  parameters: { liebe: { entities: [fullColorBulb({ rgb_color: [0, 122, 255] })] } },
  play: async ({ canvasElement }) => {
    const blue = canvasElement.querySelector('[aria-label="Blue"]')
    await expect(blue).toHaveAttribute('aria-pressed', 'true')
    await expect(canvasElement.querySelector('[aria-label="Red"]')).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  },
}

/**
 * The capability gate, from both sides in one pair of stories: a bulb that only
 * does colour temperature gets no swatches.
 */
export const ColorControlsOnTempOnlyBulb: Story = {
  args: { ...FULL, item: placedLight({}) },
  parameters: {
    liebe: {
      entities: [
        createLightEntity({
          attributes: {
            supported_color_modes: ['color_temp'],
            min_color_temp_kelvin: 2000,
            max_color_temp_kelvin: 6500,
            color_temp_kelvin: 3000,
          },
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(swatchGroup(canvasElement)).toBeNull()
    await expect(tempThumb(canvasElement)).not.toBeNull()
  },
}

/** And a colour-only bulb gets no temperature slider. */
export const ColorControlsOnColorOnlyBulb: Story = {
  args: { ...FULL, item: placedLight({}) },
  parameters: {
    liebe: {
      entities: [createLightEntity({ attributes: { supported_color_modes: ['hs', 'rgb'] } })],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(tempThumb(canvasElement)).toBeNull()
    await expect(swatchGroup(canvasElement)).not.toBeNull()
  },
}

/**
 * Neither control appears while the light is off. Setting a colour would turn
 * it on as a side effect of something that does not look like a switch — the
 * tile's own tap is what turns it on.
 */
export const ColorControlsWhileOff: Story = {
  args: { ...FULL, item: placedLight({}) },
  parameters: { liebe: { entities: [fullColorBulb({ brightness: 0 }, 'off')] } },
  play: async ({ canvasElement }) => {
    await expect(tempThumb(canvasElement)).toBeNull()
    await expect(swatchGroup(canvasElement)).toBeNull()
  },
}

/*
 * `brightnessPresets` (docs/specs/entity-cards/options/light.md — "Brightness
 * presets"). Percent values rendered as one-tap pills at `full`; the empty
 * default hides the row.
 */

const presetGroup = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('[role="group"][aria-label="Brightness presets"]')

const presetLabels = (canvasElement: HTMLElement) =>
  [...(presetGroup(canvasElement)?.querySelectorAll('button') ?? [])].map((b) => b.textContent)

/** A dimmable bulb at 50%, so one preset in the row below reads as current. */
const dimmable = (attributes: Record<string, unknown> = {}, state = 'on') =>
  createLightEntity({
    state,
    attributes: { supported_color_modes: ['brightness'], brightness: 128, ...attributes },
  })

/** Three presets, with the one matching the current 50% shown selected. */
export const BrightnessPresetsShown: Story = {
  args: { ...FULL, item: placedLight({ brightnessPresets: [20, 50, 100] }) },
  parameters: { liebe: { entities: [dimmable()] } },
  play: async ({ canvasElement }) => {
    await expect(presetLabels(canvasElement)).toEqual(['20%', '50%', '100%'])

    // 128/255 rounds to 50%, so that pill — and only that one — reads current.
    for (const button of presetGroup(canvasElement)!.querySelectorAll('button')) {
      await expect(button).toHaveAttribute(
        'aria-pressed',
        button.textContent === '50%' ? 'true' : 'false'
      )
    }
  },
}

/**
 * The row on a light that is OFF — the case the option exists for. A preset is
 * "turn on at N%", so it stays tappable, and nothing reads as current because an
 * off light has no level.
 */
export const BrightnessPresetsWhileOff: Story = {
  args: { ...FULL, item: placedLight({ brightnessPresets: [20, 50, 100] }) },
  parameters: { liebe: { entities: [dimmable({ brightness: 0 }, 'off')] } },
  play: async ({ canvasElement }) => {
    await expect(presetLabels(canvasElement)).toEqual(['20%', '50%', '100%'])
    for (const button of presetGroup(canvasElement)!.querySelectorAll('button')) {
      await expect(button).toHaveAttribute('aria-pressed', 'false')
    }
  },
}

/**
 * Validation, seen from outside: `0` (turning off is the tap action's job),
 * `150`, a fraction and a string are all dropped, and the row renders what is
 * left. The stored document keeps every value its author wrote.
 */
export const BrightnessPresetsValidated: Story = {
  args: {
    ...FULL,
    item: placedLight({ brightnessPresets: [0, 25, 150, 33.3, 'bright', 75] }),
  },
  parameters: { liebe: { entities: [dimmable()] } },
  play: async ({ canvasElement }) => {
    await expect(presetLabels(canvasElement)).toEqual(['25%', '75%'])
  },
}

/** Nothing usable survives filtering, so the row goes rather than rendering empty. */
export const BrightnessPresetsAllInvalid: Story = {
  args: { ...FULL, item: placedLight({ brightnessPresets: [0, 150] }) },
  parameters: { liebe: { entities: [dimmable()] } },
  play: async ({ canvasElement }) => {
    await expect(presetGroup(canvasElement)).toBeNull()
  },
}

/** The empty default — no row at all, which is what an unconfigured card shows. */
export const BrightnessPresetsEmpty: Story = {
  args: { ...FULL, item: placedLight({}) },
  parameters: { liebe: { entities: [dimmable()] } },
  play: async ({ canvasElement }) => {
    await expect(presetGroup(canvasElement)).toBeNull()
  },
}

/**
 * Inert against a light that cannot be dimmed: an `onoff` bulb cannot honour a
 * `brightness`, so configuring presets for it conjures nothing (common
 * contract, convention 3).
 */
export const BrightnessPresetsUnsupported: Story = {
  args: { ...FULL, item: placedLight({ brightnessPresets: [20, 50] }) },
  parameters: {
    liebe: {
      entities: [createLightEntity({ attributes: { supported_color_modes: ['onoff'] } })],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(presetGroup(canvasElement)).toBeNull()
  },
}

/** Edit mode hides the controls and exposes configure/delete affordances. */
export const EditMode: Story = {
  args: { onDelete: () => {} },
  parameters: { liebe: { entities: [createLightEntity()], mode: 'edit' } },
}

/*
 * Layout tiers (docs/specs/design-system/index.md — "Size-adaptive layouts";
 * docs/specs/entity-cards/options/light.md — "Tier layouts"). Each story names
 * its tier and sets only the cell; the decorator derives the tier from it, so
 * the workshop shows the card at the size the tier is for. What each tier keeps
 * and drops is asserted in `__tests__/controlCardTierLayouts.test.tsx` — a story
 * shows the layout, it does not pin it.
 */

/** 1×1: icon over name and state. The whole tile toggles; no slider. */
export const TierGlance: Story = {
  args: { gridWidth: 1, gridHeight: 1 },
}

/** 2×1: icon and meta in a row with the horizontal brightness slider. */
export const TierRow: Story = {
  args: { gridWidth: 2, gridHeight: 1 },
}

/** 1×3: the slider stands up and fills the height between icon and meta. */
export const TierTall: Story = {
  args: { gridWidth: 1, gridHeight: 3 },
}

/** 3×2: the row content — colour and preset controls arrive with change 0016. */
export const TierFull: Story = {
  args: { gridWidth: 3, gridHeight: 2 },
}
