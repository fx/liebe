/**
 * Default grid dimensions for a card component
 */
export interface CardDefaultDimensions {
  width: number
  height: number
}

/**
 * Interface that card components can implement to provide default dimensions
 */
export interface CardWithDefaultDimensions {
  defaultDimensions: CardDefaultDimensions
}
