import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CardConfig, type ConfigDefinition } from '../CardConfig'
import { Theme } from '@radix-ui/themes'
import { entityStore } from '~/store/entityStore'
import type { GridItem } from '~/store/types'
import { createBinarySensorEntity } from '~/test/fixtures'

// Mock the store
vi.mock('~/store', () => ({
  dashboardStore: {
    state: { mode: 'edit' },
    setState: vi.fn(),
  },
  dashboardActions: {},
  // Honours the selector form: the universal action editor selects `screens`
  // out of the store to offer `navigate` targets.
  useDashboardStore: vi.fn((selector?: (state: { mode: string; screens: [] }) => unknown) => {
    const state = { mode: 'edit' as const, screens: [] as [] }
    return selector ? selector(state) : state
  }),
}))

// Mock WeatherCard to avoid entity dependencies
vi.mock('../WeatherCard', () => ({
  WeatherCard: ({ config }: { config?: Record<string, unknown> }) => (
    <div data-testid="weather-card-preview">
      Weather Card - Variant: {String(config?.variant || 'default')}
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
      type: 'entity',
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

    it('should ensure dropdown is properly accessible and interactive', async () => {
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

        // Verify all options are visible
        expect(within(dropdown).getByText('Default')).toBeInTheDocument()
        expect(within(dropdown).getByText('Detailed')).toBeInTheDocument()
        expect(within(dropdown).getByText('Minimal')).toBeInTheDocument()
        expect(within(dropdown).getByText('Modern')).toBeInTheDocument()
      })

      // Verify we can interact with an option
      const modernOption = within(screen.getByRole('listbox')).getByText('Modern')
      await user.click(modernOption)

      // Verify the selection was made
      await waitFor(() => {
        expect(variantTrigger).toHaveTextContent('Modern')
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

  /**
   * The universal option surface. It is merged into every entity card's form
   * rather than declared per card, so the assertions that matter are that it is
   * there for a card with no options of its own, that it is absent from the
   * things that are not entity cards, and that what it saves is the serialized
   * action shape (docs/specs/entity-cards/options/common.md).
   */
  describe('Universal actions', () => {
    const sensorItem: GridItem = {
      id: 'sensor-1',
      type: 'entity',
      entityId: 'sensor.hallway_temperature',
      x: 0,
      y: 0,
      width: 2,
      height: 2,
    }

    it('offers the action surface even for a card with no options of its own', () => {
      render(
        <Theme>
          <CardConfig.Modal
            open={true}
            onOpenChange={mockOnOpenChange}
            item={sensorItem}
            onSave={mockOnSave}
          />
        </Theme>
      )

      expect(
        screen.getByText('No configuration options available for this card type.')
      ).toBeVisible()
      expect(screen.getByText('Actions')).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'Tap' })).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'Hold' })).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'Double tap' })).toBeInTheDocument()
    })

    it('saves a chosen action into the card config', async () => {
      const user = userEvent.setup()
      render(
        <Theme>
          <CardConfig.Modal
            open={true}
            onOpenChange={mockOnOpenChange}
            item={sensorItem}
            onSave={mockOnSave}
          />
        </Theme>
      )

      await user.click(screen.getByRole('combobox', { name: 'Tap' }))
      const dropdown = await waitFor(() => screen.getByRole('listbox'))
      await user.click(within(dropdown).getByText('Toggle'))

      await user.click(screen.getByRole('button', { name: /save changes/i }))

      expect(mockOnSave).toHaveBeenCalledWith({ config: { tapAction: 'toggle' } })
    })

    it('leaves cards that are not entity cards alone', () => {
      render(
        <Theme>
          <CardConfig.Modal
            open={true}
            onOpenChange={mockOnOpenChange}
            item={{ id: 'sep-1', type: 'separator', x: 0, y: 0, width: 4, height: 1 }}
            onSave={mockOnSave}
          />
        </Theme>
      )

      // A separator has no entity, so there is nothing for an action to act on.
      expect(screen.queryByText('Actions')).not.toBeInTheDocument()
    })
  })

  /**
   * The display half of the same shared fragment: it is merged into every entity
   * card's form beside whatever the card defines itself, and what it saves is
   * the contract's key names under `item.config`
   * (docs/specs/entity-cards/options/common.md — "Universal options").
   */
  describe('Universal display options', () => {
    const sensorItem: GridItem = {
      id: 'sensor-1',
      type: 'entity',
      entityId: 'sensor.hallway_temperature',
      x: 0,
      y: 0,
      width: 2,
      height: 2,
    }

    function renderModal(item: GridItem = sensorItem) {
      return render(
        <Theme>
          <CardConfig.Modal
            open={true}
            onOpenChange={mockOnOpenChange}
            item={item}
            onSave={mockOnSave}
          />
        </Theme>
      )
    }

    it('offers all five options for a card with no options of its own', () => {
      renderModal()

      expect(screen.getByText('Display')).toBeInTheDocument()
      expect(screen.getByText('Name')).toBeInTheDocument()
      expect(screen.getByText('Icon')).toBeInTheDocument()
      expect(screen.getByText('Hide name')).toBeInTheDocument()
      expect(screen.getByText('Hide state')).toBeInTheDocument()
      expect(findSelectByLabel('Color')).toBeTruthy()
    })

    it('merges alongside a card’s own options rather than replacing them', () => {
      renderModal({
        ...sensorItem,
        entityId: 'weather.home',
        config: { variant: 'default', temperatureUnit: 'auto' },
      })

      expect(screen.getByText('Card Variant')).toBeInTheDocument()
      expect(screen.getByText('Display')).toBeInTheDocument()
      expect(screen.getByText('Actions')).toBeInTheDocument()
    })

    it('does not offer them on things that are not entity cards', () => {
      renderModal({ id: 'sep-1', type: 'separator', x: 0, y: 0, width: 4, height: 1 })

      expect(screen.queryByText('Display')).not.toBeInTheDocument()
    })

    it('offers exactly the canonical colour list, and saves the chosen value', async () => {
      const user = userEvent.setup()
      renderModal()

      const colorTrigger = findSelectByLabel('Color')
      expect(colorTrigger).toHaveTextContent('Automatic (follows the entity)')
      await user.click(colorTrigger)

      const dropdown = await waitFor(() => screen.getByRole('listbox'))
      // Driven off `CARD_COLOR_OPTIONS`, so the form cannot offer a value the
      // schema would reject — `brand` is not a card colour.
      expect(within(dropdown).queryByText(/brand/i)).not.toBeInTheDocument()
      await user.click(within(dropdown).getByText('Media (indigo)'))

      await user.click(screen.getByRole('button', { name: /save changes/i }))

      expect(mockOnSave).toHaveBeenCalledWith({ config: { color: 'media' } })
    })

    it('saves a renamed, state-less card under the contract’s keys', async () => {
      const user = userEvent.setup()
      renderModal()

      await user.type(screen.getByPlaceholderText('Entity name'), 'Hallway')
      // The switch rows are labelled by the text beside them rather than by a
      // `for`/`id` pair, so they are addressed positionally.
      const switches = screen.getAllByRole('switch')
      await user.click(switches[1])

      await user.click(screen.getByRole('button', { name: /save changes/i }))

      expect(mockOnSave).toHaveBeenCalledWith({
        config: { name: 'Hallway', hideState: true },
      })
    })

    it('can clear an icon override back to the card’s own icon', async () => {
      const user = userEvent.setup()
      renderModal({ ...sensorItem, config: { icon: 'Bulb' } })

      // An override the user cannot undo would be a trap, so the picker's own
      // Clear has to reach the empty value the shell reads as "no override".
      await user.click(screen.getByRole('button', { name: 'Bulb' }))
      await user.click(await screen.findByRole('button', { name: 'Clear' }))
      await user.click(screen.getByRole('button', { name: /save changes/i }))

      expect(mockOnSave).toHaveBeenCalledWith({ config: { icon: '' } })
    })
  })

  /**
   * The three shared non-scalar controls, reached the way a card reaches them:
   * through its `ConfigDefinition`. No card declares one yet — they exist so the
   * per-card changes that need them (`motionEntity`, `brightnessPresets`,
   * `armModes`) consume a control rather than invent one — so what is asserted
   * here is the form wiring: the right control for the type, seeded with the
   * option's default, writing back under the option's key.
   */
  describe('Non-scalar option types', () => {
    const definition: ConfigDefinition = {
      motionEntity: {
        type: 'entity',
        default: '',
        label: 'Motion sensor',
        domains: ['binary_sensor'],
        deviceClasses: ['motion'],
        placeholder: 'No motion sensor',
      },
      brightnessPresets: {
        type: 'number-array',
        default: [],
        label: 'Brightness presets',
        min: 1,
        max: 100,
        step: 1,
        integer: true,
        unit: '%',
      },
      armModes: {
        type: 'ordered-multi-select',
        default: ['away', 'home'],
        label: 'Arm modes',
        options: [
          { value: 'away', label: 'Away' },
          { value: 'home', label: 'Home' },
        ],
      },
    }

    function renderForm(config: Record<string, unknown> = {}) {
      const onChange = vi.fn()
      render(
        <Theme>
          <CardConfig.Component
            title="Card"
            configDefinition={definition}
            config={config}
            onChange={onChange}
          />
        </Theme>
      )
      return onChange
    }

    beforeEach(() => {
      entityStore.setState((state) => ({
        ...state,
        entities: {
          'binary_sensor.driveway_motion': createBinarySensorEntity({
            entity_id: 'binary_sensor.driveway_motion',
            attributes: { friendly_name: 'Driveway Motion', device_class: 'motion' },
          }),
        },
        isConnected: true,
        isInitialLoading: false,
      }))
    })

    it('renders each control against its option’s default', () => {
      renderForm()

      expect(screen.getByRole('button', { name: 'Motion sensor' })).toHaveTextContent(
        'No motion sensor'
      )
      expect(screen.getByText('Nothing set — the card renders no values.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Move Away up' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Move Home down' })).toBeInTheDocument()
    })

    it('writes the entity picker’s choice back under its key', async () => {
      const user = userEvent.setup()
      const onChange = renderForm()

      await user.click(screen.getByRole('button', { name: 'Motion sensor' }))
      await user.click(await screen.findByText('Driveway Motion'))

      expect(onChange).toHaveBeenCalledWith({ motionEntity: 'binary_sensor.driveway_motion' })
    })

    it('writes an added number back under its key', async () => {
      const user = userEvent.setup()
      const onChange = renderForm()

      await user.type(screen.getByLabelText('Brightness presets to add'), '50')
      await user.click(screen.getByRole('button', { name: 'Add' }))

      expect(onChange).toHaveBeenCalledWith({ brightnessPresets: [50] })
    })

    it('writes a reordered selection back under its key', async () => {
      const user = userEvent.setup()
      const onChange = renderForm({ armModes: ['away', 'home'] })

      await user.click(screen.getByRole('button', { name: 'Move Home up' }))

      expect(onChange).toHaveBeenCalledWith({ armModes: ['home', 'away'] })
    })

    it('renders an ordered multi-select that was given no choices at all', () => {
      render(
        <Theme>
          <CardConfig.Component
            title="Card"
            configDefinition={{
              armModes: { type: 'ordered-multi-select', default: [], label: 'Arm modes' },
            }}
            config={{}}
            onChange={vi.fn()}
          />
        </Theme>
      )

      expect(
        screen.getByText('Nothing selected — the card shows none of these.')
      ).toBeInTheDocument()
    })
  })

  /*
   * The preview has to show the tier the card will actually render at on the
   * grid, which is a property of the *effective* span rather than of the stored
   * dimensions — a 2×2 item previewed as `full` while it renders `glance` on a
   * four-column screen is a preview of a card that does not exist
   * (docs/changes/0011-layout-tiers.md).
   */
  describe('Preview tier', () => {
    const sensorItem: GridItem = {
      id: 'bs-1',
      type: 'entity',
      entityId: 'binary_sensor.driveway_motion',
      x: 0,
      y: 0,
      width: 2,
      height: 2,
    }

    beforeEach(() => {
      entityStore.setState((state) => ({
        ...state,
        entities: {
          'binary_sensor.driveway_motion': createBinarySensorEntity({
            entity_id: 'binary_sensor.driveway_motion',
            attributes: { friendly_name: 'Driveway Motion', device_class: 'motion' },
          }),
        },
        isConnected: true,
        isInitialLoading: false,
      }))
    })

    function renderModalWithSpan(span?: { width: number; height: number }) {
      return render(
        <Theme>
          <CardConfig.Modal
            open={true}
            onOpenChange={mockOnOpenChange}
            item={sensorItem}
            span={span}
            onSave={mockOnSave}
          />
        </Theme>
      )
    }

    it('previews at the span the caller is laying the item out at', () => {
      // Stored 2×2, but the caller says the grid is giving it one cell.
      renderModalWithSpan({ width: 1, height: 1 })

      expect(document.querySelector('.liebe-card')).toHaveAttribute('data-tier', 'glance')
    })

    it('falls back to the stored dimensions for a caller with no grid behind it', () => {
      renderModalWithSpan()

      expect(document.querySelector('.liebe-card')).toHaveAttribute('data-tier', 'full')
    })
  })
})
