import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useServiceCall } from '../useServiceCall';
import { hassService } from '../../services/hassService';
import { HomeAssistantProvider } from '../../contexts/HomeAssistantContext';
import type { HomeAssistant } from '../../contexts/HomeAssistantContext';

vi.mock('../../services/hassService', () => ({
  hassService: {
    setHass: vi.fn(),
    callService: vi.fn(),
  },
}));

describe('useServiceCall', () => {
  let mockHass: HomeAssistant;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    mockHass = {
      callService: vi.fn(),
      states: {},
      connection: {
        subscribeEvents: vi.fn(),
      },
      user: {
        name: 'Test User',
        id: '123',
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
          temperature: 'C',
          volume: 'L',
        },
        location_name: 'Test',
        time_zone: 'UTC',
        components: [],
        version: '2024.1.0',
      },
    };
  });
  
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <HomeAssistantProvider hass={mockHass}>{children}</HomeAssistantProvider>
  );
  
  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => useServiceCall(), { wrapper });
    
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(hassService.setHass).toHaveBeenCalledWith(mockHass);
  });
  
  it('should handle successful service call', async () => {
    vi.mocked(hassService.callService).mockResolvedValue({ success: true });
    
    const { result } = renderHook(() => useServiceCall(), { wrapper });
    
    let serviceResult;
    await act(async () => {
      serviceResult = await result.current.callService({
        domain: 'light',
        service: 'turn_on',
        entityId: 'light.bedroom',
      });
    });
    
    expect(serviceResult).toEqual({ success: true });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(null);
  });
  
  it('should handle failed service call', async () => {
    vi.mocked(hassService.callService).mockResolvedValue({ 
      success: false, 
      error: 'Service call failed' 
    });
    
    const { result } = renderHook(() => useServiceCall(), { wrapper });
    
    await act(async () => {
      await result.current.callService({
        domain: 'light',
        service: 'turn_on',
        entityId: 'light.bedroom',
      });
    });
    
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('Service call failed');
  });
  
  it('should set loading state during service call', async () => {
    vi.mocked(hassService.callService).mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
    );
    
    const { result } = renderHook(() => useServiceCall(), { wrapper });
    
    act(() => {
      result.current.callService({
        domain: 'light',
        service: 'turn_on',
        entityId: 'light.bedroom',
      });
    });
    
    expect(result.current.loading).toBe(true);
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });
  
  it('should handle turnOn helper', async () => {
    vi.mocked(hassService.callService).mockResolvedValue({ success: true });
    
    const { result } = renderHook(() => useServiceCall(), { wrapper });
    
    await act(async () => {
      await result.current.turnOn('light.bedroom', { brightness: 255 });
    });
    
    expect(hassService.callService).toHaveBeenCalledWith({
      domain: 'light',
      service: 'turn_on',
      entityId: 'light.bedroom',
      data: { brightness: 255 },
    });
  });
  
  it('should handle turnOff helper', async () => {
    vi.mocked(hassService.callService).mockResolvedValue({ success: true });
    
    const { result } = renderHook(() => useServiceCall(), { wrapper });
    
    await act(async () => {
      await result.current.turnOff('switch.outlet');
    });
    
    expect(hassService.callService).toHaveBeenCalledWith({
      domain: 'switch',
      service: 'turn_off',
      entityId: 'switch.outlet',
      data: undefined,
    });
  });
  
  it('should handle toggle helper', async () => {
    vi.mocked(hassService.callService).mockResolvedValue({ success: true });
    
    const { result } = renderHook(() => useServiceCall(), { wrapper });
    
    await act(async () => {
      await result.current.toggle('input_boolean.test');
    });
    
    expect(hassService.callService).toHaveBeenCalledWith({
      domain: 'input_boolean',
      service: 'toggle',
      entityId: 'input_boolean.test',
      data: undefined,
    });
  });
  
  it('should handle setValue helper for input_number', async () => {
    vi.mocked(hassService.callService).mockResolvedValue({ success: true });
    
    const { result } = renderHook(() => useServiceCall(), { wrapper });
    
    await act(async () => {
      await result.current.setValue('input_number.temperature', 25);
    });
    
    expect(hassService.callService).toHaveBeenCalledWith({
      domain: 'input_number',
      service: 'set_value',
      entityId: 'input_number.temperature',
      data: { value: 25 },
    });
  });
  
  it('should handle setValue error for unsupported domain', async () => {
    const { result } = renderHook(() => useServiceCall(), { wrapper });
    
    await act(async () => {
      await result.current.setValue('sensor.temperature', 25);
    });
    
    expect(result.current.error).toBe('setValue not supported for domain: sensor');
  });
  
  it('should clear error', () => {
    const { result } = renderHook(() => useServiceCall(), { wrapper });
    
    act(() => {
      // Set an error first
      result.current.setValue('sensor.invalid', 100);
    });
    
    waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });
    
    act(() => {
      result.current.clearError();
    });
    
    expect(result.current.error).toBe(null);
  });
  
  it('should cancel previous call when new call starts', async () => {
    const abortControllerMock = {
      abort: vi.fn(),
      signal: { aborted: false },
    };
    
    // Mock AbortController
    global.AbortController = vi.fn(() => abortControllerMock) as unknown as typeof AbortController;
    
    vi.mocked(hassService.callService).mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
    );
    
    const { result } = renderHook(() => useServiceCall(), { wrapper });
    
    // Start first call
    act(() => {
      result.current.callService({
        domain: 'light',
        service: 'turn_on',
        entityId: 'light.bedroom',
      });
    });
    
    // Start second call immediately
    act(() => {
      result.current.callService({
        domain: 'light',
        service: 'turn_off',
        entityId: 'light.bedroom',
      });
    });
    
    expect(abortControllerMock.abort).toHaveBeenCalled();
  });
});