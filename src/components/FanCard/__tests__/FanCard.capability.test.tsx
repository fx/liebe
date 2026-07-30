import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import { resetDispatchGuard } from '~/services/guardedDispatch'
import { CardItemProvider } from '../../cardItemContext'
import { FanCard } from '..'
import type { CardTier } from '~/utils/cardTier'
import type { HassEntity } from '~/store/entityTypes'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * The fan card's primary action against the feature mask, driven through the
 * real shell and the real dispatch path
 * (docs/specs/entity-cards/options/fan.md — "Primary action").
 *
 * The gate is asserted against the **mask**, never against a mocked rejection.
 * A test that let the card dispatch and then asserted on Home Assistant's
 * `ServiceNotSupported` would pass on a card that still dispatches, which is the
 * whole of what this change fixes: the requirement is that nothing leaves the
 * card at all (docs/changes/0037-card-state-and-capability-correctness.md —
 * "Testing Requirements").
 *
 * It runs through the real shell because resolution is not the card's to
 * perform. `tapAction` is read, resolved against the card's declared default and
 * dispatched by `useCardActions`; a mocked `dispatchGuarded` would show that
 * this component did not call something, and say nothing about what the shell
 * does with a stored `toggle` or with a confirmation gate in front of it.
 */

const ENTITY_ID = 'fan.bedroom'

/** SET_SPEED | OSCILLATE | DIRECTION | PRESET_MODE — every bit except switching. */
const NO_SWITCHING = 15
/** The above plus TURN_OFF | TURN_ON, which is what an ordinary fan publishes. */
const SWITCHING = 63

const TIERS: readonly CardTier[] = ['glance', 'row', 'tall', 'full']

let hass: HomeAssistant

function makeFan(state: string, supported_features: number): HassEntity {
  return {
    entity_id: ENTITY_ID,
    state,
    attributes: {
      friendly_name: 'Bedroom Fan',
      percentage: state === 'on' ? 50 : 0,
      percentage_step: 25,
      preset_modes: ['auto', 'sleep'],
      oscillating: false,
      direction: 'forward',
      supported_features,
    } as HassEntity['attributes'],
    last_changed: '2026-07-30T10:00:00Z',
    last_updated: '2026-07-30T10:00:00Z',
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

/** The tile itself, which is the tap target at every tier. */
function tapTile() {
  fireEvent.click(document.querySelector('.liebe-card')!)
}

/**
 * Nothing left the card. Waited out rather than asserted immediately: a dispatch
 * one tick later would otherwise pass.
 */
async function expectNoServiceCall() {
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(hass.callService).not.toHaveBeenCalled()
}

beforeEach(() => {
  hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
  dashboardActions.resetState()
  // The pending set is process-wide, so a command another case issued would be
  // refused here — and a refusal reports success, so it fails as zero calls with
  // no error at all.
  resetDispatchGuard()
})

afterEach(() => {
  dashboardActions.resetState()
  resetDispatchGuard()
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

describe('a fan advertising neither TURN_ON nor TURN_OFF', () => {
  it.each(TIERS)('opens the detail dialog instead of switching it, at %s', async (tier) => {
    seed(makeFan('on', NO_SWITCHING))
    renderCard(<FanCard entityId={ENTITY_ID} tier={tier} />)

    tapTile()

    /*
     * Both halves, and the second is the one the change document argues for:
     * suppressing the tap would leave the tile inert at `glance`, where it is
     * the only affordance the card has. The dialog keeps the tile operable while
     * the fan stays unswitched.
     */
    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible())
    await expectNoServiceCall()
  })

  it.each(TIERS)('sends a stored tapAction: toggle to the dialog too, at %s', async (tier) => {
    /*
     * The configured route, which is the one a card default cannot cover: a
     * stored `toggle` never consults what `default` resolves to, so a gate
     * living only in the resolution would dispatch here.
     */
    seed(makeFan('off', NO_SWITCHING))
    renderCard(<FanCard entityId={ENTITY_ID} tier={tier} />, { tapAction: 'toggle' })

    tapTile()

    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible())
    await expectNoServiceCall()
  })

  it('does not ask whether to switch it when a stored toggle is what routed there', async () => {
    /*
     * The same question as the case below, on the route that reaches the gate
     * differently. A stored `toggle` resolves to `toggle` without consulting the
     * card's default, so the shell's generic classifier sees a switching route
     * and — before this card suppressed it — offered "Turn on Bedroom Fan?" with
     * a button that turns nothing on. The card's default resolution cannot cover
     * this one; the gate has to be answered as well.
     */
    seed(makeFan('off', NO_SWITCHING))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />, { tapAction: 'toggle', confirm: true })

    tapTile()

    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible())
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await expectNoServiceCall()
  })

  it('still asks before switching a fan that can be switched', async () => {
    // The other half of the same rule: suppressing the prompt is scoped to the
    // fan that cannot be switched, and must not disarm `confirm` generally.
    seed(makeFan('off', SWITCHING))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />, { tapAction: 'toggle', confirm: true })

    tapTile()

    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeVisible())
    await expectNoServiceCall()
  })

  it('does not ask whether to switch it on the way to the dialog', async () => {
    /*
     * What the *resolution* has to get right, over and above the dispatch. The
     * confirmation gate classifies a route after resolution, so a card still
     * declaring `toggle` as its default would put "Turn on Bedroom Fan?" in
     * front of a dialog that turns nothing on — a prompt about an action the
     * entity cannot perform. `confirm` is one shared fragment merged into the
     * item schema for every family (`src/store/confirmOption.ts`), so this is a
     * configuration a fan card really can hold.
     */
    seed(makeFan('off', NO_SWITCHING))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />, { confirm: true })

    tapTile()

    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible())
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await expectNoServiceCall()
  })

  it('still reaches its speed control, which the mask does advertise', () => {
    // The gate is about switching alone. A fan that cannot be turned on is
    // routinely one whose speed *is* settable — `fan.set_percentage` implies
    // turn-on in Home Assistant, so the slider is how such a fan is started.
    seed(makeFan('on', NO_SWITCHING))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />)

    expect(screen.getByLabelText('Fan speed')).toBeInTheDocument()
  })
})

