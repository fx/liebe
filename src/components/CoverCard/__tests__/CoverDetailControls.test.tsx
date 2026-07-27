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
import { getDetailControls } from '../../EntityDetailDialog/detailControls'
import { EntityDetailDialog } from '../../EntityDetailDialog'
import { CoverCard } from '..'
import type { HassEntity } from '~/store/entityTypes'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * The cover's controls in the detail dialog (docs/changes/0019 — PR 1).
 *
 * The point of them is the narrow tiers: at `glance` — which a 1×1 item, or any
 * item on a narrow breakpoint, derives — the card carries no embedded control at
 * all, so the dialog behind a hold is the whole control surface. A cover that
 * could not be opened from there would be a cover that could not be opened.
 */

const ENTITY_ID = 'cover.garage_door'

let hass: HomeAssistant

function makeCover(state: string, attributes: Record<string, unknown> = {}): HassEntity {
  return {
    entity_id: ENTITY_ID,
    state,
    attributes: {
      friendly_name: 'Garage Door',
      supported_features: 11,
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
  // The dialog graphs history for entities that have one; nothing here is about
  // the graph, and a window carried over from another case would be.
  entityHistoryService.reset()
})

afterEach(() => {
  entityHistoryService.reset()
  dashboardActions.resetState()
  resetDispatchGuard()
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

describe('registration', () => {
  it('claims the cover slot when the card module loads', () => {
    // The card is what registers; importing it is what this asserts.
    expect(CoverCard).toBeDefined()
    expect(getDetailControls('cover')).toBeDefined()
  })
})

describe('CoverDetailControls', () => {
  it('renders the open / stop / close row, gated by the feature bits', () => {
    seed(makeCover('closed'))
    renderDialog()

    expect(screen.getByLabelText('Open cover')).toBeInTheDocument()
    expect(screen.getByLabelText('Stop cover')).toBeInTheDocument()
    expect(screen.getByLabelText('Close cover')).toBeInTheDocument()
  })

  it('omits a button the entity does not advertise', () => {
    seed(makeCover('closed', { supported_features: 1 }))
    renderDialog()

    expect(screen.getByLabelText('Open cover')).toBeInTheDocument()
    expect(screen.queryByLabelText('Stop cover')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Close cover')).not.toBeInTheDocument()
  })

  it('renders nothing at all for a cover with none of the three', () => {
    // A tilt-only cover: an empty "Controls" heading is furniture.
    seed(makeCover('open', { supported_features: 48, device_class: 'blind' }))
    renderDialog()

    expect(screen.queryByText('Controls')).not.toBeInTheDocument()
  })

  it('holds the same buttons back that the card does', () => {
    seed(makeCover('open', { current_position: 100, supported_features: 15 }))
    renderDialog()

    expect(screen.getByLabelText('Open cover')).toBeDisabled()
    expect(screen.getByLabelText('Close cover')).toBeEnabled()
    // Stop, as on the card, only while the cover is actually moving.
    expect(screen.getByLabelText('Stop cover')).toBeDisabled()
  })

  it('dispatches close and stop directly', () => {
    seed(
      makeCover('closing', { current_position: 40, supported_features: 15, device_class: 'blind' })
    )
    renderDialog()

    fireEvent.click(screen.getByLabelText('Close cover'))
    expect(hass.callService).toHaveBeenCalledWith('cover', 'close_cover', { entity_id: ENTITY_ID })

    fireEvent.click(screen.getByLabelText('Stop cover'))
    expect(hass.callService).toHaveBeenCalledWith('cover', 'stop_cover', { entity_id: ENTITY_ID })
  })

  it('opens an ordinary cover on the first press', () => {
    seed(makeCover('closed', { device_class: 'blind' }))
    renderDialog()

    fireEvent.click(screen.getByLabelText('Open cover'))

    expect(hass.callService).toHaveBeenCalledWith('cover', 'open_cover', { entity_id: ENTITY_ID })
  })

  it('asks before opening a perimeter opening', () => {
    // The dialog is opened for an entity, not a placed item, so it applies
    // `confirmOpen` at its default — which is the conservative direction.
    seed(makeCover('closed', { device_class: 'garage' }))
    renderDialog()

    fireEvent.click(screen.getByLabelText('Open cover'))

    expect(hass.callService).not.toHaveBeenCalled()
    expect(screen.getByText('Open Garage Door?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    expect(hass.callService).toHaveBeenCalledTimes(1)
    expect(hass.callService).toHaveBeenCalledWith('cover', 'open_cover', { entity_id: ENTITY_ID })
  })
})

describe('narrow-tier operability', () => {
  it('reaches the controls by holding a glance-tier card', () => {
    vi.useFakeTimers()
    try {
      seed(makeCover('closed', { device_class: 'blind' }))

      render(
        <Theme>
          <HomeAssistantProvider hass={hass}>
            <CoverCard entityId={ENTITY_ID} tier="glance" />
          </HomeAssistantProvider>
        </Theme>
      )

      // The tile itself carries nothing to press at this tier.
      expect(screen.queryByLabelText('Open cover')).not.toBeInTheDocument()

      const card = document.querySelector('.liebe-card') as HTMLElement
      fireEvent.pointerDown(card, { isPrimary: true, button: 0 })
      act(() => {
        vi.advanceTimersByTime(HOLD_DURATION_MS)
      })
      fireEvent.pointerUp(card)

      // And the dialog the hold opened does.
      expect(screen.getByLabelText('Open cover')).toBeInTheDocument()
      expect(screen.getByLabelText('Close cover')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
