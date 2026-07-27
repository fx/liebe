import React, { memo, useCallback, useState } from 'react'
import { Button, IconButton, Text, TextField } from '@radix-ui/themes'
import { Archive, Hash, Minus, Plus } from 'lucide-react'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { GridCardWithComponents as GridCard } from './GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from './CardBody'
import { SkeletonCard, ErrorDisplay } from './ui'
import { Slider } from './anatomy'
import { readNumberControlStyle } from '~/store/inputHelperOptions'
import { useCardItem } from './cardItemContext'
import type { CardSpan, CardTier } from '~/utils/cardTier'

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

export const InputNumberCard = memo(function InputNumberCard({
  entityId,
  tier = 'row',
  onDelete,
  isSelected = false,
  onSelect,
  config,
}: InputNumberCardProps) {
  const { entity, isConnected, isLoading: isEntityLoading } = useEntity(entityId)
  const { setValue, loading, error } = useServiceCall()
  const publishedItem = useCardItem()

  const [localValue, setLocalValue] = useState<string>(entity?.state ?? '')
  const [isEditing, setIsEditing] = useState(false)
  /**
   * Where the slider sits while a finger is on it. `null` means "not dragging",
   * so the released control goes straight back to reporting the entity — the
   * card must not hold a stale local value after the service call lands.
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
    if (entity && !isEditing) {
      setLocalValue(entity.state)
    }
  }

  const handleClick = useCallback(() => {
    // Card click is handled by GridCard
  }, [])

  const handleIncrement = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!entity) return

      const attributes = entity.attributes as InputNumberAttributes
      const currentValue = parseFloat(entity.state)
      const step = attributes.step || 1
      const max = attributes.max

      const newValue = currentValue + step
      const finalValue = max !== undefined ? Math.min(newValue, max) : newValue

      setValue(entity.entity_id, finalValue)
    },
    [entity, setValue]
  )

  const handleDecrement = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!entity) return

      const attributes = entity.attributes as InputNumberAttributes
      const currentValue = parseFloat(entity.state)
      const step = attributes.step || 1
      const min = attributes.min

      const newValue = currentValue - step
      const finalValue = min !== undefined ? Math.max(newValue, min) : newValue

      setValue(entity.entity_id, finalValue)
    },
    [entity, setValue]
  )

  const handleValueSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!entity) return

      const attributes = entity.attributes as InputNumberAttributes
      const value = parseFloat(localValue)

      if (isNaN(value)) {
        setLocalValue(entity.state)
        setIsEditing(false)
        return
      }

      const min = attributes.min
      const max = attributes.max

      let finalValue = value
      if (min !== undefined) finalValue = Math.max(finalValue, min)
      if (max !== undefined) finalValue = Math.min(finalValue, max)

      setValue(entity.entity_id, finalValue)
      setIsEditing(false)
    },
    [entity, localValue, setValue]
  )

  const handleFieldClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditing(true)
  }, [])

  const handleFieldBlur = useCallback(() => {
    if (entity) {
      setLocalValue(entity.state)
      setIsEditing(false)
    }
  }, [entity])

  /**
   * The slider's release, quantized to the helper's `step` and clamped to its
   * range before it is sent — the same rules the stepper and the typed field
   * already obey, because they are the helper's rules and not the control's.
   *
   * Local state is dropped in the same breath: the entity is the value from
   * here on, and holding the released position would leave the card showing a
   * number Home Assistant may have adjusted.
   */
  const handleSliderCommit = useCallback(
    (value: number) => {
      setDragValue(null)
      if (!entity) return

      const { min, max, step } = entity.attributes as InputNumberAttributes
      const base = min ?? 0
      let committed = step ? base + Math.round((value - base) / step) * step : value
      // `step` is routinely fractional (0.1, 0.5), and the arithmetic above
      // reintroduces the binary-float tail it exists to remove.
      committed = Number.parseFloat(committed.toFixed(4))
      if (min !== undefined) committed = Math.max(committed, min)
      if (max !== undefined) committed = Math.min(committed, max)

      setValue(entity.entity_id, committed)
    },
    [entity, setValue]
  )

  // Show skeleton while loading initial data
  if (isEntityLoading || (!entity && isConnected)) {
    return <SkeletonCard tier={tier} showIcon={true} lines={2} />
  }

  // Show error state when disconnected or entity not found
  if (!entity || !isConnected) {
    return (
      <ErrorDisplay
        error={!isConnected ? 'Disconnected from Home Assistant' : `Entity ${entityId} not found`}
        variant="card"
        tier={tier}
        title={!isConnected ? 'Disconnected' : 'Entity Not Found'}
        onRetry={!isConnected ? () => window.location.reload() : undefined}
      />
    )
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

  // Format display value
  const displayValue = parseFloat(entity.state).toFixed(
    attributes.step && attributes.step < 1 ? 1 : 0
  )

  const isGlance = tier === 'glance'

  /*
   * The click-to-edit readout, which is also the card's minimal control: it
   * enters an edit state and commits an arbitrary value inside `[min, max]`.
   *
   * It is a real `<button>` (Radix `Button`) rather than a styled `Box` with an
   * `onClick`, because it is the control `glance` keeps — the one thing that
   * stops a 1×1 `input_number` from being unoperable (docs/changes/0011 — "no
   * operability regression"). A `div` that only answers to clicks satisfies
   * that invariant for a pointer and breaks it for every keyboard, switch and
   * screen-reader user, which is the case the invariant most needs to cover. A
   * button is focusable in tab order, activates on both Enter and Space, and
   * announces itself as something operable, all from the element rather than
   * from handlers that have to be kept in sync.
   *
   * The label names the action and repeats the visible value, so the accessible
   * name contains the visible one (WCAG "Label in Name") instead of replacing
   * it — "50 %" alone would read as a value with no hint that pressing it does
   * anything.
   */
  const valueLabel = `${displayValue}${unit ? ` ${unit}` : ''}`
  const valueField = isEditing ? (
    <form onSubmit={handleValueSubmit}>
      <TextField.Root
        size="3"
        aria-label="Value"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleFieldBlur}
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
      onClick={handleFieldClick}
      style={{ minWidth: '60px' }}
    >
      <Text size="2" weight="bold">
        {valueLabel}
      </Text>
    </Button>
  )

  /*
   * The stepper: the two bound-clamped buttons around that readout.
   *
   * `glance` keeps the readout and drops the buttons. The option doc asks for
   * "value big, no control" at one cell and the card cannot go that far — an
   * `input_number` has no whole-tile action to fall back on, and its dialog
   * control does not arrive until 0022, so a control-free glance would leave
   * the tile with no way to set the helper at all (docs/changes/0011 — "no
   * operability regression"). Dropping the two buttons is the omission that
   * fits: a 1×1 tile cannot hold two 40px targets, a 60px readout and a name
   * without clipping, and what stays behind is the more capable control of the
   * three — the readout sets any value in range, the buttons only step by one.
   */
  const stepper = (
    <GridCard.Controls>
      <IconButton
        size="3"
        variant="soft"
        aria-label="Decrease value"
        onClick={handleDecrement}
        disabled={
          loading || (attributes.min !== undefined && parseFloat(entity.state) <= attributes.min)
        }
        style={{ cursor: 'pointer' }}
      >
        <Minus size={16} />
      </IconButton>

      {valueField}

      <IconButton
        size="3"
        variant="soft"
        aria-label="Increase value"
        onClick={handleIncrement}
        disabled={
          loading || (attributes.max !== undefined && parseFloat(entity.state) >= attributes.max)
        }
        style={{ cursor: 'pointer' }}
      >
        <Plus size={16} />
      </IconButton>
    </GridCard.Controls>
  )

  /*
   * Which embedded control renders (`controlStyle`), defaulting to the helper's
   * own `mode` attribute — `box` steps, `slider` slides — so a helper
   * reconfigured in Home Assistant keeps steering cards nobody has configured
   * (docs/specs/entity-cards/options/input-helpers.md). Existing cards were
   * built with the stepper, so the loader pins them to it; the attribute
   * default reaches new cards only (common contract, convention 7).
   */
  const controlStyle = readNumberControlStyle(config ?? publishedItem.config, attributes.mode)

  /*
   * The slider commits on release, never while dragging: the value under the
   * finger is a position, not an intent, and dispatching per pixel would send a
   * service call per frame. `dragValue` is what the card shows meanwhile — the
   * readout in the track follows the thumb, so what is committed is what was
   * visibly chosen.
   *
   * Vertical in `tall`, where the tile's height is the travel; horizontal
   * everywhere else. `glance` gets no slider at all — it keeps the readout that
   * is its only way to operate the helper.
   */
  const sliderValue = dragValue ?? parseFloat(entity.state)
  const slider = (
    <GridCard.Controls>
      <Slider
        label={`Set ${attributes.friendly_name || entity.entity_id.split('.')[1]}`}
        value={Number.isFinite(sliderValue) ? sliderValue : (attributes.min ?? 0)}
        min={attributes.min ?? 0}
        max={attributes.max ?? 100}
        step={attributes.step || 1}
        orientation={tier === 'tall' ? 'vertical' : 'horizontal'}
        disabled={loading}
        readout={valueLabel}
        onValueChange={setDragValue}
        onValueCommit={handleSliderCommit}
        domain="input_number"
        color="default"
      />
    </GridCard.Controls>
  )

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
      title={error || undefined}
    >
      {/*
       * `glance` anchors on the value and drops the icon circle with it, as the
       * option doc's "value big" row asks. The helper's `min – max` range is
       * secondary text and renders only in `full`, the one tier the tier table
       * gives a line past the meta ("`row` control plus the `min – max` range
       * line") — everywhere else it is omitted rather than squeezed onto a
       * tile that is already carrying a name and a three-part control.
       */}
      <CardBody
        arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
        lead={
          isGlance ? (
            valueField
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
        control={isGlance ? undefined : controlStyle === 'slider' ? slider : stepper}
      />
    </GridCard>
  )
})
