import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { dashboardActions } from '~/store'
import { entityStore } from '~/store/entityStore'
import { confirmableService } from '~/hooks/useCardActions'
import { HOLD_DURATION_MS } from '~/store/cardActions'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * The `confirm` gate (docs/specs/entity-cards/options/switch.md).
 *
 * Driven through the real shell, because the contract is about *where* the gate
 * sits: after action resolution, so no gesture and no re-routed action reaches
 * the device by a path the dialog does not stand in.
 */
describe('confirmableService', () => {
  const entityId = 'switch.well_pump'

  it('gates the toggle route', () => {
    expect(confirmableService('toggle', entityId)).toBe('toggle')
  })

  it('gates this entity’s own on/off services', () => {
    for (const service of ['toggle', 'turn_on', 'turn_off'] as const) {
      expect(
        confirmableService({ action: 'call-service', service: `switch.${service}` }, entityId)
      ).toBe(service)
    }
  })

  it('gates the generic homeassistant aliases', () => {
    // An enumeration of `switch.*` would leave this open, which is the bypass
    // the common contract calls out by name.
    expect(
      confirmableService({ action: 'call-service', service: 'homeassistant.turn_off' }, entityId)
    ).toBe('turn_off')
  })

  it('gates an unmapped domain’s own on/off services', () => {
    // The fallback role: `siren.turn_on` on a siren card is exactly as
    // consequential as `switch.turn_on` on a switch.
    expect(
      confirmableService({ action: 'call-service', service: 'siren.turn_on' }, 'siren.garage')
    ).toBe('turn_on')
  })

  it('leaves unrelated services, other entities and non-toggling actions ungated', () => {
    expect(
      confirmableService({ action: 'call-service', service: 'switch.reload' }, entityId)
    ).toBeNull()
    expect(
      confirmableService(
        { action: 'call-service', service: 'switch.turn_on', data: { entity_id: 'switch.other' } },
        entityId
      )
    ).toBeNull()
    expect(
      confirmableService({ action: 'call-service', service: 'light.turn_on' }, entityId)
    ).toBeNull()
    expect(confirmableService('more-info', entityId)).toBeNull()
    expect(confirmableService('none', entityId)).toBeNull()
    expect(confirmableService({ action: 'navigate', target: 'kitchen' }, entityId)).toBeNull()
    expect(confirmableService('toggle', undefined)).toBeNull()
  })
})

describe('GridCard confirm gate', () => {
  let hass: HomeAssistant
  const ENTITY_ID = 'switch.well_pump'

  beforeEach(() => {
    vi.useFakeTimers()
    hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
    dashboardActions.resetState()
    entityStore.setState((state) => ({
      ...state,
      entities: {
        [ENTITY_ID]: {
          entity_id: ENTITY_ID,
          state: 'on',
          attributes: { friendly_name: 'Well Pump' },
          last_changed: '2026-07-27T10:00:00Z',
          last_updated: '2026-07-27T10:00:00Z',
          context: { id: 'seed', parent_id: null, user_id: null },
        },
      },
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
    dashboardActions.resetState()
    entityStore.setState((state) => ({ ...state, entities: {} }))
  })

  function renderCard(config: Record<string, unknown>, onToggle?: () => void) {
    return render(
      <Theme>
        <HomeAssistantProvider hass={hass}>
          <GridCard domain="switch" entityId={ENTITY_ID} isOn config={config} onClick={onToggle}>
            content
          </GridCard>
        </HomeAssistantProvider>
      </Theme>
    )
  }

  const card = () => document.querySelector('.liebe-card') as HTMLElement

  it('holds the card’s own toggle behind the dialog, and cancelling fires nothing', () => {
    const onToggle = vi.fn()
    renderCard({ confirm: true }, onToggle)

    fireEvent.click(card())
    expect(onToggle).not.toHaveBeenCalled()

    // Named, so the user knows what they are about to switch — and which way.
    expect(screen.getByText('Turn off Well Pump?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    act(() => {
      vi.runOnlyPendingTimers()
    })

    expect(onToggle).not.toHaveBeenCalled()
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('fires exactly one toggle on confirm', () => {
    const onToggle = vi.fn()
    renderCard({ confirm: true }, onToggle)

    fireEvent.click(card())
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }))

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('gates the shell’s own homeassistant.toggle fallback too', () => {
    // A card with no toggle of its own: the route changes, the gate does not.
    renderCard({ confirm: true })

    fireEvent.click(card())
    expect(hass.callService).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }))
    expect(hass.callService).toHaveBeenCalledTimes(1)
    expect(hass.callService).toHaveBeenCalledWith('homeassistant', 'toggle', {
      entity_id: ENTITY_ID,
    })
  })

  it('gates a toggle re-routed onto hold', () => {
    const onToggle = vi.fn()
    renderCard({ confirm: true, holdAction: 'toggle' }, onToggle)

    fireEvent.pointerDown(card(), { isPrimary: true, button: 0 })
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS)
    })
    fireEvent.pointerUp(card())

    expect(onToggle).not.toHaveBeenCalled()
    expect(screen.getByText('Turn off Well Pump?')).toBeInTheDocument()
  })

  it('gates a call-service action aimed at this entity’s own on/off service', () => {
    renderCard({
      confirm: true,
      tapAction: { action: 'call-service', service: 'homeassistant.turn_off' },
    })

    fireEvent.click(card())
    expect(hass.callService).not.toHaveBeenCalled()
    // The service says which way it goes, so the dialog does not have to guess.
    expect(screen.getByText('Turn off Well Pump?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }))
    expect(hass.callService).toHaveBeenCalledTimes(1)
  })

  it('does not gate a call-service action on an unrelated service', () => {
    renderCard({
      confirm: true,
      tapAction: { action: 'call-service', service: 'script.nightly_report' },
    })

    fireEvent.click(card())
    expect(screen.queryByText(/Well Pump\?$/)).not.toBeInTheDocument()
    expect(hass.callService).toHaveBeenCalledWith('script', 'nightly_report', {
      entity_id: ENTITY_ID,
    })
  })

  it('does not gate a card that did not ask for it', () => {
    const onToggle = vi.fn()
    renderCard({}, onToggle)

    fireEvent.click(card())
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('names the state a turn_on route would leave the entity in', () => {
    renderCard({
      confirm: true,
      tapAction: { action: 'call-service', service: 'switch.turn_on' },
    })

    fireEvent.click(card())
    expect(screen.getByText('Turn on Well Pump?')).toBeInTheDocument()
  })
})
