import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import type { ReactElement } from 'react'
import { Theme } from '@radix-ui/themes'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import { resetDispatchGuard } from '~/services/guardedDispatch'
import {
  createButtonEntity,
  createInputButtonEntity,
  createSceneEntity,
  createScriptEntity,
} from '~/test/fixtures'
import type { HassEntity } from '~/store/entityTypes'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'
import { ActionCard } from '..'
import { ACTIVATION_CHECK_HOLD_MS } from '../hooks'

/**
 * The action card family, rendered against the real hooks rather than mocked
 * ones: `useEntity`, `useServiceCall`, the at-most-once guard and `hassService`
 * all run, and the only seam is `hass.callService`.
 *
 * That is deliberate for this card above others. The defect it fixes is a card
 * dispatching a service that does not exist, so a test that mocked the dispatch
 * layer would assert the card's intent rather than the call it actually makes —
 * which is precisely the thing that was wrong on main.
 */

/** The one seam: everything above this runs for real. */
type CallService = (
  domain: string,
  service: string,
  serviceData?: Record<string, unknown>
) => Promise<void>

let hass: HomeAssistant
let callService: Mock<CallService>

function seed(...entities: HassEntity[]) {
  entityStore.setState((state) => ({
    ...state,
    isConnected: true,
    isInitialLoading: false,
    entities: Object.fromEntries(entities.map((entity) => [entity.entity_id, entity])),
    staleEntities: new Set<string>(),
  }))
}

function renderCard(card: ReactElement) {
  return render(
    <Theme>
      <HomeAssistantProvider hass={hass}>{card}</HomeAssistantProvider>
    </Theme>
  )
}

/** The tile itself, which is the whole touch target for this family. */
const tile = () => document.querySelector('.liebe-card') as HTMLElement

const iconGlyph = () => document.querySelector('.liebe-icon svg')?.getAttribute('class') ?? ''
const stateLine = () => document.querySelector('.liebe-state')?.textContent ?? null
const nameLine = () => document.querySelector('.liebe-name')?.textContent ?? null

/**
 * Settle the promise chain behind a dispatch without touching the clock.
 *
 * Used instead of `waitFor` wherever fake timers are running: `waitFor` advances
 * fake timers to let its own polling make progress, which would run through the
 * activation feedback's hold window before the assertion after it could look.
 */
const flush = () => act(async () => {})

/** Move fake time forward and let anything it released settle. */
async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

/** The service calls made, as `domain.service` plus the target. */
function calls() {
  return callService.mock.calls.map(([domain, service, data]) => ({
    service: `${domain}.${service}`,
    entityId: (data as { entity_id?: string } | undefined)?.entity_id,
  }))
}

beforeEach(() => {
  callService = vi.fn<CallService>().mockResolvedValue(undefined)
  hass = createMockHomeAssistant({ callService })
  dashboardActions.resetState()
  /*
   * The guard's pending set is process-wide module state. Two cases issuing the
   * same command inside one acknowledgement window would see the second refused
   * — and a refusal looks exactly like a card that never fired, with no error to
   * point at it.
   */
  resetDispatchGuard()
})

