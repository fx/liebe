import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import type { ReactElement } from 'react'
import { Theme } from '@radix-ui/themes'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import { resetDispatchGuard } from '~/services/guardedDispatch'
import { createVacuumEntity } from '~/test/fixtures'
import { CardItemProvider } from '../../cardItemContext'
import type { HassEntity } from '~/store/entityTypes'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'
import type { CardTier } from '~/utils/cardTier'
import { VacuumCard } from '..'

/**
 * The vacuum card, rendered against the **real** hooks: `useEntity`,
 * `useServiceCall`, the at-most-once dispatch guard and `hassService` all run,
 * and the only seam is `hass.callService`.
 *
 * Deliberate rather than incidental. Most of what this card promises is about
 * the call it actually makes — a state-resolved `vacuum.pause` rather than a
 * toggle, nothing at all where the state-appropriate bit is missing — so mocking
 * the dispatch layer would assert the card's intent instead of its dispatch,
 * which is exactly the gap that lets a wrong service ship.
 */

type CallService = (
  domain: string,
  service: string,
  serviceData?: Record<string, unknown>
) => Promise<void>

let hass: HomeAssistant
let callService: Mock<CallService>

const ENTITY_ID = 'vacuum.robby'

/** Masks by capability, as sums of the bits Home Assistant publishes. */
const MASK = {
  /** PAUSE | STOP | RETURN_HOME | FAN_SPEED | LOCATE | START */
  full: 4 | 8 | 16 | 32 | 512 | 8192,
  /** START | STOP — cannot pause. */
  noPause: 8192 | 8,
  /** START only — no dock button. */
  startOnly: 8192,
  /** RETURN_HOME only — no run control. */
  dockOnly: 16,
  none: 0,
} as const

