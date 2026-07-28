import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import { resetDispatchGuard } from '~/services/guardedDispatch'
import { HOLD_DURATION_MS } from '~/store/cardActions'
import { entityHistoryService } from '~/services/entityHistory'
import { CardItemProvider } from '../../cardItemContext'
import { getDetailControls } from '../../EntityDetailDialog/detailControls'
import { EntityDetailDialog } from '../../EntityDetailDialog'
import { FanCard } from '..'
import type { HassEntity } from '~/store/entityTypes'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * The fan's controls in the detail dialog (docs/changes/0019 — PR 2).
 *
 * Two tiers need them and one option removes them: `glance` carries no embedded
 * control, `speedControl: none` takes the speed control off every other tier,
 * and the preset row is `full`-only — so without this a fan could be configured
 * into, or simply placed at, a size where it can only be switched on and off.
 *
 * The `glance` **tap stays toggle** per the fan contract; the dialog is reached
 * by holding, which is what the last case here drives.
 */

const ENTITY_ID = 'fan.bedroom'

let hass: HomeAssistant

function makeFan(state: string, attributes: Record<string, unknown> = {}): HassEntity {
  return {
    entity_id: ENTITY_ID,
    state,
    attributes: {
      friendly_name: 'Bedroom Fan',
      supported_features: 1,
      percentage: 50,
      ...attributes,
    } as HassEntity['attributes'],
    last_changed: '2026-07-27T10:00:00Z',
    last_updated: '2026-07-27T10:00:00Z',
    context: { id: 'ctx', parent_id: null, user_id: null },
  }
}

function seed(entity: HassEntity) {
  entityStore.setState((state) => ({
    ...state,
    isConnected: true,
    isInitialLoading: false,
    entities: { [entity.entity_id]: entity },
    staleEntities: new Set<string>(),
  }))
}

const renderDialog = () =>
  render(
    <Theme>
      <HomeAssistantProvider hass={hass}>
        <EntityDetailDialog entityId={ENTITY_ID} open onOpenChange={() => {}} />
      </HomeAssistantProvider>
    </Theme>
  )

beforeEach(() => {
  hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
  dashboardActions.resetState()
  resetDispatchGuard()
  entityHistoryService.reset()
})

afterEach(() => {
  entityHistoryService.reset()
  dashboardActions.resetState()
  resetDispatchGuard()
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

describe('registration', () => {
  it('claims the fan slot when the card module loads', () => {
    expect(FanCard).toBeDefined()
    expect(getDetailControls('fan')).toBeDefined()
  })
})

describe('FanDetailControls', () => {
  it('renders the speed slider for a speed-capable fan', () => {
    seed(makeFan('on'))
    renderDialog()

    expect(screen.getByLabelText('Fan speed')).toHaveAttribute('aria-valuetext', '50%')
  })

  it('commits a speed through the guarded path', () => {
    seed(makeFan('on'))
    renderDialog()

    const thumb = screen.getByLabelText('Fan speed')
    fireEvent.keyDown(thumb, { key: 'ArrowRight' })
    fireEvent.keyUp(thumb, { key: 'ArrowRight' })

    expect(hass.callService).toHaveBeenCalledWith('fan', 'set_percentage', {
      entity_id: ENTITY_ID,
      percentage: 51,
    })
  })

  it('turns the fan off at zero, exactly as the card does', () => {
    seed(makeFan('on'))
    renderDialog()

    const thumb = screen.getByLabelText('Fan speed')
    fireEvent.keyDown(thumb, { key: 'Home' })
    fireEvent.keyUp(thumb, { key: 'Home' })

    expect(hass.callService).toHaveBeenCalledWith('fan', 'turn_off', { entity_id: ENTITY_ID })
  })

  it('renders the preset pills, and dispatches one', () => {
    seed(
      makeFan('on', {
        supported_features: 9,
        preset_mode: 'auto',
        preset_modes: ['auto', 'sleep'],
      })
    )
    renderDialog()

    expect(screen.getByRole('button', { name: 'auto' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'sleep' }))

    expect(hass.callService).toHaveBeenCalledWith('fan', 'set_preset_mode', {
      entity_id: ENTITY_ID,
      preset_mode: 'sleep',
    })
  })

  it('renders the presets alone for a fan with no speed control', () => {
    seed(makeFan('on', { supported_features: 8, percentage: undefined, preset_modes: ['eco'] }))
    renderDialog()

    expect(screen.queryByLabelText('Fan speed')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'eco' })).toBeInTheDocument()
  })

  it('sits the slider at zero for a speed-capable fan that reports none', () => {
    // The bit without the value: `set_percentage` is supported, so the control
    // belongs there, but the fan has published nothing for it to sit at yet.
    seed(makeFan('on', { supported_features: 1, percentage: undefined }))
    renderDialog()

    expect(screen.getByLabelText('Fan speed')).toHaveAttribute('aria-valuetext', '0%')
  })

  it('renders nothing at all for a plain on/off fan', () => {
    seed(makeFan('on', { supported_features: 0, percentage: undefined }))
    renderDialog()

    expect(screen.queryByText('Controls')).not.toBeInTheDocument()
  })

  it('ignores a preset list that carries no usable modes', () => {
    seed(makeFan('on', { supported_features: 8, percentage: undefined, preset_modes: [1, null] }))
    renderDialog()

    expect(screen.queryByText('Controls')).not.toBeInTheDocument()
  })
})

