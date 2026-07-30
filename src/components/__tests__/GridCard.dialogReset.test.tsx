import { useLayoutEffect } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { dashboardActions, useDashboardStore } from '~/store'
import { entityStore } from '~/store/entityStore'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * The shell drops both of its dialogs on the same two keys — edit mode and the
 * entity the card is pointed at (docs/changes/0040-test-harness-reliability.md,
 * PR 4).
 *
 * Both are hidden by a `!isEditMode` guard in the render, and hiding is not
 * dropping: with the reset in an effect, the *request* stood while the dialog
 * was off screen, so leaving edit mode brought it back — and so did the card
 * instance being recycled onto another entity. These pin the drop rather than
 * the hide, which is the difference between the two.
 */
describe('GridCard dialog reset', () => {
  let hass: HomeAssistant
  const PUMP = 'switch.well_pump'
  const HEATER = 'switch.pool_heater'

  beforeEach(() => {
    hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
    dashboardActions.resetState()
    entityStore.setState((state) => ({
      ...state,
      entities: {
        [PUMP]: seed(PUMP, 'Well Pump'),
        [HEATER]: seed(HEATER, 'Pool Heater'),
      },
    }))
  })

  afterEach(() => {
    dashboardActions.resetState()
    entityStore.setState((state) => ({ ...state, entities: {} }))
  })

  function seed(entityId: string, friendlyName: string) {
    return {
      entity_id: entityId,
      state: 'on',
      attributes: { friendly_name: friendlyName },
      last_changed: '2026-07-30T10:00:00Z',
      last_updated: '2026-07-30T10:00:00Z',
      context: { id: 'seed', parent_id: null, user_id: null },
    }
  }

  function tree(entityId: string) {
    return (
      <Theme>
        <HomeAssistantProvider hass={hass}>
          <GridCard domain="switch" entityId={entityId} isOn config={{ confirm: true }}>
            content
          </GridCard>
        </HomeAssistantProvider>
      </Theme>
    )
  }

  const card = () => document.querySelector('.liebe-card') as HTMLElement

  /**
   * Records, at every commit it takes part in, which dialog headings were in
   * the document — from a **layout** effect, which runs after that commit's DOM
   * mutations and before anything passive.
   *
   * This is the only vantage that can tell a render-phase reset from an effect
   * one. Both end at the same DOM, so every assertion made after an `act()`
   * boundary — where passive effects have already flushed — agrees with both.
   * The difference is the commit in between, which is a frame the user sees and
   * a test otherwise cannot: a dialog belonging to the entity this card USED to
   * be pointed at, standing over the one it is now.
   *
   * It subscribes to the dashboard store because the shell reads its mode from
   * there; without that it would not re-render in the commit a mode change
   * causes, and its layout effect would not run for it.
   */
  function CommitProbe({ seen }: { seen: string[][] }) {
    useDashboardStore()
    useLayoutEffect(() => {
      seen.push(
        Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).map((node) =>
          (node.textContent ?? '').trim()
        )
      )
    })
    return null
  }

  describe('the confirmation a gated action is waiting on', () => {
    it('does not resurrect it on the way back to view mode', () => {
      render(tree(PUMP))

      fireEvent.click(card())
      expect(screen.getByText('Turn off Well Pump?')).toBeInTheDocument()

      act(() => dashboardActions.setMode('edit'))
      act(() => dashboardActions.setMode('view'))

      expect(screen.queryByText('Turn off Well Pump?')).not.toBeInTheDocument()
      expect(hass.callService).not.toHaveBeenCalled()
    })

    it('drops it when the card is recycled onto another entity', () => {
      // The grid reuses card instances, so a confirmation raised for the pump
      // must not be standing over the heater — where the answer that looks safe
      // is to accept, against a device the user never gestured at.
      const { rerender } = render(tree(PUMP))

      fireEvent.click(card())
      expect(screen.getByText('Turn off Well Pump?')).toBeInTheDocument()

      rerender(tree(HEATER))

      expect(screen.queryByText('Turn off Well Pump?')).not.toBeInTheDocument()
      expect(screen.queryByText('Turn off Pool Heater?')).not.toBeInTheDocument()
      expect(hass.callService).not.toHaveBeenCalled()
    })

    it('survives a re-render that changes neither key', () => {
      // The guard is a previous-value comparison, so a render for any other
      // reason must leave the request alone. Without that, the dialog would be
      // unusable: the render its own Cancel button causes would drop it before
      // anything could be pressed.
      const { rerender } = render(tree(PUMP))

      fireEvent.click(card())
      expect(screen.getByText('Turn off Well Pump?')).toBeInTheDocument()

      rerender(tree(PUMP))

      expect(screen.getByText('Turn off Well Pump?')).toBeInTheDocument()
    })
  })

  describe('the commit the recycle happens in', () => {
    /*
     * The half of this that is a fix rather than a re-spelling. Edit mode has a
     * `!isEditMode` render guard covering the commit an effect ran late by, so
     * nothing stale reached the screen either way. The entity has no such guard:
     * with the reset in an effect, the commit that pointed the card at another
     * entity still rendered the previous entity's dialog, and only the passive
     * effect afterwards took it down. That is a painted frame.
     */
    function probeTree(entityId: string, seen: string[][], config: Record<string, unknown>) {
      return (
        <Theme>
          <HomeAssistantProvider hass={hass}>
            <GridCard
              domain="switch"
              entityId={entityId}
              isOn
              config={config}
              defaultAction={config.confirm ? undefined : 'more-info'}
            >
              content
            </GridCard>
            <CommitProbe seen={seen} />
          </HomeAssistantProvider>
        </Theme>
      )
    }

    it('never carries the previous entity’s confirmation', () => {
      const seen: string[][] = []
      const { rerender } = render(probeTree(PUMP, seen, { confirm: true }))

      fireEvent.click(card())
      expect(screen.getByText('Turn off Well Pump?')).toBeInTheDocument()

      seen.length = 0
      rerender(probeTree(HEATER, seen, { confirm: true }))

      // The probe must have run, or this asserts nothing at all.
      expect(seen.length).toBeGreaterThan(0)
      expect(seen.flat().join(' ')).not.toContain('Well Pump')
    })

    it('never carries the previous entity’s detail dialog', () => {
      const seen: string[][] = []
      const { rerender } = render(probeTree(PUMP, seen, {}))

      fireEvent.click(card())
      expect(screen.getByRole('heading', { name: 'Well Pump' })).toBeInTheDocument()

      seen.length = 0
      rerender(probeTree(HEATER, seen, {}))

      expect(seen.length).toBeGreaterThan(0)
      expect(seen.flat().join(' ')).not.toContain('Well Pump')
    })
  })

  describe('the detail dialog more-info opens', () => {
    function detailTree(entityId: string) {
      return (
        <Theme>
          <HomeAssistantProvider hass={hass}>
            <GridCard domain="switch" entityId={entityId} isOn defaultAction="more-info">
              content
            </GridCard>
          </HomeAssistantProvider>
        </Theme>
      )
    }

    /** The dialog names the entity it was opened for, which is what identifies it. */
    const openDetailTitle = () => screen.queryByRole('heading', { name: 'Well Pump' })

    it('does not resurrect it on the way back to view mode', () => {
      render(detailTree(PUMP))

      fireEvent.click(card())
      expect(openDetailTitle()).toBeInTheDocument()

      act(() => dashboardActions.setMode('edit'))
      act(() => dashboardActions.setMode('view'))

      expect(openDetailTitle()).not.toBeInTheDocument()
    })

    it('drops it when the card is recycled onto another entity', () => {
      // Showing the pump's details over a card that is now the heater is the
      // same defect as the confirmation's, one dialog over.
      const { rerender } = render(detailTree(PUMP))

      fireEvent.click(card())
      expect(openDetailTitle()).toBeInTheDocument()

      rerender(detailTree(HEATER))

      expect(openDetailTitle()).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Pool Heater' })).not.toBeInTheDocument()
    })

    it('survives a re-render that changes neither key', () => {
      const { rerender } = render(detailTree(PUMP))

      fireEvent.click(card())
      expect(openDetailTitle()).toBeInTheDocument()

      rerender(detailTree(PUMP))

      expect(openDetailTitle()).toBeInTheDocument()
    })
  })
})
