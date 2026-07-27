import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import type { HassEntity } from '~/store/entityTypes'
import type { GridItem } from '~/store/types'
import { CardConfig } from '../CardConfig'

/**
 * Which climate options the configuration form offers, which is a question
 * about the *entity* rather than about the card.
 *
 * An option whose control writes a key nothing will read looks like a setting
 * that did nothing (common contract, convention 3), so the three
 * capability-gated toggles are hidden for a thermostat that cannot use them —
 * and shown for one that can.
 */

const ENTITY = 'climate.hallway'

function thermostat(attributes: Record<string, unknown> = {}): HassEntity {
  return {
    entity_id: ENTITY,
    state: 'heat',
    attributes: {
      friendly_name: 'Hallway',
      temperature: 21,
      hvac_modes: ['off', 'heat'],
      supported_features: 1,
      ...attributes,
    } as HassEntity['attributes'],
    last_changed: '2024-01-01T00:00:00Z',
    last_updated: '2024-01-01T00:00:00Z',
    context: { id: 'ctx', parent_id: null, user_id: null },
  }
}

const item: GridItem = {
  id: 'item-1',
  type: 'entity',
  entityId: ENTITY,
  x: 0,
  y: 0,
  width: 3,
  height: 3,
}

function seed(entity: HassEntity) {
  entityStore.setState((state) => ({
    ...state,
    isConnected: true,
    isInitialLoading: false,
    entities: { [entity.entity_id]: entity },
    staleEntities: new Set<string>(),
  }))
}

/**
 * Through the modal, which is the only way the form is ever reached — it is
 * what resolves the card type and applies the per-option requirements.
 */
function renderForm() {
  return render(
    <Theme>
      <CardConfig.Modal open onOpenChange={vi.fn()} item={item} onSave={vi.fn()} />
    </Theme>
  )
}

beforeEach(() => dashboardActions.resetState())

afterEach(() => {
  dashboardActions.resetState()
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

describe('climate card configuration', () => {
  it('offers the options every thermostat can use', () => {
    seed(thermostat())

    renderForm()

    expect(screen.getByText('Temperature control')).toBeInTheDocument()
    expect(screen.getByText('Show mode pills')).toBeInTheDocument()
    expect(screen.getByText('Show current temperature')).toBeInTheDocument()
    expect(screen.getByText('Temperature Unit')).toBeInTheDocument()
  })

  it('hides the presets, fan modes and humidity a plain thermostat cannot use', () => {
    seed(thermostat())

    renderForm()

    expect(screen.queryByText('Show preset pills')).not.toBeInTheDocument()
    expect(screen.queryByText('Show fan-mode pills')).not.toBeInTheDocument()
    expect(screen.queryByText('Show humidity')).not.toBeInTheDocument()
  })

  it('offers presets to a thermostat advertising them with a list to choose from', () => {
    seed(thermostat({ supported_features: 17, preset_modes: ['eco', 'away'] }))

    renderForm()

    expect(screen.getByText('Show preset pills')).toBeInTheDocument()
    expect(screen.queryByText('Show fan-mode pills')).not.toBeInTheDocument()
  })

  it('withholds presets from a thermostat that advertises them and lists none', () => {
    seed(thermostat({ supported_features: 17, preset_modes: [] }))

    renderForm()

    expect(screen.queryByText('Show preset pills')).not.toBeInTheDocument()
  })

  it('offers fan modes on the same terms', () => {
    seed(thermostat({ supported_features: 9, fan_modes: ['auto', 'low'] }))

    renderForm()

    expect(screen.getByText('Show fan-mode pills')).toBeInTheDocument()
  })

  it('offers humidity only where the thermostat reports one', () => {
    seed(thermostat({ current_humidity: 44 }))

    renderForm()

    expect(screen.getByText('Show humidity')).toBeInTheDocument()
  })
})
