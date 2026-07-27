import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
 * The cover card's configuration form (docs/specs/entity-cards/options/cover.md).
 *
 * Three of its controls are capability-gated per common convention 3, and that
 * is the half worth pinning: a control the entity cannot use writes a key
 * nothing will read, which looks to a user exactly like a setting that did
 * nothing.
 */
const ENTITY_ID = 'cover.living_room_blinds'

function seed(attributes: Record<string, unknown>) {
  const entity: HassEntity = {
    entity_id: ENTITY_ID,
    state: 'open',
    attributes: { friendly_name: 'Blinds', ...attributes } as HassEntity['attributes'],
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
  id: 'cover-1',
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

describe('cover card configuration form', () => {
  it('offers the always-available options', () => {
    seed({ supported_features: 3 })
    renderModal()

    expect(screen.getByText('Show open / stop / close buttons')).toBeInTheDocument()
    expect(screen.getByText('Position display')).toBeInTheDocument()
    expect(screen.getByText('Icon from device class')).toBeInTheDocument()
  })

  it('offers the position options only to a cover that can be positioned', () => {
    seed({ supported_features: 4 })
    renderModal()

    expect(screen.getByText('Show position slider')).toBeInTheDocument()
    expect(screen.getByText('Reversed position scale')).toBeInTheDocument()
  })

  it('withholds them from a cover that cannot', () => {
    seed({ supported_features: 11 })
    renderModal()

    expect(screen.queryByText('Show position slider')).not.toBeInTheDocument()
    expect(screen.queryByText('Reversed position scale')).not.toBeInTheDocument()
  })

  it('offers the tilt option only to a cover with a tilt bit', () => {
    seed({ supported_features: 16 })
    renderModal()

    expect(screen.getByText('Show tilt controls')).toBeInTheDocument()
  })

  it('withholds it from a cover with none', () => {
    seed({ supported_features: 15 })
    renderModal()

    expect(screen.queryByText('Show tilt controls')).not.toBeInTheDocument()
  })

  it('offers the confirmation gate only to a perimeter opening', () => {
    seed({ supported_features: 3, device_class: 'garage' })
    renderModal()

    expect(screen.getByText('Confirm before opening')).toBeInTheDocument()
  })

  it('withholds it from every other device class', () => {
    seed({ supported_features: 3, device_class: 'blind' })
    renderModal()

    expect(screen.queryByText('Confirm before opening')).not.toBeInTheDocument()
  })

  it('writes an option into the card’s config', async () => {
    const user = userEvent.setup()
    seed({ supported_features: 255, device_class: 'garage' })
    const onSave = renderModal()

    // The boolean control's switch has no accessible name of its own, so it is
    // found by the label it sits beside.
    const toggle = screen
      .getByText('Reversed position scale')
      .parentElement!.querySelector('[role="switch"]')!
    await user.click(toggle)
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(onSave).toHaveBeenCalledWith({ config: { invertPosition: true } })
  })
})
