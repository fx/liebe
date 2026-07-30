import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
 * The shared slider-placement row on the three forms that offer it
 * (docs/specs/entity-cards/options/common.md — "Shared slider placement").
 *
 * One row, three cards, and the half worth pinning is the capability gate:
 * common convention 3 says an option may only tune something the entity can
 * actually do, and a placement select on a card that renders no slider is a
 * setting whose every value is a no-op — which looks exactly like an option
 * that is broken. Each card answers with its own predicate, the same one the
 * card renders by, so the form and the card cannot disagree.
 */

function seed(entityId: string, attributes: Record<string, unknown>) {
  const entity: HassEntity = {
    entity_id: entityId,
    state: 'on',
    attributes: { friendly_name: 'Fixture', ...attributes } as HassEntity['attributes'],
    last_changed: '2026-07-30T10:00:00Z',
    last_updated: '2026-07-30T10:00:00Z',
    context: { id: 'ctx', parent_id: null, user_id: null },
  }

  entityStore.setState((state) => ({
    ...state,
    isConnected: true,
    isInitialLoading: false,
    entities: { [entityId]: entity },
  }))
}

const item = (entityId: string): GridItem => ({
  id: 'placement-item',
  type: 'entity',
  entityId,
  x: 0,
  y: 0,
  width: 2,
  height: 2,
  config: {},
})

function renderModal(entityId: string) {
  render(
    <Theme>
      <CardConfig.Modal open onOpenChange={vi.fn()} item={item(entityId)} onSave={vi.fn()} />
    </Theme>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

describe('the slider-placement row', () => {
  it('is offered to a dimmable light', () => {
    seed('light.reading', { supported_color_modes: ['brightness'] })
    renderModal('light.reading')

    expect(screen.getByText('Brightness slider placement')).toBeInTheDocument()
  })

  it('is withheld from a light that cannot dim', () => {
    // An `onoff` bulb renders no brightness slider in any tier, so every value
    // of this select would write a key nothing reads.
    seed('light.porch', { supported_color_modes: ['onoff'], supported_features: 0 })
    renderModal('light.porch')

    expect(screen.queryByText('Brightness slider placement')).not.toBeInTheDocument()
  })

  it('is offered to a cover that can be set to a position', () => {
    // OPEN + CLOSE + SET_POSITION + STOP.
    seed('cover.blind', { supported_features: 15 })
    renderModal('cover.blind')

    expect(screen.getByText('Position slider placement')).toBeInTheDocument()
  })

  it('is withheld from a cover that only opens and closes', () => {
    seed('cover.shutter', { supported_features: 11 })
    renderModal('cover.shutter')

    expect(screen.queryByText('Position slider placement')).not.toBeInTheDocument()
  })

  it('is offered to a fan that can set a speed', () => {
    seed('fan.bedroom', { supported_features: 1 })
    renderModal('fan.bedroom')

    expect(screen.getByText('Speed slider placement')).toBeInTheDocument()
  })

  it('is withheld from a fan that cannot', () => {
    seed('fan.extractor', { supported_features: 8, preset_modes: ['eco'] })
    renderModal('fan.extractor')

    expect(screen.queryByText('Speed slider placement')).not.toBeInTheDocument()
  })
})
