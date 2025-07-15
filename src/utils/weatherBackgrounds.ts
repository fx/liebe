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
    'clear-day': `${baseUrl}weather-backgrounds/clear-day.jpg`,
    'clear-night': `${baseUrl}weather-backgrounds/clear-night.jpg`,
    rain: `${baseUrl}weather-backgrounds/rain.jpg`,
    snow: `${baseUrl}weather-backgrounds/snow.jpg`,
    sleet: `${baseUrl}weather-backgrounds/rain.jpg`, // Use rain background for sleet
    wind: `${baseUrl}weather-backgrounds/wind.jpg`,
    fog: `${baseUrl}weather-backgrounds/fog.jpg`,
    cloudy: `${baseUrl}weather-backgrounds/cloudy.jpg`,
    'partly-cloudy-day': `${baseUrl}weather-backgrounds/partly-cloudy-day.jpg`,
    'partly-cloudy-night': `${baseUrl}weather-backgrounds/partly-cloudy-night.jpg`,

    // Additional Pirate Weather icons (with icon=pirate)
    'mostly-clear-day': `${baseUrl}weather-backgrounds/clear-day.jpg`,
    'mostly-clear-night': `${baseUrl}weather-backgrounds/clear-night.jpg`,
    'mostly-cloudy-day': `${baseUrl}weather-backgrounds/cloudy.jpg`,
    'mostly-cloudy-night': `${baseUrl}weather-backgrounds/cloudy.jpg`,
    'possible-rain-day': `${baseUrl}weather-backgrounds/rain.jpg`,
    'possible-rain-night': `${baseUrl}weather-backgrounds/rain.jpg`,
    'possible-snow-day': `${baseUrl}weather-backgrounds/snow.jpg`,
    'possible-snow-night': `${baseUrl}weather-backgrounds/snow.jpg`,
    'possible-sleet-day': `${baseUrl}weather-backgrounds/rain.jpg`,
    'possible-sleet-night': `${baseUrl}weather-backgrounds/rain.jpg`,
    'possible-precipitation-day': `${baseUrl}weather-backgrounds/rain.jpg`,
    'possible-precipitation-night': `${baseUrl}weather-backgrounds/rain.jpg`,
    precipitation: `${baseUrl}weather-backgrounds/rain.jpg`,
    drizzle: `${baseUrl}weather-backgrounds/rain.jpg`,
    'light-rain': `${baseUrl}weather-backgrounds/rain.jpg`,
    'heavy-rain': `${baseUrl}weather-backgrounds/rain.jpg`,
    flurries: `${baseUrl}weather-backgrounds/snow.jpg`,
    'light-snow': `${baseUrl}weather-backgrounds/snow.jpg`,
    'heavy-snow': `${baseUrl}weather-backgrounds/snow.jpg`,
    'very-light-sleet': `${baseUrl}weather-backgrounds/rain.jpg`,
    'light-sleet': `${baseUrl}weather-backgrounds/rain.jpg`,
    'heavy-sleet': `${baseUrl}weather-backgrounds/rain.jpg`,
    breezy: `${baseUrl}weather-backgrounds/wind.jpg`,
    'dangerous-wind': `${baseUrl}weather-backgrounds/wind.jpg`,

    // Common weather conditions (for non-Pirate Weather integrations)
    sunny: `${baseUrl}weather-backgrounds/clear-day.jpg`,
    clear: `${baseUrl}weather-backgrounds/clear-day.jpg`,
    rainy: `${baseUrl}weather-backgrounds/rain.jpg`,
    snowy: `${baseUrl}weather-backgrounds/snow.jpg`,
    windy: `${baseUrl}weather-backgrounds/wind.jpg`,
    foggy: `${baseUrl}weather-backgrounds/fog.jpg`,
    overcast: `${baseUrl}weather-backgrounds/cloudy.jpg`,
    partlycloudy: `${baseUrl}weather-backgrounds/partly-cloudy-day.jpg`,
  }

  // Check for direct match
  if (backgroundMap[normalizedCondition]) {
    return backgroundMap[normalizedCondition]
  }

  // Check for partial matches
  if (normalizedCondition.includes('clear') || normalizedCondition.includes('sunny')) {
    return normalizedCondition.includes('night')
      ? `${baseUrl}weather-backgrounds/clear-night.jpg`
      : `${baseUrl}weather-backgrounds/clear-day.jpg`
  }

  if (normalizedCondition.includes('rain')) {
    return `${baseUrl}weather-backgrounds/rain.jpg`
  }

  if (normalizedCondition.includes('snow')) {
    return `${baseUrl}weather-backgrounds/snow.jpg`
  }

  if (normalizedCondition.includes('cloud')) {
    if (normalizedCondition.includes('partly') || normalizedCondition.includes('mostly')) {
      return normalizedCondition.includes('night')
        ? `${baseUrl}weather-backgrounds/partly-cloudy-night.jpg`
        : `${baseUrl}weather-backgrounds/partly-cloudy-day.jpg`
    }
    return `${baseUrl}weather-backgrounds/cloudy.jpg`
  }

  if (normalizedCondition.includes('wind') || normalizedCondition.includes('breezy')) {
    return `${baseUrl}weather-backgrounds/wind.jpg`
  }

  if (normalizedCondition.includes('fog') || normalizedCondition.includes('mist')) {
    return `${baseUrl}weather-backgrounds/fog.jpg`
  }

  // Default to null if no match found
  return null
}
