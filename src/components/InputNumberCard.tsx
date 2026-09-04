import React, { memo, useCallback, useRef, useState } from 'react'
import { Button, IconButton, Text, TextField } from '@radix-ui/themes'
import { Archive, Hash, Minus, Plus } from 'lucide-react'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { GridCardWithComponents as GridCard } from './GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from './CardBody'
import { renderCardLifecycle } from './ui'
import { CardValue, Slider } from './anatomy'
import { DetailControlSection } from './EntityDetailDialog/DetailControlSection'
import {
  registerDetailControls,
  type EntityDetailControlsProps,
} from './EntityDetailDialog/detailControls'
import {
  decimalsFor,
  quantizeHelperValue,
  readNumberControlStyle,
  resolveNumberPresentation,
  type NumberControlStyle,
} from '~/store/inputHelperOptions'
import { readCardDisplay } from '~/store/cardDisplay'
import { useCardItem } from './cardItemContext'
import type { HassEntity } from '~/store/entityTypes'
import type { CardSpan, CardTier } from '~/utils/cardTier'
import { withCardErrorBoundary } from './cardErrorBoundary'

interface InputNumberCardProps {
  entityId: string
  tier?: CardTier
  /**
   * The effective grid span behind `tier`. Accepted so any renderer can hand a
   * card the pair `CardProps` defines; no number-helper layout keys on width
   * past the tier boundary, so nothing here reads it.
   */
  span?: CardSpan
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
  /** The placed item's stored options, when the renderer passes them directly. */
  config?: Record<string, unknown>
}

interface InputNumberAttributes {
  friendly_name?: string
  min?: number
  max?: number
  step?: number
  unit_of_measurement?: string
  mode?: 'slider' | 'box'
  _stale?: boolean
}

/**
 * The helper's value as text, or `—` when it has none.
 *
 * The absent case is not hypothetical: `unknown` is a state Home Assistant
 * publishes for a helper it has not restored yet, and `parseFloat('unknown')`
 * is `NaN`, which `toFixed` spells out as the literal string "NaN". That was
 * survivable while the value sat inside a button among other controls; `glance`
 * now anchors the whole tile on it, so it is the one thing a 1×1 number helper
 * has to show.
 */
function formatHelperNumber(state: string, attributes: InputNumberAttributes): string {
  const value = Number.parseFloat(state)
  return Number.isFinite(value) ? value.toFixed(decimalsFor(attributes.step)) : '—'
}

interface NumberHelperControlProps {
  entity: HassEntity
  /** Which embedded control renders, already resolved from config or `mode`. */
  style: NumberControlStyle
  /** Vertical only where the tile's height is the travel (the `tall` tier). */
  orientation?: 'horizontal' | 'vertical'
  /** A dispatch is in flight, so every commit route is held shut. */
  loading?: boolean
  /** Commit a value the helper will accept. */
  onCommit: (value: number) => void
  /**
   * Whether the stepper's click-to-edit value field is open. Owned by the
   * caller, so a tap on the tile can enter the edit state the same way the
   * value button does (the option doc's "Primary action"). Absent —
   * `undefined` — the control owns it as before, which is what the detail
   * dialog relies on.
   */
  editing?: boolean
  onEditingChange?: (editing: boolean) => void
  /** Reaches the slider thumb, so the card's tile tap can focus it. */
  sliderThumbRef?: React.Ref<HTMLSpanElement>
}

/**
 * The number helper's embedded control — the stepper or the slider.
 *
 * Rendered bare, without a row of its own: the card wraps it in
 * `GridCard.Controls` and the detail dialog in `DetailControlSection`, and both
 * supply the same centred flex row. That is what lets the dialog mount *the
 * same* control the card's `full` tier renders rather than a second one that
 * drifts from it (docs/specs/entity-cards/options/input-helpers.md).
 *
 * It owns the transient state a control has and a card does not — the edit
 * state of the readout, the position under a finger — and nothing else. The
 * dispatch stays the caller's, so the card shell keeps showing its own loading
 * and error state around it.
 */
