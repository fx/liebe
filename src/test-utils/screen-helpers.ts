import type { ScreenConfig } from '../store/types'
import { generateSlug } from '../utils/slug'

/**
 * Create a test screen with all required fields including slug
 */
export function createTestScreen(
  overrides: Partial<ScreenConfig> & { name: string; id: string }
): ScreenConfig {
  const { name, id, slug, ...rest } = overrides

  return {
    id,
    name,
    slug: slug || generateSlug(name),
    type: 'grid',
    grid: {
      resolution: { columns: 12, rows: 8 },
      sections: [],
    },
    ...rest,
  }
}
