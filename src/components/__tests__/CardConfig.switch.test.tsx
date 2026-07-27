import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@radix-ui/themes'
import { CardConfig } from '../CardConfig'
import { getCardType } from '../configurations/cardConfigurations'
import { resolveCardType } from '../cardDomains'
import type { GridItem } from '~/store/types'

vi.mock('~/store', () => ({
  dashboardStore: { state: { mode: 'edit' }, setState: vi.fn() },
  dashboardActions: {},
  useDashboardStore: vi.fn((selector?: (state: { mode: string; screens: [] }) => unknown) => {
    const state = { mode: 'edit' as const, screens: [] as [] }
    return selector ? selector(state) : state
  }),
}))

/**
 * Configuration routing for the card that renders every unmapped domain, and
 * the two flat controls behind its one nested option
 * (docs/changes/0022 — "Fallback config routing", "`stateLabels` as two flat
 * form fields").
 */
describe('resolveCardType', () => {
  it('keeps a domain that has its own card', () => {
    expect(resolveCardType('light.desk')).toBe('light')
    expect(resolveCardType('input_datetime.alarm')).toBe('input_datetime')
  })

  it('routes an unmapped domain to the fallback card’s options', () => {
    expect(resolveCardType('siren.garage')).toBe('switch')
    expect(resolveCardType('lawn_mower.rover')).toBe('switch')
  })

  it('has nothing to resolve without an entity', () => {
    expect(resolveCardType(undefined)).toBeUndefined()
    expect(getCardType({})).toBeUndefined()
  })
})

describe('switch card configuration form', () => {
  const item = (entityId: string, config: Record<string, unknown> = {}): GridItem => ({
    id: 'item-1',
    type: 'entity',
    entityId,
    x: 0,
    y: 0,
    width: 2,
    height: 1,
    config,
  })

  const renderModal = (gridItem: GridItem, onSave = vi.fn()) => {
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

  it('offers the switch options to a switch card', () => {
    renderModal(item('switch.well_pump'))

    expect(screen.getByText('Confirm before switching')).toBeInTheDocument()
    expect(screen.getByText('Icon from device class')).toBeInTheDocument()
    expect(screen.getByText('Label when on')).toBeInTheDocument()
    expect(screen.getByText('Show time in state')).toBeInTheDocument()
  })

  it('offers the same options to an unmapped domain, which renders the same card', () => {
    // The bug this closes: a `siren` card rendered `ButtonCard` and then said it
    // had no configuration at all.
    renderModal(item('siren.garage'))

    expect(screen.queryByText(/No configuration options available/)).not.toBeInTheDocument()
    expect(screen.getByText('Confirm before switching')).toBeInTheDocument()
  })

  it('writes a label into the nested key without disturbing its sibling', async () => {
    const user = userEvent.setup()
    const onSave = renderModal(item('switch.coffee_maker', { stateLabels: { offLabel: 'Idle' } }))

    const onLabel = screen.getByPlaceholderText('ON')
    await user.type(onLabel, 'Brewing')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(onSave).toHaveBeenCalledWith({
      config: { stateLabels: { offLabel: 'Idle', onLabel: 'Brewing' } },
    })
  })

  it('creates the nested key when the card has never had one', async () => {
    const user = userEvent.setup()
    const onSave = renderModal(item('switch.coffee_maker'))

    await user.type(screen.getByPlaceholderText('OFF'), 'Idle')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(onSave).toHaveBeenCalledWith({ config: { stateLabels: { offLabel: 'Idle' } } })
  })

  it('seeds each control from the stored nested value', () => {
    renderModal(
      item('switch.coffee_maker', { stateLabels: { onLabel: 'Brewing', offLabel: 'Idle' } })
    )

    expect(screen.getByPlaceholderText('ON')).toHaveValue('Brewing')
    expect(screen.getByPlaceholderText('OFF')).toHaveValue('Idle')
  })
})
