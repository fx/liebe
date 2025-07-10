import { useState, useEffect } from 'react'
import { CardConfig } from './CardConfig'
import { dashboardActions, useDashboardStore } from '~/store'
import { registerCardVariant } from './cardRegistry'
import type { CardProps } from './cardRegistry'
import type { GridItem } from '~/store/types'
import {
  WeatherCardDefault,
  WeatherCardMinimal,
  WeatherCardModern,
  WeatherCardDetailed,
} from './weather-variants'

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
