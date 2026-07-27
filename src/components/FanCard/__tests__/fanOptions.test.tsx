import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { Theme } from '@radix-ui/themes'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import { resetDispatchGuard } from '~/services/guardedDispatch'
import { CardItemProvider } from '../../cardItemContext'
import { FanCard } from '..'
import type { HassEntity } from '~/store/entityTypes'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * The fan card's options, driven through the real shell
 * (docs/specs/entity-cards/options/fan.md).
 *
 * Rendered inside a `CardItemProvider` because that is the path a placed item's
 * options actually take — the same surface the shell reads `hideState` from is
 * the one the card reads `speedControl` from.
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
const spinner = () => document.querySelector('.liebe-fan-spin')

function stepSlider(key: 'ArrowRight' | 'ArrowLeft' | 'Home' | 'End') {
  const thumb = screen.getByLabelText('Fan speed')
  fireEvent.keyDown(thumb, { key })
  fireEvent.keyUp(thumb, { key })
}

beforeEach(() => {
  hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
  dashboardActions.resetState()
  // The pending set is process-wide, so a command another case issued would be
  // refused here — and a refusal reports success, so it fails as zero calls
  // with no error at all.
  resetDispatchGuard()
})

afterEach(() => {
  dashboardActions.resetState()
  resetDispatchGuard()
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

describe('speedControl', () => {
  it('renders the slider by default', () => {
    seed(makeFan('on'))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />)

    expect(screen.getByLabelText('Fan speed')).toHaveAttribute('role', 'slider')
    expect(screen.queryByRole('group', { name: 'Fan speed' })).not.toBeInTheDocument()
  })

  it('renders the step pills when asked', () => {
    seed(makeFan('on'))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />, { speedControl: 'steps' })

    expect(screen.getByRole('group', { name: 'Fan speed' })).toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })

  it('renders no speed control at all under `none`', () => {
    seed(makeFan('on'))
    renderCard(<FanCard entityId={ENTITY_ID} tier="full" />, { speedControl: 'none' })

    expect(screen.queryByLabelText('Fan speed')).not.toBeInTheDocument()
  })

  it('is inert on a fan that cannot set a speed', () => {
    seed(makeFan('on', { supported_features: 0, percentage: undefined }))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />, { speedControl: 'slider' })

    expect(screen.queryByLabelText('Fan speed')).not.toBeInTheDocument()
  })

  it('never renders a control at glance', () => {
    seed(makeFan('on'))
    for (const speedControl of ['slider', 'steps'] as const) {
      const { unmount } = renderCard(<FanCard entityId={ENTITY_ID} tier="glance" />, {
        speedControl,
      })
      expect(screen.queryByLabelText('Fan speed')).not.toBeInTheDocument()
      unmount()
    }
  })

  it('turns the slider vertical at tall and stacks the pills there', () => {
    seed(makeFan('on'))
    const { unmount } = renderCard(<FanCard entityId={ENTITY_ID} tier="tall" />)
    expect(screen.getByLabelText('Fan speed').closest('.liebe-slider')).toHaveAttribute(
      'data-orientation',
      'vertical'
    )
    unmount()

    renderCard(<FanCard entityId={ENTITY_ID} tier="tall" />, { speedControl: 'steps' })
    expect(screen.getByRole('group', { name: 'Fan speed' })).toHaveAttribute(
      'data-orientation',
      'vertical'
    )
  })

  it('commits a slider drag as set_percentage', () => {
    seed(makeFan('on'))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />)

    stepSlider('ArrowRight')

    expect(hass.callService).toHaveBeenCalledWith('fan', 'set_percentage', {
      entity_id: ENTITY_ID,
      percentage: 51,
    })
  })

  it('turns the fan off when the slider is committed at zero', () => {
    // Not `set_percentage: 0` — the shipped behaviour, and what the option doc
    // pins.
    seed(makeFan('on'))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />)

    stepSlider('Home')

    expect(hass.callService).toHaveBeenCalledWith('fan', 'turn_off', { entity_id: ENTITY_ID })
    expect(hass.callService).not.toHaveBeenCalledWith(
      'fan',
      'set_percentage',
      expect.objectContaining({ percentage: 0 })
    )
  })

  it('dispatches a pill press as set_percentage', () => {
    seed(makeFan('on'))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />, { speedControl: 'steps' })

    fireEvent.click(screen.getByRole('button', { name: 'Set speed to 75%' }))

    expect(hass.callService).toHaveBeenCalledWith('fan', 'set_percentage', {
      entity_id: ENTITY_ID,
      percentage: 75,
    })
  })

  it('hides the control while the fan is off, where the tap turns it on', () => {
    seed(makeFan('off', { percentage: 0 }))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />)

    expect(screen.queryByLabelText('Fan speed')).not.toBeInTheDocument()
  })
})

