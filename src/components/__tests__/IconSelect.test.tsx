import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Theme } from '@radix-ui/themes'
import { IconSelect } from '../IconSelect'

const renderWithTheme = (component: React.ReactElement) => {
  return render(<Theme>{component}</Theme>)
}

describe('IconSelect', () => {
  it('renders with button trigger', () => {
    renderWithTheme(<IconSelect />)
    expect(screen.getByRole('button', { name: /select icon/i })).toBeInTheDocument()
  })

  it('renders with custom button label', () => {
    renderWithTheme(<IconSelect buttonLabel="Choose Icon" />)
    expect(screen.getByRole('button', { name: /choose icon/i })).toBeInTheDocument()
  })

  it('opens popover when button is clicked', async () => {
    renderWithTheme(<IconSelect />)
    const trigger = screen.getByRole('button', { name: /select icon/i })
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search icons...')).toBeInTheDocument()
    })
  })

  it('filters icons based on search input', async () => {
    renderWithTheme(<IconSelect />)

    // Open popover first
    const trigger = screen.getByRole('button', { name: /select icon/i })
    fireEvent.click(trigger)

    await waitFor(() => {
      const searchInput = screen.getByPlaceholderText('Search icons...')
      fireEvent.change(searchInput, { target: { value: 'light' } })
    })

    await waitFor(() => {
      // Should show filtered icons (bulb icons)
      expect(screen.getByTitle(/light on/i)).toBeInTheDocument()
      expect(screen.getByTitle(/light off/i)).toBeInTheDocument()
    })
  })

  it('shows no results message when search has no matches', async () => {
    renderWithTheme(<IconSelect />)

    // Open popover
    fireEvent.click(screen.getByRole('button', { name: /select icon/i }))

    await waitFor(() => {
      const searchInput = screen.getByPlaceholderText('Search icons...')
      fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } })
    })

    await waitFor(() => {
      expect(screen.getByText('No icons found matching "xyznonexistent"')).toBeInTheDocument()
    })
  })

  it('calls onChange when an icon is selected', async () => {
    const handleChange = vi.fn()
    renderWithTheme(<IconSelect onChange={handleChange} />)

    // Open popover
    fireEvent.click(screen.getByRole('button', { name: /select icon/i }))

    await waitFor(() => {
      // Click on the Home icon
      const homeIcon = screen.getByTitle(/^home$/i)
      fireEvent.click(homeIcon)
    })

    expect(handleChange).toHaveBeenCalledTimes(1)
    expect(handleChange).toHaveBeenCalledWith('Home')
  })

  it('displays selected icon in button', () => {
    renderWithTheme(<IconSelect value="Home" />)

    // Button should show "Home" text
    expect(screen.getByRole('button', { name: /home/i })).toBeInTheDocument()
  })

  it('displays icon count in popover', async () => {
    renderWithTheme(<IconSelect />)

    // Open popover
    fireEvent.click(screen.getByRole('button', { name: /select icon/i }))

    await waitFor(() => {
      // Should show the count of icons
      expect(screen.getByText(/\d+ of \d+ icons/)).toBeInTheDocument()
    })
  })

  it('shows clear button when value is selected', async () => {
    renderWithTheme(<IconSelect value="Home" />)

    // Open popover
    fireEvent.click(screen.getByRole('button', { name: /home/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument()
    })
  })

  it('closes popover after selecting an icon', async () => {
    const handleChange = vi.fn()
    renderWithTheme(<IconSelect onChange={handleChange} />)

    // Open popover
    fireEvent.click(screen.getByRole('button', { name: /select icon/i }))

    await waitFor(() => {
      const homeIcon = screen.getByTitle(/^home$/i)
      fireEvent.click(homeIcon)
    })

    // Popover should close, search field should not be visible
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search icons...')).not.toBeInTheDocument()
    })
  })
})