afterEach(() => {
  vi.useRealTimers()
  dashboardActions.resetState()
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

describe('primary action per domain', () => {
  it.each([
    ['scene', createSceneEntity(), 'scene.turn_on', 'scene.movie_night'],
    ['script', createScriptEntity(), 'script.turn_on', 'script.water_garden'],
    ['button', createButtonEntity(), 'button.press', 'button.restart_bridge'],
    ['input_button', createInputButtonEntity(), 'input_button.press', 'input_button.doorbell_test'],
  ])('a tap on a %s card calls %s', async (_domain, entity, expected, entityId) => {
    seed(entity)
    renderCard(<ActionCard entityId={entityId} />)

    fireEvent.click(tile())

    await waitFor(() => expect(calls()).toEqual([{ service: expected, entityId }]))
  })

  it('never dispatches a toggle on any domain of the family', async () => {
    /*
     * The regression under test. `ButtonCard` — the fallback these four resolve
     * to on main — dispatches `<domain>.toggle`, and Home Assistant answers 400
     * for `scene.toggle`, `button.toggle` and `input_button.toggle`, none of
     * which is a registered service.
     */
    for (const entity of [
      createSceneEntity(),
      createButtonEntity(),
      createInputButtonEntity(),
      createScriptEntity(),
    ]) {
      resetDispatchGuard()
      callService.mockClear()
      seed(entity)
      const { unmount } = renderCard(<ActionCard entityId={entity.entity_id} />)

      fireEvent.click(tile())

      await waitFor(() => expect(callService).toHaveBeenCalled())
      expect(calls().map((call) => call.service)).not.toContain(
        `${entity.entity_id.split('.')[0]}.toggle`
      )
      unmount()
    }
  })

  it('does not fall through to homeassistant.toggle when tapAction is an explicit toggle', async () => {
    // `toggle` is meaningless on these domains, so the card supplies its own
    // toggle semantics and the shell routes the literal there.
    seed(createButtonEntity())
    renderCard(<ActionCard entityId="button.restart_bridge" config={{ tapAction: 'toggle' }} />)

    fireEvent.click(tile())

    await waitFor(() =>
      expect(calls()).toEqual([{ service: 'button.press', entityId: 'button.restart_bridge' }])
    )
  })
})

describe('the unknown-versus-unavailable rule', () => {
  it.each([
    ['scene', createSceneEntity({ state: 'unknown' }), 'scene.turn_on'],
    ['button', createButtonEntity({ state: 'unknown' }), 'button.press'],
    ['input_button', createInputButtonEntity({ state: 'unknown' }), 'input_button.press'],
  ])('a never-activated %s stays activatable', async (_domain, entity, expected) => {
    /*
     * These entities' state IS their last-activation timestamp, so `unknown`
     * means "never run" and only an activation can move it out of that state.
     * Inert would mean permanently unusable.
     */
    seed(entity)
    renderCard(<ActionCard entityId={entity.entity_id} />)

    fireEvent.click(tile())

    await waitFor(() =>
      expect(calls()).toEqual([{ service: expected, entityId: entity.entity_id }])
    )
  })

  it('an unknown script is inert, because its state really is indeterminate', async () => {
    seed(createScriptEntity({ state: 'unknown' }))
    renderCard(<ActionCard entityId="script.water_garden" />)

    fireEvent.click(tile())

    await act(async () => {})
    expect(callService).not.toHaveBeenCalled()
    expect(tile()).toHaveAttribute('data-unavailable', 'true')
  })

  it.each([
    ['scene', createSceneEntity({ state: 'unavailable' })],
    ['script', createScriptEntity({ state: 'unavailable' })],
    ['button', createButtonEntity({ state: 'unavailable' })],
    ['input_button', createInputButtonEntity({ state: 'unavailable' })],
  ])('an unavailable %s is inert', async (_domain, entity) => {
    seed(entity)
    renderCard(<ActionCard entityId={entity.entity_id} />)

    fireEvent.click(tile())

    await act(async () => {})
    expect(callService).not.toHaveBeenCalled()
    expect(tile()).toHaveAttribute('data-unavailable', 'true')
  })
})

/**
 * The activation feedback, on fake timers.
 *
 * These entities expose no state change to observe, so the sequence is the tap's
 * only evidence that anything happened — correctness, not decoration.
 */
describe('activation feedback', () => {
  it('holds the check for the ~1.5s the spec names', () => {
    /*
     * The literal, pinned separately from the sequencing cases below. Those read
     * the hold out of the same constant they are checking, so on its own a
     * shortened hold would move the code and the expectation together and no
     * assertion would notice.
     */
    expect(ACTIVATION_CHECK_HOLD_MS).toBe(1500)
  })

  it('runs icon → spinner → check → icon, holding the check ~1.5s', async () => {
    /*
     * Driven by explicit timer advances rather than `waitFor`. `waitFor` under
     * fake timers advances them itself to let its polling make progress, which
     * would run straight through the 1.5s hold this case exists to measure —
     * the check would be gone before the first assertion looked for it.
     */
    vi.useFakeTimers()
    seed(createSceneEntity())
    renderCard(<ActionCard entityId="scene.movie_night" />)

    // The resting glyph, before anything is tapped.
    expect(iconGlyph()).toContain('lucide-palette')

    let release: () => void = () => {}
    callService.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = () => resolve()
        })
    )

    fireEvent.click(tile())
    await flush()

    // In flight: the spinner stands in for the icon, and the tile is not yet
    // claiming anything happened.
    expect(iconGlyph()).toContain('liebe-action-spin')
    expect(tile()).not.toHaveAttribute('data-active')

    await act(async () => {
      release()
    })
    await flush()

    // Succeeded: the check, on the active tint the entity itself never reports.
    expect(iconGlyph()).toContain('lucide-check')
    expect(tile()).toHaveAttribute('data-active', 'true')

    // Still held just before the window closes.
    await advance(ACTIVATION_CHECK_HOLD_MS - 1)
    expect(iconGlyph()).toContain('lucide-check')

    await advance(1)
    expect(iconGlyph()).toContain('lucide-palette')
    expect(tile()).not.toHaveAttribute('data-active')
  })

  it('queues no further call from taps inside the feedback window', async () => {
    vi.useFakeTimers()
    seed(createButtonEntity())
    renderCard(<ActionCard entityId="button.restart_bridge" />)

    fireEvent.click(tile())
    await flush()
    expect(callService).toHaveBeenCalledTimes(1)

    // Three more taps spread across the check hold.
    fireEvent.click(tile())
    await flush()
    fireEvent.click(tile())
    await advance(ACTIVATION_CHECK_HOLD_MS - 10)
    fireEvent.click(tile())
    await flush()

    expect(callService).toHaveBeenCalledTimes(1)
  })

  it('shows the error state and no check when the call fails', async () => {
    callService.mockRejectedValueOnce(new Error('Service not found'))
    seed(createSceneEntity())
    renderCard(<ActionCard entityId="scene.movie_night" />)

    fireEvent.click(tile())

    await waitFor(() => expect(tile()).toHaveAttribute('data-error', 'true'))
    expect(stateLine()).toBe('ERROR')
    expect(iconGlyph()).not.toContain('lucide-check')
    // The error text is the card's title, per the entity-card baseline.
    expect(tile()).toHaveAttribute('title', 'Service not found')
  })

  it('opens recovery on retap while the error stands instead of dispatching again', async () => {
    callService.mockRejectedValueOnce(new Error('Service not found'))
    seed(createButtonEntity())
    renderCard(<ActionCard entityId="button.restart_bridge" />)

    fireEvent.click(tile())
    await waitFor(() => expect(tile()).toHaveAttribute('data-error', 'true'))

    // A retap while the error stands is a recovery activation, not a new
    // dispatch: the shell routes the tap to the detail dialog carrying the
    // failure instead of clearing the error and re-dispatching behind it.
    resetDispatchGuard()
    fireEvent.click(tile())

    expect(screen.getByTestId('detail-failure')).toHaveTextContent('Service not found')
    expect(calls()).toHaveLength(1)

    // Dismiss clears the presentation state and dispatches nothing; Retry
    // re-dispatches the retained command (covered in ButtonCard.retry.test).
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    await waitFor(() => expect(tile()).not.toHaveAttribute('data-error'))
    expect(stateLine()).toBeNull()
    expect(calls()).toHaveLength(1)
  })

  it('lets a later tap through once the window has closed', async () => {
    vi.useFakeTimers()
    seed(createButtonEntity())
    renderCard(<ActionCard entityId="button.restart_bridge" />)

    fireEvent.click(tile())
    await flush()
    expect(callService).toHaveBeenCalledTimes(1)

    await advance(ACTIVATION_CHECK_HOLD_MS)

    /*
     * The dispatch guard is a separate mechanism with its own window, and it
     * keys on the entity's `last_updated` — which moves when a real press lands.
     * Reset here so this case tests the feedback window rather than the guard's.
     */
    resetDispatchGuard()
    fireEvent.click(tile())
    await flush()

    expect(callService).toHaveBeenCalledTimes(2)
  })
})

