import { createElement } from 'react'
import { Flex } from '@radix-ui/themes'
import { useEntity } from '../../hooks'
import { SkeletonCard, ErrorDisplay } from '../ui'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from '../CardBody'
import { CardValue } from '../anatomy'
import { readCardDisplay } from '~/store/cardDisplay'
import { readWeatherOptions } from '~/store/weatherOptions'
import { useCardItem } from '../cardItemContext'
import type { CardProps } from '../cardRegistry'
import {
  formatTemperature,
  getConditionGlyph,
  getTemperatureDisplay,
  resolveUnavailableStatus,
} from './presentation'
import { withCardErrorBoundary } from '../cardErrorBoundary'

function WeatherCardMinimalContent(props: CardProps) {
  const {
    entityId,
    tier = 'row',
    onDelete,
    isSelected = false,
    onSelect,
    config: configProp,
    onConfigure,
  } = props
  const publishedItem = useCardItem()
  /*
   * The card's stored options, from the renderer's prop when it passed one and
   * off the published item otherwise, because both are real: the grid hands a
   * placed card both, while anything that publishes only the item context (the
   * configuration preview) is still a card the options have to reach.
   *
   * Bound to the name `config` rather than resolved into a second variable
   * beside the raw prop, and that is the point rather than a style choice: a
   * component holding both an unresolved `config` and a resolved `storedConfig`
   * invites the next option read to take whichever is nearer, and the two
   * disagree on exactly one path. This variant shipped that: the `iconOnly` read
   * below took the resolved value while `readWeatherOptions` a line above kept
   * the bare prop, so a card rendered through `CardItemProvider` with no prop
   * ignored its persisted `temperatureUnit`. One name, one source, nothing left
   * to pick wrongly.
   */
  const config = configProp ?? publishedItem.config
  const options = readWeatherOptions(config)
  /*
   * The one universal option this variant has to read for itself. The seam
   * suppresses every slot but the lead, and this is the variant with no lead to
   * keep — so under `iconOnly` a body that only collapsed its slots would leave
   * an empty tile, which is the outcome the option's audit exists to catch
   * (docs/specs/entity-cards/options/common.md — "Every card and every
   * registered variant MUST resolve an icon-only form").
   *
   * The same resolution goes to the shell below, which is the part that cannot
   * be skipped: a card that reads one source while its shell reads another
   * renders half the option — this glyph on a tile that never suppressed
   * anything and never stamped the marker. `ActionCard` and `CameraCard` pass
   * their resolved config down for exactly this reason.
   */
  const { iconOnly } = readCardDisplay(config)
  const { entity, isConnected, isLoading: isEntityLoading } = useEntity(entityId)

  // Show skeleton while loading initial data
  if (isEntityLoading || (!entity && isConnected)) {
    return <SkeletonCard tier={tier} showIcon={false} lines={1} />
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

  const attributes = entity.attributes as Record<string, unknown> | undefined
  const tempDisplay = getTemperatureDisplay(
    attributes?.temperature,
    attributes?.temperature_unit,
    options.temperatureUnit
  )
  const unavailableStatus = resolveUnavailableStatus(entity.state)
  const isGlance = tier === 'glance'

  // Handle unavailable state
  if (unavailableStatus) {
    return (
      <GridCard
        domain="weather"
        tier={tier}
        isUnavailable={true}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
        onConfigure={onConfigure}
        hasConfiguration={!!onConfigure}
        backdrop={false}
      >
        <Flex direction="column" align="center" justify="center" gap="2" height="100%">
          <GridCard.Title>{entity.attributes?.friendly_name || entity.entity_id}</GridCard.Title>
          <GridCard.Status>{unavailableStatus}</GridCard.Status>
        </Flex>
      </GridCard>
    )
  }

  return (
    <GridCard
      domain="weather"
      tier={tier}
      isSelected={isSelected}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      // Read-only card: `tapAction: default` resolves to `more-info`, per the
      // common contract's read-only rule.
      defaultAction="more-info"
      onConfigure={onConfigure}
      hasConfiguration={!!onConfigure}
      transparent={true}
      /*
       * Both, together. The config is what turns suppression on; the entity is
       * what the shell builds the accessible name out of, and it too defaults to
       * the published item — so passing one without the other is precisely how
       * an icon-only tile ends up with a glyph and no name at all, which the
       * contract forbids (docs/specs/entity-cards/options/common.md — "Visual
       * suppression never removes accessible semantics"). Half the shells in
       * this tree pass `entityId` already; this variant did not need to until
       * it started resolving the option for itself.
       */
      entityId={entityId}
      config={config}
    >
      {/*
       * `minimal` is the variant that renders LESS than its tier allows, which
       * the option doc explicitly permits: no condition artwork at any tier
       * whatever `showConditionBackground` says, no secondary line, no
       * forecasts. What is left is a name and one number, so the tier only
       * decides where the number goes — the state slot at `glance`, where one
       * cell holds a name and one value, and the big `liebe-value` readout
       * everywhere else.
       */}
      <CardBody
        arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
        /*
         * `undefined` normally — "no condition glyph at any tier" is what makes
         * this variant the minimal one — and the condition glyph under
         * `iconOnly`, which is the only presentation where the variant's own
         * content is gone. The glyph is the one its siblings already resolve
         * from the same state (`getConditionGlyph`, in `default` and
         * `detailed`'s icon circle), so an icon-only weather tile shows the same
         * mark whichever variant the user picked, rather than each variant
         * inventing one.
         */
        lead={
          iconOnly ? (
            <GridCard.Icon>
              {createElement(getConditionGlyph(entity.state), { size: 20 })}
            </GridCard.Icon>
          ) : undefined
        }
        meta={
          <GridCard.Meta>
            <GridCard.Title>{entity.attributes?.friendly_name || entity.entity_id}</GridCard.Title>
            <GridCard.Status>
              {isGlance && tempDisplay ? formatTemperature(tempDisplay) : entity.state}
            </GridCard.Status>
          </GridCard.Meta>
        }
        control={
          !isGlance && tempDisplay ? (
            <CardValue
              domain="weather"
              value={Math.round(tempDisplay.value)}
              unit={tempDisplay.unit}
            />
          ) : undefined
        }
      />
    </GridCard>
  )
}

export const WeatherCardMinimal = Object.assign(withCardErrorBoundary(WeatherCardMinimalContent), {
  defaultDimensions: { width: 2, height: 2 },
})
