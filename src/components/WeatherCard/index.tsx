import { useState, useEffect } from 'react'
import { CardConfig } from '../CardConfig'
import { dashboardActions, useDashboardStore } from '~/store'
import { registerCardVariant } from '../cardRegistry'
import type { CardProps } from '../cardRegistry'
import type { GridItem } from '~/store/types'
import type { CSSProperties } from 'react'
import { WeatherCardDefault } from './WeatherCardDefault'
import { WeatherCardMinimal } from './WeatherCardMinimal'
import { WeatherCardModern } from './WeatherCardModern'
import { WeatherCardDetailed } from './WeatherCardDetailed'

// Register weather card variants - do this inside a component to avoid initialization issues
let variantsRegistered = false
function registerWeatherVariants() {
  if (!variantsRegistered) {
    registerCardVariant('weather', 'minimal', WeatherCardMinimal)
    registerCardVariant('weather', 'modern', WeatherCardModern)
    registerCardVariant('weather', 'detailed', WeatherCardDetailed)
    variantsRegistered = true
  }
}

interface WeatherCardConfig {
  preset?: 'default' | 'detailed' | 'minimal' | 'modern'
  variant?: string // New variant field
  temperatureUnit?: 'auto' | 'celsius' | 'fahrenheit'
}

// Weather styling utilities (previously in weatherCardStyles.ts)
// Color type from Radix UI themes
type RadixColor =
  | 'gray'
  | 'gold'
  | 'bronze'
  | 'brown'
  | 'yellow'
  | 'amber'
  | 'orange'
  | 'tomato'
  | 'red'
  | 'ruby'
  | 'crimson'
  | 'pink'
  | 'plum'
  | 'purple'
  | 'violet'
  | 'iris'
  | 'indigo'
  | 'blue'
  | 'cyan'
  | 'teal'
  | 'jade'
  | 'green'
  | 'grass'
  | 'lime'
  | 'mint'
  | 'sky'

interface WeatherTextStyles {
  text: CSSProperties
  icon: CSSProperties
}

/**
 * Get consistent text styling for weather cards with background images
 * @param hasBackground - Whether the card has a background image
 * @param variant - The style variant (default, emphasis)
 */
export function getWeatherTextStyles(
  hasBackground: boolean,
  variant: 'default' | 'emphasis' = 'default'
): WeatherTextStyles {
  if (!hasBackground) {
    return {
      text: {},
      icon: {},
    }
  }

  const baseTextStyle: CSSProperties = {
    color: 'white',
    textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.4)',
  }

  const emphasisTextStyle: CSSProperties = {
    color: 'white',
    textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.5)',
  }

  const iconStyle: CSSProperties = {
    color: 'white',
    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))',
  }

  return {
    text: variant === 'emphasis' ? emphasisTextStyle : baseTextStyle,
    icon: iconStyle,
  }
}

/**
 * Get text color prop for Radix UI Text components
 * @param hasBackground - Whether the card has a background image
 * @param defaultColor - The default color when no background
 */
export function getWeatherTextColor(
  hasBackground: boolean,
  defaultColor: RadixColor | undefined = undefined
): RadixColor | undefined {
  return hasBackground ? undefined : defaultColor
}

// Weather background utilities (previously in weatherBackgrounds.ts)
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

// Main WeatherCard that handles variant selection based on config
export function WeatherCard(props: CardProps) {
  // Register variants on first render
  useEffect(() => {
    registerWeatherVariants()
  }, [])

  const [configOpen, setConfigOpen] = useState(false)
  const screens = useDashboardStore((state) => state.screens)
  const currentScreenId = useDashboardStore((state) => state.currentScreenId)
  const config = props.config as WeatherCardConfig

  // Determine which variant to render based on config
  // First check new 'variant' field, then fall back to 'preset' for backwards compatibility
  const variantName = config?.variant || config?.preset || 'default'

  // Get the appropriate component
  let VariantComponent: React.ComponentType<CardProps>
  switch (variantName) {
    case 'minimal':
      VariantComponent = WeatherCardMinimal
      break
    case 'modern':
      VariantComponent = WeatherCardModern
      break
    case 'detailed':
      VariantComponent = WeatherCardDetailed
      break
    case 'default':
    default:
      VariantComponent = WeatherCardDefault
      break
  }

  const handleConfigSave = (updates: Partial<GridItem>) => {
    if (props.item && currentScreenId) {
      const screen = screens.find((s) => s.id === currentScreenId)
      if (screen) {
        // Convert preset to variant in config updates
        if (updates.config && 'preset' in updates.config) {
          const updatedConfig = { ...updates.config }
          updatedConfig.variant = updatedConfig.preset
          delete updatedConfig.preset
          updates = { ...updates, config: updatedConfig }
        }
        dashboardActions.updateGridItem(currentScreenId, props.item.id, updates)
      }
    }
  }

  const handleConfigure = () => {
    setConfigOpen(true)
  }

  // Pass through all props with added config handler
  const enhancedProps = {
    ...props,
    onConfigure: handleConfigure,
  }

  return (
    <>
      <VariantComponent {...enhancedProps} />

      {props.item && (
        <CardConfig.Modal
          open={configOpen}
          onOpenChange={setConfigOpen}
          item={props.item}
          onSave={handleConfigSave}
        />
      )}
    </>
  )
}

// Assign default dimensions
Object.assign(WeatherCard, {
  defaultDimensions: { width: 4, height: 3 },
})