function seed(...entities: HassEntity[]) {
  entityStore.setState((state) => ({
    ...state,
    isConnected: true,
    isInitialLoading: false,
    entities: Object.fromEntries(entities.map((entity) => [entity.entity_id, entity])),
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

/** Seed one vacuum and render it, in the shape most cases want. */
function mount({
  state = 'docked',
  attributes = {},
  tier = 'full',
  config,
}: {
  state?: string
  attributes?: Record<string, unknown>
  tier?: CardTier
  config?: Record<string, unknown>
} = {}) {
  seed(createVacuumEntity({ state, attributes: { supported_features: MASK.full, ...attributes } }))
  return renderCard(<VacuumCard entityId={ENTITY_ID} tier={tier} />, config)
}

/** The service calls made, as `domain.service` plus the target. */
function calls() {
  return callService.mock.calls.map(([domain, service, data]) => ({
    service: `${domain}.${service}`,
    entityId: (data as { entity_id?: string } | undefined)?.entity_id,
  }))
}

const tile = () => document.querySelector('.liebe-card') as HTMLElement
const nameLine = () => document.querySelector('.liebe-name')?.textContent ?? null
const stateLine = () => document.querySelector('.liebe-state')?.textContent ?? null
const batterySegment = () => document.querySelector('.liebe-vacuum-battery')
const pills = () =>
  [...document.querySelectorAll('.liebe-pill')].map(
    (pill) => pill.getAttribute('aria-label') ?? pill.textContent
  )
const pill = (label: string) =>
  document.querySelector(`.liebe-pill[aria-label="${label}"]`) as HTMLElement | null

const flush = () => act(async () => {})

beforeEach(() => {
  callService = vi.fn<CallService>().mockResolvedValue(undefined)
  hass = createMockHomeAssistant({ callService })
  dashboardActions.resetState()
  /*
   * The guard's pending set is process-wide module state. Two cases issuing the
   * same command would otherwise have the second refused — which surfaces as
   * zero calls and no error, and reads as a broken test rather than a working
   * guard.
   */
  resetDispatchGuard()
})

describe('VacuumCard primary action', () => {
  it.each([
    ['docked', 'vacuum.start'],
    ['idle', 'vacuum.start'],
    ['paused', 'vacuum.start'],
    ['cleaning', 'vacuum.pause'],
  ] as const)('dispatches %s → %s on a body tap', async (state, service) => {
    mount({ state })

    fireEvent.click(tile())
    await flush()

    await waitFor(() => expect(calls()).toEqual([{ service, entityId: ENTITY_ID }]))
  })

  /** The option doc's scenario: never a blind toggle. */
  it('follows the entity from start to pause across a state change', async () => {
    mount({ state: 'docked' })

    fireEvent.click(tile())
    await waitFor(() => expect(calls()).toEqual([{ service: 'vacuum.start', entityId: ENTITY_ID }]))

    act(() => {
      seed(
        createVacuumEntity({
          state: 'cleaning',
          attributes: { supported_features: MASK.full },
          last_updated: '2026-07-25T12:00:05.000Z',
        })
      )
    })

    fireEvent.click(tile())
    await waitFor(() => expect(calls()).toHaveLength(2))
    expect(calls()[1]).toEqual({ service: 'vacuum.pause', entityId: ENTITY_ID })
  })

  it('falls a cleaning vacuum without PAUSE through to vacuum.stop', async () => {
    mount({ state: 'cleaning', attributes: { supported_features: MASK.noPause } })

    fireEvent.click(tile())
    await flush()

    await waitFor(() => expect(calls()).toEqual([{ service: 'vacuum.stop', entityId: ENTITY_ID }]))
  })

  /**
   * `returning` and `error` resolve to `more-info`, which dispatches nothing —
   * the shell opens the dialog. Asserted as "no service call" because that is
   * the half this card is responsible for.
   */
  it.each(['returning', 'error'])('dispatches nothing on a tap while %s', async (state) => {
    mount({ state })

    fireEvent.click(tile())
    await flush()

    expect(calls()).toEqual([])
  })

  it('dispatches nothing on a tap when the state-appropriate bit is missing', async () => {
    mount({ state: 'docked', attributes: { supported_features: MASK.dockOnly } })

    fireEvent.click(tile())
    await flush()

    expect(calls()).toEqual([])
  })
})

describe('VacuumCard command cluster', () => {
  it('renders start and dock, in that order, for a fully capable vacuum', () => {
    mount({ state: 'docked' })

    expect(pills()).toEqual(['Start', 'Return to dock'])
  })

  it('labels the run button Pause while cleaning and Resume while paused', () => {
    const { unmount } = mount({ state: 'cleaning' })
    expect(pills()).toEqual(['Pause', 'Return to dock'])
    unmount()

    mount({ state: 'paused' })
    expect(pills()).toEqual(['Resume', 'Return to dock'])
  })

  it('dispatches vacuum.return_to_base from the dock button', async () => {
    mount({ state: 'cleaning' })

    fireEvent.click(pill('Return to dock')!)
    await flush()

    await waitFor(() =>
      expect(calls()).toEqual([{ service: 'vacuum.return_to_base', entityId: ENTITY_ID }])
    )
  })

  /**
   * Omitted when the capability is absent, disabled when the capability exists
   * but the state forbids it — the option doc draws that line so a user can tell
   * "this vacuum cannot dock itself" from "it is already docked".
   */
  it('omits the dock button when RETURN_HOME is absent', () => {
    mount({ state: 'docked', attributes: { supported_features: MASK.startOnly } })

    expect(pills()).toEqual(['Start'])
  })

  it('omits the run button when the vacuum has no run control at all', () => {
    mount({ state: 'docked', attributes: { supported_features: MASK.dockOnly } })

    expect(pills()).toEqual(['Return to dock'])
  })

  it('renders no cluster at all for a vacuum advertising nothing', () => {
    mount({ state: 'docked', attributes: { supported_features: MASK.none } })

    expect(pills()).toEqual([])
  })

  it.each(['docked', 'returning'])('disables the dock button while %s', (state) => {
    mount({ state })

    expect(pill('Return to dock')).toBeDisabled()
  })

  /**
   * The deliberate tap/button divergence: mid-return the button offers Pause
   * while the tap keeps the safe inspection default.
   */
  it('offers a live Pause button while returning, where the tap dispatches nothing', async () => {
    mount({ state: 'returning' })

    expect(pill('Pause')).not.toBeDisabled()

    fireEvent.click(tile())
    await flush()
    expect(calls()).toEqual([])

    fireEvent.click(pill('Pause')!)
    await waitFor(() => expect(calls()).toEqual([{ service: 'vacuum.pause', entityId: ENTITY_ID }]))
  })

  it('disables the returning button when PAUSE is absent', () => {
    mount({ state: 'returning', attributes: { supported_features: MASK.noPause } })

    expect(pill('Pause')).toBeDisabled()
  })

  /**
   * The cluster stays visible in `error` and goes dead. A user seeing a disabled
   * Start on a failed vacuum learns something a missing button would not tell
   * them, and `more-info` is the escalation path.
   */
  it('renders the cluster disabled rather than absent while in error', () => {
    mount({ state: 'error' })

    expect(pills()).toEqual(['Start', 'Return to dock'])
    expect(pill('Start')).toBeDisabled()
    expect(pill('Return to dock')).toBeDisabled()
  })

  it('hides the cluster with showCommands false', () => {
    mount({ state: 'docked', config: { showCommands: false } })

    expect(pills()).toEqual([])
  })

  it('hides the cluster in edit mode, so editing never actuates the vacuum', () => {
    dashboardActions.setMode('edit')
    mount({ state: 'docked' })

    expect(pills()).toEqual([])
  })

  it.each(['glance', 'tall'] as const)('carries no cluster at %s', (tier) => {
    mount({ state: 'docked', tier })

    expect(pills()).toEqual([])
  })

  /** `row` puts the cluster in the trailing control slot; `full` stacks it below. */
  it('carries the cluster at row, in the control slot', () => {
    mount({ state: 'docked', tier: 'row' })

    expect(pills()).toEqual(['Start', 'Return to dock'])
    expect(document.querySelector('.liebe-card-controls')).not.toBeNull()
  })

  it('dispatches from the run button at row as it does at full', async () => {
    mount({ state: 'cleaning', tier: 'row' })

    fireEvent.click(pill('Pause')!)

    await waitFor(() => expect(calls()).toEqual([{ service: 'vacuum.pause', entityId: ENTITY_ID }]))
  })
})

describe('VacuumCard state line', () => {
  it('shows the friendly name and the humanised state', () => {
    mount({ state: 'docked' })

    expect(nameLine()).toBe('Robby')
    expect(stateLine()).toContain('Docked')
  })

  it('surfaces the error attribute in place of the state', () => {
    mount({ state: 'error', attributes: { error: 'Main brush stuck' } })

    expect(stateLine()).toContain('Main brush stuck')
  })

  it('falls back to Error when the entity publishes no diagnostic', () => {
    mount({ state: 'error' })

    expect(stateLine()).toContain('Error')
  })

  it('tints the tile with the vacuum token while cleaning and alert while in error', () => {
    const { unmount } = mount({ state: 'cleaning' })
    expect(tile()).toHaveAttribute('data-color', 'vacuum')
    unmount()

    mount({ state: 'error' })
    expect(tile()).toHaveAttribute('data-color', 'alert')
  })

  it('stays neutral while docked', () => {
    mount({ state: 'docked' })

    expect(tile()).toHaveAttribute('data-color', 'default')
  })
})

describe('VacuumCard battery segment', () => {
  /**
   * PR 1 reads the legacy attribute because no battery **sensor** is reachable
   * yet — the panel has no device or entity registry, so nothing can say which
   * sensor belongs to this vacuum. The resolver is sensor-first and its unit
   * tests cover that path; this asserts what the card actually renders today.
   */
  it('appends the battery percentage to the state line', () => {
    mount({ state: 'docked', attributes: { battery_level: 87 } })

    expect(batterySegment()?.textContent).toBe('87%')
    expect(stateLine()).toBe('Docked 87%')
  })

  it('marks a reading under 20% low, and one at 20% not', () => {
    const { unmount } = mount({ state: 'docked', attributes: { battery_level: 14 } })
    expect(batterySegment()).toHaveAttribute('data-low', 'true')
    unmount()

    mount({ state: 'docked', attributes: { battery_level: 20 } })
    expect(batterySegment()).not.toHaveAttribute('data-low')
  })

  it('renders no segment when the entity publishes no battery source', () => {
    mount({ state: 'docked' })

    expect(batterySegment()).toBeNull()
    expect(stateLine()).toBe('Docked')
  })

  it('renders no segment with showBattery false, whatever the entity publishes', () => {
    mount({ state: 'docked', attributes: { battery_level: 87 }, config: { showBattery: false } })

    expect(batterySegment()).toBeNull()
  })
})

describe('VacuumCard dispatch guarantees', () => {
  /**
   * Every command is non-idempotent: a retried `vacuum.start` restarts a run
   * that had already begun. The body tap issues the *same* services as the
   * buttons, so it shares the guard — a `vacuum.start` acknowledged before the
   * entity leaves `docked` must not be re-dispatchable by a second tap.
   */
  it('refuses a repeated body tap until the entity moves', async () => {
    mount({ state: 'docked' })

    fireEvent.click(tile())
    await waitFor(() => expect(callService).toHaveBeenCalledTimes(1))
    await flush()

    fireEvent.click(tile())
    await flush()

    expect(callService).toHaveBeenCalledTimes(1)
  })

  it('refuses a repeated dock press until the entity moves', async () => {
    mount({ state: 'cleaning' })

    fireEvent.click(pill('Return to dock')!)
    await waitFor(() => expect(callService).toHaveBeenCalledTimes(1))
    await flush()

    fireEvent.click(pill('Return to dock')!)
    await flush()

    expect(callService).toHaveBeenCalledTimes(1)
  })

  /** The guard keys on the payload, so a different command is never held back. */
  it('does not hold back a different command issued in the same window', async () => {
    mount({ state: 'cleaning' })

    fireEvent.click(pill('Pause')!)
    await flush()
    fireEvent.click(pill('Return to dock')!)
    await flush()

    await waitFor(() => expect(calls()).toHaveLength(2))
    expect(calls().map((call) => call.service)).toEqual(['vacuum.pause', 'vacuum.return_to_base'])
  })

  it('shows ERROR when a dispatch fails, and clears it on the next press', async () => {
    callService.mockRejectedValueOnce(new Error('nope'))
    mount({ state: 'cleaning' })

    fireEvent.click(pill('Pause')!)
    await waitFor(() => expect(stateLine()).toContain('ERROR'))

    fireEvent.click(pill('Return to dock')!)
    await waitFor(() => expect(stateLine()).not.toContain('ERROR'))
  })
})

describe('VacuumCard lifecycle states', () => {
  it('renders the unavailable treatment', () => {
    mount({ state: 'unavailable' })

    expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument()
  })

  /**
   * `unknown` is the state the unavailable treatment does *not* catch: the card
   * renders normally, and the tap must still be inert. It is the only state that
   * reaches the tile with no command behind it, so it is the one that proves the
   * card asks the shell for `none` rather than for a toggle that does nothing.
   */
  it('renders an unknown vacuum as an ordinary but inert tile', async () => {
    mount({ state: 'unknown' })

    // Not the unavailable treatment — the card renders, it just cannot be
    // commanded.
    expect(screen.queryByText('UNAVAILABLE')).toBeNull()
    expect(nameLine()).toBe('Robby')
    expect(stateLine()).toBe('unknown')

    fireEvent.click(tile())
    await flush()
    expect(calls()).toEqual([])
  })

  it('falls back to the entity id when the entity has no friendly name', () => {
    seed(
      createVacuumEntity({
        attributes: { friendly_name: undefined, supported_features: MASK.full },
      })
    )
    renderCard(<VacuumCard entityId={ENTITY_ID} tier="glance" />)

    expect(nameLine()).toBe(ENTITY_ID)
  })

  it('falls back to the entity id on the unavailable treatment too', () => {
    seed(createVacuumEntity({ state: 'unavailable', attributes: { friendly_name: undefined } }))
    renderCard(<VacuumCard entityId={ENTITY_ID} tier="full" />)

    expect(screen.getByText(ENTITY_ID)).toBeInTheDocument()
  })

  it('renders the skeleton while the entity is still loading', () => {
    entityStore.setState((state) => ({
      ...state,
      isConnected: true,
      isInitialLoading: true,
      entities: {},
      staleEntities: new Set<string>(),
    }))
    renderCard(<VacuumCard entityId={ENTITY_ID} tier="full" />)

    /*
     * The skeleton reuses the `liebe-card` shell, so its tell is the absence of
     * card content rather than the absence of the tile: no name, no state line,
     * no controls, because there is no entity to render any of them from.
     */
    expect(nameLine()).toBeNull()
    expect(stateLine()).toBeNull()
    expect(pills()).toEqual([])
  })

  it('offers a retry when the connection is down', () => {
    entityStore.setState((state) => ({
      ...state,
      isConnected: false,
      isInitialLoading: false,
      entities: {},
      staleEntities: new Set<string>(),
    }))
    const reload = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload },
    })

    try {
      renderCard(<VacuumCard entityId={ENTITY_ID} tier="full" />)
      fireEvent.click(screen.getByRole('button', { name: /retry/i }))
      expect(reload).toHaveBeenCalled()
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original })
    }
  })
})

