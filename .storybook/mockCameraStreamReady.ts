/**
 * Workshop replacement for `CameraCard/useCameraStreamReady`.
 *
 * The real hook bootstraps `<ha-camera-stream>` through the Home Assistant
 * frontend's card-helper ladder, which can only ever resolve inside HA — in
 * the workshop it would report `unavailable` for every camera story, pinning
 * the card to its still-image fallback and making the entire stream UI
 * unreachable. The story's fixture decides instead, through a story-only
 * `mock_readiness` attribute, so both branches are reachable: `unavailable`
 * for the still-image fallback the standalone dev server also takes, and
 * `ready` (the default) for the stream branch that `mockCameraStream` serves.
 *
 * `.storybook/vite.config.ts` substitutes this module for the real one in the
 * workshop build only; the panel bundle and the unit suite are untouched.
 */
import { useEntity } from '~/hooks'

export type CameraStreamReadiness = 'loading' | 'ready' | 'unavailable'

const READINESS: readonly CameraStreamReadiness[] = ['loading', 'ready', 'unavailable']

export function useCameraStreamReady(entityId: string): CameraStreamReadiness {
  const { entity } = useEntity(entityId)
  const requested = entity?.attributes.mock_readiness
  return READINESS.find((known) => known === requested) ?? 'ready'
}
