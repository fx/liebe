import { useEffect, useState } from 'react'
import { Flex } from '@radix-ui/themes'
import { VideoIcon } from '@radix-ui/react-icons'
import type { HomeAssistantState } from '../../contexts/HomeAssistantContext'

const REFRESH_INTERVAL_MS = 10_000

export interface StillImageFallbackProps {
  entity: HomeAssistantState
  objectFit?: 'cover' | 'contain' | 'fill'
}

// Still-image fallback for when <ha-camera-stream> cannot be bootstrapped
// (standalone dev, or the HA frontend never defines the element). Shows the
// entity's `entity_picture` snapshot, refreshed periodically with a
// cache-busting query param.
export function StillImageFallback({ entity, objectFit = 'cover' }: StillImageFallbackProps) {
  const [refreshCounter, setRefreshCounter] = useState(0)
  const { entity_picture: entityPicture, friendly_name: friendlyName } = entity.attributes as {
    entity_picture?: string
    friendly_name?: string
  }

  useEffect(() => {
    if (!entityPicture) return
    const interval = setInterval(() => {
      setRefreshCounter((count) => count + 1)
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [entityPicture])

  if (!entityPicture) {
    return (
      <Flex align="center" justify="center" style={{ width: '100%', height: '100%' }}>
        <VideoIcon
          aria-label="No camera image available"
          style={{ color: 'var(--gray-9)', width: 20, height: 20 }}
        />
      </Flex>
    )
  }

  // Deterministic cache-buster: an incrementing counter (not Date.now()) so
  // the refresh cadence is fully controllable in tests.
  const separator = entityPicture.includes('?') ? '&' : '?'
  const src = `${entityPicture}${separator}_ts=${refreshCounter}`

  return (
    <img
      src={src}
      alt={friendlyName || entity.entity_id}
      style={{ width: '100%', height: '100%', objectFit, display: 'block' }}
    />
  )
}
