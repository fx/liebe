import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { entityHistoryService } from '~/services/entityHistory'
import { dashboardActions } from '~/store'
import { resetDispatchGuard } from '~/services/guardedDispatch'
import { CardItemProvider } from '../cardItemContext'
import {
  createBinarySensorEntity,
  createInputBooleanEntity,
  createInputDateTimeEntity,
  createInputNumberEntity,
  createInputSelectEntity,
  createInputTextEntity,
  createSensorEntity,
  createSwitchEntity,
} from '~/test/fixtures'
import type { HassEntity } from '~/store/entityTypes'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'
import { SensorCard } from '../SensorCard'
import { BinarySensorCard } from '../BinarySensorCard'
import { ButtonCard } from '../ButtonCard'
import { InputBooleanCard } from '../InputBooleanCard'
import { InputNumberCard } from '../InputNumberCard'
import { InputSelectCard } from '../InputSelectCard'
import { InputTextCard } from '../InputTextCard'
import { InputDateTimeCard } from '../InputDateTimeCard'

/**
 * What each tier of the simple card set actually contains.
 *
 * These are the per-card tier assertions change 0011 PR 2 owes: PR 1 deleted
 * these cards' `size variants` blocks as tests of a removed prop, on the
 * condition that real tier coverage landed here
 * (docs/changes/0011-layout-tiers.md).
 *
 * Every assertion below is about **presence or absence in the DOM**, never
 * about CSS. That is the point: the spec's degradation rule is "content that
 * does not fit MUST be omitted, never clipped or scrolled"
 * (docs/specs/design-system/index.md — "Size-adaptive layouts"), and a card
 * that hid its overflow with `display: none` instead would satisfy the eye
 * while failing every `toBeNull()` below — which is the whole reason to assert
 * on the DOM. Hiding is not an accessibility-tree leak (`display: none` drops
 * out of that tree too); it is a claim about the tier that no longer matches
 * the tier's output, one `display: revert` in the themable cascade away from
 * coming back. So a tier that drops something is checked with
 * `queryBy…().toBeNull()`, and the arrangement is read off `data-arrangement`,
 * which is stamped precisely so the shape is observable without a stylesheet.
 *
 * Rendered against the real entity store through the cards' own hooks rather
 * than against mocked ones — the tier is the only input under test, so
 * everything else is left real.
 */

let hass: HomeAssistant

function seed(...entities: HassEntity[]) {
  entityStore.setState((state) => ({
    ...state,
    isConnected: true,
    isInitialLoading: false,
    entities: Object.fromEntries(entities.map((entity) => [entity.entity_id, entity])),
  }))
}

function renderCard(ui: ReactElement, config?: Record<string, unknown>) {
  /*
   * The grid publishes the placed item's entity to the shell through this
   * provider rather than through the card (`cardItemContext`), and the shell
   * needs it to open anything: `more-info` is not actionable without an entity.
   * Taking it off the element under test keeps every call site below unchanged
   * while making the `glance` tiles' `more-info` tap reachable — which is now
   * the only way those tiles are operated at all.
   */
  const entityId = (ui.props as { entityId?: string }).entityId

  return render(
    <Theme>
      <HomeAssistantProvider hass={hass}>
        <CardItemProvider entityId={entityId} config={config}>
          {ui}
        </CardItemProvider>
      </HomeAssistantProvider>
    </Theme>
  )
}

/** The tile, and the shape its body was laid out in. */
const card = () => document.querySelector('.liebe-card')!
const arrangement = () =>
  document.querySelector('.liebe-card-body')!.getAttribute('data-arrangement')
const part = (selector: string) => card().querySelector(selector)

/**
 * Where a slot sits among its siblings.
 *
 * The tier table is as much about order as about presence — `tall` is "icon on
 * top, vertical control, meta at bottom", and a `tall` tile that stacked its
 * control *under* the meta would be a `stack` with extra height. The row shapes
 * put their slots inside `liebe-card-body-line`, the stacked ones directly in
 * the body, so the container is whichever of the two is there.
 */
function slotIndex(selector: string): number {
  const container =
    document.querySelector('.liebe-card-body-line') ?? document.querySelector('.liebe-card-body')!
  const slot = container.querySelector(selector)!

  return Array.from(container.children).findIndex((child) => child.contains(slot))
}

