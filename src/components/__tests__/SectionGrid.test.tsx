import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SectionGrid } from '../SectionGrid'
import type { SectionConfig } from '../../store/types'
import { dashboardStore, dashboardActions } from '../../store'

// Mock CSS import
vi.mock('../SectionGrid.css', () => ({}))

// Mock the hooks
vi.mock('~/hooks', () => ({
  useEntity: vi.fn((entityId: string) => {
    const entities: Record<string, { entity: unknown; isConnected: boolean; isStale: boolean }> = {
      'light.living_room': {
        entity: {
          entity_id: 'light.living_room',
          state: 'off',
          attributes: {
            friendly_name: 'Living Room Light',
          },
        },
        isConnected: true,
        isStale: false,
      },
      'switch.kitchen': {
        entity: {
          entity_id: 'switch.kitchen',
          state: 'off',
          attributes: {
            friendly_name: 'Kitchen Switch',
          },
        },
        isConnected: true,
        isStale: false,
      },
    }
    return entities[entityId] || { entity: null, isConnected: false, isStale: false }
  }),
  useServiceCall: vi.fn(() => ({
    loading: false,
    error: null,
    toggle: vi.fn(),
    clearError: vi.fn(),
  })),
  useEntities: vi.fn(() => ({
    entities: {
      'light.living_room': {
        entity_id: 'light.living_room',
        state: 'off',
        attributes: { friendly_name: 'Living Room Light' },
      },
      'switch.kitchen': {
        entity_id: 'switch.kitchen',
        state: 'off',
        attributes: { friendly_name: 'Kitchen Switch' },
      },
    },
    isConnected: true,
  })),
}))

describe('SectionGrid', () => {
  const mockSections: SectionConfig[] = [
    {
      id: 'section-1',
      title: 'Section 1',
      order: 0,
      width: 'full',
      collapsed: false,
      items: [],
    },
    {
      id: 'section-2',
      title: 'Section 2',
      order: 1,
      width: 'half',
      collapsed: false,
      items: [],
    },
    {
      id: 'section-3',
      title: 'Section 3',
      order: 2,
      width: 'half',
      collapsed: false,
      items: [],
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    dashboardStore.setState(() => ({
      mode: 'view',
      screens: [],
      currentScreenId: null,
      configuration: { version: '1.0.0', screens: [], theme: 'auto' },
      gridResolution: { columns: 12, rows: 8 },
      theme: 'auto',
      isDirty: false,
    }))
  })

  it('should render all sections', () => {
    render(<SectionGrid screenId="screen-1" sections={mockSections} />)

    expect(screen.getByText('Section 1')).toBeInTheDocument()
    expect(screen.getByText('Section 2')).toBeInTheDocument()
    expect(screen.getByText('Section 3')).toBeInTheDocument()
  })

  it('should render sections in order', () => {
    render(<SectionGrid screenId="screen-1" sections={mockSections} />)

    const sectionTitles = screen.getAllByText(/Section \d/)
    expect(sectionTitles[0]).toHaveTextContent('Section 1')
    expect(sectionTitles[1]).toHaveTextContent('Section 2')
    expect(sectionTitles[2]).toHaveTextContent('Section 3')
  })

  it('should apply correct CSS classes for section widths', () => {
    render(<SectionGrid screenId="screen-1" sections={mockSections} />)

    const sections = screen
      .getAllByText(/Section \d/)
      .map((el) => el.closest('.section-full, .section-half, .section-third, .section-quarter'))

    expect(sections[0]).toHaveClass('section-full')
    expect(sections[1]).toHaveClass('section-half')
    expect(sections[2]).toHaveClass('section-half')
  })

  it('should make sections draggable in edit mode', () => {
    dashboardStore.setState((state) => ({ ...state, mode: 'edit' }))

    render(<SectionGrid screenId="screen-1" sections={mockSections} />)

    const draggableElements = screen
      .getAllByText(/Section \d/)
      .map((el) => el.closest('[draggable="true"]'))

    draggableElements.forEach((el) => {
      expect(el).toHaveAttribute('draggable', 'true')
    })
  })

  it('should not make sections draggable in view mode', () => {
    render(<SectionGrid screenId="screen-1" sections={mockSections} />)

    const draggableElements = screen
      .getAllByText(/Section \d/)
      .map((el) => el.closest('[draggable]'))

    draggableElements.forEach((el) => {
      expect(el).toHaveAttribute('draggable', 'false')
    })
  })

  it('should call updateSection when section is updated', async () => {
    const updateSpy = vi.spyOn(dashboardActions, 'updateSection')
    const user = userEvent.setup()

    render(<SectionGrid screenId="screen-1" sections={mockSections} />)

    // Click on section header to collapse
    const sectionHeader = screen.getByText('Section 1').closest('div[style*="cursor: pointer"]')
    await user.click(sectionHeader!)

    expect(updateSpy).toHaveBeenCalledWith('screen-1', 'section-1', { collapsed: true })
  })

  it('should call removeSection when section is deleted', async () => {
    const removeSpy = vi.spyOn(dashboardActions, 'removeSection')
    const user = userEvent.setup()
    dashboardStore.setState((state) => ({ ...state, mode: 'edit' }))

    render(<SectionGrid screenId="screen-1" sections={mockSections} />)

    // Find and click delete button for first section
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete section' })
    await user.click(deleteButtons[0])

    expect(removeSpy).toHaveBeenCalledWith('screen-1', 'section-1')
  })

  it('should render empty sections array', () => {
    render(<SectionGrid screenId="screen-1" sections={[]} />)

    // Should render grid container but no sections
    const grid = document.querySelector('.section-grid')
    expect(grid).toBeInTheDocument()
    expect(grid?.children).toHaveLength(0)
  })

  it('should render sections with items', () => {
    const sectionsWithItems: SectionConfig[] = [
      {
        ...mockSections[0],
        items: [
          { id: 'item-1', entityId: 'light.living_room', x: 0, y: 0, width: 2, height: 2 },
          { id: 'item-2', entityId: 'switch.kitchen', x: 2, y: 0, width: 2, height: 2 },
        ],
      },
    ]

    render(<SectionGrid screenId="screen-1" sections={sectionsWithItems} />)

    expect(screen.getByText('Living Room Light')).toBeInTheDocument()
    expect(screen.getByText('Kitchen Switch')).toBeInTheDocument()
  })
})
