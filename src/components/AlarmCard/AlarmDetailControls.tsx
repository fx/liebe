import { Box, Heading } from '@radix-ui/themes'
import { useCallback, useState } from 'react'
import { useServiceCall } from '~/hooks'
import { Pill, PillGroup } from '../anatomy'
import { ConfirmToggleDialog } from '../ConfirmToggleDialog'
import { Keypad } from '~/components/Keypad'
import { ALARM_OPTION_DEFAULTS, type ArmMode } from '~/store/alarmOptions'
import {
  ARM_CONFIRM_PROMPT,
  ARM_MODE_SPEC,
  DISARM_CONFIRM_PROMPT,
  DISARM_SERVICE,
  codeRequiredToArm,
  codeRequiredToDisarm,
  keypadFormat,
  keypadShownFor,
  requiresAlarmConfirmation,
  resolveAlarmPresentation,
  resolveArmModes,
  type AlarmAttributes,
} from './presentation'
import type { CardConfirmRequest } from '~/hooks/useCardActions'
import type { EntityDetailControlsProps } from '../EntityDetailDialog/detailControls'

/**
 * Each direction's gate, as a pair rather than two parallel ternaries.
 *
 * These controls always apply the option *defaults*, and `confirmArm` defaults
 * to `false` — so an `arming` direction never reaches the confirmation block
 * from here, and a `direction === 'disarming' ? … : …` for the prompt had an arm
 * that could not be taken. Pairing the direction with its prompt removes the
 * unreachable arm without removing the correctness: if a default ever changes,
 * the right prompt is already attached to the right direction.
 */
const DISARM_GATE = { direction: 'disarming', prompt: DISARM_CONFIRM_PROMPT } as const
const ARM_GATE = { direction: 'arming', prompt: ARM_CONFIRM_PROMPT } as const

/**
 * The alarm's arm pills, Disarm and keypad inside the entity detail dialog.
 *
 * It exists because a panel placed 1×1 derives `glance`, where the card renders
 * no control at all and its tap resolves to more-info — so this IS the control
 * surface there, and without it a 1×1 alarm could not be armed or disarmed from
 * anywhere (docs/changes/0024 — "Detail-dialog controls").
 *
 * **The options apply at their defaults.** The dialog is opened for an *entity*,
 * not a placed item, so it cannot see a card's `confirmDisarm` or `armModes`.
 * Since `confirmDisarm` defaults to `true` and the only thing a user configures
 * is switching it off, applying the default is conservative rather than a guess.
 * `armModes` defaults to "everything the panel supports", which is also what a
 * dialog with no card context should offer.
 */
export function AlarmDetailControls({ entity }: EntityDetailControlsProps) {
  const { dispatchGuarded } = useServiceCall()
  const [confirmRequest, setConfirmRequest] = useState<CardConfirmRequest | null>(null)
  const [keypadRequest, setKeypadRequest] = useState<{
    service: string
    actionLabel: string
  } | null>(null)

  const entityId = entity.entity_id
  const attributes = entity.attributes as AlarmAttributes | undefined
  const { showArmPills, showDisarm, canDisarm, canArm, isIndeterminate, isActive, state } =
    resolveAlarmPresentation({ state: entity.state })

  const armModes = resolveArmModes(attributes, ALARM_OPTION_DEFAULTS.armModes)

  const send = useCallback(
    (service: string, code?: string) => {
      void dispatchGuarded({
        domain: 'alarm_control_panel',
        service,
        entityId,
        data: code ? { code } : undefined,
      })
    },
    [dispatchGuarded, entityId]
  )

  const begin = useCallback(
    (service: string, actionLabel: string, codeRequired: boolean) => {
      if (keypadShownFor(ALARM_OPTION_DEFAULTS.showKeypad, codeRequired)) {
        setKeypadRequest({ service, actionLabel })
        return
      }

      const { direction, prompt } = service === DISARM_SERVICE ? DISARM_GATE : ARM_GATE

      if (requiresAlarmConfirmation(direction, ALARM_OPTION_DEFAULTS, false)) {
        setConfirmRequest({ entityId, prompt, proceed: () => send(service) })
        return
      }

      send(service)
    },
    [entityId, send]
  )

  // Nothing at all rather than an empty group: a panel with no arm modes and
  // nothing to disarm has no control surface here, and a bare heading is
  // furniture.
  if (!showDisarm && armModes.length === 0) return null

  return (
    <Box>
      <Heading size="2" mb="2">
        Controls
      </Heading>
      <PillGroup label="Alarm controls">
        {showArmPills
          ? armModes.map((mode: ArmMode) => (
              <Pill
                key={mode}
                domain="alarm_control_panel"
                color="ok"
                active={state === ARM_MODE_SPEC[mode].state}
                label={ARM_MODE_SPEC[mode].label}
                onClick={() =>
                  begin(
                    ARM_MODE_SPEC[mode].service,
                    ARM_MODE_SPEC[mode].label,
                    codeRequiredToArm(attributes)
                  )
                }
                disabled={isIndeterminate || !canArm}
              />
            ))
          : null}
        {showDisarm && (
          <Pill
            domain="alarm_control_panel"
            color="alert"
            active={false}
            label="Disarm"
            onClick={() => begin(DISARM_SERVICE, 'Disarm', codeRequiredToDisarm(attributes))}
            disabled={isIndeterminate || !canDisarm}
          />
        )}
      </PillGroup>

      {keypadRequest && (
        <Box mt="3">
          <Keypad
            format={keypadFormat(attributes)}
            actionLabel={keypadRequest.actionLabel}
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
          onResolve={() => setConfirmRequest(null)}
        />
      )}
    </Box>
  )
}