describe('showPresets', () => {
  const withPresets = (attributes: Record<string, unknown> = {}) =>
    makeFan('on', {
      supported_features: 9,
      preset_mode: 'auto',
      preset_modes: ['auto', 'sleep', 'boost'],
      ...attributes,
    })

  it('renders the preset pills at full', () => {
    seed(withPresets())
    renderCard(<FanCard entityId={ENTITY_ID} tier="full" />)

    expect(screen.getByRole('group', { name: 'Fan preset' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'auto' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'sleep' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps them off the narrower tiers', () => {
    seed(withPresets())
    for (const tier of ['row', 'tall'] as const) {
      const { unmount } = renderCard(<FanCard entityId={ENTITY_ID} tier={tier} />)
      expect(screen.queryByRole('group', { name: 'Fan preset' })).not.toBeInTheDocument()
      unmount()
    }
  })

  it('drops them when the option is off', () => {
    seed(withPresets())
    renderCard(<FanCard entityId={ENTITY_ID} tier="full" />, { showPresets: false })

    expect(screen.queryByRole('group', { name: 'Fan preset' })).not.toBeInTheDocument()
  })

  it('dispatches set_preset_mode', () => {
    seed(withPresets())
    renderCard(<FanCard entityId={ENTITY_ID} tier="full" />)

    fireEvent.click(screen.getByRole('button', { name: 'sleep' }))

    expect(hass.callService).toHaveBeenCalledWith('fan', 'set_preset_mode', {
      entity_id: ENTITY_ID,
      preset_mode: 'sleep',
    })
  })

  it('ignores a modes list that is not a list of strings', () => {
    seed(withPresets({ preset_modes: [1, null, 'sleep'] }))
    renderCard(<FanCard entityId={ENTITY_ID} tier="full" />)

    expect(screen.getByRole('button', { name: 'sleep' })).toBeInTheDocument()
    expect(
      screen.getByRole('group', { name: 'Fan preset' }).querySelectorAll('button')
    ).toHaveLength(1)
  })
})

describe('showOscillate', () => {
  const oscillating = (attributes: Record<string, unknown> = {}) =>
    makeFan('on', { supported_features: 3, oscillating: false, ...attributes })

  it('renders the toggle at full by default', () => {
    seed(oscillating())
    renderCard(<FanCard entityId={ENTITY_ID} tier="full" />)

    const toggle = screen.getByRole('button', { name: 'Oscillate' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  it('reflects the attribute', () => {
    seed(oscillating({ oscillating: true }))
    renderCard(<FanCard entityId={ENTITY_ID} tier="full" />)

    expect(screen.getByRole('button', { name: 'Oscillate' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('dispatches the inverse of the current state', () => {
    seed(oscillating())
    renderCard(<FanCard entityId={ENTITY_ID} tier="full" />)

    fireEvent.click(screen.getByRole('button', { name: 'Oscillate' }))

    expect(hass.callService).toHaveBeenCalledWith('fan', 'oscillate', {
      entity_id: ENTITY_ID,
      oscillating: true,
    })
  })

  it('drops it when the option is off', () => {
    seed(oscillating())
    renderCard(<FanCard entityId={ENTITY_ID} tier="full" />, { showOscillate: false })

    expect(screen.queryByRole('button', { name: 'Oscillate' })).not.toBeInTheDocument()
  })

  it('cannot be enabled on a fan that does not oscillate', () => {
    seed(makeFan('on', { supported_features: 1 }))
    renderCard(<FanCard entityId={ENTITY_ID} tier="full" />, { showOscillate: true })

    expect(screen.queryByRole('button', { name: 'Oscillate' })).not.toBeInTheDocument()
  })
})

describe('showDirection', () => {
  const directional = (attributes: Record<string, unknown> = {}) =>
    makeFan('on', { supported_features: 5, direction: 'forward', ...attributes })

  it('is off by default — a seasonal setting is opted into', () => {
    seed(directional())
    renderCard(<FanCard entityId={ENTITY_ID} tier="full" />)

    expect(screen.queryByRole('group', { name: 'Fan direction' })).not.toBeInTheDocument()
  })

  it('renders forward and reverse when enabled, reflecting the attribute', () => {
    seed(directional())
    renderCard(<FanCard entityId={ENTITY_ID} tier="full" />, { showDirection: true })

    expect(screen.getByRole('button', { name: 'Forward' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Reverse' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('dispatches set_direction', () => {
    seed(directional())
    renderCard(<FanCard entityId={ENTITY_ID} tier="full" />, { showDirection: true })

    fireEvent.click(screen.getByRole('button', { name: 'Reverse' }))

    expect(hass.callService).toHaveBeenCalledWith('fan', 'set_direction', {
      entity_id: ENTITY_ID,
      direction: 'reverse',
    })
  })

  it('cannot be enabled on a fan with no direction control', () => {
    seed(makeFan('on', { supported_features: 1 }))
    renderCard(<FanCard entityId={ENTITY_ID} tier="full" />, { showDirection: true })

    expect(screen.queryByRole('button', { name: 'Reverse' })).not.toBeInTheDocument()
  })
})

describe('showPercentage', () => {
  it('adds the speed to the state line by default', () => {
    seed(makeFan('on', { percentage: 75 }))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />)

    expect(stateLine()).toContain('ON')
    expect(stateLine()).toContain('75%')
  })

  it('gives the preset the primary slot and keeps the percentage beside it', () => {
    seed(
      makeFan('on', {
        supported_features: 9,
        preset_mode: 'sleep',
        preset_modes: ['sleep'],
        percentage: 30,
      })
    )
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />)

    expect(stateLine()).toContain('sleep')
    expect(stateLine()).toContain('30%')
  })

  it('drops the percentage when the option is off', () => {
    seed(makeFan('on', { percentage: 75 }))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />, { showPercentage: false })

    expect(stateLine()).toContain('ON')
    expect(stateLine()).not.toContain('75%')
  })

  it('shows nothing extra for a stopped fan, or one with no percentage', () => {
    seed(makeFan('off', { percentage: 0 }))
    const { unmount } = renderCard(<FanCard entityId={ENTITY_ID} tier="row" />)
    expect(stateLine()).toBe('OFF')
    unmount()

    seed(makeFan('on', { supported_features: 0, percentage: undefined }))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />)
    expect(stateLine()).toBe('ON')
  })

  it('goes with the state line when `hideState` hides it', () => {
    seed(makeFan('on', { percentage: 75 }))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />, { hideState: true })

    expect(document.querySelector('.liebe-state')).toBeNull()
  })
})

describe('animateIcon', () => {
  it('spins a running fan by default, at a rate its speed sets', () => {
    seed(makeFan('on', { percentage: 100 }))
    const { unmount } = renderCard(<FanCard entityId={ENTITY_ID} tier="row" />)
    const fast = spinner()!.getAttribute('style')
    unmount()

    seed(makeFan('on', { percentage: 25 }))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />)
    const slow = spinner()!.getAttribute('style')

    expect(fast).toContain('--liebe-fan-spin-duration')
    expect(slow).toContain('--liebe-fan-spin-duration')
    expect(fast).not.toBe(slow)
  })

  it('holds a stopped fan still', () => {
    seed(makeFan('off', { percentage: 0 }))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />)

    expect(spinner()).toBeNull()
  })

  it('never spins when the option is off', () => {
    seed(makeFan('on', { percentage: 100 }))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />, { animateIcon: false })

    expect(spinner()).toBeNull()
  })

  it('gives a fan with no percentage a single fixed rate', () => {
    seed(makeFan('on', { supported_features: 0, percentage: undefined }))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />)

    expect(spinner()!.getAttribute('style')).toContain('1.5s')
  })
})

describe('dispatch guarantees', () => {
  it('issues at most one command per gesture, even before the fan moves', () => {
    /*
     * Home Assistant acknowledges a service call before a slow integration
     * updates state, so the promise resolving proves nothing. Two presses of
     * the same pill inside that window are one command, not two — the
     * at-most-once guarantee, which is the whole reason these dispatches left
     * the retrying path (docs/specs/entity-cards/options/common.md).
     */
    seed(makeFan('on'))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />, { speedControl: 'steps' })

    const pill = screen.getByRole('button', { name: 'Set speed to 75%' })
    fireEvent.click(pill)
    fireEvent.click(pill)

    expect(hass.callService).toHaveBeenCalledTimes(1)
  })

  it('does not hold back a different command in the same window', () => {
    // The guard keys on the payload, so a second, different speed is a
    // different command and travels immediately. The slider is the control to
    // prove it on: the pills are `disabled` while a command is in flight, so
    // they could not issue a second one whatever the guard decided.
    seed(makeFan('on'))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />)

    stepSlider('ArrowRight')
    stepSlider('ArrowLeft')

    expect(hass.callService).toHaveBeenCalledTimes(2)

    // What makes the second one admissible is precisely that its payload
    // differs — the key the guard is built on.
    const payloads = vi
      .mocked(hass.callService)
      .mock.calls.map(([, , data]) => (data as { percentage: number }).percentage)
    expect(payloads[0]).not.toBe(payloads[1])
  })
})

/**
 * State that outlives the gesture that created it — the shape behind the cover
 * card's held-confirmation defect, checked here for the fan's own local state.
 */
describe('optimistic drag state', () => {
  it('drops a drag when the card is recycled onto another fan', () => {
    seed(makeFan('on', { percentage: 20 }))
    const other = makeFan('on', { friendly_name: 'Study Fan', percentage: 80 })

    const { rerender } = renderCard(<FanCard entityId={ENTITY_ID} tier="row" />)

    // Mid-gesture: the slider is showing a local value, not the entity's.
    const thumb = screen.getByLabelText('Fan speed')
    fireEvent.keyDown(thumb, { key: 'ArrowRight' })
    expect(screen.getByLabelText('Fan speed')).toHaveAttribute('aria-valuetext', '21%')

    act(() => {
      entityStore.setState((state) => ({
        ...state,
        entities: {
          ...state.entities,
          'fan.study': { ...other, entity_id: 'fan.study' },
        },
      }))
    })

    rerender(
      <Theme>
        <HomeAssistantProvider hass={hass}>
          <CardItemProvider entityId="fan.study">
            <FanCard entityId="fan.study" tier="row" />
          </CardItemProvider>
        </HomeAssistantProvider>
      </Theme>
    )

    // The new fan's own speed, not the drag left over from the previous one —
    // which is also the value a commit would have sent to it.
    expect(screen.getByLabelText('Fan speed')).toHaveAttribute('aria-valuetext', '80%')
  })

  it('does not bring a stale drag back out of edit mode', () => {
    seed(makeFan('on', { percentage: 20 }))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />)

    const thumb = screen.getByLabelText('Fan speed')
    fireEvent.keyDown(thumb, { key: 'ArrowRight' })
    expect(screen.getByLabelText('Fan speed')).toHaveAttribute('aria-valuetext', '21%')

    // Edit mode hides the control rather than resetting the card, so without a
    // reset the slider comes back still pinned to a drag nobody is making.
    act(() => dashboardActions.setMode('edit'))
    expect(screen.queryByLabelText('Fan speed')).not.toBeInTheDocument()

    act(() => dashboardActions.setMode('view'))

    expect(screen.getByLabelText('Fan speed')).toHaveAttribute('aria-valuetext', '20%')
  })
})
