import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { BinarySensorCard } from '../BinarySensorCard'
import { useEntity } from '~/hooks'
import { useDashboardStore } from '~/store'
import type { HassEntity } from '~/store/entityTypes'
import type { DashboardState } from '~/store/types'

vi.mock('~/hooks', () => ({
  useEntity: vi.fn(),
}))

vi.mock('~/store', () => ({
  useDashboardStore: vi.fn(),
  dashboardStore: { state: { currentScreenId: 'screen-1' } },
  dashboardActions: { updateGridItem: vi.fn() },
}))

/**
 * The design system resolves a binary sensor by its `device_class` rather than
 * by its domain, so which `--liebe-c-*` triplet a tripped sensor lands on is
 * behaviour worth pinning: a smoke alarm must not read the same as a doorbell.
 * The triplet is observable as `data-color` on the anatomy parts, which is the
 * stable selector contract themes key off.
 */
describe('BinarySensorCard domain colour', () => {
  function makeEntity(deviceClass: string | undefined, state = 'on'): HassEntity {
    return {
      entity_id: 'binary_sensor.test',
      state,
      attributes: {
        friendly_name: 'Test Sensor',
        ...(deviceClass ? { device_class: deviceClass } : {}),
      },
      last_changed: '2023-01-01T00:00:00Z',
      last_updated: '2023-01-01T00:00:00Z',
      context: { id: 'test', parent_id: null, user_id: null },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useDashboardStore).mockImplementation((selector) => {
      const state = { mode: 'view' } as Pick<DashboardState, 'mode'>
      return selector ? selector(state as DashboardState) : state
    })
  })

  function renderWith(deviceClass: string | undefined, state = 'on') {
    vi.mocked(useEntity).mockReturnValue({
      entity: makeEntity(deviceClass, state),
      isConnected: true,
      isLoading: false,
      isStale: false,
    })
    const { container } = render(<BinarySensorCard entityId="binary_sensor.test" />)
    return container.querySelector('.liebe-card') as HTMLElement
  }

  it.each(['carbon_monoxide', 'gas', 'heat', 'problem', 'safety', 'smoke', 'tamper'])(
    'reads a tripped %s sensor as an alert',
    (deviceClass) => {
      expect(renderWith(deviceClass)).toHaveAttribute('data-color', 'alert')
    }
  )

  it.each(['moisture', 'water'])('reads a tripped %s sensor as water', (deviceClass) => {
    expect(renderWith(deviceClass)).toHaveAttribute('data-color', 'water')
  })

  it.each(['door', 'motion', undefined])(
    'falls a %s sensor through to the generic active colour',
    (deviceClass) => {
      expect(renderWith(deviceClass)).toHaveAttribute('data-color', 'default')
    }
  )

  it('carries no active state while the sensor is clear', () => {
    const card = renderWith('smoke', 'off')

    // The triplet is still stamped — a theme can select on it either way — but
    // nothing is tinted, because an inactive part carries no state meaning.
    expect(card).toHaveAttribute('data-color', 'alert')
    expect(card).not.toHaveAttribute('data-active')
    expect(document.querySelector('.liebe-icon')).not.toHaveAttribute('data-active')
  })

  it('composes from the anatomy rather than from Radix text', () => {
    const card = renderWith('smoke')

    expect(card).toHaveAttribute('data-domain', 'binary_sensor')
    expect(card.querySelector('.liebe-icon')).toHaveAttribute('data-active', 'true')
    expect(card.querySelector('.liebe-name')).toHaveTextContent('Test Sensor')
    expect(card.querySelector('.liebe-state')).toHaveTextContent('ON')
  })
})
