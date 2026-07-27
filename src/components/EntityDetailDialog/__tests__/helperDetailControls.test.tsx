import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EntityDetailDialog } from '../index'
import { getDetailControls } from '../detailControls'
import { REDACTED_PLACEHOLDER } from '../redaction'
import { HomeAssistantProvider, type HomeAssistant } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { entityHistoryService } from '~/services/entityHistory'
import { resetDispatchGuard } from '~/services/guardedDispatch'
import { dashboardActions } from '~/store'
import {
  createInputBooleanEntity,
  createInputDateTimeEntity,
  createInputNumberEntity,
  createInputSelectEntity,
  createInputTextEntity,
} from '~/test/fixtures'
import type { HassEntity } from '~/store/entityTypes'

/*
 * Importing the five card modules is what registers their controls: the family
 * that owns a control registers it at module scope, because the dialog cannot
 * import a card without closing a cycle back through `GridCard`
 * (docs/changes/0022-switch-input-helpers-to-spec.md — PR 4). In the panel that
 * import comes from the card registry; here it has to be written out.
 *
 * The named imports are what makes them *used* imports rather than side-effect
 * ones, and each is asserted against the registry below — so an accidental
 * `registerDetailControls` for the wrong domain is a failing test rather than a
 * dialog that silently mounts the wrong control.
 */
import { InputBooleanDetailControls } from '../../InputBooleanCard'
import { InputNumberDetailControls } from '../../InputNumberCard'
import { InputSelectDetailControls } from '../../InputSelectCard'
import { InputTextDetailControls } from '../../InputTextCard'
import { InputDateTimeDetailControls } from '../../InputDateTimeCard'

/**
 * The input helpers' domain controls, as the detail dialog mounts them.
 *
 * These are what makes the control-free `glance` tier legal: a 1×1 helper tile
 * renders its value and nothing else, and `default` resolves to `more-info`, so
 * the dialog is where the helper is operated
 * (docs/specs/entity-cards/options/input-helpers.md — the tier table). The path
 * *from the tile* is pinned in `components/__tests__/cardTierLayouts.test.tsx`;
 * this file is about what the controls do once mounted, and in particular about
 * the attribute shapes a user-defined helper can legally arrive in.
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

function openDialog(entityId: string) {
  return render(
    <Theme>
      <HomeAssistantProvider hass={hass}>
        <EntityDetailDialog entityId={entityId} open onOpenChange={vi.fn()} />
      </HomeAssistantProvider>
    </Theme>
  )
}

/** The domain control slot's contents, which is absent for an unregistered domain. */
const controls = () => screen.getByTestId('detail-controls')

beforeEach(() => {
  // The dialog's history section subscribes a cached window and starts a
  // maintenance timer; without this they outlive the test that created them.
  entityHistoryService.reset()
  // The pending set is process-wide, so without this the second test to issue
  // an identical command is refused — silently, since a refusal reports success.
  resetDispatchGuard()
  dashboardActions.resetState()
  hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
})

afterEach(() => {
  entityHistoryService.reset()
})

