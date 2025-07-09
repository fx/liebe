import type { GridItem } from '../store/types'

type PackedItem = GridItem

/**
 * Pack grid items to minimize empty space using a simple left-to-right, top-to-bottom algorithm
 * This algorithm tries to place items as close to the top-left as possible
 */
export function packGridItems(
  items: GridItem[],
  gridColumns: number,
  gridRows: number
): PackedItem[] {
  if (items.length === 0) return []

  // Sort items by size (larger items first) to improve packing efficiency
  const sortedItems = [...items].sort((a, b) => {
    const areaA = a.width * a.height
    const areaB = b.width * b.height
    return areaB - areaA
  })

  // Create a 2D grid to track occupied cells
  const grid: boolean[][] = Array(gridRows)
    .fill(null)
    .map(() => Array(gridColumns).fill(false))

  const packedItems: PackedItem[] = []

  // Try to place each item
  for (const item of sortedItems) {
    let placed = false

    // Try each position from top-left to bottom-right
    for (let y = 0; y <= gridRows - item.height && !placed; y++) {
      for (let x = 0; x <= gridColumns - item.width && !placed; x++) {
        // Check if the item fits at this position
        if (canPlaceItem(grid, x, y, item.width, item.height)) {
          // Place the item
          placeItem(grid, x, y, item.width, item.height)
          packedItems.push({
            ...item,
            x,
            y,
          })
          placed = true
        }
      }
    }

    // If item couldn't be placed, add it at the original position
    // This shouldn't happen if grid is large enough, but it's a safety measure
    if (!placed) {
      packedItems.push({
        ...item,
        x: item.x,
        y: item.y,
      })
    }
  }

  return packedItems
}

/**
 * Check if an item can be placed at the given position
 */
function canPlaceItem(
  grid: boolean[][],
  x: number,
  y: number,
  width: number,
  height: number
): boolean {
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      if (grid[y + dy][x + dx]) {
        return false
      }
    }
  }
  return true
}

/**
 * Mark cells as occupied
 */
function placeItem(grid: boolean[][], x: number, y: number, width: number, height: number): void {
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      grid[y + dy][x + dx] = true
    }
  }
}

/**
 * Alternative packing algorithm that tries to minimize the bounding box
 * This is more complex but can produce better results
 */
export function packGridItemsCompact(
  items: GridItem[],
  gridColumns: number,
  gridRows: number
): PackedItem[] {
  if (items.length === 0) return []

  // Sort items by height (tallest first), then by width
  const sortedItems = [...items].sort((a, b) => {
    if (a.height !== b.height) return b.height - a.height
    return b.width - a.width
  })

  const packedItems: PackedItem[] = []
  const heights: number[] = new Array(gridColumns).fill(0)

  for (const item of sortedItems) {
    let bestX = 0
    let minY = Infinity

    // Find the position with the lowest y coordinate
    for (let x = 0; x <= gridColumns - item.width; x++) {
      const y = Math.max(...heights.slice(x, x + item.width))
      if (y < minY) {
        minY = y
        bestX = x
      }
    }

    // Check if item fits within grid bounds
    if (minY + item.height <= gridRows) {
      // Update heights
      for (let x = bestX; x < bestX + item.width; x++) {
        heights[x] = minY + item.height
      }

      packedItems.push({
        ...item,
        x: bestX,
        y: minY,
      })
    } else {
      // If it doesn't fit, keep original position
      packedItems.push({
        ...item,
        x: item.x,
        y: item.y,
      })
    }
  }

  return packedItems
}
