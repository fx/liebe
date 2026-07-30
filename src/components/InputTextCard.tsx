import React, { memo, useCallback, useState } from 'react'
import { Box, Flex, IconButton, Text, TextField } from '@radix-ui/themes'
import { Archive, Check, Edit2, Type, X } from 'lucide-react'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { GridCardWithComponents as GridCard } from './GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from './CardBody'
import { renderCardLifecycle } from './ui'
import { DetailControlSection } from './EntityDetailDialog/DetailControlSection'
import {
  registerDetailControls,
  type EntityDetailControlsProps,
} from './EntityDetailDialog/detailControls'
import type { HassEntity } from '~/store/entityTypes'
import type { CardSpan, CardTier } from '~/utils/cardTier'
import { withCardErrorBoundary } from './cardErrorBoundary'

interface InputTextCardProps {
  entityId: string
  tier?: CardTier
  /**
   * The effective grid span behind `tier`. Accepted so any renderer can hand a
   * card the pair `CardProps` defines; no text-helper layout keys on width past
   * the tier boundary, so nothing here reads it.
   */
  span?: CardSpan
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

interface InputTextAttributes {
  friendly_name?: string
  min?: number
  max?: number
  pattern?: string
  mode?: 'text' | 'password'
  _stale?: boolean
}

/**
 * The mask a password helper's value is shown as. Not configurable, on any
 * surface: "a presentation option MUST NOT be able to unmask a password
 * helper", and the guarantee is per *value*, so it binds the detail dialog's
 * control exactly as it binds the card's
 * (docs/specs/entity-cards/options/input-helpers.md).
 */
const PASSWORD_MASK = '••••••••'

/**
 * Whether a value satisfies the helper's own `pattern`.
 *
 * `pattern` is a hand-edited string on a user-defined helper, so it is not
 * always a valid regular expression: an unbalanced bracket or a stray
 * quantifier makes `new RegExp` throw. Uncaught, that throw happens inside a
 * submit handler and takes the card down with it — and the detail dialog, which
 * since change 0022 is the only way a 1×1 text helper can be operated at all
 * (docs/specs/entity-cards/options/input-helpers.md — the tier table). A typo
 * in Home Assistant would cost the user the tile rather than the keystroke.
 *
 * An unusable pattern reads as "nothing matches", so the commit is refused the
 * way a genuinely non-matching value is. The other reading — "everything
 * matches" — would send a value the helper is configured to reject, which is
 * the failure `pattern` exists to prevent; between a validator that cannot be
 * evaluated and a helper that may reject the write, refusing is the direction
 * that loses nothing.
 */
function matchesPattern(value: string, pattern: string): boolean {
  try {
    return new RegExp(pattern).test(value)
  } catch {
    return false
  }
}

/** What the helper's value reads as where it is displayed rather than edited. */
export function displayTextHelperValue(entity: HassEntity): string {
  const { mode } = entity.attributes as InputTextAttributes
  return mode === 'password' ? PASSWORD_MASK : entity.state
}

interface TextHelperControlProps {
  entity: HassEntity
  /** Whether the inline editor is open. Owned by the caller, so a tap on the
   *  tile can enter the edit state the same way the edit button does. */
  editing: boolean
  onEditingChange: (editing: boolean) => void
  /** A dispatch is in flight, so the save route is held shut. */
  loading?: boolean
  /** Commit a value that already satisfies the helper's own constraints. */
  onCommit: (value: string) => void
}

/**
 * The text helper's embedded control — the readout with its edit affordance,
 * and the inline editor behind it.
 *
 * Rendered bare so the card can wrap it in `GridCard.Controls` and the detail
 * dialog in `DetailControlSection`; that is what lets the dialog mount the same
 * control the card's `full` tier renders rather than a second one that drifts
 * from it (docs/specs/entity-cards/options/input-helpers.md).
 */
export function TextHelperControl({
  entity,
  editing,
  onEditingChange,
  loading = false,
  onCommit,
}: TextHelperControlProps) {
  const attributes = entity.attributes as InputTextAttributes
  const isPassword = attributes.mode === 'password'

  const [localValue, setLocalValue] = useState<string>(entity.state)
  // Seed the editor from the entity each time it opens, during render rather
  // than in an effect (react-hooks/set-state-in-effect).
  const [prevEditing, setPrevEditing] = useState(editing)
  if (editing !== prevEditing) {
    setPrevEditing(editing)
    if (editing) setLocalValue(entity.state)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Validate length constraints
    if (attributes.min && localValue.length < attributes.min) {
      // Invalid — leave the edit state, and the readout reverts to the entity
      onEditingChange(false)
      return
    }

    if (attributes.max && localValue.length > attributes.max) {
      // Truncate value
      setLocalValue(localValue.substring(0, attributes.max))
      return
    }

    // Validate pattern if provided
    if (attributes.pattern && !matchesPattern(localValue, attributes.pattern)) {
      onEditingChange(false)
      return
    }

    onCommit(localValue)
    onEditingChange(false)
  }

  if (editing) {
    return (
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}>
        <Flex align="center" gap="2">
          <TextField.Root
            size="3"
            aria-label="Value"
            /*
             * A password helper is masked while it is edited too. The card's
             * readout and the dialog's are the same component, so this is the
             * one place the guarantee has to hold — and `type="password"` is
             * what keeps the secret out of the field the user is typing into.
             */
            type={isPassword ? 'password' : 'text'}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            autoFocus
            /*
             * Cross-axis flexible rather than a 150px minimum: the field takes
             * the room the shape gives it and shrinks with it, which is what
             * "a control rendered at a one-cell-wide tier MUST be cross-axis
             * flexible" asks of it (docs/specs/design-system — "Cross-axis
             * fit"). The old minimum was not merely too wide for a `tall`
             * tile's 35px region — it overflowed a two-column `row` region
             * (113px) as well, so this fixes the tier nobody had measured too.
             * `minWidth: 0` because a flex item's automatic minimum size is its
             * content, and without it the flex above buys nothing.
             */
            style={{ flex: 1, minWidth: 0 }}
            maxLength={attributes.max}
          />
          <IconButton
            size="3"
            type="submit"
            variant="soft"
            color="green"
            aria-label="Save value"
            disabled={loading}
          >
            <Check size={16} />
          </IconButton>
          <IconButton
            size="3"
            type="button"
            variant="soft"
            color="red"
            aria-label="Cancel editing"
            onClick={() => onEditingChange(false)}
          >
            <X size={16} />
          </IconButton>
        </Flex>
      </form>
    )
  }