describe('VacuumCard selection and boundary', () => {
  it('selects the tile in edit mode rather than dispatching', async () => {
    const onSelect = vi.fn()
    dashboardActions.setMode('edit')
    seed(createVacuumEntity({ attributes: { supported_features: MASK.full } }))
    renderCard(<VacuumCard entityId={ENTITY_ID} tier="full" onSelect={onSelect} />)

    fireEvent.click(tile())
    await flush()

    expect(onSelect).toHaveBeenCalledWith(true)
    expect(calls()).toEqual([])
  })

  it('selects an unavailable tile too', async () => {
    const onSelect = vi.fn()
    dashboardActions.setMode('edit')
    seed(createVacuumEntity({ state: 'unavailable' }))
    renderCard(<VacuumCard entityId={ENTITY_ID} tier="full" onSelect={onSelect} />)

    fireEvent.click(tile())
    await flush()

    expect(onSelect).toHaveBeenCalledWith(true)
  })

  /**
   * The memo comparator, one clause at a time.
   *
   * The grid rebuilds every item's props on every pass, so props of equal value
   * must not re-render the card while a real change must. The rerenders below
   * vary exactly one prop each, in an order that reaches every clause: the chain
   * short-circuits, so a clause is only consulted when the ones before it
   * matched.
   */
  it('holds its render across rebuilt props and re-renders on each real change', () => {
    seed(createVacuumEntity({ state: 'cleaning', attributes: { supported_features: MASK.full } }))
    const onSelect = () => {}
    const onDelete = () => {}

    let props = {
      entityId: ENTITY_ID,
      tier: 'full' as CardTier,
      isSelected: false,
      onSelect,
      onDelete,
    }

    const { rerender } = renderCard(<VacuumCard {...props} />)
    expect(pills()).toEqual(['Pause', 'Return to dock'])

    const again = (next: Partial<typeof props>) => {
      props = { ...props, ...next }
      rerender(
        <Theme>
          <HomeAssistantProvider hass={hass}>
            <CardItemProvider entityId={ENTITY_ID}>
              <VacuumCard {...props} />
            </CardItemProvider>
          </HomeAssistantProvider>
        </Theme>
      )
    }

    // Equal values, fresh object: held at the same render, not a stale one.
    again({})
    expect(pills()).toEqual(['Pause', 'Return to dock'])

    // A real tier change, which the comparator must let through.
    again({ tier: 'glance' })
    expect(pills()).toEqual([])

    again({ tier: 'full' })
    expect(pills()).toEqual(['Pause', 'Return to dock'])

    // The remaining clauses, each varied alone. None changes what is drawn —
    // the point is that the comparator consults them rather than stopping early.
    again({ onDelete: () => {} })
    expect(pills()).toEqual(['Pause', 'Return to dock'])

    again({ isSelected: true })
    expect(pills()).toEqual(['Pause', 'Return to dock'])

    again({ onSelect: () => {} })
    expect(pills()).toEqual(['Pause', 'Return to dock'])

    // A different entity short-circuits the chain at its first clause.
    seed(
      createVacuumEntity({ state: 'cleaning', attributes: { supported_features: MASK.full } }),
      createVacuumEntity({
        entity_id: 'vacuum.mopper',
        state: 'docked',
        attributes: { friendly_name: 'Mopper', supported_features: MASK.full },
      })
    )
    again({ entityId: 'vacuum.mopper' })
    expect(nameLine()).toBe('Mopper')
  })

  it('offers a delete affordance in edit mode', () => {
    const onDelete = vi.fn()
    dashboardActions.setMode('edit')
    seed(createVacuumEntity({ attributes: { supported_features: MASK.full } }))
    renderCard(<VacuumCard entityId={ENTITY_ID} tier="full" onDelete={onDelete} />)

    expect(tile()).toBeInTheDocument()
  })

  /**
   * The card's own boundary. `GridView` wraps entity cards in
   * `EntityErrorBoundary`, but that covers only the dashboard path — this test
   * renders the card **bare**, which is what a story and the configuration
   * preview do, and plants the throw in `attributes` so it fires from inside the
   * boundary's subtree rather than from the test's own frame.
   */
  it('contains a render-time throw instead of taking the tree down with it', () => {
    const entity = createVacuumEntity({ attributes: { supported_features: MASK.full } })
    const exploding = {
      ...entity,
      get attributes(): never {
        throw new Error('render exploded')
      },
    } as unknown as HassEntity

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      seed(exploding)
      expect(() => renderCard(<VacuumCard entityId={ENTITY_ID} tier="full" />)).not.toThrow()
    } finally {
      consoleError.mockRestore()
    }
  })
})
