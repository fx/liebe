import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ButtonCard } from '../ButtonCard';
import { useEntity } from '~/hooks';
import { useHomeAssistantOptional } from '~/contexts/HomeAssistantContext';
import type { HomeAssistant } from '~/contexts/HomeAssistantContext';

// Mock the hooks
vi.mock('~/hooks', () => ({
  useEntity: vi.fn(),
}));

vi.mock('~/contexts/HomeAssistantContext', () => ({
  useHomeAssistantOptional: vi.fn(),
  HomeAssistant: vi.fn(),
}));

describe('ButtonCard', () => {
  const mockCallService = vi.fn();
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
    mockCallService.mockResolvedValue(undefined);
    
    render(<ButtonCard entityId="light.living_room" />);
    
    const card = screen.getByText('Living Room Light').closest('[class*="Card"]');
    await user.click(card!);
    
    expect(mockCallService).toHaveBeenCalledWith('light', 'toggle', {
      entity_id: 'light.living_room',
    });
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
    
    expect(mockCallService).toHaveBeenCalledWith('switch', 'toggle', {
      entity_id: 'switch.garage_door',
    });
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
    
    expect(mockCallService).toHaveBeenCalledWith('input_boolean', 'toggle', {
      entity_id: 'input_boolean.vacation_mode',
    });
  });

  it('should show loading state during service call', async () => {
    const user = userEvent.setup();
    vi.mocked(useEntity).mockReturnValue({
      entity: mockEntity,
      isConnected: true,
      isLoading: false,
    });
    
    // Make the service call hang
    let resolvePromise: () => void;
    const promise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });
    mockCallService.mockReturnValue(promise);
    
    render(<ButtonCard entityId="light.living_room" />);
    
    const card = screen.getByText('Living Room Light').closest('[class*="Card"]');
    await user.click(card!);
    
    // Should show loading spinner
    expect(card).toHaveStyle({ cursor: 'wait' });
    
    // Resolve the promise
    resolvePromise!();
    await promise;
  });

  it('should handle service call errors', async () => {
    const user = userEvent.setup();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(useEntity).mockReturnValue({
      entity: mockEntity,
      isConnected: true,
      isLoading: false,
    });
    mockCallService.mockRejectedValue(new Error('Service call failed'));
    
    render(<ButtonCard entityId="light.living_room" />);
    
    const card = screen.getByText('Living Room Light').closest('[class*="Card"]');
    await user.click(card!);
    
    expect(consoleSpy).toHaveBeenCalledWith('Failed to call service:', expect.any(Error));
    
    consoleSpy.mockRestore();
  });

  it('should not call service when hass is not available', async () => {
    const user = userEvent.setup();
    vi.mocked(useEntity).mockReturnValue({
      entity: mockEntity,
      isConnected: true,
      isLoading: false,
    });
    vi.mocked(useHomeAssistantOptional).mockReturnValue(null);
    
    render(<ButtonCard entityId="light.living_room" />);
    
    const card = screen.getByText('Living Room Light').closest('[class*="Card"]');
    await user.click(card!);
    
    expect(mockCallService).not.toHaveBeenCalled();
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