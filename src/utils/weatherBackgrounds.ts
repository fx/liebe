// Get the base URL for assets based on the panel's location
function getAssetBaseUrl(): string {
  // Check if we have the base URL from panel initialization
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof window !== 'undefined' && (window as any).__LIEBE_ASSET_BASE_URL__) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).__LIEBE_ASSET_BASE_URL__
  }

  // Fallback to root path for development
  return '/'
}

// Map weather conditions to background images
export function getWeatherBackground(condition: string): string | null {
  // Normalize the condition
  const normalizedCondition = condition.toLowerCase().trim()

  // Get the base URL for assets
  const baseUrl = getAssetBaseUrl()

  // Direct mapping for standard Pirate Weather icons
  const backgroundMap: Record<string, string> = {
    'clear-day': `${baseUrl}weather-backgrounds/clear-day.png`,
    'clear-night': `${baseUrl}weather-backgrounds/clear-night.png`,
    rain: `${baseUrl}weather-backgrounds/rain.png`,
    snow: `${baseUrl}weather-backgrounds/snow.png`,
    sleet: `${baseUrl}weather-backgrounds/sleet.png`,
    wind: `${baseUrl}weather-backgrounds/wind.png`,
    fog: `${baseUrl}weather-backgrounds/fog.png`,
    cloudy: `${baseUrl}weather-backgrounds/cloudy.png`,
    'partly-cloudy-day': `${baseUrl}weather-backgrounds/partly-cloudy-day.png`,
    'partly-cloudy-night': `${baseUrl}weather-backgrounds/partly-cloudy-night.png`,

    // Additional Pirate Weather icons (with icon=pirate)
    'mostly-clear-day': `${baseUrl}weather-backgrounds/clear-day.png`,
    'mostly-clear-night': `${baseUrl}weather-backgrounds/clear-night.png`,
    'mostly-cloudy-day': `${baseUrl}weather-backgrounds/cloudy.png`,
    'mostly-cloudy-night': `${baseUrl}weather-backgrounds/cloudy.png`,
    'possible-rain-day': `${baseUrl}weather-backgrounds/rain.png`,
    'possible-rain-night': `${baseUrl}weather-backgrounds/rain.png`,
    'possible-snow-day': `${baseUrl}weather-backgrounds/snow.png`,
    'possible-snow-night': `${baseUrl}weather-backgrounds/snow.png`,
    'possible-sleet-day': `${baseUrl}weather-backgrounds/sleet.png`,
    'possible-sleet-night': `${baseUrl}weather-backgrounds/sleet.png`,
    'possible-precipitation-day': `${baseUrl}weather-backgrounds/rain.png`,
    'possible-precipitation-night': `${baseUrl}weather-backgrounds/rain.png`,
    precipitation: `${baseUrl}weather-backgrounds/rain.png`,
    drizzle: `${baseUrl}weather-backgrounds/rain.png`,
    'light-rain': `${baseUrl}weather-backgrounds/rain.png`,
    'heavy-rain': `${baseUrl}weather-backgrounds/rain.png`,
    flurries: `${baseUrl}weather-backgrounds/snow.png`,
    'light-snow': `${baseUrl}weather-backgrounds/snow.png`,
    'heavy-snow': `${baseUrl}weather-backgrounds/snow.png`,
    'very-light-sleet': `${baseUrl}weather-backgrounds/sleet.png`,
    'light-sleet': `${baseUrl}weather-backgrounds/sleet.png`,
    'heavy-sleet': `${baseUrl}weather-backgrounds/sleet.png`,
    breezy: `${baseUrl}weather-backgrounds/wind.png`,
    'dangerous-wind': `${baseUrl}weather-backgrounds/wind.png`,

    // Common weather conditions (for non-Pirate Weather integrations)
    sunny: `${baseUrl}weather-backgrounds/clear-day.png`,
    clear: `${baseUrl}weather-backgrounds/clear-day.png`,
    rainy: `${baseUrl}weather-backgrounds/rain.png`,
    snowy: `${baseUrl}weather-backgrounds/snow.png`,
    windy: `${baseUrl}weather-backgrounds/wind.png`,
    foggy: `${baseUrl}weather-backgrounds/fog.png`,
    overcast: `${baseUrl}weather-backgrounds/cloudy.png`,
    partlycloudy: `${baseUrl}weather-backgrounds/partly-cloudy-day.png`,
  }

  // Check for direct match
  if (backgroundMap[normalizedCondition]) {
    return backgroundMap[normalizedCondition]
  }

  // Check for partial matches
  if (normalizedCondition.includes('clear') || normalizedCondition.includes('sunny')) {
    return normalizedCondition.includes('night')
      ? `${baseUrl}weather-backgrounds/clear-night.png`
      : `${baseUrl}weather-backgrounds/clear-day.png`
  }

  if (normalizedCondition.includes('rain')) {
    return `${baseUrl}weather-backgrounds/rain.png`
  }

  if (normalizedCondition.includes('snow')) {
    return `${baseUrl}weather-backgrounds/snow.png`
  }

  if (normalizedCondition.includes('cloud')) {
    if (normalizedCondition.includes('partly') || normalizedCondition.includes('mostly')) {
      return normalizedCondition.includes('night')
        ? `${baseUrl}weather-backgrounds/partly-cloudy-night.png`
        : `${baseUrl}weather-backgrounds/partly-cloudy-day.png`
    }
    return `${baseUrl}weather-backgrounds/cloudy.png`
  }

  if (normalizedCondition.includes('wind') || normalizedCondition.includes('breezy')) {
    return `${baseUrl}weather-backgrounds/wind.png`
  }

  if (normalizedCondition.includes('fog') || normalizedCondition.includes('mist')) {
    return `${baseUrl}weather-backgrounds/fog.png`
  }

  // Default to null if no match found
  return null
}