beforeEach(() => {
  dashboardActions.resetState()
  // The at-most-once guard is process-wide, so two cases issuing the same
  // command would otherwise see the second refused as a repeat of the first.
  resetDispatchGuard()
  hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
})

describe('SensorCard tiers', () => {
  beforeEach(() => seed(createSensorEntity()))

  it('anchors glance on the big value and drops the icon circle', () => {
    renderCard(<SensorCard entityId="sensor.living_room_temperature" tier="glance" />)

    expect(arrangement()).toBe('stack')
    expect(part('.liebe-value')).toHaveTextContent('21.4 °C')
    expect(screen.getByText('Living Room Temperature')).toBeInTheDocument()
    // The value replaces the icon as the tile's anchor, and the state line with
    // it — the reading *is* the state here.
    expect(part('.liebe-icon')).toBeNull()
    expect(part('.liebe-state')).toBeNull()
  })

  it('reads the value out on the state line in row, without the big figure', () => {
    renderCard(<SensorCard entityId="sensor.living_room_temperature" tier="row" />)

    expect(arrangement()).toBe('row')
    expect(part('.liebe-icon')).not.toBeNull()
    expect(part('.liebe-state')).toHaveTextContent('21.4 °C')
    // One reading per tile: the big figure would say the same number twice.
    expect(part('.liebe-value')).toBeNull()
  })

  it('stacks icon, value and name in tall', () => {
    renderCard(<SensorCard entityId="sensor.living_room_temperature" tier="tall" />)

    expect(arrangement()).toBe('tall')
    expect(part('.liebe-icon')).not.toBeNull()
    expect(part('.liebe-value')).toHaveTextContent('21.4 °C')
    expect(part('.liebe-state')).toBeNull()
  })

  it('keeps the row shape in full and adds the value alongside', () => {
    renderCard(<SensorCard entityId="sensor.living_room_temperature" tier="full" />)

    expect(arrangement()).toBe('row')
    expect(part('.liebe-icon')).not.toBeNull()
    expect(part('.liebe-value')).toHaveTextContent('21.4 °C')
    expect(part('.liebe-state')).toBeNull()
  })

  it('renders no graph in glance', () => {
    renderCard(<SensorCard entityId="sensor.living_room_temperature" tier="glance" />)

    // "Never renders in `glance`" — one cell has room for a figure and a name
    // (docs/specs/entity-cards/options/sensor.md — `showGraph`). Where the
    // graph DOES render, and what it does while its window is loading, empty or
    // unsupported, is `SensorCard/__tests__/SensorCard.test.tsx`: those need a
    // recorder answer behind them, which is not what this file is about.
    expect(part('.liebe-spark')).toBeNull()
    expect(part('[data-testid="sensor-graph"]')).toBeNull()
  })

  it('falls back to the icon tile in glance when the state is hidden', () => {
    renderCard(<SensorCard entityId="sensor.living_room_temperature" tier="glance" />, {
      hideState: true,
    })

    // The value is the state, so hiding the state takes the anchor with it and
    // the standard icon-and-name tile comes back
    // (docs/specs/entity-cards/options/sensor.md — the `glance` "Fallbacks").
    expect(part('.liebe-value')).toBeNull()
    expect(part('.liebe-icon')).not.toBeNull()
    expect(screen.getByText('Living Room Temperature')).toBeInTheDocument()
  })

  it('falls back to the icon-only tile when the name is hidden too', () => {
    renderCard(<SensorCard entityId="sensor.living_room_temperature" tier="glance" />, {
      hideState: true,
      hideName: true,
    })

    expect(part('.liebe-value')).toBeNull()
    expect(part('.liebe-name')).toBeNull()
    expect(part('.liebe-icon')).not.toBeNull()
    expect(card()).toHaveAttribute('data-icon-only', 'true')
  })
})