  return (
    <Flex align="center" gap="2">
      <Box
        style={{
          padding: '4px 12px',
          borderRadius: 'var(--radius-2)',
          backgroundColor: 'var(--gray-2)',
          /*
           * No inline minimum. The readout took 100px whatever the tile was,
           * which a `tall` tile's 35px content region cannot hold — the tile's
           * own `overflow: hidden` cropped it, the clip the omit-never-clip
           * rule forbids. It now shrinks with the room and ellipsizes what will
           * not fit, which is the meta block's established treatment for text
           * too long for its box.
           */
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'center',
        }}
      >
        <Text size="2" style={{ fontFamily: isPassword ? 'monospace' : undefined }}>
          {displayTextHelperValue(entity) || '(empty)'}
        </Text>
      </Box>
      {/*
       * The readout beside it is a plain `Box`, and stays one: it reports the
       * value, it does not operate the helper. The edit affordance is this
       * button — a real `<button>`, focusable and Enter/Space-operable — so the
       * control is reachable without a pointer, which is what "operable" means
       * for the keyboard, switch and screen-reader users the no-operability
       * -regression invariant most exists for. An icon-only button has no text
       * to name it, so the name is spelled out here rather than left to an
       * `<svg>`.
       */}
      <IconButton
        size="3"
        variant="ghost"
        aria-label="Edit value"
        onClick={(e) => {
          e.stopPropagation()
          onEditingChange(true)
        }}
      >
        <Edit2 size={16} />
      </IconButton>
    </Flex>
  )
}

/**
 * The `input_text` control the detail dialog mounts — what a control-free
 * `glance` tile defers to through its `more-info` tap
 * (docs/specs/entity-cards/options/input-helpers.md — the tier table).
 *
 * It is the card's own control, which is what keeps the password guarantee
 * whole: the dialog now offers a *field over the helper's value*, and a second,
 * dialog-only implementation would be exactly the surface that forgets to mask.
 */
export function InputTextDetailControls({ entity }: EntityDetailControlsProps) {
  const { setValue, loading, error } = useServiceCall()
  const [isEditing, setIsEditing] = useState(false)

  return (
    <DetailControlSection error={error}>
      <TextHelperControl
        entity={entity}
        editing={isEditing}
        onEditingChange={setIsEditing}
        loading={loading}
        onCommit={(value) => setValue(entity.entity_id, value)}
      />
    </DetailControlSection>
  )
}

// Registered by the card family that owns the control; see the note on
// `registerDetailControls` in `InputNumberCard.tsx` for why the edge runs this
// way round and why it is safe.
registerDetailControls('input_text', InputTextDetailControls)

