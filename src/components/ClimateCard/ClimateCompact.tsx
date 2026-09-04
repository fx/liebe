import { Thermometer } from 'lucide-react'
import { readClimateOptions } from '~/store/climateOptions'
import { useDashboardStore } from '~/store'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from '../CardBody'
import { useCardItem } from '../cardItemContext'
import type { CardProps } from '../cardRegistry'
import { registerDetailControls } from '../EntityDetailDialog/detailControls'
import { ClimateDetailControls } from './ClimateDetailControls'
import { ClimateSecondaryRows } from './ClimateSecondaryRows'
import { ClimateSetpointControls } from './ClimateSetpointControls'
import { ClimateStateLine, glanceStateText } from './ClimateStateLine'
import { climateCardFallback } from './ClimateCardStates'
import { useClimateModel } from './climateModel'
import { temperatureDisplay } from './temperatureDisplay'
import { useClimateControl } from './useClimateControl'
import './ClimateCard.css'

/*
 * The domain controls the detail dialog mounts, registered by the card family
 * that owns them — the dialog is imported *by* `GridCard` and every card
 * imports `GridCard`, so a dialog that imported cards to find their controls
 * would close the temporal-dead-zone cycle AGENTS.md documents. Reaching the
 * registry from a card closes nothing: `detailControls` imports two types and
 * nothing else, so it is a leaf at runtime.
 *
 * It lives in *this* module rather than beside the component because the
 * package declares `"sideEffects": false`: a module imported only for its side
 * effect may be dropped from a production bundle, and this one is the module
 * the card registry imports, so it is always retained. The registration has
 * therefore always run by the time the dialog reads it — the tile whose
 * `more-info` opens it is this card.
 */
registerDetailControls('climate', ClimateDetailControls)

/**
 * The `compact` variant: the stepper/pills presentation, at every tier.
 *
 * The default (docs/specs/entity-cards/options/climate.md — "variant"), because
 * it is the presentation that degrades cleanly through every tier, and defaults
 * must look right with zero configuration at any size. The arc dial lives in
 * `ClimateDial.tsx` behind `variant: dial` and falls back to this component
 * below `full`, so this file is what a thermostat renders at three of the four
 * tiers no matter how it is configured.
 *
 * What each tier carries (option doc — "Tier layouts"). Content that does not
 * fit is omitted, never clipped (docs/specs/design-system — "Size-adaptive
 * layouts"):
 *
 *   glance  icon in the HVAC state colour, name, and the target temperature in
 *           the state slot. **No controls**: the whole tile is the primary
 *           action, which for a thermostat is the detail dialog — and the
 *           dialog carries this same stepper, registered in
 *           `ClimateDetailControls.tsx`. The two are one change on purpose;
 *           dropping the stepper before the dialog had it would have left a 1×1
 *           thermostat nobody could turn up (docs/changes/0011-layout-tiers.md
 *           — no operability regression).
 *   row     icon + meta + the stepper with a large readout between the buttons.
 *           Range mode gets independent low/high steppers at width ≥3 and a
 *           lockstep pair at width 2 — which is why this card takes the span and
 *           not only the tier.
 *   tall    icon on top, readout with the stepper turned vertical (+ above, −
 *           below), meta at the bottom.
 *   full    the row layout plus the secondary rows in order — mode pills, preset
 *           pills, fan-mode pills — and the humidity fragment in the state area.
 */
export function ClimateCompactContent({
  entityId,
  tier = 'row',
  span,
  onDelete,
  isSelected = false,
  onSelect,
  config: configProp,
}: CardProps) {
  const model = useClimateModel(entityId)
  const control = useClimateControl(entityId)
  const { config: publishedConfig } = useCardItem()
  /*
   * The renderer's config when it passed one, the published item's otherwise —
   * and the same resolution goes to the shell below, so the card and its tile
   * cannot disagree about the configuration. A card rendered with a literal
   * `entityId` and `config` and no provider (a story, the configuration
   * preview) is the shape where the two sources come apart; the universal
   * options are resolved by the shell, so a card that read one source while its
   * shell read another would apply half of one.
   */
  const config = configProp ?? publishedConfig
  const mode = useDashboardStore((state) => state.mode)
  const isEditMode = mode === 'edit'

  const fallback = climateCardFallback({ model, tier, isSelected, onSelect, onDelete })
  if (fallback) return fallback

  // Established by the fallback above: it returns an element for every state in
  // which there is no entity to read, so anything past it has a reading.
  const reading = model.reading!
  const { friendlyName, hvacMode, statusColor } = reading

  const options = readClimateOptions(config)
  const display = temperatureDisplay(reading.tempUnit, options.displayUnit)

  const isGlance = tier === 'glance'
  const isFull = tier === 'full'
  const isTall = tier === 'tall'

  /*
   * Independent low/high needs the width for two steppers side by side; below
   * that the pair moves the whole band. Read off the effective span rather than
   * the tier, which cannot tell a 2×1 from a 4×1.
   */
  const hasWidthForBothSetpoints = (span?.width ?? 0) >= 3

  // `glance` is control-free — the tile is the action — and edit mode hides
  // every control at every tier, because a tap there selects the card.
  const controls =
    isEditMode || isGlance ? null : (
      <ClimateSetpointControls
        reading={reading}
        control={control}
        display={display}
        vertical={isTall}
        independentSetpoints={hasWidthForBothSetpoints}
      />
    )

  const secondaryRows =
    isFull && !isEditMode ? (
      <ClimateSecondaryRows reading={reading} options={options} control={control} />
    ) : null

  return (
    <GridCard
      domain="climate"
      color={statusColor}
      tier={tier}
      isLoading={control.isLoading}
      isError={!!control.error}
      isStale={model.isStale}
      isSelected={isSelected}
      isOn={hvacMode !== 'off'}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      // A thermostat's tap default is the detail dialog, never a power toggle
      // (docs/specs/entity-cards/options/climate.md — "Primary action") — and at
      // `glance` that dialog is the whole of the tile's operability.
      defaultAction="more-info"
      title={control.error || undefined}
      className="climate-card"
      // The entity travels with the config: the shell resolves the universal
      // options off one and builds an icon-only tile's accessible name out of
      // the other, and both default to the published item.
      entityId={entityId}
      config={config}
    >
      {/*
       * The stepper fills the band between icon and meta in `tall`, which is
       * the axis that tier gives the card room on; everywhere else it stays the
       * size of its two buttons and their readout — grown to a row's width it
       * would float them apart.
       */}
      <CardBody
        arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
        controlSize={isTall ? 'fill' : 'content'}
        lead={
          <GridCard.Icon>
            <Thermometer size={20} />
          </GridCard.Icon>
        }
        meta={
          <GridCard.Meta>
            <GridCard.Title>{friendlyName}</GridCard.Title>
            <GridCard.Status>
              {isGlance ? (
                glanceStateText(reading, display)
              ) : (
                <ClimateStateLine
                  reading={reading}
                  options={options}
                  display={display}
                  showHumidity={isFull}
                />
              )}
            </GridCard.Status>
          </GridCard.Meta>
        }
        control={controls}
        extra={secondaryRows}
      />
    </GridCard>
  )
}
