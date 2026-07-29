import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { CardConfig } from '../CardConfig'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import type { GridItem } from '~/store/types'
import type { HassEntity } from '~/store/entityTypes'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * The person card's configuration form
 * (docs/specs/entity-cards/options/person.md).
 *
 * One of its four controls is gated, and it is gated on something no other card
 * gates on: not this entity's own attributes but the **entity graph** — whether
 * a battery sensor sits on the device behind one of the person's trackers. So
 * the form has to reach the registry, and a person whose phone yields no battery
 * must not be offered a toggle that can never show anything.
 *
 * `batteryEntity` is deliberately NOT gated, and the asymmetry is the point: the
 * override exists for exactly the households where derivation fails, so gating
 * it on derivation would put it behind the condition it is meant to escape.
 */
const ENTITY_ID = 'person.jane_doe'
const TRACKER = 'device_tracker.jane_phone'
const SENSOR = 'sensor.jane_phone_battery'

vi.mock('~/store', () => ({
  dashboardStore: { state: { mode: 'edit' }, setState: vi.fn() },
  dashboardActions: {},
  useDashboardStore: vi.fn((selector?: (state: { mode: string; screens: [] }) => unknown) => {
    const state = { mode: 'edit' as const, screens: [] as [] }
    return selector ? selector(state) : state
  }),
}))

function seedPerson(trackers: string[]) {
  const entity: HassEntity = {
    entity_id: ENTITY_ID,
    state: 'home',
    attributes: {
      friendly_name: 'Jane Doe',
      device_trackers: trackers,
    } as HassEntity['attributes'],
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

/** A `hass` whose registry joins the tracker and a battery sensor, or does not. */
function hassWith({ linked }: { linked: boolean }): HomeAssistant {
  const hass = createMockHomeAssistant()
  hass.entities = linked
    ? {
        [TRACKER]: { entity_id: TRACKER, device_id: 'dev-phone' },
        [SENSOR]: { entity_id: SENSOR, device_id: 'dev-phone' },
      }
    : { [TRACKER]: { entity_id: TRACKER } }
  hass.states = {
    [TRACKER]: {
      entity_id: TRACKER,
      state: 'home',
      attributes: {},
      last_changed: '2026-07-29T10:00:00Z',
      last_updated: '2026-07-29T10:00:00Z',
      context: { id: 'ctx', parent_id: null, user_id: null },
    },
    [SENSOR]: {
      entity_id: SENSOR,
      state: '87',
      attributes: { device_class: 'battery' },
      last_changed: '2026-07-29T10:00:00Z',
      last_updated: '2026-07-29T10:00:00Z',
      context: { id: 'ctx', parent_id: null, user_id: null },
    },
  }
  return hass
}

const item = (config: Record<string, unknown> = {}): GridItem => ({
  id: 'person-1',
  type: 'entity',
  entityId: ENTITY_ID,
  x: 0,
  y: 0,
  width: 2,
  height: 1,
  config,
})

const renderModal = (hass: HomeAssistant, config: Record<string, unknown> = {}) => {
  render(
    <Theme>
      <HomeAssistantProvider hass={hass}>
        <CardConfig.Modal open onOpenChange={vi.fn()} item={item(config)} onSave={vi.fn()} />
      </HomeAssistantProvider>
    </Theme>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  entityStore.setState((state) => ({ ...state, entities: {} }))
})

describe('the person configuration form', () => {
  it('offers the battery toggle when a level derives from the tracker’s device', () => {
    seedPerson([TRACKER])
    renderModal(hassWith({ linked: true }))

    expect(screen.getByText('Show phone battery')).toBeInTheDocument()
  })

  it('hides the battery toggle when nothing derives', () => {
    // The common household: a tracker the registry does not join to a battery.
    // A control that can never show anything is a bug report waiting to happen.
    seedPerson([TRACKER])
    renderModal(hassWith({ linked: false }))

    expect(screen.queryByText('Show phone battery')).not.toBeInTheDocument()
  })

  it('hides it for a person with no trackers at all', () => {
    seedPerson([])
    renderModal(hassWith({ linked: true }))

    expect(screen.queryByText('Show phone battery')).not.toBeInTheDocument()
  })

  it('offers it again once a sensor is named, though nothing derives', () => {
    /*
     * The case the override exists for, and the reason the gate reads the stored
     * config rather than only the graph. Gating on derivation alone would make
     * the toggle unreachable exactly where somebody needs it — and the sensor
     * they named would then be read by a card whose option they cannot see.
     */
    seedPerson([TRACKER])
    renderModal(hassWith({ linked: false }), { batteryEntity: 'sensor.somewhere_else' })

    expect(screen.getByText('Show phone battery')).toBeInTheDocument()
  })

  it('always offers the sensor override itself', () => {
    // Never gated: it is the escape hatch, so it must be reachable in precisely
    // the state that hides everything else.
    seedPerson([])
    renderModal(hassWith({ linked: false }))

    expect(screen.getByText('Battery sensor')).toBeInTheDocument()
  })
})
