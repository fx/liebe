import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen } from '@testing-library/react'
import { OrderedMultiSelect } from '../OrderedMultiSelect'

/**
 * The control behind options that are an ordered subset of a canonical enum,
 * such as the alarm card's `armModes` — where the first entry is also the mode
 * the single-pill tiers offer, so arranging matters as much as selecting.
 *
 * A stored value the caller did not offer — a mode from a newer build, or one
 * the entity's `supported_features` no longer advertises — stays where it is
 * (docs/specs/dashboard-config/index.md — "Forward Compatibility").
 */
describe('OrderedMultiSelect', () => {
  const onChange = vi.fn()

  const ARM_MODE_OPTIONS = [
    { value: 'away', label: 'Away' },
    { value: 'home', label: 'Home' },
    { value: 'night', label: 'Night' },
    { value: 'vacation', label: 'Vacation' },
  ]

  function renderControl(props: Partial<React.ComponentProps<typeof OrderedMultiSelect>> = {}) {
    return render(
      <Theme>
        <OrderedMultiSelect
          label="Arm modes"
          value={[]}
          options={ARM_MODE_OPTIONS}
          onChange={onChange}
          {...props}
        />
      </Theme>
    )
  }

  beforeEach(() => {
    onChange.mockClear()
  })

  it('says an empty selection shows nothing, and appends what is added', () => {
    renderControl()
    expect(screen.getByText('Nothing selected — the card shows none of these.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add Night' }))

    expect(onChange).toHaveBeenCalledWith(['night'])
  })

  it('offers only what is not already selected, and nothing once all of it is', () => {
    const { rerender } = renderControl({ value: ['away', 'home'] })
    expect(screen.queryByRole('button', { name: 'Add Away' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Night' })).toBeInTheDocument()

    rerender(
      <Theme>
        <OrderedMultiSelect
          label="Arm modes"
          value={['away', 'home', 'night', 'vacation']}
          options={ARM_MODE_OPTIONS}
          onChange={onChange}
        />
      </Theme>
    )

    expect(screen.queryByRole('button', { name: /^Add / })).not.toBeInTheDocument()
  })

  it('moves an entry through the order, with the ends fixed', () => {
    renderControl({ value: ['away', 'home', 'night'] })

    expect(screen.getByRole('button', { name: 'Move Away up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Night down' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Move Night up' }))
    expect(onChange).toHaveBeenLastCalledWith(['away', 'night', 'home'])

    fireEvent.click(screen.getByRole('button', { name: 'Move Away down' }))
    expect(onChange).toHaveBeenLastCalledWith(['home', 'away', 'night'])
  })

  it('removes an entry by position', () => {
    renderControl({ value: ['away', 'home'] })

    fireEvent.click(screen.getByRole('button', { name: 'Remove Away' }))

    expect(onChange).toHaveBeenCalledWith(['home'])
  })

  it('keeps a stored value it was not offered, in place and still editable', () => {
    renderControl({ value: ['away', 'armed_custom_bypass'] })

    const kept = screen.getByRole('button', { name: 'Move armed_custom_bypass up' })
    expect(kept).toBeInTheDocument()
    expect(screen.getByText(/armed_custom_bypass \(not available\)/)).toBeInTheDocument()

    // Editing around it must not drop it — the user removes it deliberately or
    // it stays in the config.
    fireEvent.click(kept)
    expect(onChange).toHaveBeenLastCalledWith(['armed_custom_bypass', 'away'])

    fireEvent.click(screen.getByRole('button', { name: 'Add Night' }))
    expect(onChange).toHaveBeenLastCalledWith(['away', 'armed_custom_bypass', 'night'])
  })

  it('reads a stored value that is not a list as nothing selected, and writes nothing', () => {
    renderControl({ value: 'away' })

    expect(screen.getByText('Nothing selected — the card shows none of these.')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('renders its description when given one', () => {
    renderControl({ description: 'The first mode is the one small cards offer.' })
    expect(screen.getByText('The first mode is the one small cards offer.')).toBeInTheDocument()
  })
})