/**
 * The boundary guarantee the change doc asks for: one tap, exactly one call,
 * even when the client observes a transient failure. These services are all
 * non-idempotent — a retried `script.turn_on` runs the script twice.
 */
describe('dispatch guarantees', () => {
  it('sends exactly one call for one tap when the client sees a transient failure', async () => {
    callService.mockRejectedValue(new Error('socket hiccup'))
    seed(createScriptEntity())
    renderCard(<ActionCard entityId="script.water_garden" />)

    fireEvent.click(tile())

    await waitFor(() => expect(tile()).toHaveAttribute('data-error', 'true'))
    // The retrying path would have made three attempts here.
    expect(callService).toHaveBeenCalledTimes(1)
  })

  it('refuses an identical repeat while the first is still travelling', async () => {
    seed(createButtonEntity())
    const { unmount } = renderCard(<ActionCard entityId="button.restart_bridge" />)

    fireEvent.click(tile())
    await waitFor(() => expect(callService).toHaveBeenCalledTimes(1))
    unmount()

    // A second card for the same entity: a different component instance, the
    // same command, and the guard is process-wide precisely for this.
    renderCard(<ActionCard entityId="button.restart_bridge" />)
    fireEvent.click(tile())

    await act(async () => {})
    expect(callService).toHaveBeenCalledTimes(1)
  })
})

