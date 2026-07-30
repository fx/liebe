import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@radix-ui/themes'
import { InputBooleanCard } from '../InputBooleanCard'
import { InputNumberCard } from '../InputNumberCard'
import { InputSelectCard } from '../InputSelectCard'
import { CardItemProvider } from '../cardItemContext'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import { hassService } from '~/services/hassService'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import type { HassEntity } from '~/store/entityTypes'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * `controlStyle` as it renders and dispatches
 * (docs/specs/entity-cards/options/input-helpers.md).
 *
 * Driven through the real cards and the real entity store, with only the Home
 * Assistant connection stubbed, so a payload assertion is on what would reach
 * Home Assistant rather than on a mocked hook.
 */
describe('input helper controlStyle', () => {
  let hass: HomeAssistant

  const seed = (entity: HassEntity) => {
    entityStore.setState((state) => ({
      ...state,
      entities: { ...state.entities, [entity.entity_id]: entity },
      isConnected: true,
      isInitialLoading: false,
    }))
  }

  const entity = (
    entityId: string,
    state: string,
    attributes: Record<string, unknown>
  ): HassEntity => ({
    entity_id: entityId,
    state,
    attributes,
    last_changed: '2026-07-27T10:00:00Z',
    last_updated: '2026-07-27T10:00:00Z',
    context: { id: 'seed', parent_id: null, user_id: null },
  })

  function renderCard(ui: React.ReactElement, config: Record<string, unknown> = {}) {
    return render(
      <Theme>
        <HomeAssistantProvider hass={hass}>
          <CardItemProvider config={config}>{ui}</CardItemProvider>
        </HomeAssistantProvider>
      </Theme>
    )
  }

  beforeEach(() => {
    hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
    hassService.setHass(hass)
    dashboardActions.resetState()
    entityStore.setState((state) => ({ ...state, entities: {}, isConnected: true }))
  })

  afterEach(() => {
    dashboardActions.resetState()
    entityStore.setState((state) => ({ ...state, entities: {} }))
    hassService.setHass(null)
  })

  describe('input_boolean', () => {
    beforeEach(() => {
      seed(entity('input_boolean.guest_mode', 'off', { friendly_name: 'Guest Mode' }))
    })

    it('renders no discrete control under the tile default', () => {
      renderCard(<InputBooleanCard entityId="input_boolean.guest_mode" tier="row" />)
      expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    })

    it('renders the switch when configured, and it toggles', async () => {
      renderCard(<InputBooleanCard entityId="input_boolean.guest_mode" tier="row" />, {
        controlStyle: 'switch',
      })

      const control = screen.getByRole('switch')
      fireEvent.click(control)
      expect(hass.callService).toHaveBeenCalledWith('input_boolean', 'toggle', {
        entity_id: 'input_boolean.guest_mode',
      })
    })

    it('omits the switch at glance even when configured', () => {
      // A 1×1 tile holding an icon, a name, a state line and a 44px control
      // would clip one of them; the tile tap still toggles.
      renderCard(<InputBooleanCard entityId="input_boolean.guest_mode" tier="glance" />, {
        controlStyle: 'switch',
      })

      expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    })
  })

  describe('input_number', () => {
    const helper = (mode: string) =>
      entity('input_number.volume', '40', {
        friendly_name: 'Volume',
        min: 0,
        max: 100,
        step: 5,
        mode,
      })

    it('follows the helper’s slider mode with no option set', () => {
      seed(helper('slider'))
      renderCard(<InputNumberCard entityId="input_number.volume" tier="row" />)

      expect(screen.getByRole('slider')).toBeInTheDocument()
      expect(screen.queryByLabelText('Increase value')).not.toBeInTheDocument()
    })

    it('follows the helper’s box mode with no option set', () => {
      seed(helper('box'))
      renderCard(<InputNumberCard entityId="input_number.volume" tier="row" />)

      expect(screen.getByLabelText('Increase value')).toBeInTheDocument()
      expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    })

    it('lets the option override the helper in either direction', () => {
      seed(helper('slider'))
      const { unmount } = renderCard(
        <InputNumberCard entityId="input_number.volume" tier="row" />,
        {
          controlStyle: 'stepper',
        }
      )
      expect(screen.getByLabelText('Increase value')).toBeInTheDocument()
      unmount()

      seed(helper('box'))
      renderCard(<InputNumberCard entityId="input_number.volume" tier="row" />, {
        controlStyle: 'slider',
      })
      expect(screen.getByRole('slider')).toBeInTheDocument()
    })

    it('commits one quantized, clamped value on release', async () => {
      const user = userEvent.setup()
      seed(helper('slider'))
      renderCard(<InputNumberCard entityId="input_number.volume" tier="row" />)

      // Keyboard adjustment is a commit per step, which is the same path a
      // drag's release takes — and the one a test can drive deterministically.
      await user.tab()
      await user.keyboard('{ArrowRight}')

      expect(hass.callService).toHaveBeenCalledTimes(1)
      expect(hass.callService).toHaveBeenCalledWith('input_number', 'set_value', {
        entity_id: 'input_number.volume',
        // 40 + one 5-wide step, quantized and inside [0, 100].
        value: 45,
      })
    })

    it('clamps at the helper’s bound rather than stepping past it', async () => {
      const user = userEvent.setup()
      seed(
        entity('input_number.volume', '100', {
          friendly_name: 'Volume',
          min: 0,
          max: 100,
          step: 5,
          mode: 'slider',
        })
      )
      renderCard(<InputNumberCard entityId="input_number.volume" tier="row" />)

      await user.tab()
      await user.keyboard('{ArrowRight}')

      // Radix refuses to move past `max`, so nothing is dispatched at all.
      expect(hass.callService).not.toHaveBeenCalled()
    })

    it('renders a slider for a helper that publishes no bounds at all', () => {
      // A hand-made helper with nothing but a mode: the card falls back to a
      // 0-100 track with a step of 1, and names the slider from the entity id
      // because there is no friendly name to use.
      seed(entity('input_number.volume', 'unknown', { mode: 'slider' }))
      renderCard(<InputNumberCard entityId="input_number.volume" tier="row" />)

      const slider = screen.getByRole('slider', { name: 'Set volume' })
      expect(slider).toHaveAttribute('aria-valuemin', '0')
      expect(slider).toHaveAttribute('aria-valuemax', '100')
      // An unparseable state has no position, so the track sits at its floor
      // rather than at `NaN`, which Radix would refuse to render.
      expect(slider).toHaveAttribute('aria-valuenow', '0')
    })

    it('renders neither control style at glance', () => {
      seed(helper('slider'))
      renderCard(<InputNumberCard entityId="input_number.volume" tier="glance" />)

      // `controlStyle` picks between two embedded controls, and one cell has
      // room for neither: the tier is the value and the name, with the control
      // reached through the detail dialog instead
      // (docs/specs/entity-cards/options/input-helpers.md — the tier table).
      expect(screen.queryByRole('slider')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Increase value')).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/Set value, currently/)).not.toBeInTheDocument()
    })

    it('renders the vertical slider at tall even where the stepper is stored', () => {
      /*
       * The one-column tier. A stepper is a row of buttons sized by its
       * contents — 156px of them — and a `tall` tile's content region is 35px
       * on a 12-column desktop grid, so rendering it there hangs it past the
       * tile's own edge, which the tile clips. The tier's vertical slider
       * renders instead (docs/specs/entity-cards/options/input-helpers.md —
       * `input_number`; docs/specs/design-system — cross-axis fit).
       *
       * `mode: 'box'` as well as the stored option, so this is the case where
       * BOTH inputs ask for the stepper and neither is what renders.
       */
      seed(helper('box'))
      renderCard(<InputNumberCard entityId="input_number.volume" tier="tall" />, {
        controlStyle: 'stepper',
      })

      const slider = screen.getByRole('slider', { name: 'Set Volume' })
      expect(slider.closest('.liebe-slider')).toHaveAttribute('data-orientation', 'vertical')
      // Not merely "a slider is present": the stepper's three surfaces are all
      // gone, so nothing is left to be clipped against the tile's edge.
      expect(screen.queryByLabelText('Increase value')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Decrease value')).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/Set value, currently/)).not.toBeInTheDocument()
    })

    it('returns to the stored stepper on the tiers that are wider than one column', () => {
      /*
       * The fallback is presentation, not a migration: the same stored config
       * that renders a slider at `tall` renders the stepper at `row` and at
       * `full`, so a card resized back gets its stepper without any
       * configuration change.
       */
      seed(helper('box'))
      const stored = { controlStyle: 'stepper' }

      const tall = renderCard(
        <InputNumberCard entityId="input_number.volume" tier="tall" />,
        stored
      )
      expect(screen.queryByLabelText('Increase value')).not.toBeInTheDocument()
      tall.unmount()

      const row = renderCard(<InputNumberCard entityId="input_number.volume" tier="row" />, stored)
      expect(screen.getByLabelText('Increase value')).toBeInTheDocument()
      expect(screen.queryByRole('slider')).not.toBeInTheDocument()
      row.unmount()

      renderCard(<InputNumberCard entityId="input_number.volume" tier="full" />, stored)
      expect(screen.getByLabelText('Increase value')).toBeInTheDocument()
      expect(screen.queryByRole('slider')).not.toBeInTheDocument()

      // And the card never rewrote what it was handed — the option still says
      // `stepper` after a tier that could not render one.
      expect(stored).toEqual({ controlStyle: 'stepper' })
    })
  })

  describe('input_select', () => {
    const helper = (options: unknown) =>
      entity('input_select.house_mode', 'Home', { friendly_name: 'House Mode', options })

    it('renders pills at full with five or fewer options, and selecting one dispatches', () => {
      seed(helper(['Home', 'Away', 'Night']))
      renderCard(<InputSelectCard entityId="input_select.house_mode" tier="full" />, {
        controlStyle: 'pills',
      })

      expect(screen.getByRole('button', { name: 'Away' })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Away' }))

      expect(hass.callService).toHaveBeenCalledWith('input_select', 'select_option', {
        entity_id: 'input_select.house_mode',
        option: 'Away',
      })
    })

    it('names the pill group from the entity id when the helper has no friendly name', () => {
      seed(entity('input_select.house_mode', 'Home', { options: ['Home', 'Away'] }))
      renderCard(<InputSelectCard entityId="input_select.house_mode" tier="full" />, {
        controlStyle: 'pills',
      })

      // The group's label is what tells a screen reader which helper these
      // pills belong to; an entity with no friendly name must still get one.
      expect(screen.getByRole('group', { name: 'house_mode' })).toBeInTheDocument()
    })

    it('marks the current option selected and refuses to re-send it', () => {
      seed(helper(['Home', 'Away']))
      renderCard(<InputSelectCard entityId="input_select.house_mode" tier="full" />, {
        controlStyle: 'pills',
      })

      const current = screen.getByRole('button', { name: 'Home' })
      expect(current).toHaveAttribute('aria-pressed', 'true')
      expect(current).toBeDisabled()
    })

    it('falls back to the dropdown below full', () => {
      seed(helper(['Home', 'Away', 'Night']))
      renderCard(<InputSelectCard entityId="input_select.house_mode" tier="row" />, {
        controlStyle: 'pills',
      })

      expect(screen.queryByRole('button', { name: 'Away' })).not.toBeInTheDocument()
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    it('falls back to the dropdown past five options', () => {
      seed(helper(['One', 'Two', 'Three', 'Four', 'Five', 'Six']))
      renderCard(<InputSelectCard entityId="input_select.house_mode" tier="full" />, {
        controlStyle: 'pills',
      })

      expect(screen.queryByRole('button', { name: 'Two' })).not.toBeInTheDocument()
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    it('renders the dropdown by default at every tier', () => {
      seed(helper(['Home', 'Away']))
      renderCard(<InputSelectCard entityId="input_select.house_mode" tier="full" />)

      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    it('survives a helper whose options are not a list', () => {
      seed(helper('Home'))
      renderCard(<InputSelectCard entityId="input_select.house_mode" tier="full" />, {
        controlStyle: 'pills',
      })

      // No options to offer: the dropdown renders, disabled, rather than the
      // card throwing on a `.length` of something that is not a list.
      expect(screen.getByRole('combobox')).toBeDisabled()
    })
  })

  /**
   * Accessible names on the two embedded controls
   * (docs/specs/design-system/index.md — card anatomy; the residue change
   * [0035](docs/changes/0035-light-appearance-contrast.md) PR 3 closed).
   *
   * The name has to identify the helper, not merely exist: a screen-reader
   * user meets these controls with no tile context, and "Toggle" or "Select"
   * alone tells them nothing about which helper they are about to change.
   */
  describe('embedded controls carry an accessible name', () => {
    it('names the select trigger after the helper', () => {
      seed(entity('input_select.house_mode', 'Home', { friendly_name: 'House Mode', options: [] }))
      renderCard(<InputSelectCard entityId="input_select.house_mode" tier="row" />)

      // `role="combobox"` takes no name from its contents, so the option
      // rendered inside the trigger cannot supply one.
      expect(screen.getByRole('combobox', { name: 'Select House Mode' })).toBeInTheDocument()
    })

    it('falls back to the entity id when the select helper has no friendly name', () => {
      seed(entity('input_select.house_mode', 'Home', { options: ['Home'] }))
      renderCard(<InputSelectCard entityId="input_select.house_mode" tier="row" />)

      expect(screen.getByRole('combobox', { name: 'Select house_mode' })).toBeInTheDocument()
    })

    it('names the boolean helper’s own-tile switch after the helper', () => {
      seed(entity('input_boolean.guest_mode', 'on', { friendly_name: 'Guest Mode' }))
      renderCard(<InputBooleanCard entityId="input_boolean.guest_mode" tier="row" />, {
        controlStyle: 'switch',
      })

      expect(screen.getByRole('switch', { name: 'Toggle Guest Mode' })).toBeInTheDocument()
    })

    it('falls back to the entity id when the boolean helper has no friendly name', () => {
      seed(entity('input_boolean.guest_mode', 'on', {}))
      renderCard(<InputBooleanCard entityId="input_boolean.guest_mode" tier="row" />, {
        controlStyle: 'switch',
      })

      expect(
        screen.getByRole('switch', { name: 'Toggle input_boolean.guest_mode' })
      ).toBeInTheDocument()
    })

    it('leaves an icon-only tile with its clipped label as the only anchor', () => {
      // `iconOnly` drops every body slot but the lead, the control included
      // (docs/specs/entity-cards/options/common.md — icon-only presentation),
      // so neither name above can be present to compete with the label the
      // tile keeps — nor can the tile end up with no name at all.
      seed(entity('input_boolean.guest_mode', 'on', { friendly_name: 'Guest Mode' }))
      render(
        <Theme>
          <HomeAssistantProvider hass={hass}>
            {/* The clipped label is built from the placed item's entity, which
                is what the grid publishes alongside the config. */}
            <CardItemProvider
              entityId="input_boolean.guest_mode"
              config={{ controlStyle: 'switch', iconOnly: true }}
            >
              <InputBooleanCard entityId="input_boolean.guest_mode" tier="row" />
            </CardItemProvider>
          </HomeAssistantProvider>
        </Theme>
      )

      expect(screen.queryByRole('switch')).not.toBeInTheDocument()
      expect(document.querySelector('.liebe-card-body-label')).toHaveTextContent(/^Guest Mode, on$/)
    })
  })
})