export function NumberHelperControl({
  entity,
  style,
  orientation = 'horizontal',
  loading = false,
  onCommit,
  editing: editingProp,
  onEditingChange,
  sliderThumbRef,
}: NumberHelperControlProps) {
  const attributes = entity.attributes as InputNumberAttributes

  const [localValue, setLocalValue] = useState<string>(entity.state)
  const [uncontrolledEditing, setUncontrolledEditing] = useState(false)
  // A controlled caller (the card, driving the tile tap) owns the edit state;
  // the dialog mounts the control bare and the control owns it itself.
  const isEditing = editingProp ?? uncontrolledEditing
  const setIsEditing = onEditingChange ?? setUncontrolledEditing
  /**
   * Where the slider sits while a finger is on it. `null` means "not dragging",
   * so the released control goes straight back to reporting the entity — it
   * must not hold a stale local value after the service call lands.
   */
  const [dragValue, setDragValue] = useState<number | null>(null)

  // Sync the local value from the entity while the user is not editing. Done
  // during render (not in an effect) per react-hooks/set-state-in-effect; the
  // previous-value guards reproduce the old effect's [entity, isEditing] triggers.
  const [prevEntity, setPrevEntity] = useState(entity)
  const [prevIsEditing, setPrevIsEditing] = useState(isEditing)
  if (entity !== prevEntity || isEditing !== prevIsEditing) {
    setPrevEntity(entity)
    setPrevIsEditing(isEditing)
    if (!isEditing) setLocalValue(entity.state)
  }

  const { min, max } = attributes
  const step = attributes.step || 1
  const unit = attributes.unit_of_measurement || ''
  const currentValue = Number.parseFloat(entity.state)
  /**
   * Whether the helper is publishing a number at all. Every route that reads
   * the current value to compute a new one is held shut when it is not:
   * stepping from `unknown` would dispatch `set_value` with `NaN`, which is
   * neither what the user asked for nor something Home Assistant accepts.
   */
  const hasValue = Number.isFinite(currentValue)

  /**
   * One formatter for every place the value is shown, so the readout the
   * slider carries and the readout the stepper carries cannot drift apart.
   */
  const formatValue = (value: number) =>
    `${value.toFixed(decimalsFor(attributes.step))}${unit ? ` ${unit}` : ''}`

  const clamp = (value: number) => {
    let clamped = value
    if (min !== undefined) clamped = Math.max(clamped, min)
    if (max !== undefined) clamped = Math.min(clamped, max)
    return clamped
  }

  const handleStep = (direction: 1 | -1) => (e: React.MouseEvent) => {
    e.stopPropagation()
    onCommit(clamp(currentValue + direction * step))
  }

  const handleValueSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const value = Number.parseFloat(localValue)
    if (Number.isNaN(value)) {
      setLocalValue(entity.state)
      setIsEditing(false)
      return
    }

    onCommit(clamp(value))
    setIsEditing(false)
  }

  /*
   * The click-to-edit readout at the heart of the stepper: it enters an edit
   * state and commits an arbitrary value inside `[min, max]`, where the two
   * buttons beside it only step by `step`.
   *
   * It is a real `<button>` (Radix `Button`) rather than a styled `Box` with an
   * `onClick`, because a control that answers only to a pointer is not operable
   * to a keyboard, a switch device or a screen reader. A button is focusable in
   * tab order, activates on both Enter and Space, and announces itself as
   * something operable, all from the element rather than from handlers that
   * have to be kept in sync.
   *
   * The label names the action and repeats the visible value, so the accessible
   * name contains the visible one (WCAG "Label in Name") instead of replacing
   * it — "50 %" alone would read as a value with no hint that pressing it does
   * anything.
   */
  const valueLabel = `${formatHelperNumber(entity.state, attributes)}${unit ? ` ${unit}` : ''}`
  const valueField = isEditing ? (
    <form onSubmit={handleValueSubmit}>
      <TextField.Root
        size="3"
        aria-label="Value"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => {
          setLocalValue(entity.state)
          setIsEditing(false)
        }}
        autoFocus
        style={{ width: '80px', textAlign: 'center' }}
      />
    </form>
  ) : (
    <Button
      type="button"
      variant="soft"
      color="gray"
      size="2"
      aria-label={`Set value, currently ${valueLabel}`}
      onClick={(e) => {
        e.stopPropagation()
        setIsEditing(true)
      }}
      style={{ minWidth: '60px' }}
    >
      <Text size="2" weight="bold">
        {valueLabel}
      </Text>
    </Button>
  )

  if (style === 'stepper') {
    return (
      <>
        <IconButton
          size="3"
          variant="soft"
          aria-label="Decrease value"
          onClick={handleStep(-1)}
          disabled={loading || !hasValue || (min !== undefined && currentValue <= min)}
          style={{ cursor: 'pointer' }}
        >
          <Minus size={16} />
        </IconButton>

        {valueField}

        <IconButton
          size="3"
          variant="soft"
          aria-label="Increase value"
          onClick={handleStep(1)}
          disabled={loading || !hasValue || (max !== undefined && currentValue >= max)}
          style={{ cursor: 'pointer' }}
        >
          <Plus size={16} />
        </IconButton>
      </>
    )
  }

  /*
   * The slider commits on release, never while dragging: the value under the
   * finger is a position, not an intent, and dispatching per pixel would send a
   * service call per frame. `dragValue` is what shows meanwhile — the readout
   * in the track follows the thumb, so what is committed is what was visibly
   * chosen. It is dropped in the same breath as the commit: the entity is the
   * value from there on, and holding the released position would leave a number
   * on screen that Home Assistant may have adjusted.
   */
  const sliderValue = dragValue ?? currentValue
  // An unparseable state has no position; the track sits at its floor rather
  // than at `NaN`, which Radix refuses to render and `toFixed` would spell out.
  const sliderPosition = Number.isFinite(sliderValue) ? sliderValue : (min ?? 0)

  return (
    <Slider
      label={`Set ${attributes.friendly_name || entity.entity_id.split('.')[1]}`}
      value={sliderPosition}
      min={min ?? 0}
      max={max ?? 100}
      step={step}
      orientation={orientation}
      disabled={loading}
      /*
       * The value under the thumb, not the last committed one. A readout fed
       * from `entity.state` reports what the helper *was* for the whole
       * duration of a drag, which is a usability problem for everyone and an
       * accessibility one in particular: the anatomy hands this same string to
       * `aria-valuetext`, so a screen-reader user has nothing else to go on and
       * would hear no feedback at all until release.
       */
      readout={formatValue(sliderPosition)}
      onValueChange={setDragValue}
      onValueCommit={(value) => {
        setDragValue(null)
        onCommit(quantizeHelperValue(value, attributes))
      }}
      domain="input_number"
      color="default"
      thumbRef={sliderThumbRef}
    />
  )
}