describe('script running state', () => {
  const running = createScriptEntity({ state: 'on' })

  it('shows the stop glyph, the active tint and “Running · tap to stop”', () => {
    seed(running)
    renderCard(<ActionCard entityId="script.water_garden" tier="row" />)

    expect(stateLine()).toBe('Running · tap to stop')
    expect(iconGlyph()).toContain('lucide-square')
    expect(tile()).toHaveAttribute('data-active', 'true')
  })

  it('calls script.turn_off when tapped while running', async () => {
    seed(running)
    renderCard(<ActionCard entityId="script.water_garden" tier="row" />)

    fireEvent.click(tile())

    await waitFor(() =>
      expect(calls()).toEqual([{ service: 'script.turn_off', entityId: 'script.water_garden' }])
    )
  })

  it('reverts to idle when the script finishes', () => {
    seed(running)
    const { rerender } = renderCard(<ActionCard entityId="script.water_garden" tier="row" />)
    expect(stateLine()).toBe('Running · tap to stop')

    seed(createScriptEntity({ state: 'off' }))
    rerender(
      <Theme>
        <HomeAssistantProvider hass={hass}>
          <ActionCard entityId="script.water_garden" tier="row" />
        </HomeAssistantProvider>
      </Theme>
    )

    expect(stateLine()).toBeNull()
    expect(iconGlyph()).toContain('lucide-scroll-text')
    expect(tile()).not.toHaveAttribute('data-active')
  })

  it('puts the running line in the name line’s place at glance', () => {
    // The 1×1 stack has room for one line, and while a script runs that line has
    // to be the one offering the stop.
    seed(running)
    renderCard(<ActionCard entityId="script.water_garden" tier="glance" />)

    expect(stateLine()).toBe('Running · tap to stop')
    expect(nameLine()).toBeNull()
  })

  it('supersedes a pending success check with the running state', async () => {
    vi.useFakeTimers()
    seed(createScriptEntity({ state: 'off' }))
    const { rerender } = renderCard(<ActionCard entityId="script.water_garden" tier="row" />)

    fireEvent.click(tile())
    await flush()
    expect(iconGlyph()).toContain('lucide-check')

    // The state update lands while the check is still holding.
    seed(createScriptEntity({ state: 'on' }))
    rerender(
      <Theme>
        <HomeAssistantProvider hass={hass}>
          <ActionCard entityId="script.water_garden" tier="row" />
        </HomeAssistantProvider>
      </Theme>
    )

    expect(iconGlyph()).toContain('lucide-square')
    expect(stateLine()).toBe('Running · tap to stop')
  })
})

