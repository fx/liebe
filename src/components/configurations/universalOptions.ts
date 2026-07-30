import { CARD_ACTION_DEFAULTS } from '~/store/cardActions'
import { CARD_ALIGN_OPTIONS, CARD_COLOR_OPTIONS, CARD_DISPLAY_DEFAULTS } from '~/store/cardDisplay'
import type { ConfigDefinition } from '../CardConfig'

/**
 * The universal option surface every entity card exposes, merged into each
 * card's own configuration form rather than declared card by card
 * (docs/specs/entity-cards/options/common.md).
 *
 * Two fragments because they are two sections in the form — what the card looks
 * like, and what it does — not because they are two contracts. Both are stored
 * under the same `item.config` and round-trip through the same YAML.
 */

/** How the enum's values read in the form. */
const COLOR_LABELS: Readonly<Record<(typeof CARD_COLOR_OPTIONS)[number], string>> = {
  auto: 'Automatic (follows the entity)',
  light: 'Light (amber)',
  heat: 'Heat (orange)',
  cool: 'Cool (sky)',
  ok: 'OK (green)',
  alert: 'Alert (red)',
  media: 'Media (indigo)',
  vacuum: 'Vacuum (teal)',
  water: 'Water (cyan)',
  default: 'Generic (blue)',
}

/**
 * How the alignment values read in the form, per axis.
 *
 * Two label sets rather than one, because `start` and `end` are logical: on the
 * horizontal axis they are the reading direction's edges, on the vertical axis
 * they are the top and the bottom. A shared "Start / End" pair would be exact
 * and unreadable — the form is where the abstraction has to come back down to
 * what the user is looking at.
 */
const ALIGN_LABELS: Readonly<
  Record<'horizontal' | 'vertical', Record<(typeof CARD_ALIGN_OPTIONS)[number], string>>
> = {
  horizontal: {
    auto: 'Automatic (follows the layout)',
    start: 'Leading edge',
    center: 'Centre',
    end: 'Trailing edge',
  },
  vertical: {
    auto: 'Automatic (follows the layout)',
    start: 'Top',
    center: 'Middle',
    end: 'Bottom',
  },
}

const alignOptions = (axis: 'horizontal' | 'vertical') =>
  CARD_ALIGN_OPTIONS.map((value) => ({ value, label: ALIGN_LABELS[axis][value] }))

export const displayConfigOptions: ConfigDefinition = {
  name: {
    type: 'string',
    default: CARD_DISPLAY_DEFAULTS.name,
    label: 'Name',
    placeholder: 'Entity name',
    description: 'Shown instead of the entity’s name. Leave empty to keep it.',
  },
  icon: {
    type: 'icon',
    default: CARD_DISPLAY_DEFAULTS.icon,
    label: 'Icon',
    placeholder: 'Card icon',
    // The picker's own Clear is the way back to the card's icon — see the
    // `IconSelect` popover footer.
    description: 'Shown instead of the card’s own icon. Clear it to keep the card’s own.',
  },
  hideName: {
    type: 'boolean',
    default: CARD_DISPLAY_DEFAULTS.hideName,
    label: 'Hide name',
    description: 'Removes the name line. The icon and state stay.',
  },
  hideState: {
    type: 'boolean',
    default: CARD_DISPLAY_DEFAULTS.hideState,
    label: 'Hide state',
    description: 'Removes the state line. Hiding both lines leaves an icon-only card.',
  },
  color: {
    type: 'select',
    default: CARD_DISPLAY_DEFAULTS.color,
    label: 'Color',
    description:
      'Pins the card’s accent to one colour instead of following what the entity is doing.',
    // Driven off the canonical enum, so the form cannot offer a value the schema
    // would reject — nor miss one it would accept.
    options: CARD_COLOR_OPTIONS.map((value) => ({ value, label: COLOR_LABELS[value] })),
  },
  iconOnly: {
    type: 'boolean',
    default: CARD_DISPLAY_DEFAULTS.iconOnly,
    label: 'Icon only',
    description:
      'Reduces the card to its centred icon. Everything else — lines, controls, graphs, artwork — goes.',
  },
  alignHorizontal: {
    type: 'select',
    default: CARD_DISPLAY_DEFAULTS.alignHorizontal,
    label: 'Horizontal alignment',
    description:
      'Slides the card’s content across the tile. Automatic keeps the layout’s own placement.',
    options: alignOptions('horizontal'),
  },
  alignVertical: {
    type: 'select',
    default: CARD_DISPLAY_DEFAULTS.alignVertical,
    label: 'Vertical alignment',
    description:
      'Slides the card’s content up or down the tile. Automatic keeps the layout’s own placement.',
    options: alignOptions('vertical'),
  },
}

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
