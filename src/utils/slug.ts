/**
 * Generate a URL-safe slug from a screen name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-')  // Replace spaces, underscores, hyphens with single hyphen
    .replace(/^-+|-+$/g, '');  // Remove leading/trailing hyphens
}

/**
 * Ensure a slug is unique within a list of existing slugs
 */
export function ensureUniqueSlug(baseSlug: string, existingSlugs: string[]): string {
  if (!existingSlugs.includes(baseSlug)) {
    return baseSlug;
  }
  
  let counter = 1;
  let uniqueSlug = `${baseSlug}-${counter}`;
  
  while (existingSlugs.includes(uniqueSlug)) {
    counter++;
    uniqueSlug = `${baseSlug}-${counter}`;
  }
  
  return uniqueSlug;
}

/**
 * Get all slugs from a screen tree structure
 */
export function getAllSlugs(screens: Array<{ slug: string; children?: Array<{ slug: string; children?: any[] }> }>): string[] {
  const slugs: string[] = [];
  
  const collectSlugs = (screenList: typeof screens) => {
    for (const screen of screenList) {
      slugs.push(screen.slug);
      if (screen.children) {
        collectSlugs(screen.children);
      }
    }
  };
  
  collectSlugs(screens);
  return slugs;
}