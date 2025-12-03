import { useState, useEffect } from 'react'

export const breakpoints = {
  mobile: 480,
  tablet: 768,
  desktop: 1024,
  wide: 1440,
} as const

export type Breakpoint = keyof typeof breakpoints

export const mediaQueries = {
  mobile: `(max-width: ${breakpoints.mobile - 1}px)`,
  tablet: `(min-width: ${breakpoints.mobile}px) and (max-width: ${breakpoints.tablet - 1}px)`,
  desktop: `(min-width: ${breakpoints.tablet}px) and (max-width: ${breakpoints.desktop - 1}px)`,
  wide: `(min-width: ${breakpoints.desktop}px)`,

  // Utility queries
  mobileUp: `(min-width: ${breakpoints.mobile}px)`,
  tabletUp: `(min-width: ${breakpoints.tablet}px)`,
  desktopUp: `(min-width: ${breakpoints.desktop}px)`,

  mobileOnly: `(max-width: ${breakpoints.tablet - 1}px)`,
  tabletOnly: `(min-width: ${breakpoints.tablet}px) and (max-width: ${breakpoints.desktop - 1}px)`,
  desktopOnly: `(min-width: ${breakpoints.desktop}px)`,
} as const

export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() => {
    // Default to desktop for SSR
    if (typeof window === 'undefined') return 'desktop'

    const width = window.innerWidth
    if (width < breakpoints.mobile) return 'mobile'
    if (width < breakpoints.tablet) return 'tablet'
    if (width < breakpoints.desktop) return 'desktop'
    return 'wide'
  })

  useEffect(() => {
    const updateBreakpoint = () => {
      const width = window.innerWidth
      if (width < breakpoints.mobile) {
        setBreakpoint('mobile')
      } else if (width < breakpoints.tablet) {
        setBreakpoint('tablet')
      } else if (width < breakpoints.desktop) {
        setBreakpoint('desktop')
      } else {
        setBreakpoint('wide')
      }
    }

    updateBreakpoint()
    window.addEventListener('resize', updateBreakpoint)
    return () => window.removeEventListener('resize', updateBreakpoint)
  }, [])

  return breakpoint
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    // Default to false for SSR
    if (typeof window === 'undefined') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    const mediaQuery = window.matchMedia(query)

    const handleChange = (e: MediaQueryListEvent) => {
      setMatches(e.matches)
    }

    // Add listener
    mediaQuery.addEventListener('change', handleChange)

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [query])

  return matches
}

export function useIsMobile(): boolean {
  return useMediaQuery(mediaQueries.mobileOnly)
}

export function useIsTablet(): boolean {
  return useMediaQuery(mediaQueries.tabletOnly)
}

export function useIsDesktop(): boolean {
  return useMediaQuery(mediaQueries.desktopOnly)
}

// Grid configuration based on breakpoint
export const gridConfig = {
  mobile: {
    columns: 4,
    rows: 12,
    margin: [12, 12] as [number, number], // Consistent with Radix p="3" (12px)
    containerPadding: [12, 12] as [number, number], // Consistent with sidebar padding
  },
  tablet: {
    columns: 8,
    rows: 10,
    margin: [16, 16] as [number, number], // Consistent with Radix p="4" (16px)
    containerPadding: [16, 16] as [number, number], // Consistent with sidebar padding
  },
  desktop: {
    columns: 12,
    rows: 8,
    margin: [16, 16] as [number, number], // Consistent with Radix p="4" (16px)
    containerPadding: [16, 16] as [number, number], // Consistent with sidebar padding
  },
  wide: {
    columns: 16,
    rows: 8,
    margin: [16, 16] as [number, number], // Consistent with Radix p="4" (16px)
    containerPadding: [16, 16] as [number, number], // Consistent with sidebar padding
  },
} as const

export function getGridConfig(breakpoint: Breakpoint) {
  return gridConfig[breakpoint]
}