describe('BinarySensorCard tiers', () => {
  beforeEach(() => seed(createBinarySensorEntity()))

  it('stacks its three parts in glance', () => {
    renderCard(<BinarySensorCard entityId="binary_sensor.front_door" tier="glance" />)

    expect(arrangement()).toBe('stack')
    expect(part('.liebe-icon')).not.toBeNull()
    expect(screen.getByText('Front Door')).toBeInTheDocument()
    // The `door` device class names its states (0018 PR 2).
    expect(part('.liebe-state')).toHaveTextContent('Closed')
  })

  it.each(['row', 'tall', 'full'] as const)('lays %s out as a row', (tier) => {
    renderCard(<BinarySensorCard entityId="binary_sensor.front_door" tier={tier} />)

    // The option doc gives `tall` the row arrangement as well, because the
    // vertical shape exists to hold a control and this card has none
    // (docs/specs/entity-cards/options/sensor.md — "Binary sensor").
    expect(arrangement()).toBe('row')
    expect(part('.liebe-icon')).not.toBeNull()
    expect(part('.liebe-state')).toHaveTextContent('Closed')
  })

  it('invents no content in full', () => {
    renderCard(<BinarySensorCard entityId="binary_sensor.front_door" tier="full" />)

    // "The extra `full` real estate stays calm rather than inventing content":
    // a binary sensor has no numeric history to graph and no control to embed.
    expect(part('.liebe-value')).toBeNull()
    expect(part('.liebe-spark')).toBeNull()
    expect(part('.liebe-card-controls')).toBeNull()
  })
})

describe('ButtonCard tiers', () => {
  beforeEach(() => seed(createSwitchEntity()))

  it.each([
    ['glance', 'stack'],
    ['row', 'row'],
    ['tall', 'tall'],
    ['full', 'row'],
  ] as const)('lays %s out as %s with no embedded control', (tier, shape) => {
    renderCard(<ButtonCard entityId="switch.coffee_machine" tier={tier} />)

    expect(arrangement()).toBe(shape)
    // "The whole tile is the touch target in every tier; the card embeds no
    // discrete controls of its own" (docs/specs/entity-cards/options/switch.md).
    expect(part('.liebe-card-controls')).toBeNull()
    expect(part('.liebe-icon')).not.toBeNull()
    expect(part('.liebe-state')).not.toBeNull()
  })
})

describe('InputBooleanCard tiers', () => {
  beforeEach(() => seed(createInputBooleanEntity()))

  it('omits the switch in glance and stays operable through the tile', async () => {
    const user = userEvent.setup()
    renderCard(<InputBooleanCard entityId="input_boolean.guest_mode" tier="glance" />)

    expect(arrangement()).toBe('stack')
    // Omitted, not hidden: a 1×1 tile cannot hold a 44px control beside the
    // icon, name and state without clipping one of them.
    expect(screen.queryByRole('switch')).toBeNull()
    expect(part('.liebe-state')).toHaveTextContent('OFF')

    // The replacement path, which is why this card may drop its control at all:
    // the whole tile toggles (docs/changes/0011 — no operability regression).
    await user.click(card())
    expect(hass.callService).toHaveBeenCalled()
  })

  it.each([
    ['row', 'row'],
    ['tall', 'tall'],
    ['full', 'row'],
  ] as const)('keeps the switch at %s when the card asks for one', (tier, shape) => {
    renderCard(
      <InputBooleanCard
        entityId="input_boolean.guest_mode"
        tier={tier}
        config={{ controlStyle: 'switch' }}
      />
    )

    expect(arrangement()).toBe(shape)
    expect(screen.getByRole('switch')).toBeInTheDocument()
  })

  it('puts the switch between the icon and the meta in tall', () => {
    renderCard(
      <InputBooleanCard
        entityId="input_boolean.guest_mode"
        tier="tall"
        config={{ controlStyle: 'switch' }}
      />
    )

    // "Icon on top, vertical control, meta at bottom" — a tall tile that stacked
    // its control under the meta would just be a taller `glance`
    // (docs/specs/design-system — the tier table).
    expect(slotIndex('.liebe-icon')).toBeLessThan(slotIndex('[role="switch"]'))
    expect(slotIndex('[role="switch"]')).toBeLessThan(slotIndex('.liebe-meta'))
  })

  it('puts the switch after the meta in row', () => {
    renderCard(
      <InputBooleanCard
        entityId="input_boolean.guest_mode"
        tier="row"
        config={{ controlStyle: 'switch' }}
      />
    )

    // "Icon + meta in a row, plus the primary embedded control" — the control is
    // the trailing edge of the line, not something between icon and name.
    expect(slotIndex('.liebe-icon')).toBeLessThan(slotIndex('.liebe-meta'))
    expect(slotIndex('.liebe-meta')).toBeLessThan(slotIndex('[role="switch"]'))
  })
})

