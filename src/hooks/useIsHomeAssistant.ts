import { useHomeAssistantOptional } from '~/contexts/HomeAssistantContext'
import { isPanelPath } from '~/config/panel'

export function useIsHomeAssistant(): boolean {
  const hass = useHomeAssistantOptional()

  // Check multiple conditions to determine if we're in Home Assistant
  return !!(
    hass || // Has Home Assistant context
    isPanelPath(window.location.pathname) || // Running at a Home Assistant panel path
    window.parent !== window // Running in an iframe
  )
}
