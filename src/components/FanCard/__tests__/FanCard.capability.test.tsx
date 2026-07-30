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
