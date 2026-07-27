import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import { resetDispatchGuard } from '~/services/guardedDispatch'
import { ClimateCard } from '../ClimateCard'
import { CoverCard } from '../CoverCard'
import { FanCard } from '../FanCard'
import { LightCard } from '../LightCard'
import { WeatherCard } from '../WeatherCard'
import type { HassEntity } from '~/store/entityTypes'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * What each control-set card KEEPS and what it DROPS at every tier.
 *
 * The simple set has its own file, `cardTierLayouts.test.tsx` (change 0011
 * PR 2). The two are split by card family rather than combined because each
 * carries the helpers its own cards need — the control set's sliders, pill
 * groups and steppers against the simple set's switches and text fields. Both
 * families now render through the shared `CardBody`, so both read the shape off
 * its `data-arrangement`; the last describe block below is where this file
 * asserts that.
 *
 * The tier tables live in the per-card option docs
 * (docs/specs/entity-cards/options/) under the design system's omit-never-clip
 * rule (docs/specs/design-system/index.md — "Size-adaptive layouts"), and the
 * absence half is the half that rots silently: a card that quietly kept its
 * slider at 1×1 still renders, still stamps `data-tier`, and only looks wrong
 * on a wall tablet. So every case below asserts both directions — the content
 * the tier keeps is present AND the content it drops is genuinely out of the
 * DOM, not merely shrunk.
 *
 * Cards are rendered directly at a tier rather than through the grid: the grid
 * deriving the tier from a span is `GridView.tier.test.tsx`'s subject, and this
 * one is about what a card does with the tier it is handed.
 */

let hass: HomeAssistant

function seed(...entities: HassEntity[]) {
  entityStore.setState((state) => ({
    ...state,
    isConnected: true,
    isInitialLoading: false,
    entities: Object.fromEntries(entities.map((entity) => [entity.entity_id, entity])),
    staleEntities: new Set<string>(),
  }))
}

/** Seeds an entity the staleness monitor reports as stale, which cards tint for. */
function seedStale(entity: HassEntity) {
  seed(entity)
  entityStore.setState((state) => ({
    ...state,
    staleEntities: new Set([entity.entity_id]),
  }))
}

function makeEntity(
  entityId: string,
  state: string,
  attributes: Record<string, unknown>
): HassEntity {
  return {
    entity_id: entityId,
    state,
    attributes: attributes as HassEntity['attributes'],
    last_changed: '2024-01-01T00:00:00Z',
    last_updated: '2024-01-01T00:00:00Z',
    context: { id: 'ctx', parent_id: null, user_id: null },
  }
}

function renderCard(card: ReactElement) {
  return render(
    <Theme>
      <HomeAssistantProvider hass={hass}>{card}</HomeAssistantProvider>
    </Theme>
  )
}

/** The tier the shell actually stamped, so a mis-wired prop fails loudly. */
function stampedTier(): string | null {
  return document.querySelector('.liebe-card')!.getAttribute('data-tier')
}

/** The embedded slider's axis, which is part of the `tall` contract. */
function sliderOrientation(label: string): string | null {
  return screen.getByLabelText(label).closest('.liebe-slider')!.getAttribute('data-orientation')
}

/** The shape the shared body laid the tile out in. */
const arrangement = () =>
  document.querySelector('.liebe-card-body')!.getAttribute('data-arrangement')

/** How the body sized the control slot — content-width, or the tier's leftover room. */
const controlSize = () =>
  document.querySelector('.liebe-card-body')!.getAttribute('data-control-size')

/** The `tall` band a filling control sits in, or null when no band was rendered. */
const fillBand = () => document.querySelector('.liebe-card-body-fill')

beforeEach(() => {
  hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
  dashboardActions.resetState()
  /*
   * The at-most-once guard's pending set is module state, shared by every test
   * in the process (`services/guardedDispatch.ts`). Two cases issuing the same
   * command inside one acknowledgement window would see the second refused —
   * and a refusal looks exactly like a control that never fired, with no error
   * to point at it.
   */
  resetDispatchGuard()
})

