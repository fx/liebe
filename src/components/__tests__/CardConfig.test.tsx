import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardConfig } from '../CardConfig'
import { Theme } from '@radix-ui/themes'
import type { GridItem } from '~/store/types'

// Mock the store
vi.mock('~/store', () => ({
  dashboardStore: {
    state: { mode: 'edit' },
    setState: vi.fn(),
  },
  dashboardActions: {},
  useDashboardStore: vi.fn(() => ({ mode: 'edit' })),
}))

// Mock WeatherCard to avoid entity dependencies
vi.mock('../WeatherCard', () => ({
  WeatherCard: ({ config }: { config: Record<string, unknown> }) => (
    <div data-testid="weather-card-preview">
      Weather Card - Variant: {config.variant || 'default'}
    </div>
  ),
}))

// Helper function to find select trigger by label text
function findSelectByLabel(labelText: string) {
  const label = screen.getByText(labelText)
  // Navigate from label to the select trigger
  // The structure is: Flex > Text (label) + Select.Root > Select.Trigger
  const selectContainer = label.parentElement
  const trigger = selectContainer?.querySelector('[role="combobox"]') as HTMLElement
  return trigger
}

describe('CardConfig', () => {
  const mockOnSave = vi.fn()
  const mockOnOpenChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Weather Card Configuration', () => {
    const weatherItem: GridItem = {
      id: 'weather-1',
      entityId: 'weather.home',
      x: 0,
      y: 0,
      width: 4,
      height: 3,
      config: {
        variant: 'default',
        temperatureUnit: 'auto',
      },
    }

    it('should render weather card configuration with variant select', async () => {
      render(
        <Theme>
          <CardConfig.Modal
            open={true}
            onOpenChange={mockOnOpenChange}
            item={weatherItem}
            onSave={mockOnSave}
          />
        </Theme>
      )

      // Check that the modal is rendered
      expect(screen.getByText('Card Configuration')).toBeInTheDocument()

      // Check that weather card specific fields are rendered
      expect(screen.getByText('Weather Card')).toBeInTheDocument()
      expect(screen.getByText('Card Variant')).toBeInTheDocument()
      expect(screen.getByText('Temperature Unit')).toBeInTheDocument()

      // Check that the select trigger shows the current variant
      const variantTrigger = findSelectByLabel('Card Variant')
      expect(variantTrigger).toBeTruthy()
      expect(variantTrigger).toHaveTextContent('Default')
    })

    it('should open variant dropdown and allow selection', async () => {
      const user = userEvent.setup()

      render(
        <Theme>
          <CardConfig.Modal
            open={true}
            onOpenChange={mockOnOpenChange}
            item={weatherItem}
            onSave={mockOnSave}
          />
        </Theme>
      )

      // Find and click the variant select trigger
      const variantTrigger = findSelectByLabel('Card Variant')
      expect(variantTrigger).toBeTruthy()
      await user.click(variantTrigger)

      // Wait for the dropdown to open
      await waitFor(() => {
        const dropdown = screen.getByRole('listbox')
        expect(dropdown).toBeInTheDocument()
      })

      // Check that all variant options are visible
      const dropdown = screen.getByRole('listbox')
      expect(within(dropdown).getByText('Default')).toBeInTheDocument()
      expect(within(dropdown).getByText('Detailed')).toBeInTheDocument()
      expect(within(dropdown).getByText('Minimal')).toBeInTheDocument()
      expect(within(dropdown).getByText('Modern')).toBeInTheDocument()

      // Click on the Modern variant
      await user.click(within(dropdown).getByText('Modern'))

      // Check that the select now shows Modern
      await waitFor(() => {
        expect(variantTrigger).toHaveTextContent('Modern')
      })

      // Check that the preview updated
      expect(screen.getByTestId('weather-card-preview')).toHaveTextContent('Variant: modern')
    })

    it('should save configuration when save button is clicked', async () => {
      const user = userEvent.setup()

      render(
        <Theme>
          <CardConfig.Modal
            open={true}
            onOpenChange={mockOnOpenChange}
            item={weatherItem}
            onSave={mockOnSave}
          />
        </Theme>
      )

      // Change the variant
      const variantTrigger = findSelectByLabel('Card Variant')
      await user.click(variantTrigger)

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })

      const dropdown = screen.getByRole('listbox')
      await user.click(within(dropdown).getByText('Minimal'))

      // Click save
      const saveButton = screen.getByRole('button', { name: /save changes/i })
      await user.click(saveButton)

      // Check that onSave was called with the updated config
      expect(mockOnSave).toHaveBeenCalledWith({
        config: {
          variant: 'minimal',
          temperatureUnit: 'auto',
        },
      })

      // Check that modal was closed
      expect(mockOnOpenChange).toHaveBeenCalledWith(false)
    })

    it('should handle temperature unit selection', async () => {
      const user = userEvent.setup()

      render(
        <Theme>
          <CardConfig.Modal
            open={true}
            onOpenChange={mockOnOpenChange}
            item={weatherItem}
            onSave={mockOnSave}
          />
        </Theme>
      )

      // Find and click the temperature unit select
      const tempTrigger = findSelectByLabel('Temperature Unit')
      expect(tempTrigger).toBeTruthy()
      expect(tempTrigger).toHaveTextContent('Auto (from entity)')

      await user.click(tempTrigger)

      // Wait for dropdown
      await waitFor(() => {
        const dropdown = screen.getByRole('listbox')
        expect(dropdown).toBeInTheDocument()
      })

      // Select Celsius
      const dropdown = screen.getByRole('listbox')
      await user.click(within(dropdown).getByText('Celsius (°C)'))

      // Check that the select updated
      await waitFor(() => {
        expect(tempTrigger).toHaveTextContent('Celsius (°C)')
      })
    })

    it('should ensure dropdown has proper z-index to appear above modal', async () => {
      const user = userEvent.setup()

      render(
        <Theme>
          <CardConfig.Modal
            open={true}
            onOpenChange={mockOnOpenChange}
            item={weatherItem}
            onSave={mockOnSave}
          />
        </Theme>
      )

      // Click to open dropdown
      const variantTrigger = findSelectByLabel('Card Variant')
      await user.click(variantTrigger)

      // Wait for dropdown to be visible
      await waitFor(() => {
        const dropdown = screen.getByRole('listbox')
        expect(dropdown).toBeInTheDocument()

        // Check that the dropdown content has the high z-index
        const dropdownContent = dropdown.closest('[style*="z-index"]')
        expect(dropdownContent).toHaveStyle({ zIndex: '100000' })
      })
    })

    it('should cancel changes when cancel button is clicked', async () => {
      const user = userEvent.setup()

      render(
        <Theme>
          <CardConfig.Modal
            open={true}
            onOpenChange={mockOnOpenChange}
            item={weatherItem}
            onSave={mockOnSave}
          />
        </Theme>
      )

      // Change the variant
      const variantTrigger = findSelectByLabel('Card Variant')
      await user.click(variantTrigger)

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })

      const dropdown = screen.getByRole('listbox')
      await user.click(within(dropdown).getByText('Detailed'))

      // Click cancel
      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelButton)

      // Check that onSave was NOT called
      expect(mockOnSave).not.toHaveBeenCalled()

      // Check that modal was closed
      expect(mockOnOpenChange).toHaveBeenCalledWith(false)
    })

    it('should close modal when X button is clicked', async () => {
      const user = userEvent.setup()

      render(
        <Theme>
          <CardConfig.Modal
            open={true}
            onOpenChange={mockOnOpenChange}
            item={weatherItem}
            onSave={mockOnSave}
          />
        </Theme>
      )

      // Find and click the X button (close icon)
      const closeButton = screen.getByRole('button', { name: '' }) // IconButton without explicit label
      await user.click(closeButton)

      // Check that modal was closed
      expect(mockOnOpenChange).toHaveBeenCalledWith(false)
      expect(mockOnSave).not.toHaveBeenCalled()
    })
  })

  describe('Select Dropdown Interaction', () => {
    const separatorItem: GridItem = {
      id: 'separator-1',
      type: 'separator',
      x: 0,
      y: 0,
      width: 4,
      height: 1,
      title: 'Section',
      separatorOrientation: 'horizontal',
      separatorTextColor: 'gray',
      hideBackground: false,
    }

    it('should allow keyboard navigation in select dropdown', async () => {
      const user = userEvent.setup()

      render(
        <Theme>
          <CardConfig.Modal
            open={true}
            onOpenChange={mockOnOpenChange}
            item={separatorItem}
            onSave={mockOnSave}
          />
        </Theme>
      )

      // Find orientation select
      const orientationTrigger = findSelectByLabel('Orientation')
      expect(orientationTrigger).toBeTruthy()

      // Focus and open with keyboard
      orientationTrigger.focus()
      await user.keyboard('{Enter}')

      // Wait for dropdown
      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument()
      })

      // Navigate with arrow keys
      await user.keyboard('{ArrowDown}')
      await user.keyboard('{Enter}')

      // Check that selection changed
      await waitFor(() => {
        expect(orientationTrigger).toHaveTextContent('Vertical')
      })
    })

    it('should handle multiple select fields independently', async () => {
      const user = userEvent.setup()

      render(
        <Theme>
          <CardConfig.Modal
            open={true}
            onOpenChange={mockOnOpenChange}
            item={separatorItem}
            onSave={mockOnSave}
          />
        </Theme>
      )

      // Change orientation
      const orientationTrigger = findSelectByLabel('Orientation')
      await user.click(orientationTrigger)

      let dropdown = await waitFor(() => screen.getByRole('listbox'))
      await user.click(within(dropdown).getByText('Vertical'))

      // Wait for first dropdown to close
      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      })

      // Change text color
      const colorTrigger = findSelectByLabel('Text Color')
      await user.click(colorTrigger)

      dropdown = await waitFor(() => screen.getByRole('listbox'))
      await user.click(within(dropdown).getByText('Blue'))

      // Save changes
      await user.click(screen.getByRole('button', { name: /save changes/i }))

      // Check both values were saved
      expect(mockOnSave).toHaveBeenCalledWith({
        title: 'Section',
        separatorOrientation: 'vertical',
        separatorTextColor: 'blue',
        hideBackground: false,
      })
    })
  })
})
