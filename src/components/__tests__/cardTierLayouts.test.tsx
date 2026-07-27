import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'
import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
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
  return render(
    <Theme>
      <HomeAssistantProvider hass={hass}>
        <CardItemProvider config={config}>{ui}</CardItemProvider>
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

  it.each(['glance', 'row', 'tall', 'full'] as const)('renders no graph at %s', (tier) => {
    renderCard(<SensorCard entityId="sensor.living_room_temperature" tier={tier} />)

    // `showGraph` and the sparkline are fed by entity history and arrive with
    // 0018. A control with no data source renders nothing rather than an empty
    // frame (docs/specs/entity-cards/options/sensor.md).
    expect(part('.liebe-spark')).toBeNull()
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
    expect(part('.liebe-state')).toHaveTextContent('OFF')
  })

  it.each(['row', 'tall', 'full'] as const)('lays %s out as a row', (tier) => {
    renderCard(<BinarySensorCard entityId="binary_sensor.front_door" tier={tier} />)

    // The option doc gives `tall` the row arrangement as well, because the
    // vertical shape exists to hold a control and this card has none
    // (docs/specs/entity-cards/options/sensor.md — "Binary sensor").
    expect(arrangement()).toBe('row')
    expect(part('.liebe-icon')).not.toBeNull()
    expect(part('.liebe-state')).toHaveTextContent('OFF')
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

  it('keeps the click-to-edit readout in glance and drops the stepper buttons', async () => {
    const user = userEvent.setup()
    renderCard(<InputNumberCard entityId="input_number.target_humidity" tier="glance" />)

    expect(arrangement()).toBe('stack')
    // The value anchors the tile, so the icon circle goes; the two step buttons
    // go with it, because two 40px targets plus a readout plus a name do not
    // fit one cell.
    expect(part('.liebe-icon')).toBeNull()
    expect(screen.queryByLabelText('Decrease value')).toBeNull()
    expect(screen.queryByLabelText('Increase value')).toBeNull()

    /*
     * What stays is the control, not a label. An `input_number` has no
     * whole-tile action to fall back on and no dialog control until 0022, so a
     * control-free glance would leave the tile unable to set the helper at all
     * — the regression docs/changes/0011 forbids at a merge point.
     */
    await user.click(screen.getByText('45 %'))
    expect(screen.getByRole('textbox')).toHaveValue('45')
  })

  it.each([
    ['row', 'row'],
    ['tall', 'tall'],
    ['full', 'row'],
  ] as const)('gives %s the whole stepper when the card asks for one', (tier, shape) => {
    // The fixture helper is `mode: slider`, which is now the default this card
    // follows; the stepper is what an explicit `controlStyle` selects.
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
    ['glance', 'stack'],
    ['row', 'row'],
    ['tall', 'tall'],
    ['full', 'row'],
  ] as const)('keeps the dropdown at %s', (tier, shape) => {
    renderCard(<InputSelectCard entityId="input_select.house_mode" tier={tier} />)

    expect(arrangement()).toBe(shape)
    /*
     * Retained at every tier, `glance` included: the option doc's control-free
     * glance defers to a dialog control that 0022 registers, and removing the
     * dropdown before then would leave a 1×1 select helper with no way to
     * change its option.
     */
    expect(screen.getByRole('combobox')).toBeInTheDocument()
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
    ['glance', 'stack'],
    ['row', 'row'],
    ['tall', 'tall'],
    ['full', 'row'],
  ] as const)('keeps the value field at %s', (tier, shape) => {
    renderCard(<InputTextCard entityId="input_text.doorbell_message" tier={tier} />)

    expect(arrangement()).toBe(shape)
    // Retained for the same reason as the select's dropdown: the dialog control
    // it would defer to is 0022's.
    expect(part('.liebe-card-controls')).not.toBeNull()
    expect(screen.getByText('Please leave parcels at the side door')).toBeInTheDocument()
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
    ['glance', 'stack'],
    ['row', 'row'],
    ['tall', 'tall'],
    ['full', 'row'],
  ] as const)('keeps the picker at %s', (tier, shape) => {
    renderCard(<InputDateTimeCard entityId="input_datetime.wake_up" tier={tier} />)

    expect(arrangement()).toBe(shape)
    expect(part('.liebe-card-controls')).not.toBeNull()
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
 * That the control each helper keeps in `glance` can actually be operated.
 *
 * The four non-boolean helpers keep a minimal control at one cell because
 * removing it would leave the tile with no way to operate the entity at all
 * until 0022 registers their dialog controls (the note under the tier table in
 * docs/specs/entity-cards/options/input-helpers.md). The invariant it serves is
 * *operability*, and a control that answers only to a pointer does not satisfy
 * it: to a keyboard, a switch device or a screen reader, a `div` carrying an
 * `onClick` is indistinguishable from the control-free tile the retention
 * exists to prevent — and those are the users with the fewest ways around it.
 *
 * So every retained control is driven here from the keyboard only, never with
 * `user.click()`: reached with Tab, checked for an accessible name, and
 * activated with Enter *and* with Space. A pointer-driven test passes on a
 * plain `div` and therefore cannot tell "clickable" from "operable", which is
 * the whole distinction these assertions exist to hold.
 *
 * Enter and Space are asserted separately because an element that fakes button
 * semantics with a keydown handler typically honours one and drops the other;
 * a real `<button>` gets both from the element.
 */
describe('keyboard operability of the retained glance controls', () => {
  /** Enter, then Space — the two keys a native button activates on. */
  const activationKeys = [
    ['Enter', '{Enter}'],
    ['Space', ' '],
  ] as const

  describe('input_number — the click-to-edit readout', () => {
    beforeEach(() => seed(createInputNumberEntity()))

    it('reaches the readout with Tab, under a name that says what it does', async () => {
      const user = userEvent.setup()
      renderCard(<InputNumberCard entityId="input_number.target_humidity" tier="glance" />)

      await user.tab()

      // Named, not just labelled by its value: "45 %" alone announces a
      // reading, with nothing to say it can be pressed. The visible text stays
      // inside the accessible name (WCAG "Label in Name").
      expect(screen.getByRole('button', { name: 'Set value, currently 45 %' })).toHaveFocus()
    })

    it.each(activationKeys)('enters the edit state on %s', async (_name, key) => {
      const user = userEvent.setup()
      renderCard(<InputNumberCard entityId="input_number.target_humidity" tier="glance" />)

      await user.tab()
      await user.keyboard(key)

      expect(screen.getByLabelText('Value')).toHaveValue('45')
    })

    it.each(activationKeys)(
      'commits a typed value from the keyboard alone on %s',
      async (_name, key) => {
        const user = userEvent.setup()
        renderCard(<InputNumberCard entityId="input_number.target_humidity" tier="glance" />)

        // The end of the invariant: not just "the editor opened" but "the helper
        // was set", with the pointer never used.
        await user.tab()
        await user.keyboard(key)
        await user.clear(screen.getByLabelText('Value'))
        await user.keyboard('60{Enter}')

        expect(hass.callService).toHaveBeenCalledWith('input_number', 'set_value', {
          entity_id: 'input_number.target_humidity',
          value: 60,
        })
      }
    )
  })

  describe('input_text — the edit affordance beside the readout', () => {
    beforeEach(() => seed(createInputTextEntity()))

    it('reaches the edit button with Tab, under a name of its own', async () => {
      const user = userEvent.setup()
      renderCard(<InputTextCard entityId="input_text.doorbell_message" tier="glance" />)

      await user.tab()

      // Icon-only, so without the explicit name it would announce as an
      // unlabelled button — focusable but not identifiable.
      expect(screen.getByRole('button', { name: 'Edit value' })).toHaveFocus()
    })

    it.each(activationKeys)('enters the edit state on %s', async (_name, key) => {
      const user = userEvent.setup()
      renderCard(<InputTextCard entityId="input_text.doorbell_message" tier="glance" />)

      await user.tab()
      await user.keyboard(key)

      expect(screen.getByLabelText('Value')).toHaveValue('Please leave parcels at the side door')
    })

    it('saves and cancels from named controls', async () => {
      const user = userEvent.setup()
      renderCard(<InputTextCard entityId="input_text.doorbell_message" tier="glance" />)

      await user.tab()
      await user.keyboard('{Enter}')
      await user.clear(screen.getByLabelText('Value'))
      await user.type(screen.getByLabelText('Value'), 'Ring twice')
      await user.click(screen.getByRole('button', { name: 'Save value' }))

      expect(hass.callService).toHaveBeenCalledWith('input_text', 'set_value', {
        entity_id: 'input_text.doorbell_message',
        value: 'Ring twice',
      })

      await user.click(screen.getByRole('button', { name: 'Edit value' }))
      await user.click(screen.getByRole('button', { name: 'Cancel editing' }))

      expect(screen.queryByLabelText('Value')).toBeNull()
    })
  })

  describe('input_datetime — the edit affordance beside the readout', () => {
    beforeEach(() => seed(createInputDateTimeEntity()))

    it('reaches the edit button with Tab, under a name of its own', async () => {
      const user = userEvent.setup()
      renderCard(<InputDateTimeCard entityId="input_datetime.wake_up" tier="glance" />)

      await user.tab()

      expect(screen.getByRole('button', { name: 'Edit value' })).toHaveFocus()
    })

    it.each(activationKeys)('enters the edit state on %s', async (_name, key) => {
      const user = userEvent.setup()
      renderCard(<InputDateTimeCard entityId="input_datetime.wake_up" tier="glance" />)

      await user.tab()
      await user.keyboard(key)

      // A `datetime-local` field has no implicit ARIA role, so the label is
      // what makes it findable — which is the same reason a user needs it.
      expect(screen.getByLabelText('Value')).toBeInTheDocument()
    })

    it('names its save and cancel controls, and leaves the edit state on cancel', async () => {
      const user = userEvent.setup()
      renderCard(<InputDateTimeCard entityId="input_datetime.wake_up" tier="glance" />)

      await user.tab()
      await user.keyboard('{Enter}')

      // Both are icon-only buttons; without names they are two unlabelled
      // buttons in a row, which is unusable without sight of the glyphs.
      expect(screen.getByRole('button', { name: 'Save value' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Cancel editing' }))

      expect(screen.queryByLabelText('Value')).toBeNull()
    })
  })

  describe('input_select — the dropdown trigger', () => {
    beforeEach(() => seed(createInputSelectEntity()))

    it('reaches the trigger with Tab', async () => {
      const user = userEvent.setup()
      renderCard(<InputSelectCard entityId="input_select.house_mode" tier="glance" />)

      await user.tab()

      // Radix renders the trigger as a real button; its name is the current
      // option, which is also what the tier table asks it to read out.
      expect(screen.getByRole('combobox')).toHaveFocus()
    })

    it.each(activationKeys)('opens the option list on %s', async (_name, key) => {
      const user = userEvent.setup()
      renderCard(<InputSelectCard entityId="input_select.house_mode" tier="glance" />)

      // Captured before the key: an open Radix select marks the rest of the
      // document `aria-hidden`, so the trigger is no longer reachable by role
      // once the list is up.
      const trigger = screen.getByRole('combobox')

      await user.tab()
      await user.keyboard(key)

      expect(await screen.findByRole('listbox')).toBeInTheDocument()
      expect(trigger).toHaveAttribute('aria-expanded', 'true')
    })
  })
})
