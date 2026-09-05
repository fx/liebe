import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { Theme } from '@radix-ui/themes'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions, dashboardStore } from '~/store'
import { resetDispatchGuard } from '~/services/guardedDispatch'
import { exportConfigurationAsYAML } from '~/store/persistence'
import { CardItemProvider } from '../../cardItemContext'
import { LockCard } from '..'
import type { HassEntity } from '~/store/entityTypes'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * The lock card driven through the real shell, the real stores and the real
 * dispatch path — no mocked hooks.
 *
 * Two things can only be tested here. The **edit-mode reset** needs a genuine
 * store subscription: the card is `memo`'d, so a mocked `useDashboardStore`
 * returning a new value plus a re-render with identical props is short-circuited
 * and the re-render never happens. And the **service call itself** only reaches
 * `hass.callService` through the guarded, non-retrying path this family is
 * required to use — a mocked `dispatchGuarded` proves the card called something,
 * not that a lock command left the building exactly once.
 */

const ENTITY_ID = 'lock.front_door'

let hass: HomeAssistant

function makeLock(state: string): HassEntity {
  return {
    entity_id: ENTITY_ID,
    state,
    attributes: { friendly_name: 'Front Door' } as HassEntity['attributes'],
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

const pill = (name: 'Lock' | 'Unlock') => screen.getByRole('button', { name })

beforeEach(() => {
  hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
  dashboardActions.resetState()
  /*
   * The pending set is process-wide, so a command another case issued would
   * otherwise be refused here — and a refusal reports success, so it fails as
   * zero calls with no error at all.
   */
  resetDispatchGuard()
})

afterEach(() => {
  dashboardActions.resetState()
  resetDispatchGuard()
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

describe('the lock command on the real dispatch path', () => {
  it('sends lock.unlock exactly once, after the confirmation', async () => {
    seed(makeLock('locked'))
    renderCard(<LockCard entityId={ENTITY_ID} tier="row" />)

    fireEvent.click(pill('Unlock'))
    expect(hass.callService).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
    expect(hass.callService).toHaveBeenCalledWith('lock', 'unlock', { entity_id: ENTITY_ID })
  })

  it('sends nothing at all when the confirmation is cancelled', async () => {
    seed(makeLock('locked'))
    renderCard(<LockCard entityId={ENTITY_ID} tier="row" />)

    fireEvent.click(pill('Unlock'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    // Waited out rather than asserted immediately: a dispatch that happened one
    // tick later would otherwise pass this test.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('sends lock.lock in one call, with no confirmation at the default', async () => {
    seed(makeLock('unlocked'))
    renderCard(<LockCard entityId={ENTITY_ID} tier="row" />)

    fireEvent.click(pill('Lock'))

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
    expect(hass.callService).toHaveBeenCalledWith('lock', 'lock', { entity_id: ENTITY_ID })
  })

  it('refuses a second identical command while the first is still pending', async () => {
    // The double-fire guard, which for this family is the difference between a
    // door unlocked once and a command sent twice.
    seed(makeLock('unlocked'))
    renderCard(<LockCard entityId={ENTITY_ID} tier="row" />)

    fireEvent.click(pill('Lock'))
    fireEvent.click(pill('Lock'))

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
  })
})

describe('the pending confirmation across edit mode', () => {
  it('is dropped when the dashboard switches to edit mode, and does not come back', async () => {
    seed(makeLock('locked'))
    renderCard(<LockCard entityId={ENTITY_ID} tier="row" />)

    fireEvent.click(pill('Unlock'))
    expect(screen.getByText('Unlock Front Door?')).toBeInTheDocument()

    act(() => dashboardActions.setMode('edit'))

    expect(screen.queryByText('Unlock Front Door?')).not.toBeInTheDocument()

    act(() => dashboardActions.setMode('view'))

    /*
     * Dropped rather than hidden. Had the dialog merely been rendered behind an
     * `!isEditMode &&` guard, leaving edit mode would resurrect it — asking
     * "Unlock Front Door?" detached from the gesture that raised it, where the
     * answer that looks safe is to accept.
     */
    expect(screen.queryByText('Unlock Front Door?')).not.toBeInTheDocument()

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(hass.callService).not.toHaveBeenCalled()
  })
})

describe('the confirmation prompt names the direction', () => {
  it('asks the lock question, not the unlock one, when confirmLock is on', async () => {
    seed(makeLock('unlocked'))
    renderCard(<LockCard entityId={ENTITY_ID} tier="row" />, {
      confirmLock: true,
      tapAction: 'toggle',
    })

    fireEvent.click(screen.getByText('Front Door'))

    // The gesture resolves to `lock` from `unlocked`, so the dialog has to say
    // Lock — the direction branch the pills alone never exercise on this path.
    await waitFor(() => expect(screen.getByText('Lock Front Door?')).toBeInTheDocument())
    expect(screen.queryByText('Unlock Front Door?')).not.toBeInTheDocument()
  })
})

describe('a configured toggle against a jammed lock', () => {
  it('opens the detail dialog rather than guessing a direction (#260)', async () => {
    seed(makeLock('jammed'))
    renderCard(<LockCard entityId={ENTITY_ID} tier="row" />, { tapAction: 'toggle' })

    fireEvent.click(screen.getByText('Front Door'))

    // The dialog, not a command: a jammed mechanism has no knowable direction,
    // but the user still needs somewhere to go.
    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible())
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('does not confirm on the way there, even with both gates on', async () => {
    /*
     * The same design property the alarm card pins, stated here too because
     * this is where it is easiest to get wrong: `jammed` is a state the gate
     * treats carefully everywhere else, so the temptation to confirm this route
     * as well is real. It actuates nothing, so it classifies `neutral` — and a
     * dialog in front of "open the details" is the prompt fatigue the gate
     * exists to prevent.
     */
    seed(makeLock('jammed'))
    renderCard(<LockCard entityId={ENTITY_ID} tier="row" />, {
      tapAction: 'toggle',
      confirmUnlock: true,
      confirmLock: true,
    })

    fireEvent.click(screen.getByText('Front Door'))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible())
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Unlock Front Door?')).not.toBeInTheDocument()
    expect(hass.callService).not.toHaveBeenCalled()
  })
})

describe('the detail dialog as the glance control surface', () => {
  it('locks through the dialog without a confirmation, at the default', async () => {
    seed(makeLock('unlocked'))
    renderCard(<LockCard entityId={ENTITY_ID} tier="glance" />)

    fireEvent.click(screen.getByText('Front Door'))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Lock' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Lock' }))

    // `confirmLock` is off by default, so this is the ungated path through the
    // dialog's controls.
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
    expect(hass.callService).toHaveBeenCalledWith('lock', 'lock', { entity_id: ENTITY_ID })
    expect(screen.queryByText('Lock Front Door?')).not.toBeInTheDocument()
  })

  it('reaches lock and unlock through the dialog a 1x1 card opens', async () => {
    // A `glance` lock renders no pills and its tap resolves to more-info, so the
    // dialog's registered controls are the whole control surface. Without them a
    // 1×1 lock would be inoperable.
    seed(makeLock('locked'))
    renderCard(<LockCard entityId={ENTITY_ID} tier="glance" />)

    expect(screen.queryByRole('button', { name: 'Unlock' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Front Door'))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Unlock' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Lock' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))

    // The dialog's controls carry the same gate the card's pills do, applied at
    // the option's default.
    await waitFor(() => expect(screen.getByText('Unlock Front Door?')).toBeInTheDocument())
    expect(hass.callService).not.toHaveBeenCalled()

    fireEvent.click(screen.getAllByRole('button', { name: 'Unlock' }).at(-1)!)

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
    expect(hass.callService).toHaveBeenCalledWith('lock', 'unlock', { entity_id: ENTITY_ID })
  })
})

describe('a lock code on the real dispatch path', () => {
  const CODE = '4821'

  const codedLock = (state: string): HassEntity => ({
    ...makeLock(state),
    attributes: { friendly_name: 'Front Door', code_format: 'number' } as HassEntity['attributes'],
  })

  const enter = (code: string) => {
    for (const digit of code) {
      fireEvent.click(screen.getByRole('button', { name: digit }))
    }
  }

  /** Put the lock on a real screen, so the exported document has one in it. */
  const placeLock = () => {
    act(() => {
      dashboardActions.addScreen({
        id: 'screen-1',
        name: 'Hall',
        slug: 'hall',
        type: 'grid',
        grid: { resolution: { columns: 12, rows: 8 }, items: [] },
      })
      dashboardActions.addGridItem('screen-1', {
        id: 'item-1',
        type: 'entity',
        entityId: ENTITY_ID,
        x: 0,
        y: 0,
        width: 2,
        height: 1,
      })
    })
  }

  it('forwards the code with lock.unlock, in one call, with no confirmation stacked on it', async () => {
    seed(codedLock('locked'))
    renderCard(<LockCard entityId={ENTITY_ID} tier="row" />)

    fireEvent.click(pill('Unlock'))

    // The keypad IS the gate here: `confirmUnlock` is on by default, and
    // stacking its dialog on top would be two prompts for one intent.
    await waitFor(() => expect(screen.getByTestId('code-keypad')).toBeInTheDocument())
    expect(screen.queryByText('Unlock Front Door?')).not.toBeInTheDocument()
    expect(hass.callService).not.toHaveBeenCalled()

    enter(CODE)
    fireEvent.click(screen.getAllByRole('button', { name: 'Unlock' }).at(-1)!)

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
    expect(hass.callService).toHaveBeenCalledWith('lock', 'unlock', {
      entity_id: ENTITY_ID,
      code: CODE,
    })
  })

  it('does not retry a coded unlock the lock rejected', async () => {
    /*
     * REVIEW.md — "Service-Call Safety": a consequential command takes the
     * non-retrying path, and the proof is a boundary-level test that one
     * gesture yields one call under a transient failure. A retried
     * `lock.unlock` is a door unlocked twice; a retried *coded* one also
     * resubmits the credential, which on a lock that counts failed attempts is
     * how a correct code locks the user out.
     */
    seed(codedLock('locked'))
    ;(hass.callService as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Invalid code'))
    renderCard(<LockCard entityId={ENTITY_ID} tier="row" />)

    fireEvent.click(pill('Unlock'))
    await waitFor(() => expect(screen.getByTestId('code-keypad')).toBeInTheDocument())
    enter(CODE)
    fireEvent.click(screen.getAllByRole('button', { name: 'Unlock' }).at(-1)!)

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))

    /*
     * Waited out rather than asserted immediately, and that is the whole test:
     * `waitFor` above is satisfied by the FIRST call, so a retrying path would
     * pass it and fire again afterwards. The retrying wrapper's first delay is
     * 1000 ms, so this window covers it.
     */
    await new Promise((resolve) => setTimeout(resolve, 1200))
    expect(hass.callService).toHaveBeenCalledTimes(1)
  })

  it('never writes the code into the dashboard configuration or its YAML export', async () => {
    /*
     * The security property, asserted where it can actually be observed: this
     * suite runs the real dashboard store and the real serialiser, so a code
     * that had leaked into `item.config` would appear in both readings below.
     *
     * A code is a credential. It travels with the service call and nowhere
     * else — never validated by the card, never persisted, and never in a YAML
     * a user shares (docs/specs/entity-cards/options/security.md — "Code
     * handling").
     */
    seed(codedLock('locked'))
    /*
     * The lock is PLACED, not merely rendered. Without a real grid item the
     * export is an empty document and "the code is not in it" would be true of
     * a card that had leaked it — the assertion has to run against a document
     * that carries this card's own configuration, which is what the two
     * positive checks below establish before the negative ones are believed.
     */
    placeLock()
    renderCard(<LockCard entityId={ENTITY_ID} tier="row" />)

    fireEvent.click(pill('Unlock'))
    await waitFor(() => expect(screen.getByTestId('code-keypad')).toBeInTheDocument())
    enter(CODE)
    fireEvent.click(screen.getAllByRole('button', { name: 'Unlock' }).at(-1)!)

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))

    const yaml = exportConfigurationAsYAML()
    expect(yaml).toContain(ENTITY_ID)
    expect(JSON.stringify(dashboardStore.state)).toContain(ENTITY_ID)

    expect(JSON.stringify(dashboardStore.state)).not.toContain(CODE)
    expect(yaml).not.toContain(CODE)
    // Not merely absent as a value — the KEY must not be there either, since a
    // `code: ''` written on cancel would be just as much a leak of shape.
    expect(yaml).not.toContain('code')
  })

  it('sends no code field at all for a lock that publishes none', async () => {
    // The regression half. Every other case in this file is already this lock,
    // and this one states the payload shape outright.
    seed(makeLock('unlocked'))
    renderCard(<LockCard entityId={ENTITY_ID} tier="row" />)

    fireEvent.click(pill('Lock'))

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
    expect(hass.callService).toHaveBeenCalledWith('lock', 'lock', { entity_id: ENTITY_ID })
  })
})

describe('the tile offers exactly one Tab stop (Codex pass 2)', () => {
  it('suppresses the tile-action stop beside the component-wrapped pill buttons', async () => {
    // The lock's pills render through function components (`PillGroup`), so
    // a JSX-props traversal stops at the component boundary and never sees
    // the tabbable buttons inside. The shell reads the rendered DOM instead:
    // with pill buttons on the tile, the tile-action control steps out of
    // the Tab order and the tile keeps exactly one Tab stop per control.
    seed(makeLock('locked'))
    const { container } = renderCard(<LockCard entityId={ENTITY_ID} tier="row" />)

    await waitFor(() => expect(pill('Unlock')).toBeInTheDocument())

    const tile = container.querySelector('.liebe-card') as HTMLElement
    // Tabbability, not presence: a `disabled` pill is no Tab stop, so it is
    // excluded up front rather than counted and excused.
    const tabbables = Array.from(
      tile.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => {
      if (!(el instanceof HTMLElement)) return false
      if (el.classList.contains('liebe-tile-action')) return el.tabIndex !== -1
      return true
    })

    // Pill buttons present and tabbable, tile-action suppressed: one Tab stop
    // per control — the locked tile's Lock pill is disabled (nothing to lock),
    // so only Unlock remains beside the suppressed tile action.
    expect(pill('Unlock')).toBeInTheDocument()
    expect((pill('Lock') as HTMLButtonElement).disabled).toBe(true)
    const tileAction = tile.querySelector('.liebe-tile-action')
    expect(tileAction).not.toBeNull()
    expect((tileAction as HTMLElement).tabIndex).toBe(-1)
    expect(tabbables).toHaveLength(1)
  })

  it('keeps the tile-action stop when the pill buttons are all disabled', async () => {
    // Presence is not tabbability: a `disabled` pill is no Tab stop, so
    // suppressing the tile action beside one would leave the tile with no
    // keyboard surface at all. Driven through the DOM: disable the rendered
    // pills, re-fire the refresh through focus, and the tile action returns
    // to the Tab order.
    seed(makeLock('locked'))
    const { container } = renderCard(<LockCard entityId={ENTITY_ID} tier="row" />)

    await waitFor(() => expect(pill('Unlock')).toBeInTheDocument())

    const tile = container.querySelector('.liebe-card') as HTMLElement
    for (const one of Array.from(tile.querySelectorAll('button.liebe-pill'))) {
      ;(one as HTMLButtonElement).disabled = true
    }
    const tileAction = tile.querySelector('.liebe-tile-action') as HTMLElement
    // The observer watches `disabled` and re-decides asynchronously; the
    // focus re-check is belt-and-braces for runtimes where it has not run.
    await waitFor(() => expect(tileAction.tabIndex).toBe(0))
  })
})
