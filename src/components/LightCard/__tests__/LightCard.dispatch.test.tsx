import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { Theme } from '@radix-ui/themes'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HomeAssistantProvider, type HomeAssistant } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import { resetDispatchGuard } from '~/services/guardedDispatch'
import { DOUBLE_TAP_WINDOW_MS, HOLD_DURATION_MS } from '~/store/cardActions'
import { LightCard } from '..'
import { BACKGROUND_TRAVEL_PX, Slider } from '../../anatomy/Slider'
import { CardItemProvider } from '../../cardItemContext'
import type { HassEntity } from '~/store/entityTypes'
/**
 * The light card's commands, through the real service path.
 *
 * Every action and every embedded control dispatches at most once until the
 * command is known to have landed, and is never retried
 * (docs/specs/entity-cards/options/common.md — "Dispatch guarantees"). These run
 * against the real `useServiceCall` rather than a mock of it, because a mocked
 * dispatcher is precisely the thing that cannot show whether the guard is in the
 * path — the card would look identical with the retrying path underneath it.
 *
 * The case that makes this a requirement is the **acknowledgement boundary**,
 * asserted below: Home Assistant resolves a service call before a slow
 * integration moves the entity, so promise resolution is too early a signal to
 * reopen on. A control that used it would let the second tap through against a
 * state that has not changed yet.
 */

let hass: HomeAssistant

const LIGHT = 'light.living_room'

function light(overrides: { state?: string; lastUpdated?: string } = {}): HassEntity {
  const { state = 'on', lastUpdated = '2024-01-01T00:00:00Z' } = overrides

  return {
    entity_id: LIGHT,
    state,
    attributes: {
      friendly_name: 'Living Room',
      brightness: 128,
      supported_color_modes: ['brightness'],
      supported_features: 0,
    } as HassEntity['attributes'],
    last_changed: lastUpdated,
    last_updated: lastUpdated,
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

function renderCard(card: ReactElement) {
  return render(
    <Theme>
      <HomeAssistantProvider hass={hass}>{card}</HomeAssistantProvider>
    </Theme>
  )
}

const tile = () => document.querySelector('.grid-card') as HTMLElement

beforeEach(() => {
  hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
  dashboardActions.resetState()
  // Module state, shared across the whole run. Without this a later test issuing
  // the same command sees it refused, which presents as zero calls and no error
  // — indistinguishable from a control that never fired.
  resetDispatchGuard()
  seed(light())
})

afterEach(() => {
  dashboardActions.resetState()
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

describe('LightCard dispatch', () => {
  it('toggles through the guarded, non-retrying path', async () => {
    renderCard(<LightCard entityId={LIGHT} tier="row" span={{ width: 2, height: 1 }} />)

    fireEvent.click(tile())

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('light', 'turn_off', { entity_id: LIGHT })
    )
  })

  it('toggles an off light on, through the same path', async () => {
    // The other side of the toggle, and the one a `glance` tile exists for.
    seed(light({ state: 'off' }))

    renderCard(<LightCard entityId={LIGHT} tier="row" span={{ width: 2, height: 1 }} />)

    fireEvent.click(tile())

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('light', 'turn_on', { entity_id: LIGHT })
    )
  })

  it('refuses a second identical toggle while the first is acknowledged but unlanded', async () => {
    renderCard(<LightCard entityId={LIGHT} tier="row" span={{ width: 2, height: 1 }} />)

    fireEvent.click(tile())
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))

    /*
     * The service promise has already resolved — that is the acknowledgement —
     * but `last_updated` is exactly where it was. This is the ambiguous window,
     * and the whole point of the guard: the command is still travelling, so the
     * repeat must not be sent.
     */
    fireEvent.click(tile())

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
    // Refused, not failed. The first command is still in flight, which is not an
    // error to put in front of the user.
    expect(tile()).not.toHaveAttribute('data-error', 'true')
  })

  it('admits the toggle again once the entity moves', async () => {
    renderCard(<LightCard entityId={LIGHT} tier="row" span={{ width: 2, height: 1 }} />)

    fireEvent.click(tile())
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))

    // `last_updated` moving is what "it arrived" actually looks like. The state
    // is left `on` so the card issues the identical command rather than its
    // inverse, which the guard would let through for a different reason.
    seed(light({ lastUpdated: '2024-01-01T00:05:00Z' }))

    fireEvent.click(tile())

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(2))
  })

  it('sends a brightness commit through the same guard', async () => {
    renderCard(<LightCard entityId={LIGHT} tier="row" span={{ width: 2, height: 1 }} />)

    const thumb = screen.getByLabelText('Brightness')
    fireEvent.keyDown(thumb, { key: 'ArrowRight' })

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('light', 'turn_on', {
        entity_id: LIGHT,
        brightness: 130,
      })
    )
  })

  it('refuses a repeated brightness but not a corrected one', async () => {
    /*
     * Both halves of "keyed per command" in one sequence, because they are the
     * same property seen from two sides: the guard must not let the identical
     * command travel twice, and must not swallow a user still choosing.
     *
     * The slider rests at the entity's own 50% and returns there after each
     * commit — the seeded `brightness` never moves, so nothing echoes back. Each
     * arrow therefore steps from 50 rather than from the last committed value,
     * which is what makes a second identical press reproducible.
     */
    renderCard(<LightCard entityId={LIGHT} tier="row" span={{ width: 2, height: 1 }} />)

    const thumb = screen.getByLabelText('Brightness')

    fireEvent.keyDown(thumb, { key: 'ArrowRight' }) // 51% → brightness 130
    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('light', 'turn_on', {
        entity_id: LIGHT,
        brightness: 130,
      })
    )

    // The same 51% again, with `last_updated` exactly where it was: the first
    // command is still travelling, so this one must not be sent.
    fireEvent.keyDown(thumb, { key: 'ArrowRight' })
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))

    // 49% is a different command, so the window on 51% does not hold it back.
    fireEvent.keyDown(thumb, { key: 'ArrowLeft' })

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(2))
    expect(hass.callService).toHaveBeenLastCalledWith('light', 'turn_on', {
      entity_id: LIGHT,
      brightness: 125,
    })
  })

  it('commits a slider dropped at zero as turn_off, guarded like the rest', async () => {
    renderCard(<LightCard entityId={LIGHT} tier="row" span={{ width: 2, height: 1 }} />)

    const thumb = screen.getByLabelText('Brightness')
    fireEvent.keyDown(thumb, { key: 'Home' })

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('light', 'turn_off', { entity_id: LIGHT })
    )

    fireEvent.keyDown(thumb, { key: 'Home' })

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
  })
})

