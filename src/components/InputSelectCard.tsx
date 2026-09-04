import { memo, useCallback, useRef, useState, type Ref } from 'react'
import { Box, Flex, Text } from '@radix-ui/themes'
import { Select } from '~/components/ui/portals'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from './CardBody'
import { Archive, ChevronDown, List } from 'lucide-react'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { GridCardWithComponents as GridCard } from './GridCard'
import { renderCardLifecycle } from './ui'
import { Pill, PillGroup } from './anatomy'
import { DetailControlSection } from './EntityDetailDialog/DetailControlSection'
import {
  registerDetailControls,
  type EntityDetailControlsProps,
} from './EntityDetailDialog/detailControls'
import {
  readSelectControlStyle,
  readSelectOptions,
  resolveSelectPresentation,
  type SelectControlStyle,
} from '~/store/inputHelperOptions'
import { useCardItem } from './cardItemContext'
import type { HassEntity } from '~/store/entityTypes'
import type { CardSpan, CardTier } from '~/utils/cardTier'
import { withCardErrorBoundary } from './cardErrorBoundary'

interface InputSelectCardProps {
  entityId: string
  tier?: CardTier
  /**
   * The effective grid span behind `tier`. Accepted so any renderer can hand a
   * card the pair `CardProps` defines; no select-helper layout keys on width
   * past the tier boundary, so nothing here reads it.
   */
  span?: CardSpan
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
  /** The placed item's stored options, when the renderer passes them directly. */
  config?: Record<string, unknown>
}

interface InputSelectAttributes {
  friendly_name?: string
  /** Whatever the helper published — validated at the read, not at the type. */
  options?: unknown
  _stale?: boolean
}