describe('showLastActivated', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-25T12:00:00.000Z'))
  })

  it('is off by default, leaving these tiles with no state line at all', () => {
    seed(createSceneEntity())
    renderCard(<ActionCard entityId="scene.movie_night" tier="row" />)

    expect(stateLine()).toBeNull()
  })

  it('reads a scene’s state timestamp', () => {
    seed(createSceneEntity({ state: '2026-07-25T10:00:00.000Z' }))
    renderCard(
      <ActionCard entityId="scene.movie_night" tier="row" config={{ showLastActivated: true }} />
    )

    expect(stateLine()).toBe('2 h ago')
  })

  it('reads a script’s last_triggered attribute rather than its on/off state', () => {
    seed(createScriptEntity({ attributes: { last_triggered: '2026-07-25T11:30:00.000Z' } }))
    renderCard(
      <ActionCard entityId="script.water_garden" tier="row" config={{ showLastActivated: true }} />
    )

    expect(stateLine()).toBe('30 min ago')
  })

  it.each([
    ['a never-activated scene', createSceneEntity({ state: 'unknown' }), 'scene.movie_night'],
    [
      'a never-run script',
      createScriptEntity({ attributes: { last_triggered: null } }),
      'script.water_garden',
    ],
  ])('renders Never for %s', (_label, entity, entityId) => {
    seed(entity)
    renderCard(<ActionCard entityId={entityId} tier="row" config={{ showLastActivated: true }} />)

    expect(stateLine()).toBe('Never')
  })

  it('is omitted at glance, which has no room for a secondary line', () => {
    seed(createSceneEntity({ state: '2026-07-25T10:00:00.000Z' }))
    renderCard(
      <ActionCard entityId="scene.movie_night" tier="glance" config={{ showLastActivated: true }} />
    )

    expect(stateLine()).toBeNull()
    expect(nameLine()).toBe('Movie Night')
  })

  it('refreshes at least once a minute while visible', async () => {
    seed(createSceneEntity({ state: '2026-07-25T11:59:30.000Z' }))
    renderCard(
      <ActionCard entityId="scene.movie_night" tier="row" config={{ showLastActivated: true }} />
    )

    expect(stateLine()).toBe('just now')

    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })

    expect(stateLine()).toBe('1 min ago')
  })

  it('is hidden by hideState, since this line is the card’s state line', () => {
    seed(createSceneEntity({ state: '2026-07-25T10:00:00.000Z' }))
    renderCard(
      <ActionCard
        entityId="scene.movie_night"
        tier="row"
        config={{ showLastActivated: true, hideState: true }}
      />
    )

    expect(stateLine()).toBeNull()
  })
})