describe('input helper detail controls', () => {
  it('registers one control per helper domain, and only for that domain', () => {
    expect(getDetailControls('input_boolean')).toBe(InputBooleanDetailControls)
    expect(getDetailControls('input_number')).toBe(InputNumberDetailControls)
    expect(getDetailControls('input_select')).toBe(InputSelectDetailControls)
    expect(getDetailControls('input_text')).toBe(InputTextDetailControls)
    expect(getDetailControls('input_datetime')).toBe(InputDateTimeDetailControls)
  })

  it('mounts nothing for a domain no family has registered', () => {
    seed({
      entity_id: 'sensor.living_room_temperature',
      state: '21.4',
      attributes: { friendly_name: 'Living Room Temperature' },
      last_changed: '',
      last_updated: '',
      context: { id: '', parent_id: null, user_id: null },
    })
    openDialog('sensor.living_room_temperature')

    // The dialog stays generic: it gains no branch per domain, and a domain
    // with no registration simply has no control section.
    expect(screen.queryByTestId('detail-controls')).toBeNull()
  })

  describe('input_boolean', () => {
    it('toggles the helper from the dialog', async () => {
      const user = userEvent.setup()
      seed(createInputBooleanEntity())
      openDialog('input_boolean.guest_mode')

      await user.click(within(controls()).getByRole('switch', { name: 'Toggle Guest Mode' }))

      expect(hass.callService).toHaveBeenCalledWith('input_boolean', 'toggle', {
        entity_id: 'input_boolean.guest_mode',
      })
    })

    it('names the switch from the entity id when the helper has no friendly name', () => {
      seed(createInputBooleanEntity({ attributes: { friendly_name: undefined } }))
      openDialog('input_boolean.guest_mode')

      // The control is icon-free and otherwise unlabelled, so an entity with no
      // friendly name would leave a switch announcing nothing at all.
      expect(
        within(controls()).getByRole('switch', { name: 'Toggle input_boolean.guest_mode' })
      ).toBeInTheDocument()
    })

    it.each(['unavailable', 'unknown'])('never actuates from %s', (state) => {
      seed(createInputBooleanEntity({ state }))
      openDialog('input_boolean.guest_mode')

      // The direction is indeterminate — a helper Home Assistant has not
      // restored yet is neither on nor off — and a control must never actuate
      // what it cannot read (the option doc's `input_boolean` rules).
      expect(within(controls()).getByRole('switch')).toBeDisabled()
    })
  })

  describe('input_number', () => {
    it('follows the helper’s own mode rather than any card’s option', () => {
      seed(createInputNumberEntity({ attributes: { mode: 'box' } }))
      openDialog('input_number.target_humidity')

      // The dialog is opened for an entity, not for a card, so there is no
      // stored `controlStyle` in scope — the helper's `mode` is the only answer
      // that stays right when two cards for it are configured differently.
      expect(within(controls()).getByLabelText('Increase value')).toBeInTheDocument()
      expect(within(controls()).queryByRole('slider')).toBeNull()
    })

    it('commits a typed value, clamped to the helper’s bounds', async () => {
      const user = userEvent.setup()
      seed(createInputNumberEntity({ attributes: { mode: 'box' } }))
      openDialog('input_number.target_humidity')

      await user.click(within(controls()).getByRole('button', { name: /Set value/ }))
      await user.clear(screen.getByLabelText('Value'))
      await user.type(screen.getByLabelText('Value'), '140{Enter}')

      expect(hass.callService).toHaveBeenCalledWith('input_number', 'set_value', {
        entity_id: 'input_number.target_humidity',
        value: 100,
      })
    })

    it('reverts the readout on blur without sending anything', async () => {
      const user = userEvent.setup()
      seed(createInputNumberEntity({ attributes: { mode: 'box' } }))
      openDialog('input_number.target_humidity')

      await user.click(within(controls()).getByRole('button', { name: /Set value/ }))
      await user.clear(screen.getByLabelText('Value'))
      await user.type(screen.getByLabelText('Value'), '60')
      // Leaving the field is abandoning the edit, not committing it — the
      // dialog holds several focusable controls, so tabbing away is an ordinary
      // thing to do mid-edit and must not set the helper.
      await user.tab()

      expect(hass.callService).not.toHaveBeenCalled()
      expect(
        within(controls()).getByRole('button', { name: 'Set value, currently 45 %' })
      ).toBeInTheDocument()
    })

    it('steps a helper that publishes no bounds at all', async () => {
      const user = userEvent.setup()
      /*
       * Everything but `mode` is optional on a hand-edited helper: no `min`, no
       * `max`, no `step`. Nothing constrains the value, so nothing is clamped
       * and nothing is disabled, and the step is the documented default of 1.
       *
       * The state is deliberately the *fixture's* upper bound: with `max: 100`
       * still in place the button would be disabled and the value pinned at
       * 100, so 101 is only reachable if the absence really did remove it.
       */
      seed(
        createInputNumberEntity({
          state: '100',
          attributes: {
            mode: 'box',
            min: undefined,
            max: undefined,
            step: undefined,
            unit_of_measurement: undefined,
          },
        })
      )
      openDialog('input_number.target_humidity')

      const increase = within(controls()).getByLabelText('Increase value')
      expect(increase).toBeEnabled()
      await user.click(increase)

      expect(hass.callService).toHaveBeenCalledWith('input_number', 'set_value', {
        entity_id: 'input_number.target_humidity',
        value: 101,
      })
    })

    it('refuses to step a helper publishing no number', () => {
      seed(createInputNumberEntity({ state: 'unknown', attributes: { mode: 'box' } }))
      openDialog('input_number.target_humidity')

      /*
       * `unknown` is a state Home Assistant publishes for a helper it has not
       * restored yet. Stepping from it computes `NaN + 1`, and dispatching
       * `set_value: NaN` is neither what the user asked for nor something Home
       * Assistant accepts — so both buttons are held shut, and the readout says
       * there is no value rather than spelling out "NaN".
       */
      expect(within(controls()).getByLabelText('Increase value')).toBeDisabled()
      expect(within(controls()).getByLabelText('Decrease value')).toBeDisabled()
      expect(
        within(controls()).getByRole('button', { name: /Set value, currently —/ })
      ).toBeInTheDocument()
    })
  })

  describe('input_select', () => {
    it('selects an option from the dialog', async () => {
      const user = userEvent.setup()
      seed(createInputSelectEntity())
      openDialog('input_select.house_mode')

      await user.click(within(controls()).getByRole('combobox'))
      await user.click(within(await screen.findByRole('listbox')).getByText('Night'))

      expect(hass.callService).toHaveBeenCalledWith('input_select', 'select_option', {
        entity_id: 'input_select.house_mode',
        option: 'Night',
      })
    })

    it.each([
      ['absent', undefined],
      ['empty', []],
      ['not a list', 'Home,Away'],
      ['a list of nothing usable', [1, null, { name: 'Home' }]],
    ])('disables the control for an options attribute that is %s', (_shape, options) => {
      /*
       * `options` is user-defined and reaches the card straight off a
       * hand-editable helper, so every one of these is a shape it can legally
       * arrive in — and all four mean the same thing: there is nothing to pick.
       * A disabled control that says so is the answer; a control that renders
       * an empty list, or one that throws on `.map`, is not.
       */
      seed(createInputSelectEntity({ attributes: { options } }))
      openDialog('input_select.house_mode')

      expect(within(controls()).getByRole('combobox')).toBeDisabled()
    })
  })

  describe('input_text', () => {
    it('sets the value from the dialog', async () => {
      const user = userEvent.setup()
      seed(createInputTextEntity())
      openDialog('input_text.doorbell_message')

      await user.click(within(controls()).getByRole('button', { name: 'Edit value' }))
      await user.clear(screen.getByLabelText('Value'))
      await user.type(screen.getByLabelText('Value'), 'Ring twice{Enter}')

      expect(hass.callService).toHaveBeenCalledWith('input_text', 'set_value', {
        entity_id: 'input_text.doorbell_message',
        value: 'Ring twice',
      })
    })

    it('masks a password helper in the control it mounts, not only in the state display', async () => {
      const user = userEvent.setup()
      seed(createInputTextEntity({ state: 'hunter2', attributes: { mode: 'password' } }))
      openDialog('input_text.doorbell_message')

      /*
       * The dialog now offers a *field over the helper's value*, which is a
       * second way for the secret to reach the screen: redaction covers the
       * state display and the attribute list, and would not have covered this.
       * The guarantee is per value and binds every surface, so it binds the
       * control too (docs/specs/entity-cards/options/input-helpers.md).
       */
      expect(screen.getByTestId('detail-state')).toHaveTextContent(REDACTED_PLACEHOLDER)
      expect(within(controls()).getByText(REDACTED_PLACEHOLDER)).toBeInTheDocument()
      expect(document.body).not.toHaveTextContent('hunter2')

      await user.click(within(controls()).getByRole('button', { name: 'Edit value' }))

      // And in the field being typed into, which is where an unmasked editor
      // would put the secret back on screen one click later.
      expect(screen.getByLabelText('Value')).toHaveAttribute('type', 'password')
      expect(document.body).not.toHaveTextContent('hunter2')
    })
  })

  describe('input_datetime', () => {
    it('sets a combined helper from the dialog', async () => {
      const user = userEvent.setup()
      seed(createInputDateTimeEntity())
      openDialog('input_datetime.wake_up')

      await user.click(within(controls()).getByRole('button', { name: 'Edit value' }))
      fireEvent.change(screen.getByLabelText('Value'), { target: { value: '2026-07-27T07:15' } })
      await user.click(screen.getByRole('button', { name: 'Save value' }))

      expect(hass.callService).toHaveBeenCalledWith('input_datetime', 'set_datetime', {
        entity_id: 'input_datetime.wake_up',
        datetime: '2026-07-27 07:15:00',
      })
    })

    it('reports the shape a helper carrying neither half wanted, and sends nothing', async () => {
      const user = userEvent.setup()
      seed(createInputDateTimeEntity({ attributes: { has_date: false, has_time: false } }))
      openDialog('input_datetime.wake_up')

      await user.click(within(controls()).getByRole('button', { name: 'Edit value' }))
      fireEvent.change(screen.getByLabelText('Value'), { target: { value: '2026-07-27T07:15' } })
      await user.click(screen.getByRole('button', { name: 'Save value' }))

      /*
       * Not a helper Home Assistant produces, but a hand-edited one reaches the
       * dialog all the same, and `set_datetime` has no field set that satisfies
       * it — so nothing is sent. The message matters because the dialog is
       * where a 1×1 helper is operated at all: without it the save is
       * indistinguishable from a save that silently did nothing.
       */
      expect(hass.callService).not.toHaveBeenCalled()
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'input_datetime.wake_up has neither a date nor a time to set'
      )
    })
  })
})