describe('a fan that advertises switching', () => {
  it.each(TIERS)('stops a running fan on a tap, at %s', async (tier) => {
    seed(makeFan('on', SWITCHING))
    renderCard(<FanCard entityId={ENTITY_ID} tier={tier} />)

    tapTile()

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
    expect(hass.callService).toHaveBeenCalledWith('fan', 'turn_off', { entity_id: ENTITY_ID })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each(TIERS)('starts a stopped fan on a tap, at %s', async (tier) => {
    seed(makeFan('off', SWITCHING))
    renderCard(<FanCard entityId={ENTITY_ID} tier={tier} />)

    tapTile()

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
    expect(hass.callService).toHaveBeenCalledWith('fan', 'turn_on', {
      entity_id: ENTITY_ID,
      percentage: 50,
    })
  })

  it('is switchable on TURN_ON alone', async () => {
    /*
     * Either bit is enough, because `fan.toggle` is registered with
     * `[TURN_OFF, TURN_ON]` and Home Assistant treats `required_features` as
     * "satisfies at least one feature set". Started rather than stopped here:
     * `fan.turn_on` is the service `TURN_ON` names.
     */
    seed(makeFan('off', 1 | 32))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />)

    tapTile()

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('fan', 'turn_on', {
        entity_id: ENTITY_ID,
        percentage: 50,
      })
    )
  })

  it('is switchable on TURN_OFF alone', async () => {
    seed(makeFan('on', 1 | 16))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />)

    tapTile()

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('fan', 'turn_off', { entity_id: ENTITY_ID })
    )
  })

  it('starts a switchable fan with no speed control without dictating a percentage', async () => {
    // TURN_OFF | TURN_ON only: a percentage would be a payload this fan cannot
    // honour.
    seed(makeFan('off', 48))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />)

    tapTile()

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('fan', 'turn_on', { entity_id: ENTITY_ID })
    )
  })
})

/**
 * The two states that carry no direction (change 0037 PR 7; option doc —
 * "Primary action": `unavailable`/`unknown` are resolved FIRST as inert, before
 * the direction is chosen).
 *
 * `unavailable` was already handled; `unknown` fell through and rendered an
 * ordinary operable card, where `isOn` is false and so a tap dispatched
 * `fan.turn_on` at a fan whose state nobody knows. Both states are asserted
 * together at every tier, because the defect was precisely that they were told
 * apart when the spec says they are not.
 *
 * Nothing here asserts on a rejection, for the same reason the mask cases above
 * do not: Home Assistant may well accept `turn_on` on an `unknown` fan, so a
 * test built on a refusal would pass against a card that dispatches. The
 * requirement is that nothing leaves the card.
 */