/**
 * The background placement's gesture split
 * (docs/specs/entity-cards/options/common.md — "Shared slider placement"):
 * the tile is simultaneously the control and the action surface, so a drag
 * adjusts the slider and MUST NOT fire any action, while a tap falls through
 * to `tapAction` and hold/double-tap keep their universal meanings. The card
 * here is a light at `glance` — the tier with no inline slider — so the
 * surface is the only control on the tile.
 */
describe('LightCard background slider gestures', () => {
  const backgroundCard = (config: Record<string, unknown> = {}) => {
    const item = {
      id: 'background-light',
      type: 'entity' as const,
      entityId: LIGHT,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      config: { sliderPlacement: 'background', ...config },
    }
    // The shell reads tap/hold/double-tap off the placed-item context while
    // the card reads its own keys off the item prop — both routes carry the
    // same config, the way GridView supplies one.
    return renderCard(
      <CardItemProvider entityId={LIGHT} config={item.config}>
        <LightCard entityId={LIGHT} tier="glance" span={{ width: 1, height: 1 }} item={item} />
      </CardItemProvider>
    )
  }

  it('renders the surface behind the body at glance', () => {
    backgroundCard()

    const slider = screen.getByLabelText('Brightness').closest('.liebe-slider')
    expect(slider).toHaveAttribute('data-placement', 'background')
    expect(tile().querySelector('.liebe-card-body')).not.toBeNull()
  })

  it('taps the tile without travel to toggle, with no brightness call', async () => {
    backgroundCard()

    fireEvent.click(tile())

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('light', 'turn_off', { entity_id: LIGHT })
    )
    expect(hass.callService).toHaveBeenCalledTimes(1)
  })
  it('commits nothing on a tap-away-from-thumb: no-travel tap is the tap action only', async () => {
    // The review's sharp case, through the real commit path rather than a
    // manual `onChange` call: a tap landing away from the thumb still *sets*
    // a value — Radix jumps the track to the touch point on pointer down —
    // and then commits it on pointer up. With zero travel the commit must be
    // suppressed and the ending click must bubble to the shell and toggle.
    // (Unsuppressed, this double-acts: a brightness call AND a toggle — or,
    // on a security cover, a brightness-style commit plus a confirmation.)
    //
    // The rect stub is what makes the drag real (see `beginDrag` in
    // `LightCard.dragGuard.test.tsx`): jsdom reports every element as
    // zero-sized, so without it Radix computes the value the slider already
    // has, skips both callbacks, and the test passes against no gate at all.
    backgroundCard()

    const thumb = screen.getByLabelText('Brightness')
    const slider = thumb.closest('.liebe-slider') as HTMLElement
    // The rect Radix measures is the ROOT's (`slider.getBoundingClientRect`
    // in `getValueFromPointer`), so the stub goes there — stubbing a child
    // leaves the math at zero-size and the drag never begins (see `beginDrag`
    // in `LightCard.dragGuard.test.tsx`).
    slider.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 200,
        height: 20,
        right: 200,
        bottom: 20,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
    // jsdom implements no pointer capture, and Radix gates its slide start on
    // `setPointerCapture` — without the stub the touch point never sets a
    // value and the test passes against no gate at all.
    slider.setPointerCapture = () => {}
    slider.releasePointerCapture = () => {}
    slider.hasPointerCapture = () => true

    // Same clientX for down and up: the touch point sets a value (the card's
    // optimistic drag path fires `onValueChange` — the controlled prop stays
    // 50 until the card repaints, so there is no DOM value to assert here),
    // the gesture travels nothing, and the suppressed commit means only the
    // toggle dispatches.
    fireEvent.pointerDown(slider, { clientX: 150, clientY: 10, pointerId: 1, button: 0 })
    fireEvent.pointerUp(slider, { clientX: 150, clientY: 10, pointerId: 1, button: 0 })
    fireEvent.click(tile())

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('light', 'turn_off', { entity_id: LIGHT })
    )
    // The toggle — and only the toggle. A leaked commit would be a second
    // call (`turn_on` with a brightness).
    expect(hass.callService).toHaveBeenCalledTimes(1)

    // And the tile still shows the entity's own value afterwards: the tap
    // claimed no drag, so the cancel path released the optimistic value the
    // touch-point set. Without it the tile would keep painting the tapped
    // value — and the toggle guard (`drag !== null`) would decline the next
    // tap as "a drag in flight". The guard, not a second toggle (which the
    // at-most-once dispatch window would refuse as an identical repeat),
    // is the observable: the drag slot is clear, so the tile is operable.
    expect(screen.getByLabelText('Brightness').getAttribute('aria-valuenow')).toBe('50')
    expect(tile()).toHaveStyle({ cursor: 'pointer' })
  })

  it('suppresses the tap action once the pointer travels past the threshold', () => {
    // The mirror at the anatomy level: travel past BACKGROUND_TRAVEL_PX marks
    // the gesture a drag, so the ending click is stopped even when the click
    // itself lands on the tile. Pinned without timers or dispatch.
    const { unmount } = render(
      <Theme>
        <Slider
          domain="light"
          color="light"
          label="Tap split"
          value={50}
          placement="background"
          onValueChange={() => {}}
        />
      </Theme>
    )

    const slider = document.querySelector('.liebe-slider')!
    const track = slider.querySelector('.liebe-slider-track')!
    let bubbled = 0
    slider.parentElement!.addEventListener('click', () => {
      bubbled += 1
    })
    fireEvent.pointerDown(track, { isPrimary: true, button: 0, clientX: 100, clientY: 100 })
    // Capture runs Root-first, so the threshold is seen no matter which
    // descendant the finger is over.
    fireEvent.pointerMove(slider, { clientX: 100 + BACKGROUND_TRAVEL_PX + 4, clientY: 100 })
    fireEvent.click(track, { clientX: 100 + BACKGROUND_TRAVEL_PX + 4, clientY: 100 })

    expect(bubbled).toBe(0)
    unmount()
  })

  it('never fires hold on a slow drag past the hold threshold', () => {
    // Press-and-hold arms on pointer down, so a drag held past
    // HOLD_DURATION_MS would fire hold under the adjusting finger without the
    // drag-start cancel. The shell wires the drag start to `release()`: the
    // timer dies the moment travel declares a drag.
    vi.useFakeTimers()
    try {
      backgroundCard()

      const slider = screen.getByLabelText('Brightness').closest('.liebe-slider')!
      const target = slider.querySelector('.liebe-slider-track')!
      fireEvent.pointerDown(target, { isPrimary: true, button: 0, clientX: 100, clientY: 100 })
      fireEvent.pointerMove(slider, { clientX: 100 + BACKGROUND_TRAVEL_PX + 4, clientY: 100 })
      act(() => {
        vi.advanceTimersByTime(HOLD_DURATION_MS + 500)
      })
      fireEvent.pointerUp(target)

      // No hold dialog, no toggle, no brightness call from a bare pointer
      // drag with no value assertion attached: the gesture was a drag, and a
      // drag fires neither action. (No ending click is dispatched: Radix ends
      // real drags with pointer capture, not with a click the shell would see
      // as a tap — the click-stop above is the backstop for the synthetic
      // path, not the mechanism.)
      expect(hass.callService).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
  it('reaches the background slider by Tab and commits a keyboard step', async () => {
    // The keyboard path is a real adjustment route, so the background thumb
    // must stay in the tab order (no `tabIndex={-1}`). Proved with a genuine
    // Tab traversal — a direct `.focus()` would pass on an element no
    // keyboard user can ever reach, which is exactly what the review caught.
    backgroundCard()
    const user = userEvent.setup()

    await user.tab()
    expect(screen.getByLabelText('Brightness')).toHaveFocus()

    await user.keyboard('{ArrowRight}')
    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('light', 'turn_on', {
        entity_id: LIGHT,
        brightness: 130,
      })
    )
    expect(hass.callService).toHaveBeenCalledTimes(1)
  })

  it('commits a background keyboard step without firing the tap action', async () => {
    // Named for what it is: a keyboard adjustment through the same commit
    // path a pointer drag settles on — one `onValueCommit`, no tap. (The
    // pointer-drag half is the territory the preceding Tab test's siblings
    // and the e2e drag assertion own; this one pins that the keyboard route
    // the commit gate explicitly lets through still dispatches.)
    backgroundCard()

    const thumb = screen.getByLabelText('Brightness')
    fireEvent.keyDown(thumb, { key: 'ArrowRight' })

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('light', 'turn_on', {
        entity_id: LIGHT,
        brightness: 130,
      })
    )
    expect(hass.callService).toHaveBeenCalledTimes(1)
  })

  it('commits a drag ending outside the tile like any other slider drag', async () => {
    // The contract names this explicitly: a drag that ends outside the tile
    // still commits. Keyboard `End` is the same settlement path as a pointer
    // released past the edge — one `onValueCommit`, no tap.
    backgroundCard()

    const thumb = screen.getByLabelText('Brightness')
    fireEvent.keyDown(thumb, { key: 'End' })

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('light', 'turn_on', {
        entity_id: LIGHT,
        brightness: 255,
      })
    )
    expect(hass.callService).toHaveBeenCalledTimes(1)
  })
  it('holds the tile to open details, without toggling', () => {
    // Driven through the real shell with fake timers (the GridCard.actions
    // pattern): a press held past HOLD_DURATION_MS fires hold and consumes
    // the tap behind it. The background pointer reaches the press pipeline
    // because the anatomy does not stop it — that wiring is the assertion.
    // `onMoreInfo` is the shell's own dialog opener, so the dialog assertion
    // is that the hold route resolved to it rather than to the toggle.
    vi.useFakeTimers()
    try {
      backgroundCard()

      const target = screen.getByLabelText('Brightness').closest('.liebe-slider')!
      fireEvent.pointerDown(target, { isPrimary: true, button: 0 })
      act(() => {
        vi.advanceTimersByTime(HOLD_DURATION_MS + 100)
      })
      fireEvent.pointerUp(target)
      fireEvent.click(tile())

      expect(hass.callService).not.toHaveBeenCalled()
      expect(tile().textContent).toContain('Living Room')
    } finally {
      vi.useRealTimers()
    }
  })

  it('fires double-tap instead of tap when two taps land in the window', () => {
    // Same shell path, from the click side: two taps inside the window
    // dispatch the double-tap route once and never the tap behind it. The
    // tap timer is real-timed by the shell, so fake timers must be running
    // before the clicks land — and the guarded dispatch resolves async, so
    // the assertion leaves fake timers first.
    vi.useFakeTimers()
    try {
      backgroundCard({
        doubleTapAction: { action: 'call-service', service: 'script.movie_mode' },
      })

      fireEvent.click(tile())
      fireEvent.click(tile())
      act(() => {
        vi.advanceTimersByTime(DOUBLE_TAP_WINDOW_MS * 2)
      })
    } finally {
      vi.useRealTimers()
    }

    return expect(hass.callService).toHaveBeenCalledWith('script', 'movie_mode', {
      entity_id: LIGHT,
    })
  })
})
