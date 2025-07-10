import { useHomeAssistantOptional } from '~/contexts/HomeAssistantContext'

export function useIsHomeAssistant(): boolean {
  const hass = useHomeAssistantOptional()

  // Check multiple conditions to determine if we're in Home Assistant
  return !!(
    hass || // Has Home Assistant context
    window.location.pathname.includes('/liebe') || // Running at Home Assistant path (production)
    window.location.pathname.includes('/liebe-dev') || // Running at Home Assistant path (development)
    window.parent !== window // Running in an iframe
  )
}
