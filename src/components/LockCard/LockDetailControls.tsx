import { Box, Heading } from '@radix-ui/themes'
import { useCallback, useState } from 'react'
import { useServiceCall } from '~/hooks'
import { Pill, PillGroup } from '../anatomy'
import { ConfirmToggleDialog } from '../ConfirmToggleDialog'
import { Keypad, readCodeFormat, type CodeFormat } from '~/components/Keypad'
import { LOCK_OPTION_DEFAULTS } from '~/store/lockOptions'
import {
  LOCK_CONFIRM_PROMPT,
  LOCK_SERVICE_LABEL,
  UNLOCK_CONFIRM_PROMPT,
  requiresLockConfirmation,
  resolveLockPresentation,
  type LockAttributes,
  type LockService,
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
  const [keypadRequest, setKeypadRequest] = useState<{
    service: LockService
    format: CodeFormat
  } | null>(null)

  const entityId = entity.entity_id
  const { state, canLock, canUnlock, isActive } = resolveLockPresentation({ state: entity.state })

  /*
   * A code-protected lock needs its keypad HERE most of all: a lock placed 1×1
   * derives `glance`, where the card carries no control and the tap opens this
   * dialog, so without one such a lock would be operable from nowhere at all.
   */
  const codeFormat = readCodeFormat(entity.attributes as LockAttributes | undefined)

  /*
   * No error surface here, and so nothing to clear: the dialog shows the
   * entity's own state, and a failed command is reported by the card that owns
   * it. What this shares with the card is the guarded, non-retrying path, which
   * is the part that must not differ.
   */
  const send = useCallback(
    (service: LockService, code?: string) => {
      // As on the card: the code goes with the call and nowhere else.
      void dispatchGuarded({ domain: 'lock', service, entityId, data: code ? { code } : undefined })
    },
    [dispatchGuarded, entityId]
  )

  const dispatch = useCallback(
    (service: LockService) => {
      if (codeFormat !== undefined) {
        setKeypadRequest({ service, format: codeFormat })
        return
      }

      const { direction, prompt } = SERVICE_GATE[service]
      if (requiresLockConfirmation(direction, LOCK_OPTION_DEFAULTS, false)) {
        setConfirmRequest({ entityId, prompt, proceed: () => send(service) })
        return
      }
      send(service)
    },
    [codeFormat, entityId, send]
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
      {keypadRequest && (
        <Box mt="3">
          <Keypad
            format={keypadRequest.format}
            actionLabel={LOCK_SERVICE_LABEL[keypadRequest.service]}
            onSubmit={(code) => {
              send(keypadRequest.service, code)
              setKeypadRequest(null)
            }}
            onCancel={() => setKeypadRequest(null)}
          />
        </Box>
      )}
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
