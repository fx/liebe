import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
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
 * The weather card's configuration form (docs/specs/entity-cards/options/
 * weather.md).
 *
 * The options change 0020 adds, from the form's side: that they exist, that
 * they are offered to every weather entity rather than gated on what this one
 * happens to publish, and that what a user picks reaches `item.config` under the
 * key the card reads. A control writing a key nothing reads looks exactly like a
 * setting that did nothing.
 */

const ENTITY_ID = 'weather.home'

function seed(attributes: Record<string, unknown> = {}) {
  const entity: HassEntity = {
    entity_id: ENTITY_ID,
    state: 'rainy',
    attributes: {
      friendly_name: 'Home Weather',
      temperature: 22,
      temperature_unit: '°C',
      ...attributes,
    } as HassEntity['attributes'],
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

const item: GridItem = {
  id: 'weather-1',
  type: 'entity',
  entityId: ENTITY_ID,
  x: 0,
  y: 0,
  width: 4,
  height: 3,
  config: {},
}

function findSelectByLabel(labelText: string): HTMLElement {
  const label = screen.getByText(labelText)
  return label.parentElement!.querySelector('[role="combobox"]') as HTMLElement
}

const onSave = vi.fn()

function renderModal(config: Record<string, unknown> = {}) {
  return render(
    <Theme>
      <CardConfig.Modal
        open={true}
        onOpenChange={vi.fn()}
        item={{ ...item, config }}
        onSave={onSave}
      />
    </Theme>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  seed()
})

describe('the weather configuration form', () => {
  it('offers the whole option surface', () => {
    renderModal()

    expect(findSelectByLabel('Card Variant')).toBeTruthy()
    expect(findSelectByLabel('Temperature Unit')).toBeTruthy()
    expect(findSelectByLabel('Secondary Info')).toBeTruthy()
    expect(screen.getByText('Condition Background')).toBeInTheDocument()
    expect(screen.getByText('Hourly Forecast')).toBeInTheDocument()
    expect(screen.getByText('Daily Forecast')).toBeInTheDocument()
    expect(screen.getByText('Hours Shown')).toBeInTheDocument()
    expect(screen.getByText('Days Shown')).toBeInTheDocument()
  })

  it('bounds the two counts at the option doc’s range', () => {
    renderModal()

    // The form cannot express a count the card would clamp, so a user never
    // sets one that renders as something else.
    const hours = screen.getByText('Hours Shown').parentElement!.querySelector('input')!
    expect(hours).toHaveAttribute('min', '1')
    expect(hours).toHaveAttribute('max', '12')

    const days = screen.getByText('Days Shown').parentElement!.querySelector('input')!
    expect(days).toHaveAttribute('min', '1')
    expect(days).toHaveAttribute('max', '7')
  })

  it('saves a forecast count under the key the card reads', async () => {
    const user = userEvent.setup()
    renderModal()

    const hours = screen.getByText('Hours Shown').parentElement!.querySelector('input')!
    // `change` rather than `clear` + `type`: the shared number control resolves
    // an empty field back to the option's default as you type, so clearing it
    // first would leave "4" in place and the typed digit would extend it.
    fireEvent.change(hours, { target: { value: '8' } })
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(onSave).toHaveBeenCalledWith({ config: { forecastHours: 8 } })
  })

  it('saves a forecast section being switched off', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(within(screen.getByText('Daily Forecast').parentElement!).getByRole('switch'))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(onSave).toHaveBeenCalledWith({ config: { showDailyForecast: false } })
  })

  it('shows each option’s stored value rather than its default', () => {
    renderModal({ variant: 'minimal', secondaryInfo: 'pressure' })

    expect(findSelectByLabel('Card Variant')).toHaveTextContent('Minimal')
    expect(findSelectByLabel('Secondary Info')).toHaveTextContent('Pressure')
  })

  it('offers the five secondary readings the option doc names', async () => {
    const user = userEvent.setup()
    renderModal()

    await user.click(findSelectByLabel('Secondary Info'))
    const dropdown = screen.getByRole('listbox')

    for (const label of ['Humidity', 'Wind', 'Feels like', 'UV index', 'Pressure']) {
      expect(within(dropdown).getByText(label)).toBeInTheDocument()
    }
  })

  it('saves the chosen secondary reading under the key the card reads', async () => {
    const user = userEvent.setup()
    renderModal({ variant: 'default' })

    await user.click(findSelectByLabel('Secondary Info'))
    await user.click(within(screen.getByRole('listbox')).getByText('Wind'))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(onSave).toHaveBeenCalledWith({ config: { variant: 'default', secondaryInfo: 'wind' } })
  })

  it('saves the condition background toggle', async () => {
    const user = userEvent.setup()
    renderModal()

    // Defaults on, so one click is the "turn the artwork off" case — the one
    // that has to persist, since an absent key means "on". Reached through its
    // own label's row: the universal display options put two more switches on
    // this form.
    await user.click(
      within(screen.getByText('Condition Background').parentElement!).getByRole('switch')
    )
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(onSave).toHaveBeenCalledWith({ config: { showConditionBackground: false } })
  })

  it('offers both new options whatever the entity publishes', () => {
    /*
     * Deliberately not entity-gated (common convention 3 gates on capability,
     * and these are presentation): `secondaryInfo` resolves an attribute the
     * entity lacks through its fallback chain, so withholding the control from
     * an entity with no `uv_index` today would withhold it from one whose
     * integration starts publishing it tomorrow.
     */
    seed({ humidity: undefined, wind_speed: undefined })
    renderModal()

    expect(findSelectByLabel('Secondary Info')).toBeTruthy()
    expect(screen.getByText('Condition Background')).toBeInTheDocument()
  })
})
