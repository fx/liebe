import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@radix-ui/themes'
import { CardConfig } from '../CardConfig'
import { entityStore } from '~/store/entityStore'
import type { GridItem } from '~/store/types'
import type { HassEntity } from '~/store/entityTypes'

vi.mock('~/store', () => ({
  dashboardStore: { state: { mode: 'edit' }, setState: vi.fn() },
  dashboardActions: {},
  useDashboardStore: vi.fn((selector?: (state: { mode: string; screens: [] }) => unknown) => {
    const state = { mode: 'edit' as const, screens: [] as [] }
    return selector ? selector(state) : state
  }),
}))

/**
 * The fan card's configuration form (docs/specs/entity-cards/options/fan.md).
 *
 * Every control but the spin is capability-gated per common convention 3, and
 * that is the half worth pinning: an option the entity cannot use writes a key
 * nothing reads, which looks exactly like a setting that did nothing.
 */
const ENTITY_ID = 'fan.bedroom'

function seed(attributes: Record<string, unknown>) {
  const entity: HassEntity = {
    entity_id: ENTITY_ID,
    state: 'on',
    attributes: { friendly_name: 'Bedroom Fan', ...attributes } as HassEntity['attributes'],
    last_changed: '2026-07-27T10:00:00Z',
    last_updated: '2026-07-27T10:00:00Z',
    context: { id: 'ctx', parent_id: null, user_id: null },
  }

  entityStore.setState((state) => ({
    ...state,
    isConnected: true,
    isInitialLoading: false,
    entities: { [ENTITY_ID]: entity },
  }))
}

const item = (config: Record<string, unknown> = {}): GridItem => ({
  id: 'fan-1',
  type: 'entity',
  entityId: ENTITY_ID,
  x: 0,
  y: 0,
  width: 2,
  height: 2,
  config,
})

const renderModal = (gridItem: GridItem = item(), onSave = vi.fn()) => {
  render(
    <Theme>
      <CardConfig.Modal open onOpenChange={vi.fn()} item={gridItem} onSave={onSave} />
    </Theme>
  )
  return onSave
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

describe('fan card configuration form', () => {
  it('always offers the spin, which needs no capability', () => {
    seed({ supported_features: 0 })
    renderModal()

    expect(screen.getByText('Spin the icon')).toBeInTheDocument()
  })

  it('offers the speed options only to a fan that can set a speed', () => {
    seed({ supported_features: 1 })
    renderModal()

    expect(screen.getByText('Speed control')).toBeInTheDocument()
    expect(screen.getByText('Show speed in state')).toBeInTheDocument()
  })

  it('withholds them from a fan that cannot', () => {
    seed({ supported_features: 8, preset_modes: ['eco'] })
    renderModal()

    expect(screen.queryByText('Speed control')).not.toBeInTheDocument()
    expect(screen.queryByText('Show speed in state')).not.toBeInTheDocument()
  })

  it('offers the preset toggle only when the fan both advertises and lists modes', () => {
    seed({ supported_features: 9, preset_modes: ['auto', 'sleep'] })
    renderModal()

    expect(screen.getByText('Show preset modes')).toBeInTheDocument()
  })

  it('withholds it for the bit without a list', () => {
    // A fan can advertise `PRESET_MODE` and expose no modes; an option for a
    // control that would render empty is an option that does nothing.
    seed({ supported_features: 9, preset_modes: [] })
    renderModal()

    expect(screen.queryByText('Show preset modes')).not.toBeInTheDocument()
  })

  it('withholds it when the fan does not advertise presets at all', () => {
    seed({ supported_features: 1, preset_modes: ['auto'] })
    renderModal()

    expect(screen.queryByText('Show preset modes')).not.toBeInTheDocument()
  })

  it('offers oscillation and direction to the fans that have them', () => {
    seed({ supported_features: 7 })
    renderModal()

    expect(screen.getByText('Show oscillation toggle')).toBeInTheDocument()
    expect(screen.getByText('Show direction control')).toBeInTheDocument()
  })

  it('withholds each from a fan without its bit', () => {
    seed({ supported_features: 1 })
    renderModal()

    expect(screen.queryByText('Show oscillation toggle')).not.toBeInTheDocument()
    expect(screen.queryByText('Show direction control')).not.toBeInTheDocument()
  })

  it('writes a chosen speed style into the card’s config', async () => {
    const user = userEvent.setup()
    seed({ supported_features: 1 })
    const onSave = renderModal()

    // The select trigger carries no accessible name of its own, so it is found
    // by the label it sits beneath.
    const trigger = screen
      .getByText('Speed control')
      .parentElement!.querySelector('[role="combobox"]') as HTMLElement
    await user.click(trigger)
    await user.click(within(screen.getByRole('listbox')).getByText('Step buttons'))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(onSave).toHaveBeenCalledWith({ config: { speedControl: 'steps' } })
  })
})