describe('confirm', () => {
  const confirmDialog = () => screen.queryByRole('alertdialog')

  it('does not gate anything when the option is off', async () => {
    seed(createScriptEntity())
    renderCard(<ActionCard entityId="script.water_garden" />)

    fireEvent.click(tile())

    await waitFor(() => expect(callService).toHaveBeenCalledTimes(1))
    expect(confirmDialog()).toBeNull()
  })

  it('fires nothing and leaves no pending state when cancelled', async () => {
    seed(createScriptEntity({ entity_id: 'script.reset_all_devices' }))
    renderCard(<ActionCard entityId="script.reset_all_devices" config={{ confirm: true }} />)

    fireEvent.click(tile())

    await screen.findByRole('alertdialog')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(confirmDialog()).toBeNull())
    expect(callService).not.toHaveBeenCalled()
    // No feedback played either — the icon never left its resting glyph.
    expect(iconGlyph()).toContain('lucide-scroll-text')
  })

  it('fires exactly one call, with the normal feedback, when confirmed', async () => {
    seed(createScriptEntity({ entity_id: 'script.reset_all_devices' }))
    renderCard(<ActionCard entityId="script.reset_all_devices" config={{ confirm: true }} />)

    fireEvent.click(tile())
    await screen.findByRole('alertdialog')
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    await waitFor(() =>
      expect(calls()).toEqual([{ service: 'script.turn_on', entityId: 'script.reset_all_devices' }])
    )
    await waitFor(() => expect(iconGlyph()).toContain('lucide-check'))
  })

  it.each([
    ['scene', createSceneEntity(), 'Activate Movie Night?'],
    ['script', createScriptEntity(), 'Run Water Garden?'],
    ['button', createButtonEntity(), 'Press Restart Bridge?'],
    ['input_button', createInputButtonEntity(), 'Press Doorbell Test?'],
  ])('names the %s action in the dialog', async (_domain, entity, title) => {
    seed(entity)
    renderCard(<ActionCard entityId={entity.entity_id} config={{ confirm: true }} />)

    fireEvent.click(tile())

    expect(await screen.findByText(title)).toBeInTheDocument()
  })

  it('names the stop when a tap would stop a running script', async () => {
    seed(createScriptEntity({ state: 'on' }))
    renderCard(<ActionCard entityId="script.water_garden" config={{ confirm: true }} />)

    fireEvent.click(tile())

    expect(await screen.findByText('Stop Water Garden?')).toBeInTheDocument()
  })

  it('gates a call-service re-routed at the entity’s own service', async () => {
    // The lock-card pattern: the gate sits after action resolution, so
    // re-routing cannot slip past it.
    seed(createSceneEntity())
    renderCard(
      <ActionCard
        entityId="scene.movie_night"
        config={{
          confirm: true,
          tapAction: { action: 'call-service', service: 'scene.turn_on' },
        }}
      />
    )

    fireEvent.click(tile())

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(callService).not.toHaveBeenCalled()
  })

  it('gates the generic homeassistant alias the replaced gate also caught', async () => {
    seed(createSceneEntity())
    renderCard(
      <ActionCard
        entityId="scene.movie_night"
        config={{
          confirm: true,
          tapAction: { action: 'call-service', service: 'homeassistant.turn_on' },
        }}
      />
    )

    fireEvent.click(tile())

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
  })

  it('leaves a call-service on an unrelated service ungated', async () => {
    seed(createSceneEntity())
    renderCard(
      <ActionCard
        entityId="scene.movie_night"
        config={{
          confirm: true,
          tapAction: { action: 'call-service', service: 'light.turn_on' },
        }}
      />
    )

    fireEvent.click(tile())

    await waitFor(() => expect(callService).toHaveBeenCalledTimes(1))
    expect(confirmDialog()).toBeNull()
  })
})

