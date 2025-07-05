import { useHomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * Hook to get the Home Assistant URL
 * Transforms relative URLs to absolute URLs using the Home Assistant base URL
 */
export function useHassUrl() {
  const hass = useHomeAssistant()

  const hassUrl = hass.auth?.data?.hassUrl || ''

  /**
   * Transform a relative URL to an absolute URL
   * @param relativeUrl - The relative URL (e.g., "/api/camera_proxy_stream/...")
   * @returns The absolute URL
   */
  const toAbsoluteUrl = (relativeUrl: string): string => {
    if (!relativeUrl || !hassUrl) {
      return relativeUrl
    }

    // If already absolute, return as-is
    if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
      return relativeUrl
    }

    // Remove trailing slash from hassUrl and ensure relativeUrl starts with /
    const baseUrl = hassUrl.replace(/\/$/, '')
    const path = relativeUrl.startsWith('/') ? relativeUrl : `/${relativeUrl}`

    return `${baseUrl}${path}`
  }

  return {
    hassUrl,
    toAbsoluteUrl,
  }
}
