import type { GridItem, GridResolution } from '../store/types'

/**
 * Find the optimal position for a new grid item.
 * Searches for the highest available position where the item fits.
 *
 * @param existingItems - Current items on the grid
 * @param itemWidth - Width of the new item
 * @param itemHeight - Height of the new item
 * @param gridResolution - Grid resolution (columns and rows)
 * @returns Optimal x and y coordinates for the new item
 */
export function findOptimalPosition(
  existingItems: GridItem[],
  itemWidth: number,
  itemHeight: number,
  gridResolution: GridResolution
): { x: number; y: number } {
  const { columns } = gridResolution

  // Create a 2D array to represent occupied cells
  // We'll use a sparse representation for efficiency
  const occupiedCells = new Set<string>()

  // Mark all occupied cells
  existingItems.forEach((item) => {
    for (let x = item.x; x < item.x + item.width; x++) {
      for (let y = item.y; y < item.y + item.height; y++) {
        occupiedCells.add(`${x},${y}`)
      }
    }
  })

  // Find the maximum y position of existing items
  const maxY = existingItems.reduce((max, item) => {
    return Math.max(max, item.y + item.height)
  }, 0)

  // Search for the first available position starting from the top
  for (let y = 0; y <= maxY + 1; y++) {
    for (let x = 0; x <= columns - itemWidth; x++) {
      // Check if all cells for this position are available
      let canFit = true

      for (let dx = 0; dx < itemWidth && canFit; dx++) {
        for (let dy = 0; dy < itemHeight && canFit; dy++) {
          if (occupiedCells.has(`${x + dx},${y + dy}`)) {
            canFit = false
          }
        }
      }

      if (canFit) {
        return { x, y }
      }
    }
  }

  // If no position found in existing grid, place at the bottom
  return { x: 0, y: maxY }
}

/**
 * Find optimal positions for multiple items being added at once.
 * This ensures items don't overlap when added in batch.
 *
 * @param existingItems - Current items on the grid
 * @param newItems - Array of items to add (with width and height)
 * @param gridResolution - Grid resolution (columns and rows)
 * @returns Array of optimal positions for each new item
 */
export function findOptimalPositionsForBatch(
  existingItems: GridItem[],
  newItems: Array<{ width: number; height: number }>,
  gridResolution: GridResolution
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = []
  const virtualItems = [...existingItems]

  newItems.forEach((newItem, index) => {
    const position = findOptimalPosition(
      virtualItems,
      newItem.width,
      newItem.height,
      gridResolution
    )

    positions.push(position)

    // Add this item to virtual items for next iteration
    virtualItems.push({
      id: `temp-${index}`,
      type: 'entity',
      entityId: '',
      x: position.x,
      y: position.y,
      width: newItem.width,
      height: newItem.height,
    })
  })

  return positions
}
