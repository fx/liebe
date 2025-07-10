/**
 * Panel configuration for different environments
 */

export interface PanelConfig {
  elementName: string
  urlPath: string
}

// Determine panel configuration based on environment
export function getPanelConfig(): PanelConfig {
  const isDevelopment = process.env.NODE_ENV !== 'production'

  if (isDevelopment) {
    return {
      elementName: 'liebe-panel-dev',
      urlPath: '/liebe-dev',
    }
  }

  return {
    elementName: 'liebe-panel',
    urlPath: '/liebe',
  }
}

// Get all possible panel paths for route detection
export function getAllPanelPaths(): string[] {
  return ['/liebe', '/liebe-dev']
}

// Check if current location is a panel path
export function isPanelPath(pathname: string): boolean {
  return getAllPanelPaths().some((path) => pathname.includes(path))
}

// Get the panel base path from current location
export function getPanelBasePath(pathname: string): string | undefined {
  const paths = getAllPanelPaths()
  // Check paths in reverse order (more specific first)
  for (const path of paths.reverse()) {
    if (pathname.includes(path)) {
      return path
    }
  }
  return undefined
}