describe('a fan whose state carries no direction', () => {
  const INOPERABLE = ['unavailable', 'unknown'] as const

  const cases = TIERS.flatMap((tier) => INOPERABLE.map((state) => ({ tier, state })))

  it.each(cases)('is inert on tap at $tier when $state', async ({ tier, state }) => {
    // SWITCHING deliberately: the fan advertises every bit it needs to be
    // turned on, so the only thing stopping the dispatch is its state.
    seed(makeFan(state, SWITCHING))
    renderCard(<FanCard entityId={ENTITY_ID} tier={tier} />)

    tapTile()

    // Both halves. Inert about the device, operable as a tile: suppressing the
    // tap outright would leave a `glance` fan with no affordance at all, which
    // is the operability regression the design system forbids — so the gesture
    // goes to the detail dialog, exactly as it does for a fan that cannot be
    // switched.
    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible())
    await expectNoServiceCall()
  })

  it.each(cases)(
    'refuses a stored tapAction: toggle at $tier when $state',
    async ({ tier, state }) => {
      /*
       * The route a card-level early return cannot cover on its own: a stored
       * `toggle` never consults what `default` resolves to. The shell refuses it
       * because the tile declares itself unavailable, which is the second of the
       * two layers this state is enforced at.
       *
       * **No dialog is asserted here, and that is a gap rather than an
       * oversight.** `useCardActions.performDispatch` returns early for a
       * `toggle` route while `unavailable`, BEFORE it would consult the card's
       * `onToggle` — so the card cannot answer `'more-info'` the way it does for
       * the capability gate, and this tap does nothing at all. At `glance`,
       * where the tap is the only affordance, that is the operability
       * regression the design system forbids. Measured, not assumed: asserting
       * the dialog here fails with `Unable to find role="dialog"`.
       *
       * It is pre-existing, it belongs to every domain's unavailable tile
       * rather than to fans, and the fix is one line in a shared hook — so it
       * is reported rather than widened into this PR. What is asserted is the
       * half this change owns and the spec requires: nothing is dispatched.
       */
      seed(makeFan(state, SWITCHING))
      renderCard(<FanCard entityId={ENTITY_ID} tier={tier} />, { tapAction: 'toggle' })

      tapTile()

      await expectNoServiceCall()
    }
  )

  it.each(INOPERABLE)('reports %s as itself rather than as the other one', (state) => {
    // One state rendered as a different one is the misreport this change fixed
    // on the weather cards; an `unknown` fan labelled UNAVAILABLE would be the
    // same defect in a third place.
    seed(makeFan(state, SWITCHING))
    renderCard(<FanCard entityId={ENTITY_ID} tier="full" />)

    expect(screen.getByText(state.toUpperCase())).toBeInTheDocument()
    const other = state === 'unknown' ? 'UNAVAILABLE' : 'UNKNOWN'
    expect(screen.queryByText(other)).not.toBeInTheDocument()
  })

  it.each(INOPERABLE)('renders no speed control while %s', (state) => {
    // "Every control absent" — a slider or a pill row built from the attributes
    // of an entity in this state would command a speed against a reading nobody
    // has.
    seed(makeFan(state, SWITCHING))
    renderCard(<FanCard entityId={ENTITY_ID} tier="full" />, { speedControl: 'steps' })

    expect(screen.queryByRole('group', { name: 'Fan speed' })).not.toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })

  it('does not prompt before an action it will not take', async () => {
    // The confirmation gate classifies a route after resolution, so a card that
    // reached it would offer "Turn on Bedroom Fan?" in front of a dialog that
    // turns nothing on — the same false prompt the capability gate had to
    // answer, arriving by the state rather than by the mask.
    seed(makeFan('unknown', SWITCHING))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />, { confirm: true })

    tapTile()

    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible())
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await expectNoServiceCall()
  })

  it('still switches the same fan once its state means something', async () => {
    /*
     * The positive control, and it is what stops every assertion above being
     * vacuous: identical entity, identical mask, one field different. Without
     * it a card that had simply stopped dispatching — or stopped rendering —
     * would satisfy the whole block.
     */
    seed(makeFan('off', SWITCHING))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" />)

    tapTile()

    // Deliberately not pinning the payload. The 50% start is an OPEN QUESTION in
    // the option doc and expressly out of this change's scope, so a control
    // whose job is to prove that a dispatch happens must not quietly become a
    // second pin on a behaviour nobody has settled. The cases above own it.
    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith(
        'fan',
        'turn_on',
        expect.objectContaining({ entity_id: ENTITY_ID })
      )
    )
  })

  it.each(INOPERABLE)('still shows edit-mode selection while %s', (state) => {
    /*
     * Inert is about the device, not about the card. Selection is edit-mode
     * chrome — the user is arranging tiles, and one that toggles selection
     * without showing it is a tile they cannot see they have picked
     * (docs/specs/grid-layout — "Card Chrome"). The branch omitted `isSelected`
     * before this change, so `unavailable` had the same hole; routing `unknown`
     * through it is what turned a noticed defect into one worth fixing.
     */
    dashboardActions.setMode('edit')
    seed(makeFan(state, SWITCHING))
    renderCard(<FanCard entityId={ENTITY_ID} tier="row" isSelected onSelect={() => {}} />)

    expect(document.querySelector('.liebe-card')).toHaveAttribute('data-selected', 'true')
  })

  it.each(INOPERABLE)(
    'is inert while %s even on a fan that advertises no switching bit either',
    async (state) => {
      /*
       * Where the state gate and the capability gate meet. Both would intercept
       * this tap, and the card must reach one answer rather than two: the state
       * is resolved first — above the card's `defaultAction` — and the shell
       * then refuses the toggle route independently, so the mask never gets a
       * say. Both roads lead to the detail dialog, which is why the two cannot
       * contradict each other.
       */
      seed(makeFan(state, NO_SWITCHING))
      renderCard(<FanCard entityId={ENTITY_ID} tier="glance" />)

      tapTile()

      await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible())
      await expectNoServiceCall()
    }
  )
})