const MemoizedInputTextCard = memo(function InputTextCardContent({
  entityId,
  tier = 'row',
  onDelete,
  isSelected = false,
  onSelect,
}: InputTextCardProps) {
  const { entity, isConnected, isMissing, isLoading: isEntityLoading } = useEntity(entityId)
  const { setValue, loading, error } = useServiceCall()

  const [isEditing, setIsEditing] = useState(false)

  const isGlance = tier === 'glance'

  /*
   * `tall` renders no inline input, and the tap goes to the detail dialog with
   * it (change 0042 PR 4; docs/specs/design-system — "Cross-axis fit").
   *
   * A text field is bounded by its content on the axis this tier is one cell
   * wide: it has a preferred width of its own and cannot be taken below it, so
   * it is in the class the contract says MUST be omitted rather than made
   * flexible — "a control that cannot be sized down at all MUST be omitted at
   * that tier, in favour of one that can". Measured on a 12-column desktop grid
   * at 960px: a 63px tile, a 35px content region, against a 100px readout and a
   * 150px edit field. The tile's own `overflow: hidden` cropped both, which is
   * the clip the omit-never-clip rule forbids.
   *
   * **Keyed on the tier, not on a measured width**, which is the same mechanism
   * change 0042 PR 2 used for the `input_number` stepper and for the same
   * reason: `tall` is one column wide by definition, so the condition needs no
   * arithmetic and holds at 35px, at LCARS's 19px and at the 16-column case
   * that leaves no content region at all. A card may not measure the DOM, and
   * the shell's published width is not readable here in any case — this
   * component renders the shell, so it sits outside its own provider.
   *
   * Both halves are one decision: the input goes, AND the tap falls back to
   * `more-info`, or the tier removes the last way to operate the helper —
   * "these floors outrank the no-last-control rule, and do not suspend it".
   */
  const controlOmitted = isGlance || tier === 'tall'

  /*
   * The tile tap is the card's primary action: it focuses the text field,
   * entering the inline edit state (the option doc's "Primary action"). At
   * `glance` there is no field to focus, so the tap resolves to `more-info`
   * instead and this declines — it is still passed, because an absent handler
   * would tell the shell the card has no toggle of its own and route a
   * configured `toggle` to `homeassistant.toggle` on an `input_text`.
   */
  const handleClick = useCallback(() => {
    if (!controlOmitted) setIsEditing(true)
  }, [controlOmitted])

  // Keyed on the prop rather than on the resolved entity: the control that
  // calls this only renders past the early returns below, so the entity exists
  // by construction and `entity.entity_id` is this id. Reading the prop keeps
  // the callback free of a guard for a state it cannot be called in.
  const handleCommit = useCallback(
    (value: string) => setValue(entityId, value),
    [entityId, setValue]
  )

  if (!entity || !isConnected) {
    return renderCardLifecycle({
      entityId,
      entity,
      isConnected,
      isLoading: isEntityLoading,
      isMissing,
      tier,
    })
  }

  // Handle unavailable entities
  if (entity.state === 'unavailable') {
    return (
      <GridCard
        domain="input_text"
        tier={tier}
        isUnavailable={true}
        isSelected={isSelected}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
      >
        <CardBody
          arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
          lead={
            <GridCard.Icon>
              <Archive size={20} />
            </GridCard.Icon>
          }
          meta={
            <GridCard.Meta>
              <GridCard.Title>
                {entity.attributes.friendly_name || entity.entity_id.split('.')[1]}
              </GridCard.Title>
              <GridCard.Status>Unavailable</GridCard.Status>
            </GridCard.Meta>
          }
        />
      </GridCard>
    )
  }

  const attributes = entity.attributes as InputTextAttributes
  const isStale = attributes._stale === true

  return (
    <GridCard
      // Input helpers have no domain row of their own; `default` is the
      // generic active colour the design system points them at.
      domain="input_text"
      color="default"
      tier={tier}
      isLoading={loading}
      isError={!!error}
      isStale={isStale}
      isSelected={isSelected}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      onClick={handleClick}
      /*
       * At one cell there is no field to focus, so `default` resolves to
       * `more-info` and the dialog's `input_text` control is what sets the
       * value (docs/specs/entity-cards/options/input-helpers.md — "In `glance`,
       * fall back to `more-info`").
       */
      defaultAction={controlOmitted ? 'more-info' : undefined}
      title={error || undefined}
    >
      {/*
       * `glance` reads the value out as the tile's state line — masked when the
       * helper's `mode` is `password`, on this surface as on every other — and
       * carries no control, which is what the option doc's tier table asks for
       * ("Icon + name + value as state (masked if password); tap → more-info").
       *
       * The length-constraint line is what the middle tiers omit instead: it
       * describes the helper rather than reporting its state, so it renders only
       * in `full`, the one tier with a line past the meta — and at `glance` the
       * state line is already spoken for by the value.
       */}
      <CardBody
        arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
        lead={
          <GridCard.Icon>
            <Type size={24} style={{ color: 'var(--gray-9)' }} />
          </GridCard.Icon>
        }
        meta={
          <GridCard.Meta>
            <GridCard.Title>
              {attributes.friendly_name || entity.entity_id.split('.')[1]}
            </GridCard.Title>
            {isGlance ? (
              <GridCard.Status>{displayTextHelperValue(entity) || '(empty)'}</GridCard.Status>
            ) : null}
            {tier === 'full' && attributes.min !== undefined && attributes.max !== undefined ? (
              <GridCard.Status>
                {attributes.min} - {attributes.max} chars
              </GridCard.Status>
            ) : null}
          </GridCard.Meta>
        }
        control={
          controlOmitted ? undefined : (
            <GridCard.Controls>
              <TextHelperControl
                entity={entity}
                editing={isEditing}
                onEditingChange={setIsEditing}
                loading={loading}
                onCommit={handleCommit}
              />
            </GridCard.Controls>
          )
        }
      />
    </GridCard>
  )
})

export const InputTextCard = withCardErrorBoundary(MemoizedInputTextCard)