describe('InputNumberCard tiers', () => {
  beforeEach(() => seed(createInputNumberEntity()))

  it('anchors glance on the big value and carries no control at all', () => {
    renderCard(<InputNumberCard entityId="input_number.target_humidity" tier="glance" />)

    expect(arrangement()).toBe('stack')
    // "**Value big** — the current value as the large numeric readout with unit
    // muted; no control" (the option doc's tier table). The reading is the
    // state, so it takes the icon circle's place and the state line with it.
    expect(part('.liebe-value')).toHaveTextContent('45%')
    expect(part('.liebe-icon')).toBeNull()
    expect(part('.liebe-state')).toBeNull()

    // Every control is gone now, not just the two step buttons: the readout the
    // tile kept until 0022 is replaced by the dialog control the `more-info`
    // tap reaches (see "operability of the control-free glance tiles" below).
    expect(part('.liebe-card-controls')).toBeNull()
    expect(screen.queryByLabelText('Decrease value')).toBeNull()
    expect(screen.queryByLabelText('Increase value')).toBeNull()
    expect(screen.queryByRole('button', { name: /Set value/ })).toBeNull()
  })

  it('shows a dash for a helper publishing no number', () => {
    seed(createInputNumberEntity({ state: 'unknown' }))
    renderCard(<InputNumberCard entityId="input_number.target_humidity" tier="glance" />)

    // `parseFloat('unknown')` is `NaN`, and `toFixed` spells that out. Harmless
    // while the value sat inside a button among other controls; at `glance` it
    // is the only thing the tile shows.
    expect(part('.liebe-value')).toHaveTextContent('—')
    expect(part('.liebe-value')).not.toHaveTextContent('NaN')
  })

  it.each([
    ['row', 'row'],
    ['full', 'row'],
  ] as const)('gives %s the whole stepper when the card asks for one', (tier, shape) => {
    // The fixture helper is `mode: slider`, which is now the default this card
    // follows; the stepper is what an explicit `controlStyle` selects. Both
    // tiers here are at least two columns wide, which is the whole condition —
    // see `tall` below.
    renderCard(
      <InputNumberCard
        entityId="input_number.target_humidity"
        tier={tier}
        config={{ controlStyle: 'stepper' }}
      />
    )

    expect(arrangement()).toBe(shape)
    expect(part('.liebe-icon')).not.toBeNull()
    expect(screen.getByLabelText('Decrease value')).toBeInTheDocument()
    expect(screen.getByLabelText('Increase value')).toBeInTheDocument()
  })

  it('gives tall the vertical slider instead, however the card is configured', () => {
    /*
     * `tall` is one column wide by definition, and the stepper is a row of
     * buttons sized by its contents — 156px of them against a 35px content
     * region on a 12-column desktop grid, which the tile clipped. The tier
     * renders its own vertical slider instead and leaves the stored option
     * alone (docs/specs/entity-cards/options/input-helpers.md — `input_number`;
     * docs/specs/design-system — cross-axis fit; change 0042).
     */
    renderCard(
      <InputNumberCard
        entityId="input_number.target_humidity"
        tier="tall"
        config={{ controlStyle: 'stepper' }}
      />
    )

    expect(arrangement()).toBe('tall')
    expect(part('.liebe-icon')).not.toBeNull()
    expect(part('.liebe-slider')).toHaveAttribute('data-orientation', 'vertical')
    expect(screen.queryByLabelText('Decrease value')).toBeNull()
    expect(screen.queryByLabelText('Increase value')).toBeNull()
    expect(screen.queryByRole('button', { name: /Set value/ })).toBeNull()
  })

  it.each(['glance', 'row', 'tall'] as const)('omits the range line at %s', (tier) => {
    renderCard(<InputNumberCard entityId="input_number.target_humidity" tier={tier} />)

    expect(screen.queryByText('0 - 100')).toBeNull()
  })

  it('shows the range line in full', () => {
    renderCard(<InputNumberCard entityId="input_number.target_humidity" tier="full" />)

    expect(screen.getByText('0 - 100')).toBeInTheDocument()
  })
})

