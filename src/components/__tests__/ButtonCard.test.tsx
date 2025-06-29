import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ButtonCard } from '../ButtonCard';
import { useEntity, useServiceCall } from '~/hooks';
import { useHomeAssistantOptional } from '~/contexts/HomeAssistantContext';
import type { HomeAssistant } from '~/contexts/HomeAssistantContext';

// Mock the hooks
vi.mock('~/hooks', () => ({
  useEntity: vi.fn(),
  useServiceCall: vi.fn(),
}));

vi.mock('~/contexts/HomeAssistantContext', () => ({
  useHomeAssistantOptional: vi.fn(),
  HomeAssistant: vi.fn(),
}));

describe('ButtonCard', () => {
  const mockCallService = vi.fn();
  const mockToggle = vi.fn();
  const mockClearError = vi.fn();
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
  };

  beforeEach(() => {
    vi.clearAllMocks();
    const mockHass: HomeAssistant = {
      callService: mockCallService,
      states: {},
      connection: {
        subscribeEvents: vi.fn(),
      },
      user: {
        name: 'Test User',
        id: 'test-user',
        is_admin: true,
      },
      themes: {},
      language: 'en',
      config: {
        latitude: 0,
        longitude: 0,
        elevation: 0,
        unit_system: {
          length: 'km',
          mass: 'kg',
          temperature: '°C',
          volume: 'L',
        },
        location_name: 'Home',
        time_zone: 'UTC',
        components: [],
        version: '2024.1.0',
      },
    };
    vi.mocked(useHomeAssistantOptional).mockReturnValue(mockHass);
    
    // Default mock for useServiceCall
    vi.mocked(useServiceCall).mockReturnValue({
      loading: false,
      error: null,
      callService: vi.fn(),
      turnOn: vi.fn(),
      turnOff: vi.fn(),
      toggle: mockToggle,
      setValue: vi.fn(),
      clearError: mockClearError,
    });
  });

  it('should render entity not found when entity is null', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: undefined,
      isConnected: true,
      isLoading: false,
    });
    
    render(<ButtonCard entityId="unknown.entity" />);
    
    expect(screen.getByText('Entity not found')).toBeInTheDocument();
  });

  it('should render disconnected when not connected', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: mockEntity,
      isConnected: false,
      isLoading: false,
    });
    
    render(<ButtonCard entityId="light.living_room" />);
    
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('should render entity with friendly name and state', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: mockEntity,
      isConnected: true,
      isLoading: false,
    });
    
    render(<ButtonCard entityId="light.living_room" />);
    
    expect(screen.getByText('Living Room Light')).toBeInTheDocument();
    expect(screen.getByText('OFF')).toBeInTheDocument();
  });

  it('should render entity with different states', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...mockEntity,
        state: 'on',
      },
      isConnected: true,
      isLoading: false,
    });
    
    render(<ButtonCard entityId="light.living_room" />);
    
    expect(screen.getByText('ON')).toBeInTheDocument();
  });

  it('should call toggle service when clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(useEntity).mockReturnValue({
      entity: mockEntity,
      isConnected: true,
      isLoading: false,
    });
    mockToggle.mockResolvedValue({ success: true });
    
    render(<ButtonCard entityId="light.living_room" />);
    
    const card = screen.getByText('Living Room Light').closest('[class*="Card"]');
    await user.click(card!);
    
    expect(mockToggle).toHaveBeenCalledWith('light.living_room');
  });

  it('should handle switch entities', async () => {
    const user = userEvent.setup();
    const switchEntity = {
      ...mockEntity,
      entity_id: 'switch.garage_door',
      attributes: {
        friendly_name: 'Garage Door',
      },
    };
    vi.mocked(useEntity).mockReturnValue({
      entity: switchEntity,
      isConnected: true,
      isLoading: false,
    });
    
    render(<ButtonCard entityId="switch.garage_door" />);
    
    const card = screen.getByText('Garage Door').closest('[class*="Card"]');
    await user.click(card!);
    
    expect(mockToggle).toHaveBeenCalledWith('switch.garage_door');
  });

  it('should handle input_boolean entities', async () => {
    const user = userEvent.setup();
    const inputBooleanEntity = {
      ...mockEntity,
      entity_id: 'input_boolean.vacation_mode',
      attributes: {
        friendly_name: 'Vacation Mode',
      },
    };
    vi.mocked(useEntity).mockReturnValue({
      entity: inputBooleanEntity,
      isConnected: true,
      isLoading: false,
    });
    
    render(<ButtonCard entityId="input_boolean.vacation_mode" />);
    
    const card = screen.getByText('Vacation Mode').closest('[class*="Card"]');
    await user.click(card!);
    
    expect(mockToggle).toHaveBeenCalledWith('input_boolean.vacation_mode');
  });

  it('should show loading state during service call', async () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: mockEntity,
      isConnected: true,
      isLoading: false,
    });
    
    // Set loading state
    vi.mocked(useServiceCall).mockReturnValue({
      loading: true,
      error: null,
      callService: vi.fn(),
      turnOn: vi.fn(),
      turnOff: vi.fn(),
      toggle: mockToggle,
      setValue: vi.fn(),
      clearError: mockClearError,
    });
    
    render(<ButtonCard entityId="light.living_room" />);
    
    const card = screen.getByText('Living Room Light').closest('[class*="Card"]');
    
    // Should show loading spinner by checking for the spinner class
    expect(screen.getByText('Living Room Light').parentElement?.querySelector('.rt-Spinner')).toBeInTheDocument();
    expect(card).toHaveStyle({ cursor: 'wait' });
  });

  it('should handle service call errors', async () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: mockEntity,
      isConnected: true,
      isLoading: false,
    });
    
    // Set error state
    vi.mocked(useServiceCall).mockReturnValue({
      loading: false,
      error: 'Service call failed',
      callService: vi.fn(),
      turnOn: vi.fn(),
      turnOff: vi.fn(),
      toggle: mockToggle,
      setValue: vi.fn(),
      clearError: mockClearError,
    });
    
    render(<ButtonCard entityId="light.living_room" />);
    
    const card = screen.getByText('Living Room Light').closest('[class*="Card"]');
    
    // Should show error state
    expect(screen.getByText('ERROR')).toBeInTheDocument();
    expect(card).toHaveAttribute('title', 'Service call failed');
    expect(card).toHaveStyle({ borderColor: 'var(--red-6)' });
  });

  it('should not call service when loading', async () => {
    const user = userEvent.setup();
    vi.mocked(useEntity).mockReturnValue({
      entity: mockEntity,
      isConnected: true,
      isLoading: false,
    });
    
    // Set loading state to prevent clicks
    vi.mocked(useServiceCall).mockReturnValue({
      loading: true,
      error: null,
      callService: vi.fn(),
      turnOn: vi.fn(),
      turnOff: vi.fn(),
      toggle: mockToggle,
      setValue: vi.fn(),
      clearError: mockClearError,
    });
    
    render(<ButtonCard entityId="light.living_room" />);
    
    const card = screen.getByText('Living Room Light').closest('[class*="Card"]');
    await user.click(card!);
    
    expect(mockToggle).not.toHaveBeenCalled();
  });

  it('should render different sizes correctly', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: mockEntity,
      isConnected: true,
      isLoading: false,
    });
    
    const { rerender } = render(<ButtonCard entityId="light.living_room" size="small" />);
    expect(screen.getByText('Living Room Light')).toBeInTheDocument();
    
    rerender(<ButtonCard entityId="light.living_room" size="medium" />);
    expect(screen.getByText('Living Room Light')).toBeInTheDocument();
    
    rerender(<ButtonCard entityId="light.living_room" size="large" />);
    expect(screen.getByText('Living Room Light')).toBeInTheDocument();
  });

  it('should use entity_id when friendly_name is not available', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...mockEntity,
        attributes: {},
      },
      isConnected: true,
      isLoading: false,
    });
    
    render(<ButtonCard entityId="light.living_room" />);
    
    expect(screen.getByText('light.living_room')).toBeInTheDocument();
  });

  it('should apply on state styling', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...mockEntity,
        state: 'on',
      },
      isConnected: true,
      isLoading: false,
    });
    
    render(<ButtonCard entityId="light.living_room" />);
    
    const card = screen.getByText('Living Room Light').closest('[class*="Card"]');
    expect(card).toHaveStyle({
      borderWidth: '2px',
    });
  });
});