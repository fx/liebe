import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPortal } from 'react-dom'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { Pill } from '../anatomy'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { dashboardActions, dashboardStore } from '~/store'
import { DOUBLE_TAP_WINDOW_MS, HOLD_DURATION_MS, type CardAction } from '~/store/cardActions'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * The shell's gesture controller: which gesture resolves to which action, what
 * each action dispatches, and — the part that is easy to get wrong — which
 * gestures must NOT also fire something else.
 *
 * Driven through the real `GridCard` and the real store rather than through the
 * hook in isolation, because most of the contract lives in the seam: the portal
 * guard, edit-mode suppression, and the fact that a hold and the click that
 * follows it are one gesture.
 */
describe('GridCard actions', () => {
  let hass: HomeAssistant

  const actions = (overrides: Partial<Record<string, CardAction>>) => overrides

  function renderCard(ui: React.ReactElement) {
    return render(<HomeAssistantProvider hass={hass}>{ui}</HomeAssistantProvider>)
  }

  function card() {
    return document.querySelector('.liebe-card') as HTMLElement
  }

  /** A full press-and-release over the tile, holding for `duration`. */
  function pressAndRelease(target: HTMLElement, duration: number) {
    fireEvent.pointerDown(target)
    act(() => {
      vi.advanceTimersByTime(duration)
    })
    fireEvent.pointerUp(target)
    fireEvent.click(target)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
    dashboardActions.resetState()
  })

  afterEach(() => {
    vi.useRealTimers()
    dashboardActions.resetState()
  })

  it('routes a tap to the card’s own toggle', () => {
    const onToggle = vi.fn()
    renderCard(
      <GridCard domain="light" entityId="light.desk" onClick={onToggle}>
        content
      </GridCard>
    )

    fireEvent.click(card())
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('fires the hold action once the threshold passes, and no tap behind it', () => {
    // The scenario the contract spells out: hold opens details while tap
    // toggles, and the two never both happen.
    const onToggle = vi.fn()
    const onMoreInfo = vi.fn()
    renderCard(
      <GridCard domain="light" entityId="light.desk" onClick={onToggle} onMoreInfo={onMoreInfo}>
        content
      </GridCard>
    )

    pressAndRelease(card(), HOLD_DURATION_MS + 100)

    expect(onMoreInfo).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('treats a press released before the threshold as an ordinary tap', () => {
    const onToggle = vi.fn()
    const onMoreInfo = vi.fn()
    renderCard(
      <GridCard domain="light" entityId="light.desk" onClick={onToggle} onMoreInfo={onMoreInfo}>
        content
      </GridCard>
    )

    pressAndRelease(card(), HOLD_DURATION_MS - 100)

    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onMoreInfo).not.toHaveBeenCalled()
  })

  it('does not leave a fired hold armed to swallow the next tap', () => {
    // A touch long-press often produces no click at all, so the flag the hold
    // sets has to be cleared by the next press rather than only by a click.
    const onToggle = vi.fn()
    const onMoreInfo = vi.fn()
    renderCard(
      <GridCard domain="light" entityId="light.desk" onClick={onToggle} onMoreInfo={onMoreInfo}>
        content
      </GridCard>
    )

    fireEvent.pointerDown(card())
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS)
    })
    fireEvent.pointerUp(card())
    expect(onMoreInfo).toHaveBeenCalledTimes(1)

    // No click followed. The next gesture must still be a tap.
    pressAndRelease(card(), 10)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('releases the hold when the pointer leaves or is cancelled', () => {
    const onMoreInfo = vi.fn()
    renderCard(
      <GridCard domain="light" entityId="light.desk" onMoreInfo={onMoreInfo}>
        content
      </GridCard>
    )

    fireEvent.pointerDown(card())
    fireEvent.pointerLeave(card())
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS * 2)
    })
    expect(onMoreInfo).not.toHaveBeenCalled()

    fireEvent.pointerDown(card())
    fireEvent.pointerCancel(card())
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS * 2)
    })
    expect(onMoreInfo).not.toHaveBeenCalled()
  })

  it('fires the double-tap action instead of the tap when two clicks land in the window', () => {
    const onToggle = vi.fn()
    renderCard(
      <GridCard
        domain="light"
        entityId="light.desk"
        onClick={onToggle}
        actions={actions({
          doubleTapAction: { action: 'call-service', service: 'script.movie_mode' },
        })}
      >
        content
      </GridCard>
    )

    fireEvent.click(card())
    fireEvent.click(card())
    act(() => {
      vi.advanceTimersByTime(DOUBLE_TAP_WINDOW_MS * 2)
    })

    expect(hass.callService).toHaveBeenCalledTimes(1)
    expect(hass.callService).toHaveBeenCalledWith('script', 'movie_mode', {
      entity_id: 'light.desk',
    })
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('still fires the single tap once the double-tap window elapses', () => {
    const onToggle = vi.fn()
    renderCard(
      <GridCard
        domain="light"
        entityId="light.desk"
        onClick={onToggle}
        actions={actions({ doubleTapAction: 'more-info' })}
        onMoreInfo={vi.fn()}
      >
        content
      </GridCard>
    )

    fireEvent.click(card())
    expect(onToggle).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(DOUBLE_TAP_WINDOW_MS)
    })
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('keeps a tap instant while no double-tap action is configured', () => {
    // The default is `none`, and paying a 250ms delay on every tap to detect a
    // gesture nothing is bound to would make every card feel broken.
    const onToggle = vi.fn()
    renderCard(
      <GridCard domain="light" entityId="light.desk" onClick={onToggle}>
        content
      </GridCard>
    )

    fireEvent.click(card())
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('suppresses every action in edit mode and selects instead', () => {
    const onToggle = vi.fn()
    const onMoreInfo = vi.fn()
    const onSelect = vi.fn()
    dashboardActions.setMode('edit')

    renderCard(
      <GridCard
        domain="light"
        entityId="light.desk"
        onClick={onToggle}
        onMoreInfo={onMoreInfo}
        onSelect={onSelect}
      >
        content
      </GridCard>
    )

    pressAndRelease(card(), HOLD_DURATION_MS * 2)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
    expect(onMoreInfo).not.toHaveBeenCalled()
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('ignores gestures from a portalled descendant, but not from a real child', () => {
    // The guard that distinguishes them is the shell's, and press-and-hold made
    // it matter twice over: React synthetic events bubble through the React
    // tree, so a press inside a portalled dialog would otherwise arm the card's
    // hold timer behind it.
    const onToggle = vi.fn()
    const onMoreInfo = vi.fn()
    const PortalledDescendant = () =>
      createPortal(
        <button type="button" data-testid="portalled">
          option
        </button>,
        document.body
      )

    renderCard(
      <GridCard
        domain="input_select"
        entityId="input_select.mode"
        onClick={onToggle}
        onMoreInfo={onMoreInfo}
      >
        <button type="button" data-testid="child">
          content
        </button>
        <PortalledDescendant />
      </GridCard>
    )

    const portalled = screen.getByTestId('portalled')
    expect(card().contains(portalled)).toBe(false)

    pressAndRelease(screen.getByTestId('child'), 10)
    expect(onToggle).toHaveBeenCalledTimes(1)

    pressAndRelease(portalled, HOLD_DURATION_MS * 2)
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onMoreInfo).not.toHaveBeenCalled()
  })

  it('leaves the card’s gestures alone when an embedded control is pressed', () => {
    const onToggle = vi.fn()
    const onMoreInfo = vi.fn()
    const onPill = vi.fn()

    renderCard(
      <GridCard domain="climate" entityId="climate.hall" onClick={onToggle} onMoreInfo={onMoreInfo}>
        <GridCard.Controls>
          <Pill domain="climate" label="Heat" onClick={onPill} />
        </GridCard.Controls>
      </GridCard>
    )

    pressAndRelease(screen.getByRole('button', { name: 'Heat' }), HOLD_DURATION_MS * 2)

    expect(onPill).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
    expect(onMoreInfo).not.toHaveBeenCalled()
  })

  it.each([
    [
      'a button',
      <button key="c" type="button" data-testid="control">
        Step
      </button>,
    ],
    ['a text field', <input key="c" data-testid="control" defaultValue="21" />],
    [
      'an ARIA switch',
      <div key="c" role="switch" aria-checked="false" data-testid="control">
        On
      </div>,
    ],
  ])('does not arm the hold when the press lands on %s', (_what, control) => {
    // Controls already consume their own clicks, which was enough when a click
    // was all the tile listened for. Press-and-hold starts half a second
    // earlier, so a stepper held down would open the detail dialog over the
    // value it was adjusting — and the controls that would each have to stop
    // pointer-down are drawn from three libraries, so the shell asks what the
    // press landed on instead.
    const onMoreInfo = vi.fn()
    renderCard(
      <GridCard domain="input_number" entityId="input_number.target" onMoreInfo={onMoreInfo}>
        {control}
      </GridCard>
    )

    pressAndRelease(screen.getByTestId('control'), HOLD_DURATION_MS * 2)
    expect(onMoreInfo).not.toHaveBeenCalled()

    // ...and the rest of the tile still holds.
    pressAndRelease(card(), HOLD_DURATION_MS * 2)
    expect(onMoreInfo).toHaveBeenCalledTimes(1)
  })

  it('will not toggle an entity whose state is indeterminate', () => {
    // An unavailable cover must never be commanded by a tap that cannot know
    // which way it will move (REVIEW.md — safety-critical controls).
    const onToggle = vi.fn()
    renderCard(
      <GridCard
        domain="cover"
        entityId="cover.garage"
        isUnavailable
        onClick={onToggle}
        actions={actions({ tapAction: 'toggle' })}
      >
        content
      </GridCard>
    )

    expect(card().style.cursor).toBe('default')
    fireEvent.click(card())
    expect(onToggle).not.toHaveBeenCalled()
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('still opens the details of an unavailable entity', () => {
    // Which is exactly what a user reaches for when a device goes quiet.
    const onMoreInfo = vi.fn()
    renderCard(
      <GridCard domain="cover" entityId="cover.garage" isUnavailable onMoreInfo={onMoreInfo}>
        content
      </GridCard>
    )

    pressAndRelease(card(), HOLD_DURATION_MS * 2)
    expect(onMoreInfo).toHaveBeenCalledTimes(1)
  })

  it('falls back to homeassistant.toggle when the card family has no toggle of its own', () => {
    renderCard(
      <GridCard domain="switch" entityId="switch.pump" actions={actions({ tapAction: 'toggle' })}>
        content
      </GridCard>
    )

    fireEvent.click(card())
    expect(hass.callService).toHaveBeenCalledTimes(1)
    expect(hass.callService).toHaveBeenCalledWith('homeassistant', 'toggle', {
      entity_id: 'switch.pump',
    })
  })

  it('dispatches a call-service action exactly once, with the card’s entity as the target', async () => {
    renderCard(
      <GridCard
        domain="light"
        entityId="light.desk"
        actions={actions({
          tapAction: {
            action: 'call-service',
            service: 'light.turn_on',
            data: { brightness: 180 },
          },
        })}
      >
        content
      </GridCard>
    )

    fireEvent.click(card())
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(hass.callService).toHaveBeenCalledTimes(1)
    expect(hass.callService).toHaveBeenCalledWith('light', 'turn_on', {
      entity_id: 'light.desk',
      brightness: 180,
    })
  })

  it('never retries a failed action dispatch', async () => {
    // The whole point of the non-retrying path: a `button.press` that fails
    // ambiguously must not be pressed again (docs/specs/entity-cards/options/
    // common.md — "Dispatch guarantees").
    hass.callService = vi.fn().mockRejectedValue(new Error('timeout'))

    renderCard(
      <GridCard
        domain="button"
        entityId="button.doorbell"
        actions={actions({ tapAction: { action: 'call-service', service: 'button.press' } })}
      >
        content
      </GridCard>
    )

    fireEvent.click(card())
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(hass.callService).toHaveBeenCalledTimes(1)
  })

  it('yields one call per gesture even when the service acknowledges immediately', async () => {
    // Home Assistant acknowledges before slow integrations update state, so an
    // early resolution must not be mistaken for "the gesture finished, run it
    // again": one full press → release → click is one call, not two.
    hass.callService = vi.fn().mockResolvedValue(undefined)

    renderCard(
      <GridCard
        domain="script"
        entityId="script.bedtime"
        actions={actions({ tapAction: { action: 'call-service', service: 'script.turn_on' } })}
      >
        content
      </GridCard>
    )

    fireEvent.pointerDown(card())
    fireEvent.pointerUp(card())
    fireEvent.click(card())
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(hass.callService).toHaveBeenCalledTimes(1)
  })

  it('navigates to the screen a navigate action names, by slug or by id', () => {
    dashboardActions.addScreen({ id: 'screen-2', name: 'Kitchen', slug: 'kitchen', type: 'grid' })
    dashboardActions.addScreen({ id: 'screen-3', name: 'Garage', slug: 'garage', type: 'grid' })

    const { rerender } = renderCard(
      <GridCard
        domain="light"
        entityId="light.desk"
        actions={actions({ tapAction: { action: 'navigate', target: 'kitchen' } })}
      >
        content
      </GridCard>
    )

    fireEvent.click(card())
    expect(dashboardStore.state.currentScreenId).toBe('screen-2')

    rerender(
      <HomeAssistantProvider hass={hass}>
        <GridCard
          domain="light"
          entityId="light.desk"
          actions={actions({ tapAction: { action: 'navigate', target: 'screen-3' } })}
        >
          content
        </GridCard>
      </HomeAssistantProvider>
    )

    fireEvent.click(card())
    expect(dashboardStore.state.currentScreenId).toBe('screen-3')
  })

  it('navigates nowhere when the target no longer resolves to a screen', () => {
    dashboardActions.addScreen({ id: 'screen-2', name: 'Kitchen', slug: 'kitchen', type: 'grid' })
    dashboardActions.setCurrentScreen('screen-2')

    renderCard(
      <GridCard
        domain="light"
        entityId="light.desk"
        actions={actions({ tapAction: { action: 'navigate', target: 'deleted-screen' } })}
      >
        content
      </GridCard>
    )

    fireEvent.click(card())
    expect(dashboardStore.state.currentScreenId).toBe('screen-2')
  })

  it('does nothing at all for an action of none', () => {
    renderCard(
      <GridCard
        domain="camera"
        entityId="camera.porch"
        defaultAction="none"
        onMoreInfo={vi.fn()}
        actions={actions({ holdAction: 'none' })}
      >
        content
      </GridCard>
    )

    pressAndRelease(card(), HOLD_DURATION_MS * 2)
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('resolves `default` to what the card declares', () => {
    const onToggle = vi.fn()
    const onMoreInfo = vi.fn()

    renderCard(
      <GridCard
        domain="sensor"
        entityId="sensor.temperature"
        defaultAction="more-info"
        onClick={onToggle}
        onMoreInfo={onMoreInfo}
      >
        content
      </GridCard>
    )

    fireEvent.click(card())
    expect(onMoreInfo).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('ignores a stored action that does not validate, falling back to the key default', () => {
    const onToggle = vi.fn()
    renderCard(
      <GridCard
        domain="light"
        entityId="light.desk"
        onClick={onToggle}
        actions={{ tapAction: 'toggel' }}
      >
        content
      </GridCard>
    )

    fireEvent.click(card())
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('advertises a press only when the tap has somewhere to go', () => {
    // `more-info` with no dialog handler is not yet actionable (0014 PR 2), and
    // a card must not offer a pointer for a press that does nothing.
    const { rerender } = renderCard(
      <GridCard domain="sensor" entityId="sensor.temperature" defaultAction="more-info">
        content
      </GridCard>
    )
    expect(card().style.cursor).toBe('default')

    rerender(
      <HomeAssistantProvider hass={hass}>
        <GridCard
          domain="sensor"
          entityId="sensor.temperature"
          defaultAction="more-info"
          onMoreInfo={vi.fn()}
        >
          content
        </GridCard>
      </HomeAssistantProvider>
    )
    expect(card().style.cursor).toBe('pointer')
  })

  it('does not dispatch after the card unmounts mid-gesture', () => {
    const onMoreInfo = vi.fn()
    const { unmount } = renderCard(
      <GridCard domain="light" entityId="light.desk" onMoreInfo={onMoreInfo}>
        content
      </GridCard>
    )

    fireEvent.pointerDown(card())
    unmount()
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS * 2)
    })

    expect(onMoreInfo).not.toHaveBeenCalled()
  })
})
