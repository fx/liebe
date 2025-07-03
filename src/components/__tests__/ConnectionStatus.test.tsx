import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConnectionStatus } from '../ConnectionStatus'
import { entityStore } from '../../store/entityStore'
import type { HomeAssistant } from '../../contexts/HomeAssistantContext'

// Mock the CSS import
vi.mock('../ConnectionStatus.css', () => ({}))

// Mock the context
vi.mock('~/contexts/HomeAssistantContext', () => ({
  useHomeAssistantOptional: vi.fn(),
}))

// Mock responsive utilities
vi.mock('../../../app/utils/responsive', () => ({
  useIsMobile: () => false, // Default to desktop
}))

import { useHomeAssistantOptional } from '~/contexts/HomeAssistantContext'

describe('ConnectionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset store to initial state
    entityStore.setState(() => ({
      entities: {},
      isConnected: false,
      isInitialLoading: true,
      lastError: null,
      subscribedEntities: new Set(),
      staleEntities: new Set(),
      lastUpdateTime: Date.now(),
    }))
  })

  it('should show "No Home Assistant" when hass is not available', () => {
    vi.mocked(useHomeAssistantOptional).mockReturnValue(null)

    render(<ConnectionStatus showText />)

    expect(screen.getByText('No Home Assistant')).toBeInTheDocument()
  })

  it('should show "Connected" when connected to Home Assistant', () => {
    vi.mocked(useHomeAssistantOptional).mockReturnValue({} as HomeAssistant)
    entityStore.setState((state) => ({
      ...state,
      isConnected: true,
      entities: {
        'light.test': {
          entity_id: 'light.test',
          state: 'on',
          attributes: {},
          last_changed: '2023-01-01T00:00:00Z',
          last_updated: '2023-01-01T00:00:00Z',
          context: { id: '123', parent_id: null, user_id: null },
        },
      },
    }))

    render(<ConnectionStatus showText />)

    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('should show "Disconnected" when not connected', () => {
    vi.mocked(useHomeAssistantOptional).mockReturnValue({} as HomeAssistant)
    entityStore.setState((state) => ({
      ...state,
      isConnected: false,
    }))

    render(<ConnectionStatus showText />)

    expect(screen.getByText('Disconnected')).toBeInTheDocument()
  })

  it('should show error status when there is an error', () => {
    vi.mocked(useHomeAssistantOptional).mockReturnValue({} as HomeAssistant)
    entityStore.setState((state) => ({
      ...state,
      isConnected: false,
      lastError: 'Connection failed',
    }))

    render(<ConnectionStatus showText />)

    expect(screen.getByText('Disconnected')).toBeInTheDocument()
  })

  it('should show detailed information in popover', async () => {
    const user = userEvent.setup()
    vi.mocked(useHomeAssistantOptional).mockReturnValue({} as HomeAssistant)
    entityStore.setState((state) => ({
      ...state,
      isConnected: true,
      entities: {
        'light.test': {
          entity_id: 'light.test',
          state: 'on',
          attributes: {},
          last_changed: '2023-01-01T00:00:00Z',
          last_updated: '2023-01-01T00:00:00Z',
          context: { id: '123', parent_id: null, user_id: null },
        },
      },
      subscribedEntities: new Set(['light.test']),
    }))

    render(<ConnectionStatus />)

    // Click on the status button
    const button = screen.getByRole('button', { name: 'Connected' })
    await user.click(button)

    // Check popover content
    expect(screen.getByText('Home Assistant:')).toBeInTheDocument()
    expect(screen.getByText('Available')).toBeInTheDocument()
    expect(screen.getByText('WebSocket:')).toBeInTheDocument()
    expect(screen.getByText('Total Entities:')).toBeInTheDocument()
    // Check for entity count
    const entityCounts = screen.getAllByText('1')
    expect(entityCounts).toHaveLength(2) // Total entities and subscribed count
    expect(screen.getByText('Subscribed:')).toBeInTheDocument()
  })

  it('should render as icon button when showText is false', () => {
    vi.mocked(useHomeAssistantOptional).mockReturnValue({} as HomeAssistant)
    entityStore.setState((state) => ({
      ...state,
      isConnected: true,
    }))

    render(<ConnectionStatus showText={false} />)

    const button = screen.getByRole('button', { name: 'Connected' })
    expect(button).toBeInTheDocument()
    // Should not show text
    expect(screen.queryByText('Connected')).not.toBeInTheDocument()
  })

  it('should render as text button when showText is true', () => {
    vi.mocked(useHomeAssistantOptional).mockReturnValue({} as HomeAssistant)
    entityStore.setState((state) => ({
      ...state,
      isConnected: true,
    }))

    render(<ConnectionStatus showText />)

    expect(screen.getByText('Connected')).toBeInTheDocument()
  })
})
