import { useState } from 'react'
import { CardConfig } from '../CardConfig'
import { dashboardActions, useDashboardStore } from '~/store'
import { migrateWeatherCardConfig, readWeatherOptions } from '~/store/weatherOptions'
import type { CardProps } from '../cardRegistry'
import type { GridItem } from '~/store/types'
import { WeatherCardDefault } from './WeatherCardDefault'
import { WeatherCardMinimal } from './WeatherCardMinimal'
import { WeatherCardModern } from './WeatherCardModern'
import { WeatherCardDetailed } from './WeatherCardDetailed'
import type { WeatherVariant } from '~/store/weatherOptions'

/*
 * The presentation helpers used to live in this file, which meant every variant
 * imported its own parent — a cycle that happened to resolve, and one more edge
 * for the registry cycle described below to close through. They are
 * `./presentation.ts` now; re-exported here because `getWeatherBackground` is
 * part of what this module has always offered its tests and callers.
 */
export {
  getWeatherBackground,
  getWeatherTextStyles,
  getWeatherTextColor,
  resolveConditionBackground,
} from './presentation'

const VARIANT_COMPONENTS: Readonly<Record<WeatherVariant, React.ComponentType<CardProps>>> = {
  default: WeatherCardDefault,
  minimal: WeatherCardMinimal,
  modern: WeatherCardModern,
  detailed: WeatherCardDetailed,
}

// Main WeatherCard that handles variant selection based on config
export function WeatherCard(props: CardProps) {
  const [configOpen, setConfigOpen] = useState(false)
  const screens = useDashboardStore((state) => state.screens)
  const currentScreenId = useDashboardStore((state) => state.currentScreenId)

  /*
   * `readWeatherOptions` resolves the legacy `preset` as a fallback for
   * `variant`, so a config that never went through the loader's rename — a
   * story, the configuration preview, a card handed a literal — still renders
   * the variant it was saved with, and a value this build has no component for
   * lands on `default` rather than on a blank tile.
   */
  const { variant } = readWeatherOptions(props.config)
  const VariantComponent = VARIANT_COMPONENTS[variant]

  const handleConfigSave = (updates: Partial<GridItem>) => {
    if (props.item && currentScreenId) {
      const screen = screens.find((s) => s.id === currentScreenId)
      if (screen) {
        // Saving is the other half of the rename the loader performs on the way
        // in: a card edited here is written back under the current key, so the
        // legacy one leaves the document the first time it is configured.
        if (updates.config) {
          updates = { ...updates, config: migrateWeatherCardConfig(updates.config) }
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
          // This card owns its configuration modal, so the preview's tier has
          // to come from the span the card itself was handed — otherwise it
          // falls back to the stored dimensions and previews a different tier
          // than the card behind it (docs/changes/0011-layout-tiers.md).
          span={props.span}
          onSave={handleConfigSave}
        />
      )}
    </>
  )
}

// Default dimensions and the card's presentation variants.
//
// The variants are attached statically rather than pushed into the registry via
// `registerCardVariant`: importing `cardRegistry` from here made the module
// graph circular (`cardRegistry` → every card → `CardConfig` → `WeatherCard` →
// `cardRegistry`), which crashes with a temporal-dead-zone error in any bundle
// whose entry reaches a card before the registry. `getCardVariant` reads
// `card.variants`, so lookups are unchanged — and the variants are now
// registered before the first render instead of after it.
Object.assign(WeatherCard, {
  defaultDimensions: { width: 4, height: 3 },
  variants: {
    minimal: WeatherCardMinimal,
    modern: WeatherCardModern,
    detailed: WeatherCardDetailed,
  },
})
