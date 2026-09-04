import { useCallback, useEffect, useRef, useState } from 'react'
import { NOW_60S_MS, useNowTimestamp } from '~/hooks/useNow'
import type { ServiceCallResult } from '~/services/hassService'
import type { EntityAttributes } from '~/store/entityTypes'
import { formatLastActivated, readActivationTimestamp } from './actions'

/**
 * The activation feedback these cards owe the user, and the `showLastActivated`
 * line's ticker. Both are stateful, so they live here rather than in the pure
 * `actions.ts` beside them.
 */

/** How long the success check holds before the icon reverts (spec: ~1.5s). */
export const ACTIVATION_CHECK_HOLD_MS = 1500

/** How often the relative time is recomputed while visible (spec: at least per minute). */
export const LAST_ACTIVATED_REFRESH_MS = 60_000

/**
 * Where the card is in the icon → spinner → check → icon sequence.
 *
 * `pending` while the call is in flight, `success` for the check hold. There is
 * no `error` phase: a failure is the card shell's standard error state, driven by
 * `useServiceCall`'s own `error`, and no check is shown for it
 * (docs/specs/entity-cards/options/scene.md — "Activation feedback").
 */
export type ActivationPhase = 'idle' | 'pending' | 'success'

export interface ActivationFeedback {
  phase: ActivationPhase
  /**
   * Runs one dispatch with the feedback sequence around it. The dispatch itself
   * is the caller's, so this hook never decides *what* is called — only what the
   * icon does while it is called.
   */
  run: (dispatch: () => Promise<ServiceCallResult>) => Promise<void>
}

/**
 * The intrinsic activation feedback for a card whose entity has no state change
 * to observe.
 *
 * It is behaviour, not decoration, which is why it is not an option and why the
 * check survives `prefers-reduced-motion`: the tap's only evidence that anything
 * happened is this sequence. What reduced motion drops — the spinner's rotation
 * and the swap transitions — is handled in the stylesheet, so no logic here can
 * switch it back on (see `app.css`, and `FanCard` for the same placement
 * argument).
 */
export function useActivationFeedback(): ActivationFeedback {
  const [phase, setPhase] = useState<ActivationPhase>('idle')
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearHold = useCallback(() => {
    if (holdRef.current) {
      clearTimeout(holdRef.current)
      holdRef.current = null
    }
  }, [])

  // A card unmounted mid-hold must not leave a timer to fire into nothing.
  useEffect(() => clearHold, [clearHold])

  const run = useCallback(
    async (dispatch: () => Promise<ServiceCallResult>) => {
      // A second run inside an existing hold restarts the sequence rather than
      // inheriting the old timer, which would cut the new check short.
      clearHold()
      setPhase('pending')

      const result = await dispatch()

      if (!result.success) {
        // The failure surfaces as the shell's error state; the icon simply goes
        // back to itself rather than claiming a success that did not happen.
        setPhase('idle')
        return
      }

      setPhase('success')
      holdRef.current = setTimeout(() => {
        holdRef.current = null
        setPhase('idle')
      }, ACTIVATION_CHECK_HOLD_MS)
    },
    [clearHold]
  )

  return { phase, run }
}

/**
 * The `showLastActivated` text, kept current while the card is on screen.
 *
 * The interval runs only while the option is on: an unconfigured card — which is
 * every card by default — must not pay a timer per tile for a line it does not
 * render.
 */
export function useLastActivated(
  domain: string,
  state: string,
  attributes: EntityAttributes | undefined,
  enabled: boolean
): string | null {
  // Same shared 60s clock as the since-lines: one wheel for every per-minute
  // consumer on the dashboard.
  const now = useNowTimestamp(NOW_60S_MS, enabled)

  if (!enabled) return null
  return formatLastActivated(readActivationTimestamp(domain, state, attributes), now)
}
