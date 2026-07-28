import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { ClimatePillRow, humanizeMode } from '../ClimatePillRow'

/**
 * The free-form mode row — presets and fan speeds — on its own.
 *
 * Its callers gate on capability before rendering it, so the empty case is
 * unreachable through a card; it is asserted directly because the guard is what
 * keeps a future caller from rendering a pill group with nothing in it, which
 * is a control that is not one.
 */
describe('ClimatePillRow', () => {
  const renderRow = (options: string[], active?: string, onSelect = vi.fn()) => {
    render(
      <Theme>
        <ClimatePillRow
          label="Preset mode"
          options={options}
          active={active}
          disabled={false}
          onSelect={onSelect}
        />
      </Theme>
    )
    return onSelect
  }

  it('renders one pill per option, marking the active one', () => {
    renderRow(['eco', 'comfort'], 'comfort')

    const group = screen.getByRole('group', { name: 'Preset mode' })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /comfort/i })).toHaveAttribute('data-active', 'true')
    expect(screen.getByRole('button', { name: /eco/i })).not.toHaveAttribute('data-active', 'true')
  })

  it('sends the stored value, not the label it shows', () => {
    // The pill reads "Fan only"; the service still gets `fan_only`.
    const onSelect = renderRow(['fan_only'])

    fireEvent.click(screen.getByRole('button', { name: /fan only/i }))

    expect(onSelect).toHaveBeenCalledWith('fan_only')
  })

  it('renders nothing at all rather than an empty group', () => {
    renderRow([])

    expect(screen.queryByRole('group', { name: 'Preset mode' })).not.toBeInTheDocument()
  })
})

describe('humanizeMode', () => {
  it('title-cases a mode and spaces its underscores', () => {
    expect(humanizeMode('eco')).toBe('Eco')
    expect(humanizeMode('fan_only')).toBe('Fan only')
  })
})
