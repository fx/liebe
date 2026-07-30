import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@radix-ui/themes'
import { ButtonCard } from '..'
import { useEntity, useServiceCall } from '~/hooks'
import { useHomeAssistantOptional } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { dashboardActions, dashboardStore } from '~/store'
import type { GridItem } from '~/store/types'

vi.mock('~/hooks', () => ({
  useEntity: vi.fn(),
  useServiceCall: vi.fn(),
}))

vi.mock('~/contexts/HomeAssistantContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/contexts/HomeAssistantContext')>()),
  useHomeAssistantOptional: vi.fn(),
}))

/**
 * The card's shell-facing behaviour: the lifecycle states it renders, and the
 * edit-mode affordances it now carries — a configuration modal, which this card
 * gained with its option surface (docs/changes/0022).
 */
describe('ButtonCard shell', () => {
  const dispatchGuarded = vi.fn()
  const clearError = vi.fn()

  const ITEM: GridItem = {
    id: 'item-1',
    type: 'entity',
    entityId: 'switch.coffee_maker',
    x: 0,
    y: 0,
    width: 2,
    height: 1,
    config: {},
  }

  function mockServiceCall(overrides: Partial<ReturnType<typeof useServiceCall>> = {}) {
    vi.mocked(useServiceCall).mockReturnValue({
      loading: false,
      error: null,
      callService: vi.fn(),
      turnOn: vi.fn(),
      turnOff: vi.fn(),
      toggle: vi.fn(),
      dispatchGuarded,
      setValue: vi.fn(),
      clearError,
      ...overrides,
    } as unknown as ReturnType<typeof useServiceCall>)
  }

  function mockEntity(state = 'off', { isConnected = true } = {}) {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        entity_id: 'switch.coffee_maker',
        state,
        attributes: { friendly_name: 'Coffee Maker' },
        last_changed: '2026-07-27T10:00:00Z',
        last_updated: '2026-07-27T10:00:00Z',
        context: { id: 'test', parent_id: null, user_id: null },
      },
      isConnected,
      isLoading: false,
      isMissing: false,
      isStale: false,
    } as unknown as ReturnType<typeof useEntity>)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    dashboardActions.resetState()
    vi.mocked(useHomeAssistantOptional).mockReturnValue(createMockHomeAssistant())
    mockServiceCall()
    mockEntity()
  })

  afterEach(() => {
    dashboardActions.resetState()
  })

  const renderCard = (props: Partial<React.ComponentProps<typeof ButtonCard>> = {}) =>
    render(
      <Theme>
        <ButtonCard entityId="switch.coffee_maker" tier="row" {...props} />
      </Theme>
    )

  it('offers a reload from the disconnected state', async () => {
    const user = userEvent.setup()
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    })

    mockEntity('off', { isConnected: false })
    renderCard()

    expect(screen.getByText('Disconnected from Home Assistant')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(reload).toHaveBeenCalled()
  })

  it('clears a previous error before toggling again', async () => {
    const user = userEvent.setup()
    mockServiceCall({ error: 'toggle failed' })
    renderCard()

    // The error is what the card is showing; the next tap must not leave it up.
    expect(screen.getByText('ERROR')).toBeInTheDocument()
    await user.click(screen.getByText('Coffee Maker'))

    expect(clearError).toHaveBeenCalledTimes(1)
    expect(dispatchGuarded).toHaveBeenCalledWith({
      domain: 'switch',
      service: 'toggle',
      entityId: 'switch.coffee_maker',
    })
  })

  it('does not toggle while a call is in flight', async () => {
    const user = userEvent.setup()
    mockServiceCall({ loading: true })
    renderCard()

    await user.click(screen.getByText('Coffee Maker'))
    expect(dispatchGuarded).not.toHaveBeenCalled()
  })

  it('selects rather than toggles in edit mode', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    dashboardActions.setMode('edit')
    renderCard({ onSelect, isSelected: false })

    await user.click(screen.getByText('Coffee Maker'))

    expect(onSelect).toHaveBeenCalledWith(true)
    expect(dispatchGuarded).not.toHaveBeenCalled()
  })

  describe('configuration modal', () => {
    beforeEach(() => {
      dashboardActions.addScreen({
        id: 'screen-1',
        name: 'Main',
        slug: 'main',
        type: 'grid',
        grid: { resolution: { columns: 12, rows: 8 }, items: [] },
      })
      dashboardActions.setCurrentScreen('screen-1')
      dashboardActions.addGridItem('screen-1', ITEM)
      dashboardActions.setMode('edit')
    })

    it('opens from the edit-mode settings button and saves onto the placed item', async () => {
      const user = userEvent.setup()
      renderCard({ item: ITEM })

      await user.click(screen.getByRole('button', { name: /configure/i }))

      // The boolean control sits beside its label rather than being labelled by
      // it, so it is reached through the row the label heads.
      const confirmRow = screen.getByText('Confirm before switching').parentElement as HTMLElement
      await user.click(confirmRow.querySelector('button[role="switch"]') as HTMLElement)
      await user.click(screen.getByRole('button', { name: 'Save Changes' }))

      const saved = dashboardStore.state.screens[0].grid?.items[0]
      expect(saved?.config).toMatchObject({ confirm: true })
    })

    it('saves nothing when the item is no longer on a screen', async () => {
      const user = userEvent.setup()
      // The screen the item belonged to is gone — a stale card mid-delete.
      dashboardActions.removeScreen('screen-1')
      dashboardActions.setMode('edit')
      renderCard({ item: ITEM })

      await user.click(screen.getByRole('button', { name: /configure/i }))
      await user.click(screen.getByRole('button', { name: 'Save Changes' }))

      expect(dashboardStore.state.screens).toHaveLength(0)
    })
  })

  it('renders no modal for a card that is not a placed item', async () => {
    const user = userEvent.setup()
    dashboardActions.setMode('edit')
    renderCard()

    await user.click(screen.getByRole('button', { name: /configure/i }))
    expect(screen.queryByText('Card Configuration')).not.toBeInTheDocument()
  })
})
