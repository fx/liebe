import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { Theme } from '@radix-ui/themes'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import { resetDispatchGuard } from '~/services/guardedDispatch'
import { CardItemProvider } from '../../cardItemContext'
import { CoverCard } from '..'
import { COVER_DEVICE_CLASS_GLYPHS, GENERIC_COVER_GLYPHS } from '../presentation'
import type { HassEntity } from '~/store/entityTypes'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * The cover card's options, driven through the real shell
 * (docs/specs/entity-cards/options/cover.md).
 *
 * The card is rendered inside a `CardItemProvider` because that is the path a
 * placed item's options actually take: the same surface the shell reads
 * `hideState` from is the one the card reads `invertPosition` from, so a test
 * that passed a config prop would be pinning a route the panel does not use.
 */

const ENTITY_ID = 'cover.living_room_blinds'

let hass: HomeAssistant

function makeCover(state: string, attributes: Record<string, unknown>): HassEntity {
  return {
    entity_id: ENTITY_ID,
    state,
    attributes: { friendly_name: 'Blinds', ...attributes } as HassEntity['attributes'],
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

function renderCard(card: ReactElement, config?: Record<string, unknown>) {
  return render(
    <Theme>
      <HomeAssistantProvider hass={hass}>
        <CardItemProvider entityId={ENTITY_ID} config={config}>
          {card}
        </CardItemProvider>
      </HomeAssistantProvider>
    </Theme>
  )
}

const stateLine = () => document.querySelector('.liebe-state')?.textContent
const glyphClass = () => document.querySelector('.liebe-icon svg')?.getAttribute('class') ?? ''

/** Nudge the position slider one step and let its commit fire. */
function stepPositionSlider(key: 'ArrowRight' | 'ArrowLeft') {
  const thumb = screen.getByLabelText('Position')
  fireEvent.keyDown(thumb, { key })
  fireEvent.keyUp(thumb, { key })
}

beforeEach(() => {
  hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
  dashboardActions.resetState()
  // The pending set is process-wide, so a command another case issued would
  // otherwise be refused here — and a refusal reports success, so it fails as
  // zero calls with no error at all.
  resetDispatchGuard()
})

afterEach(() => {
  dashboardActions.resetState()
  resetDispatchGuard()
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

const positional = () =>
  makeCover('open', { current_position: 70, current_tilt_position: 40, supported_features: 255 })

describe('showPositionSlider / showButtons / showTiltControls', () => {
  beforeEach(() => seed(positional()))

  it('renders all three at full by default', () => {
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />)

    expect(screen.getByLabelText('Position')).toBeInTheDocument()
    expect(screen.getByLabelText('Open cover')).toBeInTheDocument()
    expect(screen.getByLabelText('Tilt position')).toBeInTheDocument()
  })

  it('drops the position slider when the option is off', () => {
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />, { showPositionSlider: false })

    expect(screen.queryByLabelText('Position')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Open cover')).toBeInTheDocument()
    expect(screen.getByLabelText('Tilt position')).toBeInTheDocument()
  })

  it('drops the position slider at the row and tall tiers too', () => {
    for (const tier of ['row', 'tall'] as const) {
      const { unmount } = renderCard(<CoverCard entityId={ENTITY_ID} tier={tier} />, {
        showPositionSlider: false,
      })
      expect(screen.queryByLabelText('Position')).not.toBeInTheDocument()
      unmount()
    }
  })

  it('drops the button row when the option is off', () => {
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />, { showButtons: false })

    expect(screen.queryByLabelText('Open cover')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Stop cover')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Close cover')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Position')).toBeInTheDocument()
  })

  it('drops the whole tilt block when the option is off', () => {
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />, { showTiltControls: false })

    expect(screen.queryByText('Tilt')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Tilt position')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Open cover tilt')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Open cover')).toBeInTheDocument()
  })

  it('cannot enable a capability the entity does not advertise', () => {
    // The option doc's first scenario: `supported_features: 11` is open + close
    // + stop, so no slider and no tilt however the options are set.
    seed(makeCover('closed', { supported_features: 11 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />, {
      showPositionSlider: true,
      showTiltControls: true,
    })

    expect(screen.getByLabelText('Open cover')).toBeInTheDocument()
    expect(screen.queryByLabelText('Position')).not.toBeInTheDocument()
    expect(screen.queryByText('Tilt')).not.toBeInTheDocument()
    expect(stateLine()).toBe('CLOSED')
  })
})

describe('tilt feature bits', () => {
  it('renders a tilt-stop button for bit 64 and no tilt slider', () => {
    // 64 is STOP_TILT, not SET_TILT_POSITION. The card shipped reading it as
    // the latter, so a stop-tilt-only cover grew a slider that commits a
    // service it does not implement.
    seed(makeCover('open', { supported_features: 64 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />)

    expect(screen.getByLabelText('Stop cover tilt')).toBeInTheDocument()
    expect(screen.queryByLabelText('Tilt position')).not.toBeInTheDocument()
  })

  it('renders the tilt slider for bit 128', () => {
    seed(makeCover('open', { supported_features: 128, current_tilt_position: 30 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />)

    expect(screen.getByLabelText('Tilt position')).toBeInTheDocument()
    expect(screen.queryByLabelText('Stop cover tilt')).not.toBeInTheDocument()
  })

  it('dispatches stop_cover_tilt', () => {
    seed(makeCover('open', { supported_features: 64 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />)

    fireEvent.click(screen.getByLabelText('Stop cover tilt'))

    expect(hass.callService).toHaveBeenCalledWith('cover', 'stop_cover_tilt', {
      entity_id: ENTITY_ID,
    })
  })
})

describe('stateLabels', () => {
  it('defaults to the percentage for a positional cover', () => {
    seed(positional())
    renderCard(<CoverCard entityId={ENTITY_ID} tier="row" />)

    expect(stateLine()).toBe('70% OPEN')
  })

  it('defaults to open/closed for a binary cover', () => {
    seed(makeCover('open', { supported_features: 3 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="row" />)

    expect(stateLine()).toBe('OPEN')
  })

  it('never prints a percentage in the open-closed style', () => {
    seed(positional())
    renderCard(<CoverCard entityId={ENTITY_ID} tier="row" />, { stateLabels: 'open-closed' })

    expect(stateLine()).toBe('OPEN')
  })
})

describe('deviceClassIcon', () => {
  const garage = () => makeCover('closed', { device_class: 'garage', supported_features: 11 })

  it('picks the device-class glyph by default', () => {
    seed(garage())
    renderCard(<CoverCard entityId={ENTITY_ID} tier="row" />)

    expect(COVER_DEVICE_CLASS_GLYPHS.garage.closed).toBeDefined()
    expect(glyphClass()).toContain('lucide-inspection-panel')
  })

  it('falls back to the generic glyph when the option is off', () => {
    seed(garage())
    renderCard(<CoverCard entityId={ENTITY_ID} tier="row" />, { deviceClassIcon: false })

    expect(GENERIC_COVER_GLYPHS.closed).toBeDefined()
    expect(glyphClass()).toContain('lucide-panel-top-close')
  })

  it('is replaced entirely by the universal icon override', () => {
    seed(garage())
    renderCard(<CoverCard entityId={ENTITY_ID} tier="row" />, {
      deviceClassIcon: true,
      icon: 'Home',
    })

    expect(glyphClass()).not.toContain('lucide-inspection-panel')
    expect(document.querySelector('.liebe-icon svg')).toBeInTheDocument()
  })
})

describe('invertPosition', () => {
  beforeEach(() => seed(makeCover('open', { current_position: 30, supported_features: 255 })))

  it('shows the effective position on the state line and the slider', () => {
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />, { invertPosition: true })

    expect(stateLine()).toBe('70% OPEN')
    expect(screen.getByLabelText('Position')).toHaveAttribute('aria-valuetext', '70%')
  })

  it('leaves the reading alone when the option is off', () => {
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />, { invertPosition: false })

    expect(stateLine()).toBe('30% OPEN')
    expect(screen.getByLabelText('Position')).toHaveAttribute('aria-valuetext', '30%')
  })

  it('commits the effective target back in the entity’s reversed scale', () => {
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />, { invertPosition: true })

    // The slider sits at effective 70; one step right is 71, which the entity
    // is told as 29.
    stepPositionSlider('ArrowRight')

    expect(hass.callService).toHaveBeenCalledWith('cover', 'set_cover_position', {
      entity_id: ENTITY_ID,
      position: 29,
    })
  })

  it('commits the plain value when the option is off', () => {
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />, { invertPosition: false })

    stepPositionSlider('ArrowRight')

    expect(hass.callService).toHaveBeenCalledWith('cover', 'set_cover_position', {
      entity_id: ENTITY_ID,
      position: 31,
    })
  })

  it('sends `{ position: 0 }` for a drag to fully open', () => {
    // The option doc's scenario, in its own words: effective 100 converted back
    // into the entity's reversed scale.
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />, { invertPosition: true })

    const thumb = screen.getByLabelText('Position')
    fireEvent.keyDown(thumb, { key: 'End' })
    fireEvent.keyUp(thumb, { key: 'End' })

    expect(hass.callService).toHaveBeenCalledWith('cover', 'set_cover_position', {
      entity_id: ENTITY_ID,
      position: 0,
    })
  })

  it('moves the disable rule with the effective position', () => {
    // Raw 0 is fully open on a reversed integration, so Open is the pill held
    // back — and the state line agrees.
    seed(makeCover('closed', { current_position: 0, supported_features: 15 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />, { invertPosition: true })

    expect(stateLine()).toBe('OPEN')
    expect(screen.getByLabelText('Open cover')).toBeDisabled()
    expect(screen.getByLabelText('Close cover')).toBeEnabled()
  })

  it('leaves tilt on its own scale', () => {
    seed(
      makeCover('open', {
        current_position: 30,
        current_tilt_position: 40,
        supported_features: 255,
      })
    )
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />, { invertPosition: true })

    expect(screen.getByLabelText('Tilt position')).toHaveAttribute('aria-valuetext', '40%')

    const thumb = screen.getByLabelText('Tilt position')
    fireEvent.keyDown(thumb, { key: 'ArrowRight' })
    fireEvent.keyUp(thumb, { key: 'ArrowRight' })

    expect(hass.callService).toHaveBeenCalledWith('cover', 'set_cover_tilt_position', {
      entity_id: ENTITY_ID,
      tilt_position: 41,
    })
  })

  it('never remaps the movement states', () => {
    seed(makeCover('opening', { current_position: 30, supported_features: 255 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />, { invertPosition: true })

    expect(stateLine()).toBe('OPENING')
  })
})

/**
 * The primary action (docs/specs/entity-cards/options/cover.md — "Primary
 * action"). The matrix is total, so every row is here.
 */
describe('primary action', () => {
  const card = () => document.querySelector('.liebe-card') as HTMLElement

  it('toggles an ordinary cover', () => {
    seed(makeCover('closed', { current_position: 0, supported_features: 7 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="row" />)

    fireEvent.click(card())

    expect(hass.callService).toHaveBeenCalledWith('cover', 'toggle', { entity_id: ENTITY_ID })
  })

  it('stops a moving cover that advertises stop', () => {
    seed(makeCover('opening', { current_position: 30, supported_features: 15 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="row" />)

    fireEvent.click(card())

    expect(hass.callService).toHaveBeenCalledWith('cover', 'stop_cover', { entity_id: ENTITY_ID })
  })

  it('falls through to toggle on a stop-incapable mover', () => {
    seed(makeCover('opening', { current_position: 30, supported_features: 7 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="row" />)

    fireEvent.click(card())

    expect(hass.callService).toHaveBeenCalledWith('cover', 'toggle', { entity_id: ENTITY_ID })
  })

  it('commands nothing on an indeterminate cover', () => {
    seed(makeCover('unknown', { supported_features: 3 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="row" />)

    fireEvent.click(card())

    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('commands nothing when a toggle is re-routed onto an indeterminate cover', () => {
    // `default` already resolves to the dialog here, so the card's own toggle
    // is what a deliberately configured `tapAction: toggle` reaches — and it
    // must refuse for the same reason: nobody knows which way the cover moves.
    seed(makeCover('unknown', { supported_features: 3 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="row" />, { tapAction: 'toggle' })

    fireEvent.click(card())

    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('commands nothing on a tilt-only cover', () => {
    seed(makeCover('open', { supported_features: 48, current_tilt_position: 50 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="row" />)

    fireEvent.click(card())

    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('commands nothing on a security opening', () => {
    seed(makeCover('closed', { device_class: 'garage', supported_features: 3 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="row" />)

    fireEvent.click(card())

    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('still toggles a security opening when the user asks for it explicitly', () => {
    // `confirmOpen: false` and an explicit `tapAction`, which the option doc
    // says users MAY set deliberately.
    seed(makeCover('open', { device_class: 'garage', supported_features: 3 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="row" />, {
      tapAction: 'toggle',
      confirmOpen: false,
    })

    fireEvent.click(card())

    expect(hass.callService).toHaveBeenCalledWith('cover', 'toggle', { entity_id: ENTITY_ID })
  })

  it('does not dispatch from an embedded control’s click', () => {
    seed(positional())
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />)

    fireEvent.click(screen.getByLabelText('Close cover'))

    expect(hass.callService).toHaveBeenCalledTimes(1)
    expect(hass.callService).toHaveBeenCalledWith('cover', 'close_cover', { entity_id: ENTITY_ID })
  })
})

/**
 * `confirmOpen` (docs/specs/entity-cards/options/cover.md). Every route that
 * increases the opening, including the ones a user can re-route an action onto.
 */
describe('confirmOpen', () => {
  const card = () => document.querySelector('.liebe-card') as HTMLElement
  const garage = (state: string, attributes: Record<string, unknown> = {}) =>
    makeCover(state, {
      friendly_name: 'Garage Door',
      device_class: 'garage',
      supported_features: 15,
      ...attributes,
    })

  it('holds the Open button behind a dialog that names the action', () => {
    seed(garage('closed', { current_position: 0 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />)

    fireEvent.click(screen.getByLabelText('Open cover'))

    expect(hass.callService).not.toHaveBeenCalled()
    // Not "Turn on Garage Door?" — a dialog that misnames what it is about is
    // a dialog people learn to confirm blindly.
    expect(screen.getByText('Open Garage Door?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    expect(hass.callService).toHaveBeenCalledTimes(1)
    expect(hass.callService).toHaveBeenCalledWith('cover', 'open_cover', { entity_id: ENTITY_ID })
  })

  it('cancelling dispatches nothing', () => {
    seed(garage('closed', { current_position: 0 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />)

    fireEvent.click(screen.getByLabelText('Open cover'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(hass.callService).not.toHaveBeenCalled()
    expect(screen.queryByText('Open Garage Door?')).not.toBeInTheDocument()
  })

  it('leaves closing and stopping ungated', () => {
    seed(garage('opening', { current_position: 40 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />)

    fireEvent.click(screen.getByLabelText('Close cover'))
    expect(hass.callService).toHaveBeenCalledWith('cover', 'close_cover', { entity_id: ENTITY_ID })

    fireEvent.click(screen.getByLabelText('Stop cover'))
    expect(hass.callService).toHaveBeenCalledWith('cover', 'stop_cover', { entity_id: ENTITY_ID })
    expect(screen.queryByText('Open Garage Door?')).not.toBeInTheDocument()
  })

  it('lets a slider commit that narrows the opening straight through', () => {
    seed(garage('open', { current_position: 40, supported_features: 15 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />)

    stepPositionSlider('ArrowLeft')

    expect(screen.queryByText('Open Garage Door?')).not.toBeInTheDocument()
    expect(hass.callService).toHaveBeenCalledWith('cover', 'set_cover_position', {
      entity_id: ENTITY_ID,
      position: 39,
    })
  })

  it('gates a slider commit that widens the opening', () => {
    seed(garage('open', { current_position: 40, supported_features: 15 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />)

    stepPositionSlider('ArrowRight')

    expect(hass.callService).not.toHaveBeenCalled()
    expect(screen.getByText('Open Garage Door?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    // One dialog, one command: the gesture is the unit, not the values the
    // drag passed through.
    expect(hass.callService).toHaveBeenCalledTimes(1)
    expect(hass.callService).toHaveBeenCalledWith('cover', 'set_cover_position', {
      entity_id: ENTITY_ID,
      position: 41,
    })
  })

  it('gates an opening toggle re-routed onto tap', () => {
    seed(garage('closed', { current_position: 0 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="row" />, { tapAction: 'toggle' })

    fireEvent.click(card())

    expect(hass.callService).not.toHaveBeenCalled()
    expect(screen.getByText('Open Garage Door?')).toBeInTheDocument()
  })

  it('lets a closing toggle through', () => {
    seed(garage('open', { current_position: 80 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="row" />, { tapAction: 'toggle' })

    fireEvent.click(card())

    expect(hass.callService).toHaveBeenCalledWith('cover', 'toggle', { entity_id: ENTITY_ID })
  })

  it('lets a toggle that stops a moving door through', () => {
    // The card's toggle resolves to `stop_cover` here, and stopping never
    // widens an opening however the position compares.
    seed(garage('opening', { current_position: 0 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="row" />, { tapAction: 'toggle' })

    fireEvent.click(card())

    expect(hass.callService).toHaveBeenCalledWith('cover', 'stop_cover', { entity_id: ENTITY_ID })
  })

  it('gates a call-service action re-routed onto tap', () => {
    seed(garage('closed', { current_position: 0 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="row" />, {
      tapAction: { action: 'call-service', service: 'homeassistant.turn_on' },
    })

    fireEvent.click(card())

    expect(hass.callService).not.toHaveBeenCalled()
    expect(screen.getByText('Open Garage Door?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(hass.callService).toHaveBeenCalledWith('homeassistant', 'turn_on', {
      entity_id: ENTITY_ID,
    })
  })

  it('gates a toggle it cannot classify: no position to compare against', () => {
    seed(garage('closed', { supported_features: 3 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="row" />, { tapAction: 'toggle' })

    fireEvent.click(card())

    expect(hass.callService).not.toHaveBeenCalled()
    expect(screen.getByText('Open Garage Door?')).toBeInTheDocument()
  })

  it('gates a call-service route it cannot classify: an unknown state', () => {
    seed(garage('unknown', { supported_features: 3 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="row" />, {
      tapAction: {
        action: 'call-service',
        service: 'cover.set_cover_position',
        data: { position: 50 },
      },
    })

    fireEvent.click(card())

    expect(hass.callService).not.toHaveBeenCalled()
    expect(screen.getByText('Open Garage Door?')).toBeInTheDocument()
  })

  it('opens without asking when the option is off', () => {
    seed(garage('closed', { current_position: 0 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />, { confirmOpen: false })

    fireEvent.click(screen.getByLabelText('Open cover'))

    expect(hass.callService).toHaveBeenCalledWith('cover', 'open_cover', { entity_id: ENTITY_ID })
    expect(screen.queryByText('Open Garage Door?')).not.toBeInTheDocument()
  })

  it('does not apply to a cover that is not a perimeter opening', () => {
    seed(
      makeCover('closed', { device_class: 'blind', current_position: 0, supported_features: 15 })
    )
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />, { confirmOpen: true })

    fireEvent.click(screen.getByLabelText('Open cover'))

    expect(hass.callService).toHaveBeenCalledWith('cover', 'open_cover', { entity_id: ENTITY_ID })
  })

  it('drops a pending confirmation when the dashboard switches to edit mode', () => {
    seed(garage('closed', { current_position: 0 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />)

    fireEvent.click(screen.getByLabelText('Open cover'))
    expect(screen.getByText('Open Garage Door?')).toBeInTheDocument()

    act(() => dashboardActions.setMode('edit'))

    expect(screen.queryByText('Open Garage Door?')).not.toBeInTheDocument()
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('does not resurrect it on the way back to view mode', () => {
    /*
     * Hiding the dialog is not dropping the request. The render guards on
     * `!isEditMode`, so a request left standing came back the moment edit mode
     * ended — asking the user to confirm an opening whose gesture is long gone,
     * where the answer that looks safe is to accept. On a garage door that is
     * the failure the gate exists to prevent.
     */
    seed(garage('closed', { current_position: 0 }))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />)

    fireEvent.click(screen.getByLabelText('Open cover'))
    expect(screen.getByText('Open Garage Door?')).toBeInTheDocument()

    act(() => dashboardActions.setMode('edit'))
    act(() => dashboardActions.setMode('view'))

    expect(screen.queryByText('Open Garage Door?')).not.toBeInTheDocument()
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('drops it when the card is recycled onto another entity', () => {
    // The grid reuses card instances, so a pending confirmation raised for one
    // garage door must not be standing over the next one.
    seed(garage('closed', { current_position: 0 }))
    const other = makeCover('closed', {
      friendly_name: 'Side Gate',
      device_class: 'gate',
      supported_features: 15,
      current_position: 0,
    })

    const { rerender } = renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />)

    fireEvent.click(screen.getByLabelText('Open cover'))
    expect(screen.getByText('Open Garage Door?')).toBeInTheDocument()

    act(() => {
      entityStore.setState((state) => ({
        ...state,
        entities: {
          ...state.entities,
          'cover.side_gate': { ...other, entity_id: 'cover.side_gate' },
        },
      }))
    })

    rerender(
      <Theme>
        <HomeAssistantProvider hass={hass}>
          <CardItemProvider entityId="cover.side_gate">
            <CoverCard entityId="cover.side_gate" tier="full" />
          </CardItemProvider>
        </HomeAssistantProvider>
      </Theme>
    )

    expect(screen.queryByText('Open Garage Door?')).not.toBeInTheDocument()
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('clears a standing error when the slider commits, as its siblings do', async () => {
    /*
     * The gesture that proves it: a gated slider commit dispatches *nothing*
     * until the user confirms, so `useServiceCall`'s own reset never runs and
     * a stale ERROR would still be on the tile behind the dialog — reading as
     * "this failed too" about a command that has not been sent, let alone
     * reported on. Every other control here clears before dispatching; this one
     * did not.
     */
    seed(garage('open', { current_position: 40 }))
    vi.mocked(hass.callService).mockRejectedValueOnce(new Error('nope'))
    renderCard(<CoverCard entityId={ENTITY_ID} tier="full" />)

    fireEvent.click(screen.getByLabelText('Close cover'))
    await waitFor(() => {
      expect(document.querySelector('.liebe-state')?.textContent).toBe('ERROR')
    })

    stepPositionSlider('ArrowRight')

    // Held behind the gate, so nothing has been sent…
    expect(hass.callService).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Open Garage Door?')).toBeInTheDocument()
    // …and the tile is no longer reporting the previous command's failure.
    expect(document.querySelector('.liebe-state')?.textContent).not.toBe('ERROR')
  })
})

/**
 * The memo comparator. It is the reason a card re-renders at all when its props
 * move, and a comparator that returned `true` for a changed prop would freeze
 * the tile at its last render — which looks like a card that simply stopped
 * updating rather than like a bug in a comparison.
 */
describe('re-render comparator', () => {
  it('re-renders for every prop it compares', () => {
    seed(positional())
    const onDelete = vi.fn()
    const onSelect = vi.fn()

    const { rerender } = render(
      <Theme>
        <HomeAssistantProvider hass={hass}>
          <CardItemProvider entityId={ENTITY_ID}>
            <CoverCard
              entityId={ENTITY_ID}
              tier="row"
              onDelete={onDelete}
              isSelected={false}
              onSelect={onSelect}
            />
          </CardItemProvider>
        </HomeAssistantProvider>
      </Theme>
    )

    const render2 = (props: Partial<Parameters<typeof CoverCard>[0]>) =>
      rerender(
        <Theme>
          <HomeAssistantProvider hass={hass}>
            <CardItemProvider entityId={ENTITY_ID}>
              <CoverCard
                entityId={ENTITY_ID}
                tier="row"
                onDelete={onDelete}
                isSelected={false}
                onSelect={onSelect}
                {...props}
              />
            </CardItemProvider>
          </HomeAssistantProvider>
        </Theme>
      )

    // Same props: the comparator runs the whole chain and holds the render.
    render2({})
    expect(document.querySelector('.liebe-card')).toHaveAttribute('data-tier', 'row')

    render2({ tier: 'full' })
    expect(document.querySelector('.liebe-card')).toHaveAttribute('data-tier', 'full')
    expect(screen.getByLabelText('Open cover')).toBeInTheDocument()

    render2({ onDelete: vi.fn() })
    render2({ isSelected: true })
    render2({ onSelect: vi.fn() })

    // Still rendering the same entity — the chain is a comparison, not a reset.
    expect(stateLine()).toBe('70% OPEN')
  })
})