describe('InputSelectCard tiers', () => {
  beforeEach(() => seed(createInputSelectEntity()))

  it.each([
    ['row', 'row'],
    ['tall', 'tall'],
    ['full', 'row'],
  ] as const)('keeps the dropdown at %s', (tier, shape) => {
    renderCard(<InputSelectCard entityId="input_select.house_mode" tier={tier} />)

    expect(arrangement()).toBe(shape)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('reads the current option out as the state at glance, with no dropdown', () => {
    renderCard(<InputSelectCard entityId="input_select.house_mode" tier="glance" />)

    // "Icon + name + **current option as state**; tap → more-info" — the
    // dropdown is what the dialog control replaces.
    expect(arrangement()).toBe('stack')
    expect(part('.liebe-icon')).not.toBeNull()
    expect(part('.liebe-state')).toHaveTextContent('Home')
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(part('.liebe-card-controls')).toBeNull()
  })

  it.each(['glance', 'row', 'tall'] as const)('omits the option count at %s', (tier) => {
    renderCard(<InputSelectCard entityId="input_select.house_mode" tier={tier} />)

    expect(screen.queryByText('4 options')).toBeNull()
  })

  it('shows the option count in full', () => {
    renderCard(<InputSelectCard entityId="input_select.house_mode" tier="full" />)

    expect(screen.getByText('4 options')).toBeInTheDocument()
  })
})

describe('InputTextCard tiers', () => {
  beforeEach(() => seed(createInputTextEntity()))

  it.each([
    ['row', 'row'],
    ['full', 'row'],
  ] as const)('keeps the value field at %s', (tier, shape) => {
    renderCard(<InputTextCard entityId="input_text.doorbell_message" tier={tier} />)

    expect(arrangement()).toBe(shape)
    expect(part('.liebe-card-controls')).not.toBeNull()
    expect(screen.getByText('Please leave parcels at the side door')).toBeInTheDocument()
  })

  it('renders the tall shape with no field, which one column cannot hold', () => {
    /*
     * `tall` used to keep the field and no longer does (change 0042 PR 4). The
     * field carries a 100px readout and a 150px edit box, and a one-column tile
     * leaves a 35px content region — so the tile's `overflow: hidden` cropped
     * it, which is the clip the omit-never-clip rule forbids, and a field is
     * bounded by its content so it cannot be narrowed to fit either
     * (docs/specs/design-system — "Cross-axis fit";
     * docs/specs/entity-cards/options/input-helpers.md — the tier table).
     *
     * The shape is still `tall` — this is the tier rendering what it can hold,
     * not the card falling back to another arrangement.
     */
    renderCard(<InputTextCard entityId="input_text.doorbell_message" tier="tall" />)

    expect(arrangement()).toBe('tall')
    expect(part('.liebe-card-controls')).toBeNull()
    // The name is still there: the tile keeps saying which helper it is, and
    // the value is reachable through the dialog its tap now opens.
    expect(screen.getByText('Doorbell Message')).toBeInTheDocument()
  })

  it('reads the value out as the state at glance, with no field', () => {
    renderCard(<InputTextCard entityId="input_text.doorbell_message" tier="glance" />)

    // "Icon + name + value as state (masked if password); tap → more-info".
    expect(arrangement()).toBe('stack')
    expect(part('.liebe-state')).toHaveTextContent('Please leave parcels at the side door')
    expect(part('.liebe-card-controls')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit value' })).toBeNull()
  })

  it('says the value is empty at glance rather than showing an empty line', () => {
    seed(createInputTextEntity({ state: '' }))
    renderCard(<InputTextCard entityId="input_text.doorbell_message" tier="glance" />)

    expect(part('.liebe-state')).toHaveTextContent('(empty)')
  })

  it('declines a configured toggle at glance, where there is no field to open', async () => {
    const user = userEvent.setup()
    renderCard(<InputTextCard entityId="input_text.doorbell_message" tier="glance" />, {
      tapAction: 'toggle',
    })

    await user.click(card())

    /*
     * The card keeps passing `onClick` at every tier, because an absent handler
     * tells the shell the card has no toggle of its own and routes `toggle` to
     * `homeassistant.toggle` on an `input_text`. At `glance` the handler has
     * nothing to do — no field is rendered — so it declines rather than setting
     * an edit state nothing would show.
     */
    expect(hass.callService).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Value')).toBeNull()
  })

  it('masks a password helper in the glance state line', () => {
    seed(createInputTextEntity({ state: 'hunter2', attributes: { mode: 'password' } }))
    renderCard(<InputTextCard entityId="input_text.doorbell_message" tier="glance" />)

    // The value moved from a readout inside the control to the state line, and
    // the mask MUST have moved with it: the guarantee is per value, not per
    // surface (docs/specs/entity-cards/options/input-helpers.md).
    expect(part('.liebe-state')).toHaveTextContent('••••••••')
    expect(card()).not.toHaveTextContent('hunter2')
  })

  it.each(['glance', 'row', 'tall'] as const)('omits the length line at %s', (tier) => {
    renderCard(<InputTextCard entityId="input_text.doorbell_message" tier={tier} />)

    expect(screen.queryByText('0 - 255 chars')).toBeNull()
  })

  it('shows the length line in full', () => {
    renderCard(<InputTextCard entityId="input_text.doorbell_message" tier="full" />)

    expect(screen.getByText('0 - 255 chars')).toBeInTheDocument()
  })
})

describe('InputDateTimeCard tiers', () => {
  beforeEach(() => seed(createInputDateTimeEntity()))

  it.each([
    ['row', 'row'],
    ['full', 'row'],
  ] as const)('keeps the picker at %s', (tier, shape) => {
    renderCard(<InputDateTimeCard entityId="input_datetime.wake_up" tier={tier} />)

    expect(arrangement()).toBe(shape)
    expect(part('.liebe-card-controls')).not.toBeNull()
  })

  it('renders the tall shape with no picker, on the worst measurement of the set', () => {
    // 120px readout, 200px edit field, 35px region — the same rule as the text
    // helper above, on the widest fixed inline sizes any card carries.
    renderCard(<InputDateTimeCard entityId="input_datetime.wake_up" tier="tall" />)

    expect(arrangement()).toBe('tall')
    expect(part('.liebe-card-controls')).toBeNull()
  })

  it('reads the formatted value out as the state at glance, with no picker', () => {
    renderCard(<InputDateTimeCard entityId="input_datetime.wake_up" tier="glance" />)

    // "Icon + name + formatted value / `(not set)`; tap → more-info".
    expect(arrangement()).toBe('stack')
    expect(part('.liebe-state')).toHaveTextContent(new Date('2026-07-26 06:30:00').toLocaleString())
    expect(part('.liebe-card-controls')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit value' })).toBeNull()
  })

  it('reads (not set) out at glance for a helper with no value', () => {
    seed(createInputDateTimeEntity({ state: 'unknown' }))
    renderCard(<InputDateTimeCard entityId="input_datetime.wake_up" tier="glance" />)

    expect(part('.liebe-state')).toHaveTextContent('(not set)')
  })

  it('reads a date-only helper out as a date at glance', () => {
    seed(createInputDateTimeEntity({ attributes: { has_time: false } }))
    renderCard(<InputDateTimeCard entityId="input_datetime.wake_up" tier="glance" />)

    expect(part('.liebe-state')).toHaveTextContent(
      new Date('2026-07-26 06:30:00').toLocaleDateString()
    )
  })

  it('reads a time-only helper out as a time at glance', () => {
    /*
     * The state still carries a date here, which is the transitional shape a
     * helper is in for as long as it takes Home Assistant to rewrite the state
     * after `has_date` is turned off in the helper's settings. It is also the
     * only shape that reaches this half of the formatter at all: a settled
     * time-only helper publishes `06:30:00`, which `new Date` rejects and the
     * formatter passes through verbatim.
     */
    seed(createInputDateTimeEntity({ attributes: { has_date: false } }))
    renderCard(<InputDateTimeCard entityId="input_datetime.wake_up" tier="glance" />)

    expect(part('.liebe-state')).toHaveTextContent(
      new Date('2026-07-26 06:30:00').toLocaleTimeString()
    )
  })

  it('declines a configured toggle at glance, where there is no picker to open', async () => {
    const user = userEvent.setup()
    renderCard(<InputDateTimeCard entityId="input_datetime.wake_up" tier="glance" />, {
      tapAction: 'toggle',
    })

    await user.click(card())

    // As for `input_text`: the handler stays passed so the shell knows the card
    // owns its toggle, and declines where there is nothing to open.
    expect(hass.callService).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Value')).toBeNull()
  })

  it.each(['glance', 'row', 'tall'] as const)('omits the date/time mode line at %s', (tier) => {
    renderCard(<InputDateTimeCard entityId="input_datetime.wake_up" tier={tier} />)

    expect(screen.queryByText('Date & Time')).toBeNull()
  })

  it('shows the date/time mode line in full', () => {
    renderCard(<InputDateTimeCard entityId="input_datetime.wake_up" tier="full" />)

    expect(screen.getByText('Date & Time')).toBeInTheDocument()
  })

  it('renders no mode line for a helper carrying neither half', () => {
    seed(createInputDateTimeEntity({ attributes: { has_date: false, has_time: false } }))
    renderCard(<InputDateTimeCard entityId="input_datetime.wake_up" tier="full" />)

    // Not a shape Home Assistant produces, but the card has always rendered no
    // line rather than a wrong one, and moving the line into `full` must not
    // change that.
    expect(part('.liebe-state')).toBeNull()
  })
})

/*
 * The unavailable tile the five input-helper cards render instead of
 * themselves. It is a tile like any other and takes the tier of the card it
 * stands in for (docs/specs/design-system — "Size-adaptive layouts"), so it
 * went through the same layout rewrite; these pin that it did, including the
 * name fallback it has always carried for an entity with no friendly name.
 */
describe('the unavailable tile', () => {
  const helpers = [
    ['InputBooleanCard', InputBooleanCard, createInputBooleanEntity, 'guest_mode'],
    ['InputNumberCard', InputNumberCard, createInputNumberEntity, 'target_humidity'],
    ['InputSelectCard', InputSelectCard, createInputSelectEntity, 'house_mode'],
    ['InputTextCard', InputTextCard, createInputTextEntity, 'doorbell_message'],
    ['InputDateTimeCard', InputDateTimeCard, createInputDateTimeEntity, 'wake_up'],
  ] as const

  it.each(helpers)(
    '%s names the tile from the entity id and follows the tier',
    (_name, Card, createEntity, objectId) => {
      const entity = createEntity({
        state: 'unavailable',
        attributes: { friendly_name: undefined },
      })
      seed(entity)

      renderCard(<Card entityId={entity.entity_id} tier="glance" />)

      expect(card()).toHaveAttribute('data-unavailable', 'true')
      expect(arrangement()).toBe('stack')
      expect(screen.getByText(objectId)).toBeInTheDocument()
      expect(part('.liebe-state')).toHaveTextContent('Unavailable')
    }
  )
})

/*
 * That a control-free `glance` tile can still operate its helper.
 *
 * This is the invariant change 0011 deferred on. The four non-boolean helpers
 * kept a minimal control at one cell because removing it would have left the
 * tile with no way to operate the entity at all; 0022 registers their controls
 * into the detail dialog, so the tile's `default` tap resolves to `more-info`
 * and the control is one tap away instead of gone
 * (docs/specs/entity-cards/options/input-helpers.md — the tier table).
 *
 * These drive the *whole* path, from the 1×1 tile to the service call, because
 * that is the only thing the invariant is a statement about. A test that
 * rendered the dialog control directly would prove the control works and say
 * nothing about whether anything reaches it — and "nothing reaches it" is
 * precisely the regression a merge point can introduce here.
 *
 * The controls are driven from the keyboard: to a keyboard, a switch device or
 * a screen reader, a control that answers only to a pointer is as unoperable as
 * no control at all, and those are the users with the fewest ways around a tile
 * they cannot reach. So each one is focused as an element (a `div` with an
 * `onClick` cannot take focus, and the assertion fails on it) and then operated
 * with keys alone.
 */
describe('operability of the control-free glance tiles', () => {
  beforeEach(() => {
    // The dialog's history section subscribes a cached window and starts a
    // maintenance timer; without this they outlive the test that created them.
    entityHistoryService.reset()
  })

  afterEach(() => {
    entityHistoryService.reset()
  })

  /** Tap the tile — the whole of what a control-free `glance` offers. */
  async function tapTile(user: ReturnType<typeof userEvent.setup>) {
    await user.click(card())
    return screen.findByTestId('detail-controls')
  }

  it('reaches an operable input_number control from the tile', async () => {
    const user = userEvent.setup()
    seed(createInputNumberEntity())
    renderCard(<InputNumberCard entityId="input_number.target_humidity" tier="glance" />)

    const controls = await tapTile(user)

    // The fixture helper publishes `mode: slider`, and the dialog follows the
    // helper's own preference exactly as an unconfigured card's `full` tier
    // does — the same control, not a second one.
    const slider = within(controls).getByRole('slider')
    slider.focus()
    expect(slider).toHaveFocus()

    await user.keyboard('{ArrowRight}')

    expect(hass.callService).toHaveBeenCalledWith('input_number', 'set_value', {
      entity_id: 'input_number.target_humidity',
      value: 46,
    })
  })

  it('reaches an operable input_select control from the tile', async () => {
    const user = userEvent.setup()
    seed(createInputSelectEntity())
    renderCard(<InputSelectCard entityId="input_select.house_mode" tier="glance" />)

    const controls = await tapTile(user)

    const trigger = within(controls).getByRole('combobox')
    trigger.focus()
    expect(trigger).toHaveFocus()

    await user.keyboard('{Enter}')
    const listbox = await screen.findByRole('listbox')
    await user.click(within(listbox).getByText('Away'))

    expect(hass.callService).toHaveBeenCalledWith('input_select', 'select_option', {
      entity_id: 'input_select.house_mode',
      option: 'Away',
    })
  })

  it('reaches an operable input_text control from the tile', async () => {
    const user = userEvent.setup()
    seed(createInputTextEntity())
    renderCard(<InputTextCard entityId="input_text.doorbell_message" tier="glance" />)

    const controls = await tapTile(user)

    // Icon-only, so without the explicit name it would announce as an
    // unlabelled button — focusable but not identifiable.
    const edit = within(controls).getByRole('button', { name: 'Edit value' })
    edit.focus()
    expect(edit).toHaveFocus()

    await user.keyboard('{Enter}')
    const field = screen.getByLabelText('Value')
    await user.clear(field)
    await user.type(field, 'Ring twice{Enter}')

    expect(hass.callService).toHaveBeenCalledWith('input_text', 'set_value', {
      entity_id: 'input_text.doorbell_message',
      value: 'Ring twice',
    })
  })

  it('reaches an operable input_datetime control from the tile', async () => {
    const user = userEvent.setup()
    seed(createInputDateTimeEntity())
    renderCard(<InputDateTimeCard entityId="input_datetime.wake_up" tier="glance" />)

    const controls = await tapTile(user)

    const edit = within(controls).getByRole('button', { name: 'Edit value' })
    edit.focus()
    expect(edit).toHaveFocus()

    await user.keyboard('{Enter}')
    // A `datetime-local` field has no implicit ARIA role, so the label is what
    // makes it findable — which is the same reason a user needs it. It is also
    // not something `user.type` can drive, so the value is set the way the
    // native picker sets it.
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: '2026-07-27T07:15' } })
    await user.click(screen.getByRole('button', { name: 'Save value' }))

    expect(hass.callService).toHaveBeenCalledWith('input_datetime', 'set_datetime', {
      entity_id: 'input_datetime.wake_up',
      datetime: '2026-07-27 07:15:00',
    })
  })

  it('leaves the boolean tile toggling itself rather than opening the dialog', async () => {
    const user = userEvent.setup()
    seed(createInputBooleanEntity())
    renderCard(<InputBooleanCard entityId="input_boolean.guest_mode" tier="glance" />)

    await user.click(card())

    // `input_boolean` is the helper this invariant never applied to: its
    // whole-tile toggle carries the operability, so `default` stays `toggle`
    // and the tap actuates rather than opening details.
    expect(hass.callService).toHaveBeenCalledWith('input_boolean', 'toggle', {
      entity_id: 'input_boolean.guest_mode',
    })
    expect(screen.queryByTestId('detail-controls')).toBeNull()
  })
})
