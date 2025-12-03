import { useState, useEffect, ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface KeepAliveProps {
  children: ReactNode
  cacheKey: string
  containerRef: React.RefObject<HTMLElement | null>
}

// Global cache to store portal elements
const portalCache = new Map<string, HTMLDivElement>()

export function KeepAlive({ children, cacheKey, containerRef }: KeepAliveProps) {
  // Use state instead of ref to track portal element - this triggers re-render when set
  const [portalElement, setPortalElement] = useState<HTMLDivElement | null>(() => {
    // Initialize from cache synchronously during initial render
    return portalCache.get(cacheKey) ?? null
  })

  useEffect(() => {
    // Get or create portal element for this cache key
    let element = portalCache.get(cacheKey)

    if (!element) {
      element = document.createElement('div')
      element.style.width = '100%'
      element.style.height = '100%'
      portalCache.set(cacheKey, element)
    }

    setPortalElement(element)

    // Append portal element to container
    if (containerRef.current && element) {
      containerRef.current.appendChild(element)
    }

    return () => {
      // Remove portal element from current container but don't destroy it
      if (element && element.parentNode) {
        element.parentNode.removeChild(element)
      }
    }
  }, [cacheKey, containerRef])

  // Render children into the cached portal element
  if (!portalElement) return null

  return createPortal(children, portalElement)
}
