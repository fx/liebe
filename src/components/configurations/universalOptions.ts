import { CARD_ACTION_DEFAULTS } from '~/store/cardActions'
import type { ConfigDefinition } from '../CardConfig'

/**
 * The universal option surface every entity card exposes, merged into each
 * card's own configuration form rather than declared card by card
 * (docs/specs/entity-cards/options/common.md).
 *
 * Only the action keys so far; the display options (`name`, `icon`, `hideName`,
 * `hideState`, `color`) join them in 0014 PR 3.
 */
export const actionConfigOptions: ConfigDefinition = {
  tapAction: {
    type: 'action',
    default: CARD_ACTION_DEFAULTS.tapAction,
    label: 'Tap',
    description: 'What a tap on the card does.',
  },
  holdAction: {
    type: 'action',
    default: CARD_ACTION_DEFAULTS.holdAction,
    label: 'Hold',
    description: 'What a press and hold does.',
  },
  doubleTapAction: {
    type: 'action',
    default: CARD_ACTION_DEFAULTS.doubleTapAction,
    label: 'Double tap',
    description: 'What a double tap does. Leaving this at “Nothing” keeps taps instant.',
  },
}