describe('tier layouts', () => {
  const arrangement = () =>
    document.querySelector('.liebe-card-body')?.getAttribute('data-arrangement')

  it.each([
    ['glance', 'stack'],
    ['row', 'row'],
    ['tall', 'tall'],
    ['full', 'row'],
  ] as const)('lays %s out as the %s arrangement', (tier, shape) => {
    seed(createSceneEntity())
    renderCard(<ActionCard entityId="scene.movie_night" tier={tier} />)

    expect(tile()).toHaveAttribute('data-tier', tier)
    expect(arrangement()).toBe(shape)
  })

  it('embeds no discrete control at any tier — the whole tile is the target', () => {
    for (const tier of ['glance', 'row', 'tall', 'full'] as const) {
      seed(createSceneEntity())
      const { unmount } = renderCard(<ActionCard entityId="scene.movie_night" tier={tier} />)

      expect(document.querySelector('.liebe-card-controls')).toBeNull()
      unmount()
    }
  })

  it('declares a 1×1 default, the first family to do so', () => {
    expect(ActionCard.defaultDimensions).toEqual({ width: 1, height: 1 })
  })

  it('leaves an icon-only tile valid under hideName', () => {
    /*
     * These cards carry no state line by default, so hiding the name really does
     * leave nothing but the glyph — the icon-only tile the tier table requires
     * to stay valid.
     */
    seed(createSceneEntity())
    renderCard(
      <ActionCard entityId="scene.movie_night" tier="glance" config={{ hideName: true }} />
    )

    expect(nameLine()).toBeNull()
    expect(stateLine()).toBeNull()
    expect(document.querySelector('.liebe-icon')).toBeInTheDocument()
  })

  it('stamps the icon-only layout when both lines are hidden', () => {
    seed(createSceneEntity())
    renderCard(
      <ActionCard
        entityId="scene.movie_night"
        tier="glance"
        config={{ hideName: true, hideState: true }}
      />
    )

    expect(tile()).toHaveAttribute('data-icon-only', 'true')
  })
})

describe('presentation', () => {
  it('gives scene the indigo media triplet and the rest the default one', () => {
    for (const [entity, color] of [
      [createSceneEntity(), 'media'],
      [createScriptEntity(), 'default'],
      [createButtonEntity(), 'default'],
      [createInputButtonEntity(), 'default'],
    ] as const) {
      seed(entity)
      const { unmount } = renderCard(<ActionCard entityId={entity.entity_id} />)

      expect(tile()).toHaveAttribute('data-color', color)
      unmount()
    }
  })

  it.each([
    [createSceneEntity(), 'lucide-palette'],
    [createScriptEntity(), 'lucide-scroll-text'],
    [createButtonEntity(), 'lucide-circle-dot'],
    [createInputButtonEntity(), 'lucide-circle-dot'],
  ])('renders the domain glyph', (entity, glyph) => {
    seed(entity)
    renderCard(<ActionCard entityId={entity.entity_id} />)

    expect(iconGlyph()).toContain(glyph)
  })

  it('honours the universal icon override at rest', () => {
    seed(createSceneEntity())
    renderCard(<ActionCard entityId="scene.movie_night" config={{ icon: 'Moon' }} />)

    expect(iconGlyph()).toContain('tabler-icon-moon')
  })

  it('keeps the domain glyph when the override names an icon this build lacks', () => {
    // A configuration written by a build with a larger icon set is resolved for
    // display, not repaired.
    seed(createSceneEntity())
    renderCard(<ActionCard entityId="scene.movie_night" config={{ icon: 'NoSuchIcon' }} />)

    expect(iconGlyph()).toContain('lucide-palette')
  })

  it('lets the feedback glyph outrank a configured icon', async () => {
    /*
     * The reason this card renders its own icon circle rather than going through
     * `GridCard.Icon`, whose override wins over its children: a configured icon
     * must not suppress the only evidence the tap did anything.
     */
    vi.useFakeTimers()
    seed(createSceneEntity())
    renderCard(<ActionCard entityId="scene.movie_night" config={{ icon: 'Moon' }} />)

    fireEvent.click(tile())
    await flush()
    expect(iconGlyph()).toContain('lucide-check')

    await advance(ACTIVATION_CHECK_HOLD_MS)
    expect(iconGlyph()).toContain('tabler-icon-moon')
  })

  it('honours the universal name override', () => {
    seed(createSceneEntity())
    renderCard(<ActionCard entityId="scene.movie_night" config={{ name: 'Cinema' }} />)

    expect(nameLine()).toBe('Cinema')
  })
})