/**
 * The `input_number` control the detail dialog mounts.
 *
 * This is what makes the control-free `glance` tier legal: a 1×1 number helper
 * renders its value and nothing else, and its `default` tap resolves to
 * `more-info`, so the control it no longer carries is one tap away rather than
 * gone (docs/specs/entity-cards/options/input-helpers.md — the tier table).
 *
 * Which control it is follows the helper's own `mode`, the same default an
 * unconfigured card's `full` tier resolves. The dialog is opened for an
 * *entity* rather than for a card, so a card's stored `controlStyle` is not in
 * scope here — and the entity's own preference is the only answer that stays
 * right when two cards for the same helper are configured differently.
 */
export function InputNumberDetailControls({ entity }: EntityDetailControlsProps) {
  const { setValue, loading, error } = useServiceCall()
  const attributes = entity.attributes as InputNumberAttributes

  return (
    <DetailControlSection error={error}>
      <NumberHelperControl
        entity={entity}
        style={readNumberControlStyle(undefined, attributes.mode)}
        loading={loading}
        onCommit={(value) => setValue(entity.entity_id, value)}
      />
    </DetailControlSection>
  )
}

/*
 * Registered at module scope, by the card family that owns the control — which
 * is what the registry exists for: the dialog is imported *by* `GridCard`, and
 * every card imports `GridCard`, so a dialog that imported cards to find their
 * controls would close exactly the cycle AGENTS.md documents. Reaching the
 * registry from a card closes nothing: `detailControls` imports two types and
 * nothing else, and types are erased, so it is a leaf at runtime.
 *
 * The registration has always run by the time it is read, because the dialog is
 * only reachable from a rendered card: the tile whose `more-info` opens the
 * dialog for `input_number.x` is this card, and it cannot have rendered without
 * this module being evaluated.
 */
registerDetailControls('input_number', InputNumberDetailControls)

