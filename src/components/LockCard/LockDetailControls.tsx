import { Box, Heading } from '@radix-ui/themes'
import { useCallback, useState } from 'react'
import { useServiceCall } from '~/hooks'
import { Pill, PillGroup } from '../anatomy'
import { ConfirmToggleDialog } from '../ConfirmToggleDialog'
import { LOCK_OPTION_DEFAULTS } from '~/store/lockOptions'
import {
  LOCK_CONFIRM_PROMPT,
  UNLOCK_CONFIRM_PROMPT,
  requiresLockConfirmation,
  resolveLockPresentation,
} from './presentation'
import type { CardConfirmRequest } from '~/hooks/useCardActions'
import type { EntityDetailControlsProps } from '../EntityDetailDialog/detailControls'

/**
 * What each service is, for the gate: its direction and the question it raises.
 *
 * A lookup rather than the pair of ternaries this started as. These controls
 * always apply the option *defaults*, and `confirmLock` defaults to `false`, so
 * a `service === 'unlock' ? … : …` has one arm that cannot be reached from here
 * — dead code sitting in the middle of a safety gate, which is exactly the kind
 * that can be wrong for a long time without anyone noticing. A table has no arms
 * to leave unreached, and it stays correct if a default ever changes.
 */
const SERVICE_GATE = {
  lock: { direction: 'locking', prompt: LOCK_CONFIRM_PROMPT },
  unlock: { direction: 'unlocking', prompt: UNLOCK_CONFIRM_PROMPT },
} as const

/**
 * The lock's Lock / Unlock pair inside the entity detail dialog.
 *
 * It exists because the card's pills render from `row` upward and a lock placed
 * 1×1 derives `glance`, where the tile carries no control at all and its tap
 * resolves to more-info. Without these, a 1×1 lock would be inoperable from
 * anywhere (docs/changes/0024 — "Detail-dialog controls").
 *
 * **The confirmations apply at their defaults.** The dialog is opened for an
 * *entity*, not for a placed item, so it cannot see a card's `confirmUnlock`.
 * Since that option defaults to `true` and the only thing a user can configure
 * is to switch it off, applying the default is the conservative reading rather
 * than a guess: the worst case is a door that asks once more than its card
 * would. The enablement comes from the same `resolveLockPresentation` the card
 * uses, so an indeterminate lock offers nothing here either.
 */
export function LockDetailControls({ entity }: EntityDetailControlsProps) {
  const { dispatchGuarded } = useServiceCall()
  const [confirmRequest, setConfirmRequest] = useState<CardConfirmRequest | null>(null)

  const entityId = entity.entity_id
  const { state, canLock, canUnlock, isActive } = resolveLockPresentation({ state: entity.state })

  /*
   * No error surface here, and so nothing to clear: the dialog shows the
   * entity's own state, and a failed command is reported by the card that owns
   * it. What this shares with the card is the guarded, non-retrying path, which
   * is the part that must not differ.
   */
  const dispatch = useCallback(
    (service: 'lock' | 'unlock') => {
      const run = () => {
        void dispatchGuarded({ domain: 'lock', service, entityId })
      }

      const { direction, prompt } = SERVICE_GATE[service]
      if (requiresLockConfirmation(direction, LOCK_OPTION_DEFAULTS)) {
        setConfirmRequest({ entityId, prompt, proceed: run })
        return
      }
      run()
    },
    [dispatchGuarded, entityId]
  )

  return (
    <Box>
      <Heading size="2" mb="2">
        Controls
      </Heading>
      <PillGroup label="Lock controls">
        <Pill
          domain="lock"
          color="ok"
          active={state === 'locked'}
          label="Lock"
          onClick={() => dispatch('lock')}
          disabled={!canLock}
        />
        <Pill
          domain="lock"
          color="alert"
          active={state === 'unlocked'}
          label="Unlock"
          onClick={() => dispatch('unlock')}
          disabled={!canUnlock}
        />
      </PillGroup>
      {confirmRequest && (
        <ConfirmToggleDialog
          request={confirmRequest}
          isOn={isActive}
          // No `name` override to pass: the dialog reads the entity's friendly
          // name itself, and there is no card config in scope to override with.
          onResolve={() => setConfirmRequest(null)}
        />
      )}
    </Box>
  )
}
