import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { GridCardWithComponents as GridCard, resolveDialogRetry } from '../GridCard'
import { Pill } from '../anatomy'
import { CardBody } from '../CardBody'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { dashboardActions } from '~/store'
import { HOLD_DURATION_MS } from '~/store/cardActions'
import { entityStore } from '~/store/entityStore'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * The tile action control (change 0043 PR 2 + PR 3): the shell tile stays a
 * non-interactive container and carries a dedicated focusable child that owns
 * the tile action — route D of the PR 1 contract.
 *
 * Asserted through the accessible tree, never the tag: a `<button>` with no
 * name is a worse tile than the div it replaced.
 */
describe('GridCard tile action control', () => {
  let hass: HomeAssistant
  const ENTITY_ID = 'light.desk'

  function seed(state = 'on') {
    entityStore.setState((s) => ({
      ...s,
      entities: {
        [ENTITY_ID]: {
          entity_id: ENTITY_ID,
          state,
          attributes: { friendly_name: 'Desk Lamp' },
          last_changed: '2026-07-27T10:00:00Z',
          last_updated: '2026-07-27T10:00:00Z',
          context: { id: 'seed', parent_id: null, user_id: null },
        },
      },
    }))
  }

  beforeEach(() => {
    vi.useFakeTimers()
    hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
    dashboardActions.resetState()
    seed()
  })

  afterEach(() => {
    vi.useRealTimers()
    dashboardActions.resetState()
    entityStore.setState((state) => ({ ...state, entities: {} }))
  })

  function renderCard(ui: React.ReactElement) {
    return render(
      <Theme>
        <HomeAssistantProvider hass={hass}>{ui}</HomeAssistantProvider>
      </Theme>
    )
  }

  const tileAction = (name: RegExp) => screen.getByRole('button', { name })

  it('names the tile control after the entity and its state at glance', () => {
    renderCard(
      <GridCard domain="light" entityId={ENTITY_ID} tier="glance" onClick={vi.fn()}>
        content
      </GridCard>
    )

    expect(tileAction(/^Desk Lamp, on$/)).toBeInTheDocument()
  })

  it('names the tile control at a tier that embeds controls, beside them', () => {
    const onPill = vi.fn()
    renderCard(
      <GridCard domain="light" entityId={ENTITY_ID} tier="row" onClick={vi.fn()}>
        <GridCard.Controls>
          <Pill domain="light" label="Heat" onClick={onPill} />
        </GridCard.Controls>
      </GridCard>
    )

    // The tile control is a sibling of the embedded control, not its ancestor.
    expect(tileAction(/^Desk Lamp, on$/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Heat' })).toBeInTheDocument()
  })

  it('steps out of the Tab order where the tile already has a focusable control', () => {
    // A tier embedding a control already puts a Tab stop on the tile (the
    // slider thumb); the tile-action control must not add a second one. At
    // `glance`, with nothing embedded, it stays the tile's one Tab stop.
    // (Through `CardBody control={...}`, the seam real cards use — not the
    // `GridCard.Controls` div, which is a layout wrapper the detector does
    // not read.)
    const { unmount } = renderCard(
      <GridCard domain="light" entityId={ENTITY_ID} tier="row" onClick={vi.fn()}>
        <CardBody
          arrangement="row"
          lead={<span>lead</span>}
          control={<Pill domain="light" label="Heat" onClick={vi.fn()} />}
        />
      </GridCard>
    )
    expect(tileAction(/^Desk Lamp, on$/)).toHaveAttribute('tabindex', '-1')
    unmount()

    renderCard(
      <GridCard domain="light" entityId={ENTITY_ID} tier="glance" onClick={vi.fn()}>
        content
      </GridCard>
    )
    expect(tileAction(/^Desk Lamp, on$/)).not.toHaveAttribute('tabindex')
  })

  it('fires the tap action on Enter and on Space', () => {
    const onToggle = vi.fn()
    renderCard(
      <GridCard domain="light" entityId={ENTITY_ID} onClick={onToggle}>
        content
      </GridCard>
    )

    // keyDown carries no activation on its own; the click models the native
    // Enter/Space activation the control fires the tap through.
    fireEvent.click(tileAction(/^Desk Lamp/))
    fireEvent.click(tileAction(/^Desk Lamp/))

    expect(onToggle).toHaveBeenCalledTimes(2)
  })

  it('fires the hold route on Shift+Enter and never falls back to the tap', () => {
    const onToggle = vi.fn()
    const onMoreInfo = vi.fn()
    renderCard(
      <GridCard domain="light" entityId={ENTITY_ID} onClick={onToggle} onMoreInfo={onMoreInfo}>
        content
      </GridCard>
    )

    fireEvent.keyDown(tileAction(/^Desk Lamp/), { key: 'Enter', shiftKey: true })

    expect(onMoreInfo).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('fires the double-tap route on Alt+Enter', () => {
    const onToggle = vi.fn()
    renderCard(
      <GridCard
        domain="light"
        entityId={ENTITY_ID}
        onClick={onToggle}
        config={{ doubleTapAction: { action: 'call-service', service: 'script.movie_mode' } }}
      >
        content
      </GridCard>
    )

    fireEvent.keyDown(tileAction(/^Desk Lamp/), { key: 'Enter', altKey: true })

    expect(hass.callService).toHaveBeenCalledTimes(1)
    expect(hass.callService).toHaveBeenCalledWith('script', 'movie_mode', {
      entity_id: ENTITY_ID,
    })
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('routes Shift/Alt activations to recovery on an error tile, never behind ERROR', () => {
    // A configured consequential hold/double-tap must not dispatch behind the
    // ERROR surface: every activation is a recovery activation while `isError`
    // holds, modifiers included.
    const onToggle = vi.fn()
    renderCard(
      <GridCard
        domain="light"
        entityId={ENTITY_ID}
        isError
        title="Service not found"
        failureMessage="Service not found"
        onDismiss={vi.fn()}
        onClick={onToggle}
        config={{
          holdAction: { action: 'call-service', service: 'light.turn_on' },
          doubleTapAction: { action: 'call-service', service: 'script.movie_mode' },
        }}
      >
        content
      </GridCard>
    )

    fireEvent.keyDown(tileAction(/^Desk Lamp, Service not found$/), {
      key: 'Enter',
      shiftKey: true,
    })
    expect(screen.getByTestId('detail-failure')).toHaveTextContent('Service not found')
    expect(onToggle).not.toHaveBeenCalled()
    expect(hass.callService).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    fireEvent.keyDown(tileAction(/^Desk Lamp, Service not found$/), {
      key: 'Enter',
      altKey: true,
    })
    expect(screen.getByTestId('detail-failure')).toHaveTextContent('Service not found')
    expect(onToggle).not.toHaveBeenCalled()
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('leaves a Shift activation inert when holdAction is none', () => {
    const onToggle = vi.fn()
    const onMoreInfo = vi.fn()
    renderCard(
      <GridCard
        domain="light"
        entityId={ENTITY_ID}
        onClick={onToggle}
        onMoreInfo={onMoreInfo}
        config={{ holdAction: 'none' }}
      >
        content
      </GridCard>
    )

    fireEvent.keyDown(tileAction(/^Desk Lamp/), { key: 'Enter', shiftKey: true })

    expect(onMoreInfo).not.toHaveBeenCalled()
    expect(onToggle).not.toHaveBeenCalled()
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('renders no tile control in edit mode, where selection owns the tile', () => {
    dashboardActions.setMode('edit')
    const onSelect = vi.fn()
    renderCard(
      <GridCard domain="light" entityId={ENTITY_ID} onClick={vi.fn()} onSelect={onSelect}>
        content
      </GridCard>
    )

    expect(screen.queryByRole('button', { name: /^Desk Lamp/ })).toBeNull()
  })

  it('carries the failure message in the accessible name while isError holds', () => {
    renderCard(
      <GridCard
        domain="light"
        entityId={ENTITY_ID}
        isError
        title="Service not found"
        failureMessage="Service not found"
        onClick={vi.fn()}
      >
        content
      </GridCard>
    )

    expect(tileAction(/^Desk Lamp, Service not found$/)).toBeInTheDocument()
  })

  it('announces a lone failureMessage with no duplicated title', () => {
    // `title` is hover-only: a failure carried only by `failureMessage` must
    // still announce per the message-becomes-name contract.
    renderCard(
      <GridCard
        domain="light"
        entityId={ENTITY_ID}
        isError
        failureMessage="Valve jammed"
        onClick={vi.fn()}
      >
        content
      </GridCard>
    )

    expect(tileAction(/^Desk Lamp, Valve jammed$/)).toBeInTheDocument()
  })
  it('falls back to the title where the failure carries no message of its own', () => {
    // The second `??` arm: an `isError` tile with no `failureMessage`
    // announces the `title` instead — hover-only elsewhere, the carrier
    // here — so the tile-action name never goes message-less.
    renderCard(
      <GridCard domain="light" entityId={ENTITY_ID} isError title="Stream stalled" onClick={vi.fn()}>
        content
      </GridCard>
    )

    expect(tileAction(/^Desk Lamp, Stream stalled$/)).toBeInTheDocument()
  })

  it('opens the detail dialog carrying the failure from the error tile at every tier', () => {
    for (const tier of ['glance', 'row', 'tall', 'full'] as const) {
      const onToggle = vi.fn()
      const { unmount } = renderCard(
        <GridCard
          domain="light"
          entityId={ENTITY_ID}
          tier={tier}
          isError
          title="Service not found"
          failureMessage="Service not found"
          onDismiss={vi.fn()}
          onClick={onToggle}
        >
          content
        </GridCard>
      )

      // Pointer tap AND keyboard activation both route to recovery: the
      // actionable card must not toggle behind its own ERROR.
      fireEvent.click(tileAction(/^Desk Lamp, Service not found$/))
      expect(screen.getByTestId('detail-failure')).toHaveTextContent('Service not found')
      expect(onToggle).not.toHaveBeenCalled()
      expect(hass.callService).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))

      fireEvent.keyDown(tileAction(/^Desk Lamp, Service not found$/), {
        key: 'Enter',
        shiftKey: true,
      })
      expect(screen.getByTestId('detail-failure')).toHaveTextContent('Service not found')
      expect(onToggle).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('opens the dialog from a tap=none error tile instead of no-op', () => {
    // The camera resolves its tap to `none`; in the error state the press
    // still has to reach the recovery dialog rather than doing nothing.
    renderCard(
      <GridCard
        domain="camera"
        entityId={ENTITY_ID}
        tier="glance"
        isError
        title="Stream stalled"
        failureMessage="Stream stalled"
        onDismiss={vi.fn()}
        defaultAction="none"
      >
        content
      </GridCard>
    )

    fireEvent.click(tileAction(/^Desk Lamp, Stream stalled$/))
    expect(screen.getByTestId('detail-failure')).toHaveTextContent('Stream stalled')
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('presses the icon-only error tile to the same dialog', () => {
    // The PR 4 case: suppression took the words off the tile, the accessible
    // name already carries the message, and the press had nowhere to go.
    renderCard(
      <GridCard
        domain="light"
        entityId={ENTITY_ID}
        tier="glance"
        isError
        title="Service not found"
        failureMessage="Service not found"
        onDismiss={vi.fn()}
        onClick={vi.fn()}
        config={{ iconOnly: true }}
      >
        content
      </GridCard>
    )

    fireEvent.keyDown(tileAction(/^Desk Lamp, Service not found$/), {
      key: 'Enter',
      shiftKey: true,
    })
    expect(screen.getByTestId('detail-failure')).toHaveTextContent('Service not found')
  })

  it('clears the error on Dismiss and dispatches nothing', () => {
    const onDismiss = vi.fn()
    renderCard(
      <GridCard
        domain="light"
        entityId={ENTITY_ID}
        isError
        title="Service not found"
        failureMessage="Service not found"
        onDismiss={onDismiss}
        onClick={vi.fn()}
      >
        content
      </GridCard>
    )

    fireEvent.keyDown(tileAction(/^Desk Lamp/), { key: 'Enter', shiftKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(hass.callService).not.toHaveBeenCalled()
    act(() => {
      vi.runOnlyPendingTimers()
    })
  })
  function seedError() {
    entityStore.setState((s) => ({
      ...s,
      entities: {
        [ENTITY_ID]: {
          entity_id: ENTITY_ID,
          state: 'on',
          attributes: { friendly_name: 'Desk Lamp' },
          last_changed: '2026-07-27T10:00:00Z',
          last_updated: '2026-07-27T10:00:00Z',
          context: { id: 'seed', parent_id: null, user_id: null },
        },
      },
    }))
  }

  function renderErrorCard(onToggle: () => void) {
    return render(
      <Theme>
        <HomeAssistantProvider hass={hass}>
          <GridCard
            domain="light"
            entityId={ENTITY_ID}
            tier="row"
            isError
            title="Service not found"
            failureMessage="Service not found"
            onDismiss={vi.fn()}
            onClick={onToggle}
            config={{
              holdAction: { action: 'call-service', service: 'light.turn_on' },
              doubleTapAction: { action: 'call-service', service: 'script.movie_mode' },
            }}
          >
            content
          </GridCard>
        </HomeAssistantProvider>
      </Theme>
    )
  }

  it('opens recovery on long-press without dispatching the hold route', () => {
    seedError()
    const onToggle = vi.fn()
    renderErrorCard(onToggle)
    const tile = document.querySelector('.liebe-card') as HTMLElement

    // A press held past the hold threshold must not arm the gesture: the hold
    // timer would otherwise dispatch the consequential hold route behind the
    // ERROR surface before the click routes to recovery.
    fireEvent.pointerDown(tile, { isPrimary: true, button: 0 })
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS + 100)
    })
    fireEvent.pointerUp(tile)
    fireEvent.click(tile)

    expect(screen.getByTestId('detail-failure')).toHaveTextContent('Service not found')
    expect(onToggle).not.toHaveBeenCalled()
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('ignores non-activation keys and key repeats on the tile control', () => {
    // Lines 1157-1158: only Enter/Space route, and a held key must not
    // re-dispatch — the repeat guard consumes the auto-repeat.
    const onToggle = vi.fn()
    renderCard(
      <GridCard domain="light" entityId={ENTITY_ID} onClick={onToggle}>
        content
      </GridCard>
    )

    fireEvent.keyDown(tileAction(/^Desk Lamp/), { key: 'Tab' })
    fireEvent.keyDown(tileAction(/^Desk Lamp/), { key: 'Enter', repeat: true })
    fireEvent.keyDown(tileAction(/^Desk Lamp/), { key: ' ', repeat: true })

    expect(onToggle).not.toHaveBeenCalled()
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('leaves a both-modifier error activation inert instead of opening recovery twice', () => {
    // Line 1165: Shift+Alt together is neither route — not even recovery.
    // One modifier names a gesture to recover; both name none.
    const onToggle = vi.fn()
    renderCard(
      <GridCard
        domain="light"
        entityId={ENTITY_ID}
        isError
        title="Service not found"
        failureMessage="Service not found"
        onDismiss={vi.fn()}
        onClick={onToggle}
      >
        content
      </GridCard>
    )

    fireEvent.keyDown(tileAction(/^Desk Lamp, Service not found$/), {
      key: 'Enter',
      shiftKey: true,
      altKey: true,
    })

    expect(screen.queryByTestId('detail-failure')).not.toBeInTheDocument()
    expect(onToggle).not.toHaveBeenCalled()
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('leaves Ctrl/Shift error activations inert rather than recovering', () => {
    // Line 1165, the other arm: Ctrl held alongside the gesture modifier is
    // a browser shortcut, not a tile activation — recovery stays closed.
    const onToggle = vi.fn()
    renderCard(
      <GridCard
        domain="light"
        entityId={ENTITY_ID}
        isError
        title="Service not found"
        failureMessage="Service not found"
        onDismiss={vi.fn()}
        onClick={onToggle}
      >
        content
      </GridCard>
    )

    fireEvent.keyDown(tileAction(/^Desk Lamp, Service not found$/), {
      key: 'Enter',
      shiftKey: true,
      ctrlKey: true,
    })

    expect(screen.queryByTestId('detail-failure')).not.toBeInTheDocument()
    expect(onToggle).not.toHaveBeenCalled()
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('leaves a Ctrl-modified activation inert on a healthy tile', () => {
    // Lines 1171/1174: Ctrl+Shift+Enter is neither the hold nor the
    // double-tap route — the shell reserves Ctrl for the browser.
    const onToggle = vi.fn()
    const onMoreInfo = vi.fn()
    renderCard(
      <GridCard domain="light" entityId={ENTITY_ID} onClick={onToggle} onMoreInfo={onMoreInfo}>
        content
      </GridCard>
    )

    fireEvent.keyDown(tileAction(/^Desk Lamp/), { key: 'Enter', shiftKey: true, ctrlKey: true })
    fireEvent.keyDown(tileAction(/^Desk Lamp/), { key: 'Enter', altKey: true, metaKey: true })

    expect(onToggle).not.toHaveBeenCalled()
    expect(onMoreInfo).not.toHaveBeenCalled()
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('keeps the tile control Tab-reachable where nothing else tabbable renders', () => {
    // Line 1209: a tile with no other focusable control leaves the tile
    // action in the Tab order — suppressing it there would leave the tile
    // with no keyboard surface at all.
    renderCard(
      <GridCard domain="light" entityId={ENTITY_ID} onClick={vi.fn()}>
        content
      </GridCard>
    )

    expect(tileAction(/^Desk Lamp/)).not.toHaveAttribute('tabindex', '-1')
  })

  it('steps the tile control out where a disabled control still renders', () => {
    // Line 1244: decided on rendered tabbability, not mere presence — a
    // `button` that is `disabled` is not a Tab stop, so the tile action
    // stays reachable beside it.
    renderCard(
      <GridCard domain="light" entityId={ENTITY_ID} onClick={vi.fn()}>
        <button disabled>Busy</button>
      </GridCard>
    )

    expect(tileAction(/^Desk Lamp/)).not.toHaveAttribute('tabindex', '-1')
  })
  it('ignores a non-HTMLElement node when deciding Tab reachability', () => {
    // The `instanceof HTMLElement` arm: an SVG element matches the
    // selector set but is not an `HTMLElement`, so the detector skips it
    // and the tile action stays reachable beside it.
    renderCard(
      <GridCard domain="light" entityId={ENTITY_ID} onClick={vi.fn()}>
        <svg tabIndex={0} data-testid="decorative" />
      </GridCard>
    )

    expect(tileAction(/^Desk Lamp/)).not.toHaveAttribute('tabindex', '-1')
  })

  it('withholds Retry in the dialog where the card names nothing to repeat', () => {
    // The second `??` arm: `canRetry` alone is not enough — the dialog
    // offers Retry only where a recovery action exists. A pre-dispatch
    // refusal carries the flag with no action, so the dialog stays
    // Dismiss-only even where `failureMessage` itself is absent and the
    // title carries the failure.
    renderCard(
      <GridCard
        domain="light"
        entityId={ENTITY_ID}
        isError
        title="Value refused"
        canRetry
        onDismiss={vi.fn()}
        onClick={vi.fn()}
      >
        content
      </GridCard>
    )

    fireEvent.click(tileAction(/^Desk Lamp, Value refused$/))
    expect(screen.getByTestId('detail-failure')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })

  it('routes dialog Retry through the retained action and observes the outcome', () => {
    // Lines 1669-1674, the taken arms: a retained action re-enters through
    // `dispatchAction` with the card's observer — success clears the card
    // error (covered per-card in ActionCard), failure keeps it standing.
    const onRetrySettled = vi.fn()
    renderCard(
      <GridCard
        domain="light"
        entityId={ENTITY_ID}
        isError
        title="Service not found"
        failureMessage="Service not found"
        canRetry
        retryAction={{ action: 'call-service', service: 'homeassistant.toggle' }}
        onRetrySettled={onRetrySettled}
        onDismiss={vi.fn()}
        onClick={vi.fn()}
      >
        content
      </GridCard>
    )

    fireEvent.click(tileAction(/^Desk Lamp, Service not found$/))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(hass.callService).toHaveBeenCalledWith('homeassistant', 'toggle', {
      entity_id: ENTITY_ID,
    })
  })

  it('re-decides Tab reachability when the tile gains a control after mount', async () => {
    // Line 1209, the untaken arm: the observer fires on a subtree change —
    // a control mounting after the tile action re-runs the decision, and
    // the tile action steps out of the Tab order beside it.
    const { rerender } = render(
      <Theme>
        <HomeAssistantProvider hass={hass}>
          <GridCard domain="light" entityId={ENTITY_ID} onClick={vi.fn()}>
            content
          </GridCard>
        </HomeAssistantProvider>
      </Theme>
    )
    expect(tileAction(/^Desk Lamp/)).not.toHaveAttribute('tabindex', '-1')

    rerender(
      <Theme>
        <HomeAssistantProvider hass={hass}>
          <GridCard domain="light" entityId={ENTITY_ID} onClick={vi.fn()}>
            <button>Later</button>
          </GridCard>
        </HomeAssistantProvider>
      </Theme>
    )
    // The observer notifies asynchronously; the settle guard releases on a
    // microtask, so flush before asserting the re-decision.
    await act(async () => {})

    expect(tileAction(/^Desk Lamp/)).toHaveAttribute('tabindex', '-1')
  })

  it('re-checks Tab reachability on focus after a sibling disables', () => {
    // Line 1244, the taken arm through the focus path: `decide` runs from
    // `onFocus`, so a tile action focused after its sibling went disabled
    // re-reads rendered tabbability and stays reachable.
    const { rerender } = render(
      <Theme>
        <HomeAssistantProvider hass={hass}>
          <GridCard domain="light" entityId={ENTITY_ID} onClick={vi.fn()}>
            <button>Busy</button>
          </GridCard>
        </HomeAssistantProvider>
      </Theme>
    )
    expect(tileAction(/^Desk Lamp/)).toHaveAttribute('tabindex', '-1')

    rerender(
      <Theme>
        <HomeAssistantProvider hass={hass}>
          <GridCard domain="light" entityId={ENTITY_ID} onClick={vi.fn()}>
            <button disabled>Busy</button>
          </GridCard>
        </HomeAssistantProvider>
      </Theme>
    )
    fireEvent.focus(tileAction(/^Desk Lamp/))

    expect(tileAction(/^Desk Lamp/)).not.toHaveAttribute('tabindex', '-1')
  })
  it('returns from the tab-index decision when the tile is gone', () => {
    // The `tile == null` guard: an observer notification landing after
    // teardown must see the cleared ref and return instead of writing
    // `tabindex` onto a released control. Capture the observer callback,
    // unmount (the ref callback clears the ref, then disconnects), then
    // deliver the stale notification — the decision must no-op, not throw.
    const callbacks: MutationCallback[] = []
    class FakeObserver {
      constructor(cb: MutationCallback) {
        callbacks.push(cb)
      }
      disconnect(): void {}
      observe(): void {}
      takeRecords(): MutationRecord[] {
        return []
      }
    }
    vi.stubGlobal('MutationObserver', FakeObserver)
    try {
      const { unmount } = renderCard(
        <GridCard domain="light" entityId={ENTITY_ID} onClick={vi.fn()}>
          content
        </GridCard>
      )
      expect(callbacks).toHaveLength(1)
      unmount()
      const pending = [...callbacks]
      for (const cb of pending) {
        expect(() => cb([], new FakeObserver(() => {}) as unknown as MutationObserver)).not.toThrow()
      }
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('routes dialog Retry through the camera stream remount', () => {
    // The `onStreamRetry ?? ...` arm: the camera's non-service recovery
    // takes precedence — Retry invokes the remount directly and dispatches
    // no service call.
    const onStreamRetry = vi.fn()
    renderCard(
      <GridCard
        domain="camera"
        entityId={ENTITY_ID}
        isError
        title="Stream stalled"
        failureMessage="Stream stalled"
        canRetry
        onStreamRetry={onStreamRetry}
        retryAction={{ action: 'call-service', service: 'homeassistant.toggle' }}
        onDismiss={vi.fn()}
        onClick={vi.fn()}
      >
        content
      </GridCard>
    )

    fireEvent.click(tileAction(/^Desk Lamp, Stream stalled$/))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(onStreamRetry).toHaveBeenCalledTimes(1)
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('leaves Retry off where the stream recovered but the flag stayed set', () => {
    // The `||` arm: `canRetry` with neither recovery — a stream that
    // recovered (`onStreamRetry` back to `undefined`) and no retained
    // action — offers no Retry, only Dismiss.
    renderCard(
      <GridCard
        domain="camera"
        entityId={ENTITY_ID}
        isError
        title="Stream stalled"
        failureMessage="Stream stalled"
        canRetry
        onDismiss={vi.fn()}
        onClick={vi.fn()}
      >
        content
      </GridCard>
    )

    fireEvent.click(tileAction(/^Desk Lamp, Stream stalled$/))
    expect(screen.getByTestId('detail-failure')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })

  describe('resolveDialogRetry', () => {
    const action = { action: 'call-service', service: 'homeassistant.toggle' } as const

    it('returns no recovery where the flag is off', () => {
      expect(resolveDialogRetry(false, undefined, action, vi.fn())).toBeUndefined()
    })

    it('prefers the stream remount over the retained action', () => {
      const remount = vi.fn()
      const redispatch = vi.fn()
      expect(resolveDialogRetry(true, remount, action, redispatch)).toBe(remount)
    })

    it('re-dispatches the retained action through the caller', () => {
      const redispatch = vi.fn()
      const retry = resolveDialogRetry(true, undefined, action, redispatch)
      retry?.()
      expect(redispatch).toHaveBeenCalledWith(action)
    })

    it('returns no recovery where neither exists', () => {
      expect(resolveDialogRetry(true, undefined, undefined, vi.fn())).toBeUndefined()
      expect(resolveDialogRetry(true, undefined, null, vi.fn())).toBeUndefined()
    })
  })
})