interface SelectHelperControlProps {
  entity: HassEntity
  /** Which presentation renders, already degraded for tier and option count. */
  presentation: SelectControlStyle
  /** A dispatch is in flight, so every commit route is held shut. */
  loading?: boolean
  /** Select one of the helper's own options. */
  onCommit: (option: string) => void
  /** Reaches the dropdown trigger, so the card's tile tap can focus it. */
  triggerRef?: Ref<HTMLButtonElement>
  /** Reaches the pill group, so the tile tap can focus its first live pill. */
  pillGroupRef?: Ref<HTMLDivElement>
  /**
   * Whether the dropdown menu is open. Owned by the caller, so a tap on the
   * tile can open the menu the same way the trigger does. Absent —
   * `undefined` — the control falls back to its own internal open state,
   * which is what the detail dialog relies on.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * The select helper's embedded control — the dropdown or the pill group.
 *
 * Rendered bare so the card can wrap it in `GridCard.Controls` and the detail
 * dialog in `DetailControlSection`, which is what lets the dialog mount the
 * same control the card's `full` tier renders rather than a second one that
 * drifts from it (docs/specs/entity-cards/options/input-helpers.md).
 */
export function SelectHelperControl({
  entity,
  presentation,
  loading = false,
  onCommit,
  triggerRef,
  pillGroupRef,
  open: openProp,
  onOpenChange,
}: SelectHelperControlProps) {
  const attributes = entity.attributes as InputSelectAttributes
  /*
   * The helper's own list, read defensively: `options` is user-defined and can
   * arrive absent, empty, or not a list at all from a hand-edited helper.
   */
  const options = readSelectOptions(attributes)
  const currentValue = entity.state
  const helperName = attributes.friendly_name || entity.entity_id.split('.')[1]
  // A controlled caller (the card, driving the tile tap) owns the open state;
  // the dialog mounts the control bare and it falls back to its own internal
  // one there.
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = openProp ?? uncontrolledOpen
  const handleOpenChange = onOpenChange ?? setUncontrolledOpen
  if (presentation === 'pills') {
    return (
      <PillGroup label={helperName} groupRef={pillGroupRef}>
        {options.map((option) => (
          <Pill
            key={option}
            label={option}
            active={option === currentValue}
            // The current option is not a command: pressing it would send a
            // `select_option` that changes nothing, and a control that does
            // nothing must say so rather than look live.
            disabled={loading || option === currentValue}
            onClick={() => onCommit(option)}
            domain="input_select"
            color="default"
          />
        ))}
      </PillGroup>
    )
  }

  return (
    <Box onClick={(e) => e.stopPropagation()} style={{ minWidth: '120px' }}>
      <Select.Root
        value={currentValue}
        onValueChange={onCommit}
        disabled={loading || options.length === 0}
        open={open}
        onOpenChange={handleOpenChange}
      >
        {/*
         * `role="combobox"` takes no name from its contents, so the current
         * option rendered inside the trigger names nothing: without this the
         * control is an anonymous critical `button-name` violation wherever it
         * renders — the card at `row`/`tall`/`full` and the detail dialog alike
         * (docs/specs/design-system/index.md — card anatomy, and
         * docs/changes/0035-light-appearance-contrast.md). The name says what
         * the control changes rather than what it currently reads; the value is
         * already conveyed as the combobox's value.
         */}
        <Select.Trigger
          ref={triggerRef}
          variant="soft"
          aria-label={`Select ${helperName}`}
          style={{ width: '100%' }}
        >
          <Flex align="center" justify="between" style={{ width: '100%' }}>
            <Text size="2">{currentValue}</Text>
            <ChevronDown size={16} />
          </Flex>
        </Select.Trigger>
        <Select.Content>
          {options.map((option) => (
            <Select.Item key={option} value={option}>
              {option}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </Box>
  )
}

/**
 * The `input_select` control the detail dialog mounts — what a control-free
 * `glance` tile defers to through its `more-info` tap
 * (docs/specs/entity-cards/options/input-helpers.md — the tier table).
 *
 * The dropdown, not the pills: pills are a `full`-tier presentation an
 * individual *card* opts into, and the dialog is opened for an entity rather
 * than for a card, so it has no card's `controlStyle` to read. The dropdown is
 * also the presentation that holds every option list — the one the pills
 * themselves degrade to when there are too many.
 */
export function InputSelectDetailControls({ entity }: EntityDetailControlsProps) {
  const { setValue, loading, error } = useServiceCall()

  return (
    <DetailControlSection error={error}>
      <SelectHelperControl
        entity={entity}
        presentation="dropdown"
        loading={loading}
        onCommit={(option) => setValue(entity.entity_id, option)}
      />
    </DetailControlSection>
  )
}

// Registered by the card family that owns the control; see the note on
// `registerDetailControls` in `InputNumberCard.tsx` for why the edge runs this
// way round and why it is safe.
registerDetailControls('input_select', InputSelectDetailControls)

const MemoizedInputSelectCard = memo(function InputSelectCardContent({
  entityId,
  tier = 'row',
  onDelete,
  isSelected = false,
  onSelect,
  config,
}: InputSelectCardProps) {
  const { entity, isConnected, isMissing, isLoading: isEntityLoading } = useEntity(entityId)
  const { setValue, loading, error } = useServiceCall()
  const publishedItem = useCardItem()

  const isGlance = tier === 'glance'
  // The dropdown trigger and the pill group, so the tile tap can focus
  // whichever presentation renders. Refs rather than state: focusing is
  // imperative and renders nothing.
  const triggerRef = useRef<HTMLButtonElement>(null)
  const pillGroupRef = useRef<HTMLDivElement>(null)
  // The dropdown's open state, owned here so the tile tap can open the menu —
  // the option doc's "open the control". The dialog mounts the control bare
  // and the menu owns it itself.
  const [isOpen, setIsOpen] = useState(false)
  // The presentation the tap routes on, resolved before the entity guards so
  // no hook sits below an early return. The stored style needs the option
  // count, which is unknown until the entity loads, so this reads it
  // defensively — an absent entity resolves as the `dropdown` default, which
  // is exactly what the resolver returns for zero options. The render below
  // resolves the same value from the loaded entity; the two agree wherever a
  // tap can happen, because a tap needs a rendered tile.
  const attributesForPresentation = entity?.attributes as InputSelectAttributes | undefined
  const earlyPresentation = resolveSelectPresentation(
    readSelectControlStyle(config ?? publishedItem.config),
    tier,
    readSelectOptions(attributesForPresentation).length
  )

  /*
   * The tile tap is the card's primary action: it opens the control — opening
   * the dropdown menu where the dropdown renders, focusing the first live
   * pill where the pills do (the option doc's "Primary action"). At `glance`
   * there is no control to open, so the tap resolves to `more-info` instead
   * and this declines — it is still passed, because an absent handler would
   * tell the shell the card has no toggle of its own and route a configured
   * `toggle` to `homeassistant.toggle` on an `input_select`.
   *
   * A plain function rather than a `useCallback`: it closes over state
   * setters and stable refs plus `isGlance` and the pre-return presentation,
   * and the shell calls it without memoizing — so there is no identity to
   * preserve. The routing consults the resolved presentation, never the
   * stored `controlStyle`: a stored `pills` degrades to the dropdown outside
   * `full` or past five options, and the tap must open what is there rather
   * than what is stored.
   */
  const handleClick = () => {
    if (isGlance) {
      /*
       * A configured `tapAction: toggle` resolves to this handler whatever the
       * tier, so declaring `more-info` as the card's DEFAULT is not enough on
       * its own — a tile with an explicit toggle would call this, find no
       * control to open, and do nothing at all. Returning `'more-info'`
       * routes the gesture to the detail dialog instead, which is the escape
       * hatch `GridCard`'s `onClick` contract exists for and that the text card
       * already uses for its own control-free tiers.
       */
      return 'more-info'
    }
    if (earlyPresentation === 'pills') {
      // The current option's pill is disabled by design — pressing it would
      // send a `select_option` that changes nothing — so focus skips it for
      // the first pill that can actually be chosen.
      const group = pillGroupRef.current
      const firstLive = group?.querySelector('button:not([disabled])') as HTMLElement | null
      if (!firstLive) {
        // No pill rendered: `iconOnly` drops every slot but the lead, and the
        // cross-axis-fit floors can empty the slot — in both cases there is
        // nothing to focus, so the tap resolves to `more-info` exactly as at
        // `glance` (the option doc states the rule on the absence of a
        // control rather than on the tier).
        return 'more-info'
      }
      firstLive.focus()
      return undefined
    }
    // Focus first for the keyboard path, then open: opening moves focus into
    // the menu itself, and a trigger that never takes focus leaves a
    // keyboard opener with no visible anchor when the menu closes. A helper
    // with no options renders a disabled dropdown — focusing it would neither
    // open a control nor reach `more-info`, so the tap bypasses the trigger
    // and resolves to the dialog instead, which renders the disabled control
    // and says it is disabled. Held shut while a dispatch is in flight too,
    // so a tap cannot arm an open that fires late, after the load lands.
    // Absent trigger, same fallback: the control slot was suppressed
    // (`iconOnly`) or omitted (cross-axis-fit floors), so there is nothing to
    // open and the tap resolves to `more-info`.
    if (!triggerRef.current) return 'more-info'
    if (readSelectOptions(attributesForPresentation).length === 0) return 'more-info'
    triggerRef.current.focus()
    if (!loading) setIsOpen(true)
    return undefined
  }

  const handleValueChange = useCallback(
    (value: string) => {
      if (!entity) return
      setValue(entity.entity_id, value)
    },
    [entity, setValue]
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
        domain="input_select"
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

  const attributes = entity.attributes as InputSelectAttributes
  const isStale = attributes._stale === true
  const options = readSelectOptions(attributes)

  /*
   * `controlStyle` chooses the presentation, and the tier and the option count
   * decide whether it fits (docs/specs/entity-cards/options/input-helpers.md).
   * Pills need `full` and at most five options; anywhere else the stored value
   * degrades to the dropdown rather than clipping a row that cannot fit —
   * degrade, never scroll. Nothing is rewritten, so a card re-engages its pills
   * when it is resized or the helper loses an option.
   */
  const controlStyle = readSelectControlStyle(config ?? publishedItem.config)
  const presentation = resolveSelectPresentation(controlStyle, tier, options.length)

  return (
    <GridCard
      // Input helpers have no domain row of their own; `default` is the
      // generic active colour the design system points them at.
      domain="input_select"
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
       * One cell holds no dropdown, so `default` resolves to `more-info` and
       * the dialog's `input_select` control is what changes the option
       * (docs/specs/entity-cards/options/input-helpers.md — "In `glance`, fall
       * back to `more-info`").
       */
      defaultAction={isGlance ? 'more-info' : undefined}
      title={error || undefined}
      /*
       * The entity travels with the config for the same reason it does on the
       * number card: the shell builds the detail dialog's target out of the
       * placed item, so a card that hands over neither suppresses the
       * `more-info` fallback to an action with nothing behind it.
       */
      entityId={entityId}
      config={config ?? publishedItem.config}
    >
      {/*
       * `glance` reads the current option out as the tile's state line and
       * carries no control, which is what the option doc's tier table asks for
       * ("Icon + name + **current option as state**; tap → more-info").
       *
       * The option-count line is what the middle tiers omit instead: it is
       * secondary text about the helper rather than its state, so it renders
       * only in `full`, the one tier with a line past the meta — and at
       * `glance` the state line is already spoken for by the option itself.
       */}
      <CardBody
        arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
        lead={
          <GridCard.Icon>
            <List size={24} style={{ color: 'var(--gray-9)' }} />
          </GridCard.Icon>
        }
        meta={
          <GridCard.Meta>
            <GridCard.Title>
              {attributes.friendly_name || entity.entity_id.split('.')[1]}
            </GridCard.Title>
            {isGlance ? <GridCard.Status>{entity.state}</GridCard.Status> : null}
            {tier === 'full' && options.length > 0 ? (
              <GridCard.Status>
                {options.length} option{options.length !== 1 ? 's' : ''}
              </GridCard.Status>
            ) : null}
          </GridCard.Meta>
        }
        control={
          isGlance ? undefined : (
            <GridCard.Controls>
              <SelectHelperControl
                entity={entity}
                presentation={presentation}
                loading={loading}
                onCommit={handleValueChange}
                triggerRef={triggerRef}
                pillGroupRef={pillGroupRef}
                open={isOpen}
                onOpenChange={setIsOpen}
              />
            </GridCard.Controls>
          )
        }
      />
    </GridCard>
  )
})

export const InputSelectCard = withCardErrorBoundary(MemoizedInputSelectCard)
