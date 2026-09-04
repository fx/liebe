import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { Pill } from '../anatomy'
import { CardBody } from '../CardBody'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { dashboardActions } from '~/store'
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
})
