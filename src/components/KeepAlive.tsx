import { useState, useEffect, ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface KeepAliveProps {
  children: ReactNode
  cacheKey: string
  containerRef: React.RefObject<HTMLElement | null>
}

// Global cache to store portal elements
const portalCache = new Map<string, HTMLDivElement>()

// Get (or lazily create) the cached portal element for a key. Idempotent: the
// module-level cache guarantees one element per key, so it is safe to call
// during render.
function getOrCreatePortalElement(cacheKey: string): HTMLDivElement | null {
  if (typeof document === 'undefined') return null

  let element = portalCache.get(cacheKey)
  if (!element) {
    element = document.createElement('div')
    element.style.width = '100%'
    element.style.height = '100%'
    portalCache.set(cacheKey, element)
  }
  return element
}

export function KeepAlive({ children, cacheKey, containerRef }: KeepAliveProps) {
  // Resolve the portal element during render (no setState in an effect). The
  // element is stable per cacheKey, so children keep their state across moves.
  const [portalElement, setPortalElement] = useState<HTMLDivElement | null>(() =>
    getOrCreatePortalElement(cacheKey)
  )
  const [prevCacheKey, setPrevCacheKey] = useState(cacheKey)
  if (cacheKey !== prevCacheKey) {
    setPrevCacheKey(cacheKey)
    setPortalElement(getOrCreatePortalElement(cacheKey))
  }

  useEffect(() => {
    if (!portalElement) return

    // Append portal element to the current container.
    const container = containerRef.current
    if (container) {
      container.appendChild(portalElement)
    }

    return () => {
      // Remove portal element from current container but don't destroy it.
      if (portalElement.parentNode) {
        portalElement.parentNode.removeChild(portalElement)
      }
    }
  }, [portalElement, containerRef])

  // Render children into the cached portal element
  if (!portalElement) return null

  return createPortal(children, portalElement)
}
