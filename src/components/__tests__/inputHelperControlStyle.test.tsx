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

    it('keeps the readout and drops both controls at glance', () => {
      seed(helper('slider'))
      renderCard(<InputNumberCard entityId="input_number.volume" tier="glance" />)

      expect(screen.queryByRole('slider')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Increase value')).not.toBeInTheDocument()
      expect(screen.getByLabelText(/Set value, currently/)).toBeInTheDocument()
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
})