const MemoizedInputNumberCard = memo(function InputNumberCardContent({
  entityId,
  tier = 'row',
  onDelete,
  isSelected = false,
  onSelect,
  config: configProp,
}: InputNumberCardProps) {
  const { entity, isConnected, isMissing, isLoading: isEntityLoading } = useEntity(entityId)
  const { setValue, loading, error } = useServiceCall()
  const publishedItem = useCardItem()
  /*
   * The renderer's config when it passed one, the published item's otherwise —
   * bound to one name so every option read below resolves from one source. The
   * unresolved prop is deliberately not left in scope beside it: a component
   * holding both is one where the next read takes whichever is nearer, and the
   * two disagree on the path where only the context is supplied.
   */
  const config = configProp ?? publishedItem.config

  // The stepper's edit state, owned here so the tile tap can enter it — the
  // same shape as `InputTextCard`'s `isEditing` and for the same reason: the
  // tap is the card's primary action, and it focuses the value control.
  const [isEditing, setIsEditing] = useState(false)
  // The slider thumb, so the tap can focus it where the slider renders. A ref
  // rather than state: focusing is imperative and renders nothing.
  const sliderThumbRef = useRef<HTMLSpanElement>(null)

  const isGlance = tier === 'glance'

  /*
   * The presentation the tap routes on, resolved before the entity guards so
   * the handler below closes over a value rather than a ref no effect keeps
   * current. The stored style needs the helper's mode, which is unknown until
   * the entity loads, so this reads it defensively — an absent entity
   * resolves as a stored `stepper`, which is exactly what
   * `readNumberControlStyle` defaults an unknown mode to. The render below
   * resolves the same value from the loaded entity; the two agree wherever a
   * tap can happen, because a tap needs a rendered tile.
   */
  const attributesForPresentation = entity?.attributes as InputNumberAttributes | undefined
  const tapPresentation = resolveNumberPresentation(
    readNumberControlStyle(config, attributesForPresentation?.mode),
    tier
  )

  // Keyed on the prop rather than on the resolved entity: the control that
  // calls this only renders past the early returns below, so the entity exists
  // by construction and `entity.entity_id` is this id. Reading the prop keeps
  // the callback free of a guard for a state it cannot be called in.
  const handleCommit = useCallback(
    (value: number) => setValue(entityId, value),
    [entityId, setValue]
  )

  /*
   * The tile tap is the card's primary action: it focuses the value control —
   * entering edit state where the stepper renders, focusing the thumb where
   * the slider does (the option doc's "Primary action"). At `glance` there is
   * no control to focus, so the tap resolves to `more-info` instead and this
   * declines — it is still passed, because an absent handler would tell the
   * shell the card has no toggle of its own and route a configured `toggle`
   * to `homeassistant.toggle` on an `input_number`.
   *
   * A plain function closing over the pre-return `tapPresentation`: the
   * routing consults the resolved presentation, never the stored
   * `controlStyle` — at `tall` a stored `stepper` renders the vertical
   * slider, and the tap must focus what is there rather than what is stored.
   */
  const handleClick = () => {
    if (isGlance) {
      /*
       * A configured `tapAction: toggle` resolves to this handler whatever the
       * tier, so declaring `more-info` as the card's DEFAULT is not enough on
       * its own — a tile with an explicit toggle would call this, find no
       * control to focus, and do nothing at all. Returning `'more-info'`
       * routes the gesture to the detail dialog instead, which is the escape
       * hatch `GridCard`'s `onClick` contract exists for and that the text card
       * already uses for its own control-free tiers.
       */
      return 'more-info'
    }
    if (tapPresentation === 'slider') {
      sliderThumbRef.current?.focus()
      return undefined
    }
    setIsEditing(true)
    return undefined
  }

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
        domain="input_number"
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

  const attributes = entity.attributes as InputNumberAttributes
  const isStale = attributes._stale === true
  const unit = attributes.unit_of_measurement || ''

  /*
   * Which embedded control renders (`controlStyle`), defaulting to the helper's
   * own `mode` attribute — `box` steps, `slider` slides — so a helper
   * reconfigured in Home Assistant keeps steering cards nobody has configured
   * (docs/specs/entity-cards/options/input-helpers.md). Existing cards were
   * built with the stepper, so the loader pins them to it; the attribute
   * default reaches new cards only (common contract, convention 7).
   */
  const controlStyle = readNumberControlStyle(config, attributes.mode)
  /*
   * ...and what the tier lets that style render. `tall` is one column wide, so
   * the stepper gives way to the vertical slider there; the stored value is
   * untouched and `row`/`full` resolve to exactly what they always did
   * (docs/specs/entity-cards/options/input-helpers.md — `input_number`).
   */
  const controlPresentation = resolveNumberPresentation(controlStyle, tier)

  /*
   * `iconOnly` has to reach the lead, which is the one slot the seam keeps.
   *
   * The same shape as the sensor's, and for the same reason: in `glance` this
   * card's lead is the big value rather than the glyph, so a tile that only had
   * its slots collapsed would be an "icon-only" tile carrying a number and no
   * icon at all. The helper's own glyph is its identity anchor under the option
   * (docs/specs/entity-cards/options/common.md — "Icon-only presentation": the
   * card's resolved icon, and only the camera's thumbnail and the person's
   * avatar are anchors of another kind).
   *
   * The same resolution goes to the shell below, so the card and its shell
   * cannot disagree about the option: read here and not there, the glyph would
   * land on a tile that suppressed nothing and stamped no marker.
   */
  const { iconOnly } = readCardDisplay(config)

  return (
    <GridCard
      // Input helpers have no domain row of their own; `default` is the
      // generic active colour the design system points them at.
      domain="input_number"
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
       * At one cell there is no embedded control, so `default` resolves to
       * `more-info` and the dialog's `input_number` control is what operates the
       * helper (docs/specs/entity-cards/options/input-helpers.md — "In `glance`
       * (no embedded control), `default` MUST fall back to `more-info`"). Every
       * larger tier keeps the shell's `toggle` default, which this card declines
       * as it always has.
       */
      defaultAction={isGlance ? 'more-info' : undefined}
      title={error || undefined}
      /*
       * The entity travels with the config for the same reason it does on the
       * weather variant: the shell builds the icon-only tile's accessible name
       * out of the entity, and both default to the published item — so a card
       * that hands over one without the other suppresses every word on the tile
       * and emits nothing in their place (docs/specs/entity-cards/options/common.md
       * — "Visual suppression never removes accessible semantics").
       */
      entityId={entityId}
      config={config}
    >
      {/*
       * `glance` is the value and the name, and nothing else: the reading is the
       * state, so it takes the icon circle's place as the tile's anchor
       * ("**Value big**", the option doc's tier table). The helper's `min – max`
       * range is secondary text and renders only in `full`, the one tier the
       * table gives a line past the meta — everywhere else it is omitted rather
       * than squeezed onto a tile already carrying a name and a control.
       */}
      <CardBody
        arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
        /*
         * `tall` gives the control the height the icon and the meta leave, the
         * same sizing the light, cover and fan cards ask for: the vertical
         * slider below has no intrinsic length, so sized by its content it gets
         * no travel at all — and a vertical slider filling the middle is what
         * this helper's `tall` tier is specified to be
         * (docs/specs/entity-cards/options/input-helpers.md — the tier table).
         *
         * The other tiers stay content-sized, as the thermostat's do: `row` and
         * `full` render the control on the line, where a stepper grown to the
         * free width would float its buttons apart from the readout between
         * them.
         */
        controlSize={tier === 'tall' ? 'fill' : 'content'}
        /*
         * And the axis that control runs along, at the one tier where it is a
         * fixed property of the control rather than of the arrangement:
         * `resolveNumberPresentation` substitutes the vertical slider for the
         * stepper at `tall` unconditionally, so the body can size the band for
         * a track it knows is there — and apply the two floors that decide when
         * a track this narrow or this short must be omitted instead
         * (docs/specs/design-system — "Cross-axis fit"). Absent everywhere else:
         * `row` and `full` render whichever control `controlStyle` asked for,
         * and a stepper has no axis to declare.
         *
         * This card does NOT carry `sliderPlacement` — its tier substitution is
         * a different mechanism (`src/store/sliderPlacement.ts`) — so the value
         * is resolved from the tier here rather than from a stored option.
         */
        controlOrientation={tier === 'tall' ? 'vertical' : undefined}
        lead={
          isGlance && !iconOnly ? (
            <CardValue
              domain="input_number"
              color="default"
              value={formatHelperNumber(entity.state, attributes)}
              unit={unit || undefined}
            />
          ) : (
            <GridCard.Icon>
              <Hash size={24} style={{ color: 'var(--gray-9)' }} />
            </GridCard.Icon>
          )
        }
        meta={
          <GridCard.Meta>
            <GridCard.Title>
              {attributes.friendly_name || entity.entity_id.split('.')[1]}
            </GridCard.Title>
            {tier === 'full' && attributes.min !== undefined && attributes.max !== undefined ? (
              <GridCard.Status>
                {attributes.min} - {attributes.max}
              </GridCard.Status>
            ) : null}
          </GridCard.Meta>
        }
        control={
          isGlance ? undefined : (
            <GridCard.Controls>
              <NumberHelperControl
                entity={entity}
                style={controlPresentation}
                orientation={tier === 'tall' ? 'vertical' : 'horizontal'}
                loading={loading}
                onCommit={handleCommit}
                editing={isEditing}
                onEditingChange={setIsEditing}
                sliderThumbRef={sliderThumbRef}
              />
            </GridCard.Controls>
          )
        }
      />
    </GridCard>
  )
})

export const InputNumberCard = withCardErrorBoundary(MemoizedInputNumberCard)