/**
 * A domain the family does not serve. The registry never routes one here, but a
 * story or a grid item whose entity was replaced can, and the card must decline
 * rather than dispatch a service it cannot name.
 */
describe('an entity outside the family', () => {
  const foreign = {
    entity_id: 'light.kitchen',
    state: 'on',
    attributes: { friendly_name: 'Kitchen' },
    last_changed: '2026-07-25T12:00:00.000Z',
    last_updated: '2026-07-25T12:00:00.000Z',
    context: { id: 'ctx', parent_id: null, user_id: null },
  } satisfies HassEntity

  it('renders inert with the generic glyph rather than guessing a service', async () => {
    seed(foreign)
    renderCard(<ActionCard entityId="light.kitchen" />)

    expect(tile()).toHaveAttribute('data-unavailable', 'true')
    // The generic fallback glyph — the map has no entry to draw from.
    expect(iconGlyph()).toContain('lucide-zap')

    fireEvent.click(tile())
    await act(async () => {})
    expect(callService).not.toHaveBeenCalled()
  })

  it('gates nothing even with confirm on, because it dispatches nothing', async () => {
    // The gate has no action of ours to name here, and an inert card has none to
    // hold — so the tap resolves to the detail dialog and no dialog is raised.
    seed(foreign)
    renderCard(<ActionCard entityId="light.kitchen" config={{ confirm: true }} />)

    fireEvent.click(tile())
    await act(async () => {})

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(callService).not.toHaveBeenCalled()
  })
})

describe('lifecycle states', () => {
  it('renders a skeleton while the entity is still loading', () => {
    entityStore.setState((state) => ({
      ...state,
      isConnected: true,
      isInitialLoading: true,
      entities: {},
    }))
    renderCard(<ActionCard entityId="scene.movie_night" />)

    // The skeleton is a `liebe-card` too — a placeholder for this tile, not an
    // absence of one — so what distinguishes it is that no anatomy is in it yet.
    expect(document.querySelector('.liebe-icon')).toBeNull()
    expect(nameLine()).toBeNull()
    expect(document.querySelector('.rt-Skeleton')).toBeInTheDocument()
  })

  it('reports disconnection rather than a missing entity', () => {
    entityStore.setState((state) => ({
      ...state,
      isConnected: false,
      isInitialLoading: false,
      entities: {},
    }))
    renderCard(<ActionCard entityId="scene.movie_night" />)

    expect(screen.getByText('Disconnected')).toBeInTheDocument()
    expect(
      screen.getByLabelText('Disconnected: Disconnected from Home Assistant')
    ).toBeInTheDocument()
  })

  it('offers a reload as the way out of a disconnection', async () => {
    const reload = vi.fn()
    // jsdom's own `location.reload` throws "not implemented", so the retry can
    // only be exercised against a replaced one.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    })

    entityStore.setState((state) => ({
      ...state,
      isConnected: false,
      isInitialLoading: false,
      entities: {},
    }))
    renderCard(<ActionCard entityId="scene.movie_night" />)

    // The card-variant error tile opens a detail modal; Retry lives inside it.
    fireEvent.click(screen.getByLabelText('Disconnected: Disconnected from Home Assistant'))
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('falls back to the entity id when there is no friendly name', () => {
    seed(createSceneEntity({ attributes: { friendly_name: undefined } }))
    renderCard(<ActionCard entityId="scene.movie_night" />)

    expect(nameLine()).toBe('scene.movie_night')
  })

  it('suppresses the action in edit mode, where a press selects instead', async () => {
    seed(createSceneEntity())
    dashboardActions.setMode('edit')
    const onSelect = vi.fn()
    renderCard(<ActionCard entityId="scene.movie_night" onSelect={onSelect} />)

    fireEvent.click(tile())

    await act(async () => {})
    expect(callService).not.toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledWith(true)
  })
})