afterEach(() => {
  dashboardActions.resetState()
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

describe('LightCard tiers', () => {
  const light = makeEntity('light.living_room', 'on', {
    friendly_name: 'Living Room',
    brightness: 128,
    supported_color_modes: ['brightness'],
  })

  beforeEach(() => seed(light))

  it('drops the brightness slider at glance and toggles from the whole tile', () => {
    renderCard(<LightCard entityId="light.living_room" tier="glance" />)

    expect(stampedTier()).toBe('glance')
    expect(screen.getByText('Living Room')).toBeInTheDocument()
    // The one assertion that matters: no embedded control survives into a 1×1
    // tile. Operability comes from the tap and the hold (change 0014).
    expect(screen.queryByLabelText('Brightness')).not.toBeInTheDocument()
  })

  it('carries a horizontal slider at row', () => {
    renderCard(<LightCard entityId="light.living_room" tier="row" />)

    expect(sliderOrientation('Brightness')).toBe('horizontal')
  })

  it('turns the slider vertical at tall', () => {
    renderCard(<LightCard entityId="light.living_room" tier="tall" />)

    expect(sliderOrientation('Brightness')).toBe('vertical')
  })

  it('keeps the row content at full, where the colour controls will land', () => {
    // `full` is the row layout plus secondary controls; colour temperature,
    // colour and preset pills arrive with change 0016, so today it is the row
    // content and nothing extra.
    renderCard(<LightCard entityId="light.living_room" tier="full" />)

    expect(sliderOrientation('Brightness')).toBe('horizontal')
  })
})

describe('CoverCard tiers', () => {
  // OPEN + CLOSE + SET_POSITION + STOP + tilt (open/close/set-position).
  // Set-tilt-position is bit 128, not the 64 this used to name — 64 is
  // stop-tilt (docs/specs/entity-cards/options/cover.md — "Options").
  const cover = makeEntity('cover.living_room', 'open', {
    friendly_name: 'Blinds',
    current_position: 60,
    current_tilt_position: 30,
    supported_features: 191,
  })

  beforeEach(() => seed(cover))

  it('drops every control at glance', () => {
    renderCard(<CoverCard entityId="cover.living_room" tier="glance" />)

    expect(stampedTier()).toBe('glance')
    expect(screen.getByText('Blinds')).toBeInTheDocument()
    expect(screen.queryByLabelText('Position')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Open cover')).not.toBeInTheDocument()
  })

  it('carries only the position slider at row', () => {
    renderCard(<CoverCard entityId="cover.living_room" tier="row" />)

    expect(sliderOrientation('Position')).toBe('horizontal')
    // The button row and the tilt block are `full` content.
    expect(screen.queryByLabelText('Open cover')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Tilt position')).not.toBeInTheDocument()
  })

  it('turns the position slider vertical at tall', () => {
    renderCard(<CoverCard entityId="cover.living_room" tier="tall" />)

    expect(sliderOrientation('Position')).toBe('vertical')
    expect(screen.queryByLabelText('Open cover')).not.toBeInTheDocument()
  })

  it('adds the button row and the tilt controls at full', () => {
    renderCard(<CoverCard entityId="cover.living_room" tier="full" />)

    expect(screen.getByLabelText('Position')).toBeInTheDocument()
    expect(screen.getByLabelText('Open cover')).toBeInTheDocument()
    expect(screen.getByLabelText('Stop cover')).toBeInTheDocument()
    expect(screen.getByLabelText('Close cover')).toBeInTheDocument()
    expect(screen.getByLabelText('Tilt position')).toBeInTheDocument()
    // Named, not merely present: these two are icon-only, so the label is the
    // only thing that makes them controls rather than pictures of controls
    // (`controlCardAccessibleNames.test.tsx` sweeps for the general case).
    expect(screen.getByLabelText('Open cover tilt')).toBeInTheDocument()
    expect(screen.getByLabelText('Close cover tilt')).toBeInTheDocument()
    // And sized like the rest of the card's controls rather than the `size="1"`
    // they shipped with (the 44px minimum itself is issue #204's).
    expect(screen.getByLabelText('Open cover tilt').className).toContain('rt-r-size-3')
    expect(screen.getByLabelText('Close cover tilt').className).toContain('rt-r-size-3')
  })

  it('renders a binary cover’s glance content in the row arrangement', () => {
    // OPEN + CLOSE only: there is no position to set, so `row` has no primary
    // control to carry and shows the glance content laid out as a row
    // (docs/specs/entity-cards/options/cover.md — "Tier layouts").
    seed(
      makeEntity('cover.garage', 'closed', {
        friendly_name: 'Garage',
        supported_features: 3,
      })
    )
    renderCard(<CoverCard entityId="cover.garage" tier="row" />)

    expect(screen.getByText('Garage')).toBeInTheDocument()
    expect(screen.queryByLabelText('Position')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Open cover')).not.toBeInTheDocument()
  })
})

describe('FanCard tiers', () => {
  const speedLabel = 'Medium-low speed (50%)'
  const fan = makeEntity('fan.living_room', 'on', {
    friendly_name: 'Living Room Fan',
    percentage: 50,
    // SUPPORT_SET_SPEED
    supported_features: 1,
  })

  beforeEach(() => seed(fan))

  it('drops the speed control at glance', () => {
    renderCard(<FanCard entityId="fan.living_room" tier="glance" />)

    expect(stampedTier()).toBe('glance')
    expect(screen.getByText('Living Room Fan')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Fan speed' })).not.toBeInTheDocument()
  })

  it('lays the step pills out horizontally at row', () => {
    renderCard(<FanCard entityId="fan.living_room" tier="row" />)

    expect(screen.getByRole('group', { name: 'Fan speed' })).toHaveAttribute(
      'data-orientation',
      'horizontal'
    )
    expect(screen.getByRole('button', { name: speedLabel })).toBeInTheDocument()
  })

  it('stacks the step pills at tall', () => {
    renderCard(<FanCard entityId="fan.living_room" tier="tall" />)

    expect(screen.getByRole('group', { name: 'Fan speed' })).toHaveAttribute(
      'data-orientation',
      'vertical'
    )
  })

  it('keeps the preset control for the tiers that have room for it', () => {
    // A fan with both: the step pills are the primary control at `row`, and the
    // preset select is the secondary row `full` adds.
    seed(
      makeEntity('fan.study', 'on', {
        friendly_name: 'Study Fan',
        percentage: 50,
        preset_mode: 'auto',
        preset_modes: ['auto', 'sleep'],
        // SUPPORT_SET_SPEED + SUPPORT_PRESET_MODE
        supported_features: 9,
      })
    )
    const { unmount } = renderCard(<FanCard entityId="fan.study" tier="row" />)

    expect(screen.getByRole('group', { name: 'Fan speed' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Select fan preset mode')).not.toBeInTheDocument()
    unmount()

    renderCard(<FanCard entityId="fan.study" tier="full" />)

    expect(screen.getByRole('group', { name: 'Fan speed' })).toBeInTheDocument()
    expect(screen.getByLabelText('Select fan preset mode')).toBeInTheDocument()
  })

  it('keeps a preset-only fan operable at tall, and picks a mode when none is set', async () => {
    // No `preset_mode` on the entity: the select shows the first available mode
    // rather than rendering empty. The wrapper also swallows the click so
    // choosing a preset does not toggle the fan underneath it.
    seed(
      makeEntity('fan.attic', 'on', {
        friendly_name: 'Attic Fan',
        preset_modes: ['auto', 'sleep'],
        supported_features: 8,
      })
    )
    renderCard(<FanCard entityId="fan.attic" tier="tall" />)

    const trigger = screen.getByLabelText('Select fan preset mode')
    expect(trigger).toHaveTextContent('auto')

    fireEvent.click(trigger)
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('keeps a preset-only fan’s select as its primary control at row', () => {
    // Nothing else can drive this fan, so dropping the select would leave the
    // row tier with no speed control at all.
    seed(
      makeEntity('fan.attic', 'on', {
        friendly_name: 'Attic Fan',
        preset_mode: 'auto',
        preset_modes: ['auto', 'sleep'],
        // SUPPORT_PRESET_MODE only
        supported_features: 8,
      })
    )
    renderCard(<FanCard entityId="fan.attic" tier="row" />)

    expect(screen.getByLabelText('Select fan preset mode')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Fan speed' })).not.toBeInTheDocument()
  })
})

describe('ClimateCard tiers', () => {
  const thermostat = makeEntity('climate.hallway', 'heat', {
    friendly_name: 'Hallway',
    current_temperature: 19,
    temperature: 21,
    min_temp: 7,
    max_temp: 35,
    target_temp_step: 0.5,
    temperature_unit: '°C',
    hvac_modes: ['off', 'heat', 'cool'],
    hvac_action: 'heating',
    // SUPPORT_TARGET_TEMPERATURE
    supported_features: 1,
  })

  const rangeThermostat = makeEntity('climate.bedroom', 'heat_cool', {
    friendly_name: 'Bedroom',
    current_temperature: 21,
    target_temp_low: 20,
    target_temp_high: 24,
    min_temp: 7,
    max_temp: 35,
    target_temp_step: 0.5,
    temperature_unit: '°C',
    hvac_modes: ['off', 'heat_cool'],
    // SUPPORT_TARGET_TEMPERATURE_RANGE only — a heat_cool-only thermostat,
    // which the option doc requires to keep its dual setpoints.
    supported_features: 2,
  })

  it('KEEPS a setpoint control at glance', () => {
    /*
     * The exception to the glance rule, and the reason it exists: a thermostat's
     * replacement interaction is the detail dialog's domain controls, which are
     * registered by change 0017. Until then a control-free glance tile would be
     * a thermostat nobody can turn up — the operability regression change 0011
     * forbids at every merge point (docs/changes/0011-layout-tiers.md).
     */
    seed(thermostat)
    renderCard(
      <ClimateCard entityId="climate.hallway" tier="glance" span={{ width: 1, height: 1 }} />
    )

    expect(stampedTier()).toBe('glance')
    expect(screen.getByLabelText('Increase temperature')).toBeInTheDocument()
    expect(screen.getByLabelText('Decrease temperature')).toBeInTheDocument()
    // The dial and the mode pills are what a 1×1 tile cannot hold.
    expect(screen.queryByRole('group', { name: 'HVAC mode' })).not.toBeInTheDocument()
  })

  it('gives the compact stepper the same button size as the dial layout', () => {
    /*
     * The compact stepper shipped two Radix sizes smaller than the dial's own
     * +/- pair. It is the only control on the tile at `glance`, `row` and
     * `tall`, which makes it the last place on the card to shrink a touch
     * target — so it matches its `full`-tier counterpart. (The card-wide 44px
     * minimum is a separate question, tracked by issue #204.)
     */
    seed(thermostat)
    renderCard(
      <ClimateCard entityId="climate.hallway" tier="glance" span={{ width: 1, height: 1 }} />
    )

    expect(screen.getByLabelText('Increase temperature').className).toContain('rt-r-size-3')
    expect(screen.getByLabelText('Decrease temperature').className).toContain('rt-r-size-3')
  })

  it('shows the stepper with a large readout at row, without the mode pills', () => {
    seed(thermostat)
    const { container } = renderCard(
      <ClimateCard entityId="climate.hallway" tier="row" span={{ width: 2, height: 1 }} />
    )

    expect(screen.getByLabelText('Increase temperature')).toBeInTheDocument()
    expect(container.querySelector('.liebe-value')).toHaveTextContent('21.0°C')
    expect(screen.queryByRole('group', { name: 'HVAC mode' })).not.toBeInTheDocument()
  })

  it('adds the mode pills to the row layout at full', () => {
    // `compact` is the default variant (docs/specs/entity-cards/options/
    // climate.md — "variant"), so `full` is the row layout plus the mode row.
    // The arc dial is `variant: dial`'s, and is asserted in
    // `../ClimateCard/__tests__/ClimateDial.test.tsx`.
    seed(thermostat)
    renderCard(
      <ClimateCard entityId="climate.hallway" tier="full" span={{ width: 3, height: 3 }} />
    )

    expect(screen.getByRole('group', { name: 'HVAC mode' })).toBeInTheDocument()
    expect(screen.getByLabelText('Increase temperature')).toBeInTheDocument()
    expect(document.querySelector('.climate-card-name')).not.toBeInTheDocument()
  })

  it('renders the dial at full, and this same compact row below it, under variant: dial', () => {
    // The variant's fallback, from the tier table's point of view: a `dial` card
    // resized below `full` renders the compact layout for the tier it lands in,
    // with identical service behaviour, rather than a shrunken arc.
    const ClimateDialCard = ClimateCard.variants.dial
    seed(thermostat)

    const { unmount } = renderCard(
      <ClimateDialCard entityId="climate.hallway" tier="full" span={{ width: 3, height: 3 }} />
    )
    expect(document.querySelector('.climate-card-name')).toBeInTheDocument()
    unmount()

    renderCard(
      <ClimateDialCard entityId="climate.hallway" tier="row" span={{ width: 2, height: 1 }} />
    )

    expect(stampedTier()).toBe('row')
    expect(screen.getByLabelText('Increase temperature')).toBeInTheDocument()
    expect(document.querySelector('.climate-card-name')).not.toBeInTheDocument()
  })

  it('gives a narrow row the lockstep range control and a wide one both setpoints', () => {
    /*
     * The case the tier alone cannot express: `row` covers 2×1 through N×1, and
     * the option doc puts independent low/high steppers at width ≥3 and a
     * lockstep pair at width 2. A card that only knew its tier would have to
     * pick one and be wrong at the other width.
     */
    seed(rangeThermostat)
    const { unmount } = renderCard(
      <ClimateCard entityId="climate.bedroom" tier="row" span={{ width: 2, height: 1 }} />
    )

    expect(screen.getByLabelText('Increase temperature range')).toBeInTheDocument()
    expect(screen.queryByLabelText('Increase low temperature')).not.toBeInTheDocument()
    unmount()

    renderCard(<ClimateCard entityId="climate.bedroom" tier="row" span={{ width: 3, height: 1 }} />)

    expect(screen.getByLabelText('Increase low temperature')).toBeInTheDocument()
    expect(screen.getByLabelText('Increase high temperature')).toBeInTheDocument()
    expect(screen.queryByLabelText('Increase temperature range')).not.toBeInTheDocument()
  })

  it('shifts both setpoints by one step, preserving the band', async () => {
    seed(rangeThermostat)
    renderCard(<ClimateCard entityId="climate.bedroom" tier="row" span={{ width: 2, height: 1 }} />)

    fireEvent.click(screen.getByLabelText('Increase temperature range'))

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('climate', 'set_temperature', {
        entity_id: 'climate.bedroom',
        target_temp_low: 20.5,
        target_temp_high: 24.5,
      })
    )
  })

  it('holds the lockstep pair at the bounds rather than squashing the band', async () => {
    // The high setpoint is one step below `max_temp`, so increasing again would
    // take it out of range: the control is disabled instead of clamping one end
    // and narrowing the band the user set.
    seed(
      makeEntity('climate.bedroom', 'heat_cool', {
        ...rangeThermostat.attributes,
        target_temp_low: 30,
        target_temp_high: 35,
      })
    )
    renderCard(<ClimateCard entityId="climate.bedroom" tier="row" span={{ width: 2, height: 1 }} />)

    expect(screen.getByLabelText('Increase temperature range')).toBeDisabled()
    expect(screen.getByLabelText('Decrease temperature range')).toBeEnabled()
  })

  it('falls back to the current temperature when the entity sets no setpoint', () => {
    // Neither feature bit: the state slot shows what the thermostat reads
    // rather than a setpoint it does not have, and no stepper renders.
    seed(
      makeEntity('climate.porch', 'heat', {
        friendly_name: 'Porch',
        current_temperature: 18,
        temperature_unit: '°C',
        supported_features: 0,
      })
    )
    renderCard(
      <ClimateCard entityId="climate.porch" tier="glance" span={{ width: 1, height: 1 }} />
    )

    expect(screen.getByText('18°C')).toBeInTheDocument()
    expect(screen.queryByLabelText('Increase temperature')).not.toBeInTheDocument()
  })

  it('shows the HVAC state when the thermostat reports no temperature at all', () => {
    seed(
      makeEntity('climate.shed', 'heat', {
        friendly_name: 'Shed',
        temperature_unit: '°C',
        hvac_action: 'idle',
        supported_features: 0,
      })
    )
    renderCard(<ClimateCard entityId="climate.shed" tier="glance" span={{ width: 1, height: 1 }} />)

    expect(screen.getByText('IDLE')).toBeInTheDocument()
  })

  it('stacks the stepper around the readout at tall', () => {
    seed(thermostat)
    renderCard(
      <ClimateCard entityId="climate.hallway" tier="tall" span={{ width: 1, height: 3 }} />
    )

    // Plus above, minus below: in DOM order the increase button precedes the
    // decrease one, which is the whole of the vertical stepper's contract.
    const buttons = screen.getAllByRole('button')
    const increase = buttons.indexOf(screen.getByLabelText('Increase temperature'))
    const decrease = buttons.indexOf(screen.getByLabelText('Decrease temperature'))
    expect(increase).toBeLessThan(decrease)
  })

  it('dispatches from each independent setpoint stepper', async () => {
    seed(rangeThermostat)
    renderCard(<ClimateCard entityId="climate.bedroom" tier="row" span={{ width: 3, height: 1 }} />)

    fireEvent.click(screen.getByLabelText('Increase low temperature'))
    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('climate', 'set_temperature', {
        entity_id: 'climate.bedroom',
        target_temp_low: 20.5,
        target_temp_high: 24,
      })
    )

    fireEvent.click(screen.getByLabelText('Decrease low temperature'))
    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('climate', 'set_temperature', {
        entity_id: 'climate.bedroom',
        target_temp_low: 19.5,
        target_temp_high: 24,
      })
    )

    fireEvent.click(screen.getByLabelText('Increase high temperature'))
    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('climate', 'set_temperature', {
        entity_id: 'climate.bedroom',
        target_temp_low: 20,
        target_temp_high: 24.5,
      })
    )

    fireEvent.click(screen.getByLabelText('Decrease high temperature'))
    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('climate', 'set_temperature', {
        entity_id: 'climate.bedroom',
        target_temp_low: 20,
        target_temp_high: 23.5,
      })
    )
  })

  it('shifts the band down as well as up', async () => {
    seed(rangeThermostat)
    renderCard(<ClimateCard entityId="climate.bedroom" tier="row" span={{ width: 2, height: 1 }} />)

    fireEvent.click(screen.getByLabelText('Decrease temperature range'))

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('climate', 'set_temperature', {
        entity_id: 'climate.bedroom',
        target_temp_low: 19.5,
        target_temp_high: 23.5,
      })
    )
  })

  it('dispatches from the compact scalar stepper in both directions', async () => {
    // The compact tiers have their own stepper — the `full` dial's buttons are
    // different code — so the dispatch is pinned here too.
    seed(thermostat)
    renderCard(<ClimateCard entityId="climate.hallway" tier="row" span={{ width: 2, height: 1 }} />)

    fireEvent.click(screen.getByLabelText('Increase temperature'))
    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('climate', 'set_temperature', {
        entity_id: 'climate.hallway',
        temperature: 21.5,
      })
    )

    fireEvent.click(screen.getByLabelText('Decrease temperature'))
    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('climate', 'set_temperature', {
        entity_id: 'climate.hallway',
        temperature: 20.5,
      })
    )
  })

  it('starts the stepper from a sane default when the setpoint is missing', async () => {
    // `supported_features` says the thermostat takes a target temperature but
    // the attribute has not arrived yet: the stepper still works rather than
    // dispatching NaN.
    seed(
      makeEntity('climate.hallway', 'heat', {
        ...thermostat.attributes,
        temperature: undefined,
      })
    )
    renderCard(<ClimateCard entityId="climate.hallway" tier="row" span={{ width: 2, height: 1 }} />)

    fireEvent.click(screen.getByLabelText('Increase temperature'))

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('climate', 'set_temperature', {
        entity_id: 'climate.hallway',
        temperature: 20.5,
      })
    )

    fireEvent.click(screen.getByLabelText('Decrease temperature'))

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('climate', 'set_temperature', {
        entity_id: 'climate.hallway',
        temperature: 19.5,
      })
    )
  })

  it('selects the compact card in edit mode instead of acting on it', () => {
    seed(thermostat)
    dashboardActions.setMode('edit')
    const onSelect = vi.fn()
    renderCard(
      <ClimateCard
        entityId="climate.hallway"
        tier="glance"
        span={{ width: 1, height: 1 }}
        onSelect={onSelect}
      />
    )

    fireEvent.click(document.querySelector('.liebe-card') as HTMLElement)

    expect(onSelect).toHaveBeenCalledWith(true)
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('drops the stepper in edit mode at every tier', () => {
    seed(thermostat)
    dashboardActions.setMode('edit')
    renderCard(<ClimateCard entityId="climate.hallway" tier="row" span={{ width: 2, height: 1 }} />)

    expect(screen.queryByLabelText('Increase temperature')).not.toBeInTheDocument()
  })
})

describe('WeatherCard tiers', () => {
  const weather = makeEntity('weather.home', 'sunny', {
    friendly_name: 'Home Weather',
    temperature: 22,
    temperature_unit: '°C',
    humidity: 65,
    pressure: 1013,
    wind_speed: 12,
    wind_speed_unit: 'km/h',
    apparent_temperature: 19,
  })

  beforeEach(() => seed(weather))

  it('shows the temperature in the state slot at glance and nothing else', () => {
    renderCard(<WeatherCard entityId="weather.home" tier="glance" />)

    expect(stampedTier()).toBe('glance')
    expect(screen.getByText('22°C')).toBeInTheDocument()
    // Condition text and the secondary line are what a 1×1 tile drops.
    expect(screen.queryByText('sunny')).not.toBeInTheDocument()
    expect(screen.queryByText('65%')).not.toBeInTheDocument()
  })

  it('adds the condition and the secondary line at row', () => {
    renderCard(<WeatherCard entityId="weather.home" tier="row" />)

    expect(screen.getByText('sunny')).toBeInTheDocument()
    expect(screen.getByText('65%')).toBeInTheDocument()
    expect(screen.queryByText(/Feels like/)).not.toBeInTheDocument()
  })

  it('continues the detail line at full', () => {
    renderCard(<WeatherCard entityId="weather.home" tier="full" />)

    expect(screen.getByText(/Feels like 19°C/)).toBeInTheDocument()
    expect(screen.getByText(/Wind 12 km\/h/)).toBeInTheDocument()
  })

  it('keeps the stacked arrangement at tall', () => {
    renderCard(<WeatherCard entityId="weather.home" tier="tall" />)

    expect(screen.getByText('sunny')).toBeInTheDocument()
    expect(screen.getByText('65%')).toBeInTheDocument()
    expect(screen.queryByText(/Wind/)).not.toBeInTheDocument()
  })

  it('renders on the plain card surface when the condition maps to no artwork', () => {
    // Every variant paints its text white over the condition background and in
    // token colours without one; `exceptional` is a condition with no image, so
    // this is the other half of that branch on all three of them.
    for (const variant of ['default', 'modern', 'detailed'] as const) {
      seed(makeEntity('weather.home', 'exceptional', weather.attributes))
      const { unmount } = renderCard(
        <WeatherCard entityId="weather.home" tier="full" config={{ variant }} />
      )

      expect(screen.getByText('Home Weather')).toBeInTheDocument()
      unmount()
    }
  })

  it('renders a wind reading the entity gives no unit for', () => {
    seed(
      makeEntity('weather.home', 'exceptional', {
        ...weather.attributes,
        wind_speed_unit: undefined,
      })
    )
    const { unmount } = renderCard(<WeatherCard entityId="weather.home" tier="full" />)

    // The bare number, with no trailing space where the unit would have gone.
    expect(screen.getByText(/Wind 12/).textContent).toBe('Wind 12')
    unmount()

    renderCard(<WeatherCard entityId="weather.home" tier="full" config={{ variant: 'modern' }} />)

    expect(screen.getByText(/Wind 12/).textContent).toBe('Wind 12')
  })

  it('falls back to the entity id when the weather entity has no friendly name', () => {
    seed(
      makeEntity('weather.home', 'sunny', {
        ...weather.attributes,
        friendly_name: undefined,
      })
    )
    const { unmount } = renderCard(<WeatherCard entityId="weather.home" tier="row" />)

    expect(screen.getByText('weather.home')).toBeInTheDocument()
    unmount()

    renderCard(<WeatherCard entityId="weather.home" tier="row" config={{ variant: 'modern' }} />)

    expect(screen.getByText('weather.home')).toBeInTheDocument()
  })

  it('tints a stale weather card without dropping its content', () => {
    // Staleness is a colour, not a layout: the card keeps every line it would
    // otherwise show.
    for (const variant of ['default', 'modern', 'detailed'] as const) {
      seedStale(makeEntity('weather.home', 'exceptional', weather.attributes))
      const { unmount } = renderCard(
        <WeatherCard entityId="weather.home" tier="full" config={{ variant }} />
      )

      expect(screen.getByText('Home Weather')).toBeInTheDocument()
      unmount()
    }
  })

  it('drops the big readout from the minimal variant at glance', () => {
    const { container, unmount } = renderCard(
      <WeatherCard entityId="weather.home" tier="glance" config={{ variant: 'minimal' }} />
    )

    expect(container.querySelector('.liebe-value')).toBeNull()
    expect(screen.getByText('22°C')).toBeInTheDocument()
    unmount()

    const { container: rowContainer } = renderCard(
      <WeatherCard entityId="weather.home" tier="row" config={{ variant: 'minimal' }} />
    )

    expect(rowContainer.querySelector('.liebe-value')).toHaveTextContent('22°C')
  })

  it('drops the modern variant’s humidity at glance', () => {
    const { unmount } = renderCard(
      <WeatherCard entityId="weather.home" tier="glance" config={{ variant: 'modern' }} />
    )

    expect(screen.queryByText('65% humidity')).not.toBeInTheDocument()
    expect(screen.getByText('22°C')).toBeInTheDocument()
    unmount()

    renderCard(<WeatherCard entityId="weather.home" tier="row" config={{ variant: 'modern' }} />)

    expect(screen.getByText('65% humidity')).toBeInTheDocument()
  })

  it('adds the modern variant’s detail line at full', () => {
    renderCard(<WeatherCard entityId="weather.home" tier="full" config={{ variant: 'modern' }} />)

    expect(screen.getByText(/Feels like 19°C/)).toBeInTheDocument()
    expect(screen.getByText(/Wind 12 km\/h/)).toBeInTheDocument()
  })

  it('holds the detailed variant’s pressure back until full', () => {
    const { unmount } = renderCard(
      <WeatherCard entityId="weather.home" tier="row" config={{ variant: 'detailed' }} />
    )

    expect(screen.getByText('Humidity')).toBeInTheDocument()
    expect(screen.queryByText('Pressure')).not.toBeInTheDocument()
    unmount()

    renderCard(<WeatherCard entityId="weather.home" tier="full" config={{ variant: 'detailed' }} />)

    expect(screen.getByText('Pressure')).toBeInTheDocument()
  })

  it('drops the detailed variant’s whole data block at glance', () => {
    renderCard(
      <WeatherCard entityId="weather.home" tier="glance" config={{ variant: 'detailed' }} />
    )

    expect(screen.queryByText('Temperature')).not.toBeInTheDocument()
    expect(screen.queryByText('Humidity')).not.toBeInTheDocument()
    expect(screen.getByText('22°C')).toBeInTheDocument()
  })
})

describe('control-set cards — the shared body', () => {
  /*
   * The control set arranges its tiers through `CardBody` rather than through
   * four hand-written per-tier layouts. Asserted here rather than left to the
   * per-card blocks above because it is one claim about four cards, and because
   * the shape is otherwise only observable through CSS: `data-arrangement` and
   * `data-control-size` are stamped precisely so a test can see it.
   *
   * `CardBody`'s own contract — which slot goes where in each arrangement — is
   * pinned by the simple set in `cardTierLayouts.test.tsx`. What is new here is
   * the filling control slot the vertical controls need, which the simple set
   * has no card for.
   */

  const light = makeEntity('light.living_room', 'on', {
    friendly_name: 'Living Room',
    brightness: 128,
    supported_color_modes: ['brightness'],
  })

  it('lays each tier out in the arrangement its tier table names', () => {
    for (const [tier, shape] of [
      ['glance', 'stack'],
      ['row', 'row'],
      ['tall', 'tall'],
      ['full', 'row'],
    ] as const) {
      seed(light)
      const { unmount } = renderCard(<LightCard entityId="light.living_room" tier={tier} />)

      expect(arrangement()).toBe(shape)
      unmount()
    }
  })

  it('gives the vertical controls the band between the icon and the meta', () => {
    /*
     * The extension the control set needed: a control slot that takes the
     * height the icon and the meta leave, rather than one sized by its content.
     * A slider has no intrinsic length, so without it a `tall` tile would give
     * the control no travel at all — which is the one thing that tier is for.
     */
    seed(light)
    const { unmount } = renderCard(<LightCard entityId="light.living_room" tier="tall" />)

    expect(controlSize()).toBe('fill')
    expect(fillBand()).toContainElement(screen.getByLabelText('Brightness'))
    unmount()

    seed(
      makeEntity('cover.living_room', 'open', {
        friendly_name: 'Blinds',
        current_position: 60,
        supported_features: 127,
      })
    )
    const cover = renderCard(<CoverCard entityId="cover.living_room" tier="tall" />)

    expect(fillBand()).toContainElement(screen.getByLabelText('Position'))
    cover.unmount()

    seed(
      makeEntity('fan.living_room', 'on', {
        friendly_name: 'Living Room Fan',
        percentage: 50,
        supported_features: 1,
      })
    )
    const fan = renderCard(<FanCard entityId="fan.living_room" tier="tall" />)

    expect(fillBand()).toContainElement(screen.getByRole('group', { name: 'Fan speed' }))
    fan.unmount()

    seed(
      makeEntity('climate.hallway', 'heat', {
        friendly_name: 'Hallway',
        current_temperature: 19,
        temperature: 21,
        min_temp: 7,
        max_temp: 35,
        target_temp_step: 0.5,
        temperature_unit: '°C',
        hvac_modes: ['off', 'heat'],
        supported_features: 1,
      })
    )
    renderCard(
      <ClimateCard entityId="climate.hallway" tier="tall" span={{ width: 1, height: 3 }} />
    )

    expect(fillBand()).toContainElement(screen.getByLabelText('Increase temperature'))
  })

  it('renders no band at all when the tall tier has no control to put in it', () => {
    // An empty band would still take the height, which would push the icon and
    // the meta to the ends of a tile that has nothing between them.
    seed(
      makeEntity('light.living_room', 'off', {
        friendly_name: 'Living Room',
        supported_color_modes: ['brightness'],
      })
    )
    renderCard(<LightCard entityId="light.living_room" tier="tall" />)

    expect(screen.queryByLabelText('Brightness')).not.toBeInTheDocument()
    expect(fillBand()).toBeNull()
  })

  it('keeps a stepper content-sized on the tiers that are not tall', () => {
    // The other half of the fill decision, and why it is the card's rather than
    // the tier's: grown to a row's width the thermostat's two buttons would
    // float apart from the readout between them.
    seed(
      makeEntity('climate.hallway', 'heat', {
        friendly_name: 'Hallway',
        current_temperature: 19,
        temperature: 21,
        min_temp: 7,
        max_temp: 35,
        target_temp_step: 0.5,
        temperature_unit: '°C',
        hvac_modes: ['off', 'heat'],
        supported_features: 1,
      })
    )
    renderCard(<ClimateCard entityId="climate.hallway" tier="row" span={{ width: 2, height: 1 }} />)

    expect(controlSize()).toBe('content')
    expect(fillBand()).toBeNull()
  })
})
