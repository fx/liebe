import React, { memo, useCallback, useState } from 'react'
import { Box, Flex, IconButton, Text, TextField } from '@radix-ui/themes'
import { Archive, Calendar, Check, Clock, Edit2, X } from 'lucide-react'
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
import { toDatetimeInputValue, toLocalCalendarDate } from '~/utils/inputDatetime'
import type { HassEntity } from '~/store/entityTypes'
import type { CardSpan, CardTier } from '~/utils/cardTier'
import { withCardErrorBoundary } from './cardErrorBoundary'

interface InputDateTimeCardProps {
  entityId: string
  tier?: CardTier
  /**
   * The effective grid span behind `tier`. Accepted so any renderer can hand a
   * card the pair `CardProps` defines; no datetime-helper layout keys on width
   * past the tier boundary, so nothing here reads it.
   */
  span?: CardSpan
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

interface InputDateTimeAttributes {
  friendly_name?: string
  has_date?: boolean
  has_time?: boolean
  _stale?: boolean
}

/**
 * An absent attribute reads as present: Home Assistant always sends both, and
 * the card has always treated absence that way — the same rule the service
 * layer's `resolveShape` applies.
 */
const shapeOf = (attributes: InputDateTimeAttributes) => ({
  hasDate: attributes.has_date !== false,
  hasTime: attributes.has_time !== false,
})

/** The helper's state as the tile and the readout show it. */
export function formatDatetimeDisplayValue(
  value: string,
  attributes: InputDateTimeAttributes
): string {
  if (!value || value === 'unknown') return '(not set)'

  const { hasDate, hasTime } = shapeOf(attributes)

  /*
   * A date-only helper publishes a calendar date, and only a local reading of it
   * is the date the user set: `new Date('2026-12-24')` is UTC midnight, so
   * formatting it anywhere behind UTC printed Christmas Eve as the 23rd
   * (docs/changes/0037-card-state-and-capability-correctness.md). The combined
   * and time-only forms below carry a time component and already parse as local.
   */
  if (hasDate && !hasTime) {
    const calendarDate = toLocalCalendarDate(value)
    return calendarDate ? calendarDate.toLocaleDateString() : value
  }

  const date = new Date(value)
  if (isNaN(date.getTime())) return value

  // Only the combined and time-only shapes reach here; the date-only one
  // returned above and a helper carrying neither half has no format at all.
  if (hasDate) return date.toLocaleString()
  if (hasTime) return date.toLocaleTimeString()
  return value
}

/** Which native input the helper's own halves call for. */
function inputTypeFor(attributes: InputDateTimeAttributes) {
  const { hasDate, hasTime } = shapeOf(attributes)

  if (hasDate && hasTime) return 'datetime-local'
  if (hasDate) return 'date'
  if (hasTime) return 'time'
  // A helper carrying neither half is not something Home Assistant produces,
  // and there is no input that means "neither". The combined picker is what has
  // always rendered for it; the save is refused by the service layer, which
  // names the shape rather than sending a guess.
  return 'datetime-local'
}

interface DateTimeHelperControlProps {
  entity: HassEntity
  /** Whether the picker is open. Owned by the caller, so a tap on the tile can
   *  enter the edit state the same way the edit button does. */
  editing: boolean
  onEditingChange: (editing: boolean) => void
  /** A dispatch is in flight, so the save route is held shut. */
  loading?: boolean
  /** Commit a value in the native input's own format. */
  onCommit: (value: string) => void
}

/**
 * The datetime helper's embedded control — the formatted readout with its edit
 * affordance, and the native picker behind it.
 *
 * Rendered bare so the card can wrap it in `GridCard.Controls` and the detail
 * dialog in `DetailControlSection`; that is what lets the dialog mount the same
 * control the card's `full` tier renders rather than a second one that drifts
 * from it (docs/specs/entity-cards/options/input-helpers.md).
 */
export function DateTimeHelperControl({
  entity,
  editing,
  onEditingChange,
  loading = false,
  onCommit,
}: DateTimeHelperControlProps) {
  const attributes = entity.attributes as InputDateTimeAttributes

  /*
   * The state Home Assistant publishes is not what the native inputs accept —
   * `2024-01-15 06:30:00` leaves a `datetime-local` field blank, and its seconds
   * leave a `time` field blank (docs/changes/0022-switch-input-helpers-to-spec.md).
   * Every seed of the field goes through the translation, so what the user edits
   * is always the value being shown.
   */
  const inputValue = toDatetimeInputValue(entity.state, entity.attributes)
  const [localValue, setLocalValue] = useState<string>(inputValue)

  // Seed the picker from the entity each time it opens, during render rather
  // than in an effect (react-hooks/set-state-in-effect).
  const [prevEditing, setPrevEditing] = useState(editing)
  if (editing !== prevEditing) {
    setPrevEditing(editing)
    if (editing) setLocalValue(inputValue)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // A cleared field is not a value to send: `set_datetime` has no form that
    // means "unset", so this leaves the edit state instead.
    if (!localValue) {
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
            type={inputTypeFor(attributes)}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            autoFocus
            /*
             * Cross-axis flexible rather than a 200px minimum — the widest
             * fixed inline size on any card, in the tier with the least room
             * (docs/specs/design-system — "Cross-axis fit", change 0042 PR 4).
             * A native date/time input has a preferred width of its own and
             * will not shrink below its content, which is why the floor below
             * omits it rather than this alone being the fix.
             */
            style={{ flex: 1, minWidth: 0 }}
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
          // As in `InputTextCard`: no inline minimum, and the formatted value
          // ellipsizes rather than being cropped by the tile.
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'center',
        }}
      >
        <Text size="2">{formatDatetimeDisplayValue(entity.state, attributes)}</Text>
      </Box>
      {/*
       * As in `InputTextCard`: the `Box` beside it only reports the value, and
       * this real `<button>` is what operates the helper, so the control is
       * focusable and Enter/Space-operable rather than pointer-only. Icon-only,
       * so it carries its name explicitly.
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
 * The `input_datetime` control the detail dialog mounts — what a control-free
 * `glance` tile defers to through its `more-info` tap
 * (docs/specs/entity-cards/options/input-helpers.md — the tier table).
 *
 * The error line `DetailControlSection` adds earns its keep here in particular:
 * a helper carrying neither a date nor a time refuses the save with a message
 * naming the shape it wanted, and the dialog is where a 1×1 helper is operated
 * at all.
 */
export function InputDateTimeDetailControls({ entity }: EntityDetailControlsProps) {
  const { setValue, loading, error } = useServiceCall()
  const [isEditing, setIsEditing] = useState(false)

  return (
    <DetailControlSection error={error}>
      <DateTimeHelperControl
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
registerDetailControls('input_datetime', InputDateTimeDetailControls)

const MemoizedInputDateTimeCard = memo(function InputDateTimeCardContent({
  entityId,
  tier = 'row',
  onDelete,
  isSelected = false,
  onSelect,
}: InputDateTimeCardProps) {
  const { entity, isConnected, isMissing, isLoading: isEntityLoading } = useEntity(entityId)
  const { setValue, loading, error } = useServiceCall()

  const [isEditing, setIsEditing] = useState(false)

  const isGlance = tier === 'glance'

  /*
   * `tall` renders no inline input, and the tap goes to the detail dialog with
   * it — the same decision `InputTextCard` makes, on a worse measurement: a
   * native date/time input carries a 120px readout and a 200px edit field, the
   * widest fixed inline sizes on any card, in the tier with the least room
   * (35px on a 12-column desktop grid). Keyed on the tier rather than on a
   * width, exactly as change 0042 PR 2 keyed the `input_number` stepper
   * (docs/specs/design-system — "Cross-axis fit", change 0042 PR 4).
   */
  const controlOmitted = isGlance || tier === 'tall'

  /*
   * The tile tap is the card's primary action: it opens the native picker on
   * the embedded input (the option doc's "Primary action"). At `glance` there
   * is no input to open, so the tap resolves to `more-info` instead and this
   * declines — it is still passed, because an absent handler would tell the
   * shell the card has no toggle of its own and route a configured `toggle` to
   * `homeassistant.toggle` on an `input_datetime`.
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
        domain="input_datetime"
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

  const attributes = entity.attributes as InputDateTimeAttributes
  const isStale = attributes._stale === true
  const { hasDate, hasTime } = shapeOf(attributes)
  const Icon = hasDate ? Calendar : Clock

  /*
   * Which halves of a datetime the helper actually carries. Secondary text, so
   * only `full` renders it — see the layout note below. A helper with neither
   * half is nonsense Home Assistant does not produce, but it has always
   * rendered no line at all rather than a wrong one, and that stays true.
   */
  const modeLabel = hasDate
    ? hasTime
      ? 'Date & Time'
      : 'Date Only'
    : hasTime
      ? 'Time Only'
      : undefined

  return (
    <GridCard
      // Input helpers have no domain row of their own; `default` is the
      // generic active colour the design system points them at.
      domain="input_datetime"
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
       * At one cell there is no picker to open, so `default` resolves to
       * `more-info` and the dialog's `input_datetime` control is what sets the
       * helper (docs/specs/entity-cards/options/input-helpers.md — "In
       * `glance`, fall back to `more-info`").
       */
      defaultAction={controlOmitted ? 'more-info' : undefined}
      title={error || undefined}
    >
      {/*
       * `glance` reads the formatted value out as the tile's state line — or
       * `(not set)` — and carries no control, which is what the option doc's
       * tier table asks for ("Icon + name + formatted value / `(not set)`; tap
       * → more-info").
       *
       * The has-date/has-time line is what the middle tiers omit instead: it
       * describes the helper rather than reporting its state, so it renders only
       * in `full`, the one tier with a line past the meta — and at `glance` the
       * state line is already spoken for by the value.
       */}
      <CardBody
        arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
        lead={
          <GridCard.Icon>
            <Icon size={24} style={{ color: 'var(--gray-9)' }} />
          </GridCard.Icon>
        }
        meta={
          <GridCard.Meta>
            <GridCard.Title>
              {attributes.friendly_name || entity.entity_id.split('.')[1]}
            </GridCard.Title>
            {isGlance ? (
              <GridCard.Status>
                {formatDatetimeDisplayValue(entity.state, attributes)}
              </GridCard.Status>
            ) : null}
            {tier === 'full' && modeLabel ? <GridCard.Status>{modeLabel}</GridCard.Status> : null}
          </GridCard.Meta>
        }
        control={
          controlOmitted ? undefined : (
            <GridCard.Controls>
              <DateTimeHelperControl
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

export const InputDateTimeCard = withCardErrorBoundary(MemoizedInputDateTimeCard)
