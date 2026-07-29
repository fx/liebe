import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { CardConfig } from '../CardConfig'
import { entityStore } from '~/store/entityStore'
import { ALARM_FEATURE } from '../AlarmCard/presentation'
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
 * The alarm card's configuration form
 * (docs/specs/entity-cards/options/security.md).
 *
 * Only one control is capability-gated, and it is gated by the card's OWN
 * resolver rather than a second predicate shaped like it — so the form cannot
 * offer a mode the card would then filter out at render time, which is how a
 * user ends up with a setting that did nothing.
 */
const ENTITY_ID = 'alarm_control_panel.house'

function seed(attributes: Record<string, unknown>) {
  const entity: HassEntity = {
    entity_id: ENTITY_ID,
    state: 'disarmed',
    attributes: { friendly_name: 'House Alarm', ...attributes } as HassEntity['attributes'],
    last_changed: '2026-07-29T10:00:00Z',
    last_updated: '2026-07-29T10:00:00Z',
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
  id: 'alarm-1',
  type: 'entity',
  entityId: ENTITY_ID,
  x: 0,
  y: 0,
  width: 3,
  height: 3,
  config,
})

const renderModal = (gridItem: GridItem = item()) => {
  render(
    <Theme>
      <CardConfig.Modal open onOpenChange={vi.fn()} item={gridItem} onSave={vi.fn()} />
    </Theme>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

describe('alarm card configuration form', () => {
  it('offers the always-available options', () => {
    seed({ supported_features: ALARM_FEATURE.ARM_AWAY })
    renderModal()

    expect(screen.getByText('Keypad')).toBeInTheDocument()
    expect(screen.getByText('Confirm before disarming')).toBeInTheDocument()
    expect(screen.getByText('Confirm before arming')).toBeInTheDocument()
    expect(screen.getByText('Flash when triggered')).toBeInTheDocument()
  })

  it('offers the arm modes to a panel that has some', () => {
    seed({ supported_features: ALARM_FEATURE.ARM_AWAY | ALARM_FEATURE.ARM_HOME })
    renderModal()

    expect(screen.getByText('Arm modes')).toBeInTheDocument()
  })

  it('withholds them from a panel advertising no arm bits', () => {
    // TRIGGER alone is not an arm mode, and a multi-select with nothing in it
    // is a control that cannot be used.
    seed({ supported_features: ALARM_FEATURE.TRIGGER })
    renderModal()

    expect(screen.queryByText('Arm modes')).not.toBeInTheDocument()
  })

  it('withholds them from a panel advertising nothing at all', () => {
    seed({})
    renderModal()

    expect(screen.queryByText('Arm modes')).not.toBeInTheDocument()
  })
})
