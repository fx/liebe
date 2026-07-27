import { Box, Heading } from '@radix-ui/themes'
import { CaretUpIcon, CaretDownIcon, PauseIcon } from '@radix-ui/react-icons'
import { useCallback, useState } from 'react'
import { useServiceCall } from '~/hooks'
import { Pill, PillGroup } from '../anatomy'
import { ConfirmToggleDialog } from '../ConfirmToggleDialog'
import { COVER_OPTION_DEFAULTS, isSecurityCover } from '~/store/coverOptions'
import {
  COVER_FEATURE,
  readCoverDeviceClass,
  readSupportedFeatures,
  resolveCoverPresentation,
  type CoverAttributes,
} from './presentation'
import type { CardConfirmRequest } from '~/hooks/useCardActions'
import type { EntityDetailControlsProps } from '../EntityDetailDialog/detailControls'

const OPEN_CONFIRM_PROMPT = { verb: 'Open', gerund: 'opening' } as const

/**
 * The cover's open / stop / close row inside the entity detail dialog.
 *
 * It exists because the card's own button row renders at `full` only: a cover
 * placed 1×1 or on a narrow breakpoint derives `glance` or `row`, where the tile
 * carries no embedded control at all, and the dialog behind a hold is then the
 * whole control surface (docs/changes/0019 — PR 1). The gating and the disabling
 * are the card's, from the same `resolveCoverPresentation`, so a cover that
 * cannot be stopped has no stop button in either place.
 *
 * **The confirmation applies at its default.** The dialog is opened for an
 * *entity*, not for a placed item, so it cannot see a card's `confirmOpen`.
 * Since the option's default is `true` and the only thing a user can configure
 * is to switch the gate off, applying the default here is the conservative
 * reading rather than a guess: the worst case is a garage door that asks once
 * more than its card would.
 */
export function CoverDetailControls({ entity }: EntityDetailControlsProps) {
  const { dispatchGuarded } = useServiceCall()
  const [confirmRequest, setConfirmRequest] = useState<CardConfirmRequest | null>(null)

  const attributes = entity.attributes as CoverAttributes | undefined
  const supportedFeatures = readSupportedFeatures(attributes)
  const supportsOpen = (supportedFeatures & COVER_FEATURE.OPEN) !== 0
  const supportsClose = (supportedFeatures & COVER_FEATURE.CLOSE) !== 0
  const supportsStop = (supportedFeatures & COVER_FEATURE.STOP) !== 0

  const { isMoving, isFullyOpen, isFullyClosed, color, isActive } = resolveCoverPresentation({
    state: entity.state,
    attributes,
    options: COVER_OPTION_DEFAULTS,
  })

  const entityId = entity.entity_id
  const gateApplies =
    COVER_OPTION_DEFAULTS.confirmOpen && isSecurityCover(readCoverDeviceClass(attributes))

  /*
   * No error surface here, and so nothing to clear: the dialog shows the
   * entity's own state, and a failed command is reported by the card that owns
   * it. What this shares with the card is the guarded, non-retrying path, which
   * is the part that must not differ.
   */
  const dispatch = useCallback(
    (service: string) => {
      void dispatchGuarded({ domain: 'cover', service, entityId })
    },
    [dispatchGuarded, entityId]
  )

  const handleOpen = useCallback(() => {
    const run = () => dispatch('open_cover')
    if (gateApplies) {
      setConfirmRequest({ entityId, prompt: OPEN_CONFIRM_PROMPT, proceed: run })
      return
    }
    run()
  }, [dispatch, entityId, gateApplies])

  // Nothing at all rather than an empty group: a cover advertising none of the
  // three has no control surface here, and an empty heading is furniture.
  if (!supportsOpen && !supportsClose && !supportsStop) return null

  return (
    <Box>
      <Heading size="2" mb="2">
        Controls
      </Heading>
      <PillGroup label="Cover controls">
        {supportsOpen && (
          <Pill
            domain="cover"
            color={color}
            active={isFullyOpen}
            label="Open cover"
            hideLabel
            icon={<CaretUpIcon />}
            onClick={handleOpen}
            disabled={isFullyOpen}
          />
        )}
        {supportsStop && (
          <Pill
            domain="cover"
            color={isMoving ? 'alert' : color}
            active={isMoving}
            label="Stop cover"
            hideLabel
            icon={<PauseIcon />}
            onClick={() => dispatch('stop_cover')}
            disabled={!isMoving}
          />
        )}
        {supportsClose && (
          <Pill
            domain="cover"
            color={color}
            active={isFullyClosed}
            label="Close cover"
            hideLabel
            icon={<CaretDownIcon />}
            onClick={() => dispatch('close_cover')}
            disabled={isFullyClosed}
          />
        )}
      </PillGroup>
      {confirmRequest && (
        <ConfirmToggleDialog
          request={confirmRequest}
          isOn={isActive}
          // No `name` override to pass: the dialog reads the entity's friendly
          // name itself, and there is no card config in scope to override it with.
          onResolve={() => setConfirmRequest(null)}
        />
      )}
    </Box>
  )
}