describe('narrow-tier operability', () => {
  it('reaches the speed control by holding a glance-tier card', () => {
    vi.useFakeTimers()
    try {
      seed(makeFan('on'))

      render(
        <Theme>
          <HomeAssistantProvider hass={hass}>
            <CardItemProvider entityId={ENTITY_ID} config={{}}>
              <FanCard entityId={ENTITY_ID} tier="glance" />
            </CardItemProvider>
          </HomeAssistantProvider>
        </Theme>
      )

      // The tile itself carries nothing to adjust at this tier.
      expect(screen.queryByLabelText('Fan speed')).not.toBeInTheDocument()

      const card = document.querySelector('.liebe-card') as HTMLElement
      fireEvent.pointerDown(card, { isPrimary: true, button: 0 })
      act(() => {
        vi.advanceTimersByTime(HOLD_DURATION_MS)
      })
      fireEvent.pointerUp(card)

      expect(screen.getByLabelText('Fan speed')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('reaches it from a card configured to show no speed control', () => {
    vi.useFakeTimers()
    try {
      seed(makeFan('on'))

      render(
        <Theme>
          <HomeAssistantProvider hass={hass}>
            <CardItemProvider entityId={ENTITY_ID} config={{ speedControl: 'none' }}>
              <FanCard entityId={ENTITY_ID} tier="full" />
            </CardItemProvider>
          </HomeAssistantProvider>
        </Theme>
      )

      expect(screen.queryByLabelText('Fan speed')).not.toBeInTheDocument()

      const card = document.querySelector('.liebe-card') as HTMLElement
      fireEvent.pointerDown(card, { isPrimary: true, button: 0 })
      act(() => {
        vi.advanceTimersByTime(HOLD_DURATION_MS)
      })
      fireEvent.pointerUp(card)

      expect(screen.getByLabelText('Fan speed')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves the glance tap a toggle, not a dialog', () => {
    // The fan contract differs from the cover's here: a fan is safe to toggle
    // by a tap at every tier, and only the *hold* opens the dialog.
    seed(makeFan('on'))

    render(
      <Theme>
        <HomeAssistantProvider hass={hass}>
          <CardItemProvider entityId={ENTITY_ID} config={{}}>
            <FanCard entityId={ENTITY_ID} tier="glance" />
          </CardItemProvider>
        </HomeAssistantProvider>
      </Theme>
    )

    fireEvent.click(document.querySelector('.liebe-card')!)

    expect(hass.callService).toHaveBeenCalledWith('fan', 'turn_off', { entity_id: ENTITY_ID })
  })
})
