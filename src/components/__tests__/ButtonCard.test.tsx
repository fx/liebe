import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ButtonCard } from '../ButtonCard'
import { useEntity, useServiceCall } from '~/hooks'
import { useHomeAssistantOptional } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'

// Mock the hooks
vi.mock('~/hooks', () => ({
  useEntity: vi.fn(),
  useServiceCall: vi.fn(),
}))

vi.mock('~/contexts/HomeAssistantContext', () => ({
  useHomeAssistantOptional: vi.fn(),
  HomeAssistant: vi.fn(),
}))

describe('ButtonCard', () => {
  const mockCallService = vi.fn()
  const mockDispatchGuarded = vi.fn()
  const mockClearError = vi.fn()
  const mockEntity = {
    entity_id: 'light.living_room',
    state: 'off',
    attributes: {
      friendly_name: 'Living Room Light',
    },
    last_changed: '2024-01-01T00:00:00Z',
    last_updated: '2024-01-01T00:00:00Z',
    context: {
      id: 'test',
      parent_id: null,
      user_id: null,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    const mockHass = createMockHomeAssistant({
      callService: mockCallService,
    })
    vi.mocked(useHomeAssistantOptional).mockReturnValue(mockHass)

    // Default mock for useServiceCall
    vi.mocked(useServiceCall).mockReturnValue({
      loading: false,
      error: null,
      callService: vi.fn(),
      turnOn: vi.fn(),
      turnOff: vi.fn(),
      toggle: vi.fn(),
      dispatchGuarded: mockDispatchGuarded,
      setValue: vi.fn(),
      clearError: mockClearError,
    })
  })

  it('should render entity not found when entity is null', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: undefined,
      isConnected: false,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    render(<ButtonCard entityId="unknown.entity" />)

    // When not connected, it shows disconnected state instead of entity not found
    expect(screen.getByText('Disconnected')).toBeInTheDocument()
    expect(screen.getByText('Disconnected from Home Assistant')).toBeInTheDocument()
  })

  it('should render disconnected when not connected', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: undefined,
      isConnected: false,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    render(<ButtonCard entityId="light.living_room" />)

    expect(screen.getByText('Disconnected')).toBeInTheDocument()
    expect(screen.getByText('Disconnected from Home Assistant')).toBeInTheDocument()
  })

  it('should render entity with friendly name and state', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: mockEntity,
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    render(<ButtonCard entityId="light.living_room" />)

    expect(screen.getByText('Living Room Light')).toBeInTheDocument()
    expect(screen.getByText('OFF')).toBeInTheDocument()
  })

  it('should render entity with different states', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...mockEntity,
        state: 'on',
      },
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    render(<ButtonCard entityId="light.living_room" />)

    expect(screen.getByText('ON')).toBeInTheDocument()
  })

  it('should call toggle service when clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(useEntity).mockReturnValue({
      entity: mockEntity,
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })
    mockDispatchGuarded.mockResolvedValue({ success: true })

    render(<ButtonCard entityId="light.living_room" />)

    const card = screen.getByText('Living Room Light').closest('.liebe-card')
    await user.click(card!)

    expect(mockDispatchGuarded).toHaveBeenCalledWith({
      domain: 'light',
      service: 'toggle',
      entityId: 'light.living_room',
    })
    // Exactly once: the tile is the primary action and its handler
    // accepts any descendant target, so an anatomy part that forgot to
    // stop propagation would dispatch the service twice.
    expect(mockDispatchGuarded).toHaveBeenCalledTimes(1)
  })

  it('should handle switch entities', async () => {
    const user = userEvent.setup()
    const switchEntity = {
      ...mockEntity,
      entity_id: 'switch.garage_door',
      attributes: {
        friendly_name: 'Garage Door',
      },
    }
    vi.mocked(useEntity).mockReturnValue({
      entity: switchEntity,
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    render(<ButtonCard entityId="switch.garage_door" />)

    const card = screen.getByText('Garage Door').closest('.liebe-card')
    await user.click(card!)

    expect(mockDispatchGuarded).toHaveBeenCalledWith({
      domain: 'switch',
      service: 'toggle',
      entityId: 'switch.garage_door',
    })
    // Exactly once: the tile is the primary action and its handler
    // accepts any descendant target, so an anatomy part that forgot to
    // stop propagation would dispatch the service twice.
    expect(mockDispatchGuarded).toHaveBeenCalledTimes(1)
  })

  it('should handle input_boolean entities', async () => {
    const user = userEvent.setup()
    const inputBooleanEntity = {
      ...mockEntity,
      entity_id: 'input_boolean.vacation_mode',
      attributes: {
        friendly_name: 'Vacation Mode',
      },
    }
    vi.mocked(useEntity).mockReturnValue({
      entity: inputBooleanEntity,
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    render(<ButtonCard entityId="input_boolean.vacation_mode" />)

    const card = screen.getByText('Vacation Mode').closest('.liebe-card')
    await user.click(card!)

    expect(mockDispatchGuarded).toHaveBeenCalledWith({
      domain: 'input_boolean',
      service: 'toggle',
      entityId: 'input_boolean.vacation_mode',
    })
    // Exactly once: the tile is the primary action and its handler
    // accepts any descendant target, so an anatomy part that forgot to
    // stop propagation would dispatch the service twice.
    expect(mockDispatchGuarded).toHaveBeenCalledTimes(1)
  })

  it('should show loading state during service call', async () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: mockEntity,
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    // Set loading state
    vi.mocked(useServiceCall).mockReturnValue({
      loading: true,
      error: null,
      callService: vi.fn(),
      turnOn: vi.fn(),
      turnOff: vi.fn(),
      toggle: vi.fn(),
      dispatchGuarded: mockDispatchGuarded,
      setValue: vi.fn(),
      clearError: mockClearError,
    })

    render(<ButtonCard entityId="light.living_room" />)

    const card = screen.getByText('Living Room Light').closest('.liebe-card')

    // Should show loading spinner overlay
    const spinner = document.querySelector('.rt-Spinner')
    expect(spinner).toBeInTheDocument()

    // Should show loading styles. The cursor is still inline — it is an
    // affordance, not a themable visual — while the pulse and the dimming now
    // come from `.liebe-card[data-loading]` in the layered shell sheet.
    expect(card).toHaveStyle({ cursor: 'wait' })
    expect(card).toHaveAttribute('data-loading', 'true')
  })

  it('should handle service call errors', async () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: mockEntity,
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    // Set error state
    vi.mocked(useServiceCall).mockReturnValue({
      loading: false,
      error: 'Service call failed',
      callService: vi.fn(),
      turnOn: vi.fn(),
      turnOff: vi.fn(),
      toggle: vi.fn(),
      dispatchGuarded: mockDispatchGuarded,
      setValue: vi.fn(),
      clearError: mockClearError,
    })

    render(<ButtonCard entityId="light.living_room" />)

    const card = screen.getByText('Living Room Light').closest('.liebe-card')

    // Should show error state
    expect(screen.getByText('ERROR')).toBeInTheDocument()
    expect(card).toHaveAttribute('title', 'Service call failed')
    // The error outline moved out of the inline style and into
    // `.liebe-card[data-error]`, so that an alert-coloured card stays
    // themable; the attribute is the stable contract the rule keys off.
    expect(card).toHaveAttribute('data-error', 'true')
  })

  it('should not call service when loading', async () => {
    const user = userEvent.setup()
    vi.mocked(useEntity).mockReturnValue({
      entity: mockEntity,
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    // Set loading state to prevent clicks
    vi.mocked(useServiceCall).mockReturnValue({
      loading: true,
      error: null,
      callService: vi.fn(),
      turnOn: vi.fn(),
      turnOff: vi.fn(),
      toggle: vi.fn(),
      dispatchGuarded: mockDispatchGuarded,
      setValue: vi.fn(),
      clearError: mockClearError,
    })

    render(<ButtonCard entityId="light.living_room" />)

    const card = screen.getByText('Living Room Light').closest('.liebe-card')
    await user.click(card!)

    expect(mockDispatchGuarded).not.toHaveBeenCalled()
  })

  it('should render the entity name', () => {
    // Was three rerenders at three `size` values asserting this same line. The
    // prop was decoration — nothing about the assertion ever depended on it —
    // so the loop went with the prop and the assertion stayed.
    vi.mocked(useEntity).mockReturnValue({
      entity: mockEntity,
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    render(<ButtonCard entityId="light.living_room" />)

    expect(screen.getByText('Living Room Light')).toBeInTheDocument()
  })

  it('should use entity_id when friendly_name is not available', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...mockEntity,
        attributes: {},
      },
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    render(<ButtonCard entityId="light.living_room" />)

    expect(screen.getByText('light.living_room')).toBeInTheDocument()
  })

  it('should apply on state styling', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...mockEntity,
        state: 'on',
      },
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    render(<ButtonCard entityId="light.living_room" />)

    const card = screen.getByText('Living Room Light').closest('.liebe-card')
    // The active treatment is the icon circle's tint, not a thicker card
    // border; the tile only announces the state for the anatomy and for
    // themes to key off.
    expect(card).toHaveAttribute('data-active', 'true')
    expect(document.querySelector('.liebe-icon')).toHaveAttribute('data-active', 'true')
  })

  it('should render skeleton when entity is undefined but connected', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: undefined,
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    const { container } = render(<ButtonCard entityId="unknown.entity" />)

    // Should show skeleton card
    const skeleton = container.querySelector('.rt-Skeleton')
    expect(skeleton).toBeInTheDocument()
  })
})
