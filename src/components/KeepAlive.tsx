import { useRef, useEffect, ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface KeepAliveProps {
  children: ReactNode
  cacheKey: string
  containerRef: React.RefObject<HTMLElement>
}

// Global cache to store portal elements
const portalCache = new Map<string, HTMLDivElement>()

export function KeepAlive({ children, cacheKey, containerRef }: KeepAliveProps) {
  const portalElementRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // Get or create portal element for this cache key
    let portalElement = portalCache.get(cacheKey)
    
    if (!portalElement) {
      portalElement = document.createElement('div')
      portalElement.style.width = '100%'
      portalElement.style.height = '100%'
      portalCache.set(cacheKey, portalElement)
    }
    
    portalElementRef.current = portalElement

    // Append portal element to container
    if (containerRef.current && portalElement) {
      containerRef.current.appendChild(portalElement)
    }

    return () => {
      // Remove portal element from current container but don't destroy it
      if (portalElement && portalElement.parentNode) {
        portalElement.parentNode.removeChild(portalElement)
      }
    }
  }, [cacheKey, containerRef])

  // Render children into the cached portal element
  if (!portalElementRef.current) return null
  
  return createPortal(children, portalElementRef.current)
}