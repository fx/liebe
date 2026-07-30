import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Keypad, readCodeFormat } from '..'

/**
 * The code collector on its own — a dumb component, and the tests are about
 * what it refuses to do as much as what it does.
 */
describe('Keypad', () => {
  const button = (name: string) => screen.getByRole('button', { name })

  describe('the digit pad', () => {
    it('collects digits and hands them over on submit', () => {
      const onSubmit = vi.fn()
      render(<Keypad format="number" actionLabel="Disarm" onSubmit={onSubmit} onCancel={vi.fn()} />)

      for (const digit of ['1', '2', '3', '4']) fireEvent.click(button(digit))
      fireEvent.click(button('Disarm'))

      expect(onSubmit).toHaveBeenCalledWith('1234')
    })

    it('collects a zero, which is not a digit the grid lays out with the rest', () => {
      const onSubmit = vi.fn()
      render(<Keypad format="number" actionLabel="Arm" onSubmit={onSubmit} onCancel={vi.fn()} />)

      fireEvent.click(button('1'))
      fireEvent.click(button('0'))
      fireEvent.click(button('Arm'))

      expect(onSubmit).toHaveBeenCalledWith('10')
    })

    it('drops the last digit on backspace', () => {
      const onSubmit = vi.fn()
      render(<Keypad format="number" actionLabel="Arm" onSubmit={onSubmit} onCancel={vi.fn()} />)

      for (const digit of ['1', '2', '3']) fireEvent.click(button(digit))
      fireEvent.click(button('Backspace'))
      fireEvent.click(button('Arm'))

      expect(onSubmit).toHaveBeenCalledWith('12')
    })

    it('empties the entry on clear', () => {
      const onSubmit = vi.fn()
      render(<Keypad format="number" actionLabel="Arm" onSubmit={onSubmit} onCancel={vi.fn()} />)

      for (const digit of ['1', '2', '3']) fireEvent.click(button(digit))
      fireEvent.click(button('Clear'))

      expect(screen.getByTestId('code-keypad-readout').textContent?.trim()).toBe('')

      fireEvent.click(button('Arm'))
      expect(onSubmit).toHaveBeenCalledWith('')
    })

    it('backspaces harmlessly on an empty entry', () => {
      const onSubmit = vi.fn()
      render(<Keypad format="number" actionLabel="Arm" onSubmit={onSubmit} onCancel={vi.fn()} />)

      fireEvent.click(button('Backspace'))
      fireEvent.click(button('Arm'))

      expect(onSubmit).toHaveBeenCalledWith('')
    })

    it('never shows the digits it collected', () => {
      render(<Keypad format="number" actionLabel="Disarm" onSubmit={vi.fn()} onCancel={vi.fn()} />)

      for (const digit of ['9', '8', '7']) fireEvent.click(button(digit))

      const readout = screen.getByTestId('code-keypad-readout')
      expect(readout.textContent).toBe('•••')
      // The length is announced; the code is not.
      expect(readout).toHaveAttribute('aria-label', '3 digits entered')
    })
  })

  describe('the text field', () => {
    it('collects a typed code and masks it in the DOM', () => {
      const onSubmit = vi.fn()
      render(<Keypad format="text" actionLabel="Disarm" onSubmit={onSubmit} onCancel={vi.fn()} />)

      const field = screen.getByLabelText('Code')
      // `password`, so the value is not in the accessibility tree in clear.
      expect(field).toHaveAttribute('type', 'password')

      fireEvent.change(field, { target: { value: 'open sesame' } })
      fireEvent.click(button('Disarm'))

      expect(onSubmit).toHaveBeenCalledWith('open sesame')
    })

    it('renders no digit pad', () => {
      render(<Keypad format="text" actionLabel="Disarm" onSubmit={vi.fn()} onCancel={vi.fn()} />)

      expect(screen.queryByTestId('code-keypad-readout')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '1' })).not.toBeInTheDocument()
    })
  })

  it('submits at most once per open', () => {
    // The guarantee is about the gesture rather than the request: this
    // component never learns whether the call succeeded.
    const onSubmit = vi.fn()
    render(<Keypad format="number" actionLabel="Disarm" onSubmit={onSubmit} onCancel={vi.fn()} />)

    fireEvent.click(button('1'))
    const submit = button('Disarm')
    fireEvent.click(submit)
    fireEvent.click(submit)
    fireEvent.click(submit)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(submit).toBeDisabled()
  })

  it('cancels without submitting anything', () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    render(<Keypad format="number" actionLabel="Disarm" onSubmit={onSubmit} onCancel={onCancel} />)

    fireEvent.click(button('1'))
    fireEvent.click(button('Cancel'))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('readCodeFormat', () => {
  it.each([
    ['number', 'number'],
    ['text', 'text'],
    [null, undefined],
    [undefined, undefined],
    ['', undefined],
    ['^\\d{4}$', undefined],
    [4, undefined],
  ])('reads code_format %j as %j', (raw, expected) => {
    expect(readCodeFormat({ code_format: raw })).toBe(expected)
  })

  it('reads a missing attribute bag as no code format', () => {
    // The lock's ordinary case: `LockEntity` publishes `code_format` only when
    // an integration sets one, so absent must mean the same as `null` — a lock
    // that wants no code, which behaves exactly as it did before codes existed.
    expect(readCodeFormat(undefined)).toBeUndefined()
    expect(readCodeFormat({})).toBeUndefined()
  })
})
