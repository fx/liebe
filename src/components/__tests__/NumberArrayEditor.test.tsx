import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen } from '@testing-library/react'
import { NumberArrayEditor } from '../NumberArrayEditor'

/**
 * The editor behind list-of-number options such as the light card's
 * `brightnessPresets`.
 *
 * It emits only values its entry schema accepts, and it never rewrites the list
 * it was handed: an entry this build ignores is shown as ignored and survives an
 * edit to the entries around it (docs/specs/dashboard-config/index.md —
 * "Forward Compatibility").
 */
describe('NumberArrayEditor', () => {
  const onChange = vi.fn()

  function renderEditor(props: Partial<React.ComponentProps<typeof NumberArrayEditor>> = {}) {
    return render(
      <Theme>
        <NumberArrayEditor
          label="Brightness presets"
          value={[]}
          min={1}
          max={100}
          integer
          unit="%"
          onChange={onChange}
          {...props}
        />
      </Theme>
    )
  }

  function addField() {
    return screen.getByLabelText('Brightness presets to add')
  }

  function type(value: string) {
    fireEvent.change(addField(), { target: { value } })
  }

  beforeEach(() => {
    onChange.mockClear()
  })

  it('says an empty list renders nothing, and appends the first value', () => {
    renderEditor()
    expect(screen.getByText('Nothing set — the card renders no values.')).toBeInTheDocument()
    expect(addField()).toHaveAttribute('placeholder', 'Add a value')

    type('50')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(onChange).toHaveBeenCalledWith([50])
  })

  it('appends to the end rather than sorting — stored order is the render order', () => {
    renderEditor({ value: [100, 20] })

    type('50')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(onChange).toHaveBeenCalledWith([100, 20, 50])
  })

  it('adds on Enter, and ignores every other key', () => {
    renderEditor()

    type('20')
    fireEvent.keyDown(addField(), { key: 'a' })
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.keyDown(addField(), { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith([20])
  })

  it('refuses an empty entry, and says so where the field is', () => {
    renderEditor()
    expect(addField()).toHaveAttribute('aria-invalid', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    // A refusal nothing announces is a button that silently does nothing.
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a number to add.')
    expect(addField()).toHaveAttribute('aria-invalid', 'true')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('refuses a value the entry schema rejects, reporting what the schema said', () => {
    renderEditor()

    type('150')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByText(/less than or equal to 100/i)).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('refuses a duplicate rather than silently collapsing it', () => {
    renderEditor({ value: [20] })

    type('20')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByText('20% is already in the list.')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('accepts a fractional value when the option sets no bounds', () => {
    renderEditor({
      min: undefined,
      max: undefined,
      integer: undefined,
      unit: undefined,
      step: 0.5,
    })
    expect(addField()).toHaveAttribute('step', '0.5')

    type('3.5')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(onChange).toHaveBeenCalledWith([3.5])
  })

  it('removes the tapped value by position', () => {
    renderEditor({ value: [20, 50, 100] })

    fireEvent.click(screen.getByRole('button', { name: 'Remove 50%' }))

    expect(onChange).toHaveBeenCalledWith([20, 100])
  })

  it('shows entries it cannot use as ignored, and keeps them through an edit', () => {
    renderEditor({ value: [150, 'ten', 20] })

    expect(screen.getByRole('button', { name: 'Remove 150%' })).toHaveTextContent('(ignored)')
    expect(screen.getByRole('button', { name: 'Remove ten' })).toHaveTextContent('(ignored)')
    expect(
      screen.getByText(
        'Greyed values stay in the configuration but are skipped when the card renders.'
      )
    ).toBeInTheDocument()

    // Removing a usable entry must not take the unusable ones with it: they are
    // somebody's configuration, not this build's to tidy.
    fireEvent.click(screen.getByRole('button', { name: 'Remove 20%' }))
    expect(onChange).toHaveBeenCalledWith([150, 'ten'])
  })

  it('reads a stored value that is not a list as empty, and writes nothing', () => {
    renderEditor({ value: '20,50' })

    expect(screen.getByText('Nothing set — the card renders no values.')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('uses the caller’s placeholder, and swaps the description for an error', () => {
    renderEditor({ placeholder: 'Add a percentage', description: 'Shown as pills on full cards.' })
    expect(addField()).toHaveAttribute('placeholder', 'Add a percentage')
    expect(screen.getByText('Shown as pills on full cards.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.queryByText('Shown as pills on full cards.')).not.toBeInTheDocument()
    expect(screen.getByText('Enter a number to add.')).toBeInTheDocument()
  })
})
