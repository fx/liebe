import { Box, Heading, Text } from '@radix-ui/themes'
import { useCallback, useState } from 'react'
import { useServiceCall } from '~/hooks'
import { Pill, PillGroup } from '../anatomy'
import { ConfirmToggleDialog } from '../ConfirmToggleDialog'
import { Keypad, readCodeFormat, redactCode, type CodeFormat } from '~/components/Keypad'
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
  /*
   * What the lock said when it refused the last code, already redacted.
   *
   * Held here rather than read off `useServiceCall`'s `error` for two reasons:
   * the message has to sit beside the keypad that produced it rather than in a
   * card's state line, and the hook's copy is the raw string, which is the one
   * place a credential could plausibly appear.
   */
  const [keypadError, setKeypadError] = useState<string | null>(null)
  /*
   * Bumped on every refusal, and used as the keypad's `key`, so React remounts
   * it: that clears the rejected entry AND releases the at-most-once submit
   * latch, which is what makes a second attempt possible at all. Without the
   * remount the keypad would stay open showing an error above a dead button.
   */
  const [attempt, setAttempt] = useState(0)

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
    (service: LockService) => {
      // No `data`: a coded command goes through `submitCode`, which awaits its
      // result instead of firing and forgetting.
      void dispatchGuarded({ domain: 'lock', service, entityId })
    },
    [dispatchGuarded, entityId]
  )

  /**
   * Submit a collected code, and keep the keypad up if the lock refuses it.
   *
   * The keypad used to close the moment submit was pressed, before the call had
   * settled — so a **wrong code looked exactly like a successful unlock**: the
   * keypad vanished and nothing else changed. On a credential surface that is
   * the one outcome the user must be able to tell apart, and the alarm's own
   * e2e spec ("a wrong code is refused by the panel and changes nothing")
   * treats it as behaviour worth pinning.
   *
   * The message is redacted **here**, where `code` is a parameter — so what
   * reaches state is the redacted string and the credential is not retained in
   * order to redact it later.
   */
  const submitCode = useCallback(
    async (service: LockService, code: string) => {
      const result = await dispatchGuarded({
        domain: 'lock',
        service,
        entityId,
        data: { code },
      })

      if (result.success) {
        setKeypadRequest(null)
        setKeypadError(null)
        return
      }

      setKeypadError(redactCode(result.error ?? 'The lock refused that command.', code))
      setAttempt((n) => n + 1)
    },
    [dispatchGuarded, entityId]
  )

  const dispatch = useCallback(
    (service: LockService) => {
      if (codeFormat !== undefined) {
        setKeypadError(null)
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
          {keypadError && (
            <Text
              as="p"
              size="2"
              mb="2"
              role="alert"
              style={{ color: 'var(--liebe-c-alert-text)' }}
            >
              {keypadError}
            </Text>
          )}
          <Keypad
            key={attempt}
            format={keypadRequest.format}
            actionLabel={LOCK_SERVICE_LABEL[keypadRequest.service]}
            onSubmit={(code) => void submitCode(keypadRequest.service, code)}
            onCancel={() => {
              setKeypadRequest(null)
              setKeypadError(null)
            }}
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
