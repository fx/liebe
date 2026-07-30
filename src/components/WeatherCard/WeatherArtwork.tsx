import './WeatherCard.css'

/**
 * The condition artwork's scrim layer, shared by every variant that paints one.
 *
 * Three variants render artwork (`default`, `modern`, `detailed`; `minimal`
 * never does), at every tier, and the design-system rule applies to all of them
 * — so the layer and the class that scopes the foreground tokens live here
 * rather than three times over. A variant that paints artwork and forgets one of
 * the two would be legible in review and illegible on screen.
 *
 * Spec: docs/specs/design-system/index.md — "Text over content imagery sits on
 * a scrim"; docs/specs/entity-cards/options/weather.md — "Condition background".
 */

/** The class the tile takes while it paints artwork; scopes the tokens. */
export const WEATHER_ARTWORK_CLASS = 'weather-card-artwork'

/**
 * The class for the artwork scope, or `undefined` on the flat themed surface.
 *
 * `undefined` rather than `''` so a card without artwork carries no class at
 * all: the token overrides must not apply where there is no scrim to justify
 * them, or a light theme would render white text on its own pale surface.
 */
export function weatherArtworkClass(hasBackground: boolean): string | undefined {
  return hasBackground ? WEATHER_ARTWORK_CLASS : undefined
}

/**
 * The scrim element, or nothing without artwork.
 *
 * Rendered as the tile's first child. Its position in the DOM is not what puts
 * it under the content — `z-index: -1` inside the scope's stacking context is
 * (`WeatherCard.css`) — but keeping it first matches what it represents, and
 * keeps the edit affordances the shell appends last painting above everything.
 */
export function WeatherScrim({ hasBackground }: { hasBackground: boolean }) {
  if (!hasBackground) return null

  return <div className="liebe-weather-scrim" />
}
