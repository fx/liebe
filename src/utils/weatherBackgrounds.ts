// Map weather conditions to background images
export function getWeatherBackground(condition: string): string | null {
  // Normalize the condition
  const normalizedCondition = condition.toLowerCase().trim()

  // Direct mapping for standard Pirate Weather icons
  const backgroundMap: Record<string, string> = {
    'clear-day': '/weather-backgrounds/clear-day.jpg',
    'clear-night': '/weather-backgrounds/clear-night.jpg',
    rain: '/weather-backgrounds/rain.jpg',
    snow: '/weather-backgrounds/snow.jpg',
    sleet: '/weather-backgrounds/rain.jpg', // Use rain background for sleet
    wind: '/weather-backgrounds/wind.jpg',
    fog: '/weather-backgrounds/fog.jpg',
    cloudy: '/weather-backgrounds/cloudy.jpg',
    'partly-cloudy-day': '/weather-backgrounds/partly-cloudy-day.jpg',
    'partly-cloudy-night': '/weather-backgrounds/partly-cloudy-night.jpg',

    // Additional Pirate Weather icons (with icon=pirate)
    'mostly-clear-day': '/weather-backgrounds/clear-day.jpg',
    'mostly-clear-night': '/weather-backgrounds/clear-night.jpg',
    'mostly-cloudy-day': '/weather-backgrounds/cloudy.jpg',
    'mostly-cloudy-night': '/weather-backgrounds/cloudy.jpg',
    'possible-rain-day': '/weather-backgrounds/rain.jpg',
    'possible-rain-night': '/weather-backgrounds/rain.jpg',
    'possible-snow-day': '/weather-backgrounds/snow.jpg',
    'possible-snow-night': '/weather-backgrounds/snow.jpg',
    'possible-sleet-day': '/weather-backgrounds/rain.jpg',
    'possible-sleet-night': '/weather-backgrounds/rain.jpg',
    'possible-precipitation-day': '/weather-backgrounds/rain.jpg',
    'possible-precipitation-night': '/weather-backgrounds/rain.jpg',
    precipitation: '/weather-backgrounds/rain.jpg',
    drizzle: '/weather-backgrounds/rain.jpg',
    'light-rain': '/weather-backgrounds/rain.jpg',
    'heavy-rain': '/weather-backgrounds/rain.jpg',
    flurries: '/weather-backgrounds/snow.jpg',
    'light-snow': '/weather-backgrounds/snow.jpg',
    'heavy-snow': '/weather-backgrounds/snow.jpg',
    'very-light-sleet': '/weather-backgrounds/rain.jpg',
    'light-sleet': '/weather-backgrounds/rain.jpg',
    'heavy-sleet': '/weather-backgrounds/rain.jpg',
    breezy: '/weather-backgrounds/wind.jpg',
    'dangerous-wind': '/weather-backgrounds/wind.jpg',

    // Common weather conditions (for non-Pirate Weather integrations)
    sunny: '/weather-backgrounds/clear-day.jpg',
    clear: '/weather-backgrounds/clear-day.jpg',
    rainy: '/weather-backgrounds/rain.jpg',
    snowy: '/weather-backgrounds/snow.jpg',
    windy: '/weather-backgrounds/wind.jpg',
    foggy: '/weather-backgrounds/fog.jpg',
    overcast: '/weather-backgrounds/cloudy.jpg',
    partlycloudy: '/weather-backgrounds/partly-cloudy-day.jpg',
  }

  // Check for direct match
  if (backgroundMap[normalizedCondition]) {
    return backgroundMap[normalizedCondition]
  }

  // Check for partial matches
  if (normalizedCondition.includes('clear') || normalizedCondition.includes('sunny')) {
    return normalizedCondition.includes('night')
      ? '/weather-backgrounds/clear-night.jpg'
      : '/weather-backgrounds/clear-day.jpg'
  }

  if (normalizedCondition.includes('rain')) {
    return '/weather-backgrounds/rain.jpg'
  }

  if (normalizedCondition.includes('snow')) {
    return '/weather-backgrounds/snow.jpg'
  }

  if (normalizedCondition.includes('cloud')) {
    if (normalizedCondition.includes('partly') || normalizedCondition.includes('mostly')) {
      return normalizedCondition.includes('night')
        ? '/weather-backgrounds/partly-cloudy-night.jpg'
        : '/weather-backgrounds/partly-cloudy-day.jpg'
    }
    return '/weather-backgrounds/cloudy.jpg'
  }

  if (normalizedCondition.includes('wind') || normalizedCondition.includes('breezy')) {
    return '/weather-backgrounds/wind.jpg'
  }

  if (normalizedCondition.includes('fog') || normalizedCondition.includes('mist')) {
    return '/weather-backgrounds/fog.jpg'
  }

  // Default to null if no match found
  return null
}
