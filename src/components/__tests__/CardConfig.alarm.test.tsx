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

  describe('the choices inside the control', () => {
    /*
     * `requires` decides whether the control exists; this decides what is in
     * it, and they are different questions. A panel supporting only `away` has
     * *some* arm mode, so the control renders — and offering all four there
     * would let a user configure `vacation`, whereupon the card correctly
     * refuses to render it and the result reads as the card being broken rather
     * than the panel being incapable.
     */
    it('offers only the modes the panel can actually arm to', () => {
      seed({ supported_features: ALARM_FEATURE.ARM_AWAY | ALARM_FEATURE.ARM_NIGHT })
      renderModal()

      expect(screen.getByText('Arm modes')).toBeInTheDocument()
      expect(screen.getByText('Arm away')).toBeInTheDocument()
      expect(screen.getByText('Arm night')).toBeInTheDocument()
      expect(screen.queryByText('Arm vacation')).not.toBeInTheDocument()
      expect(screen.queryByText('Arm home')).not.toBeInTheDocument()
    })

    it('offers all four to a panel that supports all four', () => {
      seed({
        supported_features:
          ALARM_FEATURE.ARM_AWAY |
          ALARM_FEATURE.ARM_HOME |
          ALARM_FEATURE.ARM_NIGHT |
          ALARM_FEATURE.ARM_VACATION,
      })
      renderModal()

      for (const label of ['Arm away', 'Arm home', 'Arm night', 'Arm vacation']) {
        expect(screen.getByText(label)).toBeInTheDocument()
      }
    })

    it('does not offer custom bypass, which the panel supports but this card does not', () => {
      // Capability is necessary, not sufficient: `armed_custom_bypass` is a real
      // HA arm service the option surface deliberately defers, so narrowing
      // filters the definition's list rather than rebuilding it from the
      // entity's bits.
      seed({ supported_features: ALARM_FEATURE.ARM_AWAY | ALARM_FEATURE.ARM_CUSTOM_BYPASS })
      renderModal()

      expect(screen.getByText('Arm away')).toBeInTheDocument()
      expect(screen.queryByText(/custom bypass/i)).not.toBeInTheDocument()
    })
  })
})
