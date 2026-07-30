import { createElement } from 'react'
import { Flex, Text, Box } from '@radix-ui/themes'
import { useEntity } from '../../hooks'
import { renderCardLifecycle } from '../ui'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { useCardItem } from '../cardItemContext'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from '../CardBody'
import { CardValue } from '../anatomy'
import { readWeatherOptions } from '~/store/weatherOptions'
import { useWeatherForecastSections, WeatherForecastSections } from './WeatherForecast'
import type { CardProps } from '../cardRegistry'
import { withCardErrorBoundary } from '../cardErrorBoundary'
import { WeatherScrim, weatherArtworkClass } from './WeatherArtwork'
import {
  formatTemperature,
  getConditionGlyph,
  getTemperatureDisplay,
  getWeatherTextColor,
  getWeatherTextStyles,
  resolveConditionBackground,
  resolveSecondaryReading,
  resolveUnavailableStatus,
  WEATHER_ARTWORK_FG,
  supplementalReadings,
} from './presentation'

function WeatherCardModernContent(props: CardProps) {
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
   * The card's stored options: the renderer's prop when it passed one, the
   * published item's otherwise. The grid hands a placed card both, so this only
   * changes what a renderer that publishes the item WITHOUT repeating it as a
   * prop gets — the configuration preview among them, which was rendering this
   * variant's defaults rather than its stored options. One name for the
   * resolution, so a second option read cannot pick up the unresolved prop
   * instead (which is how `WeatherCardMinimal` came to honour `iconOnly` from
   * one source and `temperatureUnit` from another).
   */
  const config = configProp ?? publishedItem.config
  const options = readWeatherOptions(config)
  const {
    entity,
    isConnected,
    isStale,
    isMissing,
    isLoading: isEntityLoading,
  } = useEntity(entityId)

  // Before the early returns, because a hook cannot be called after one; a
  // section this tier or these options switch off subscribes to nothing.
  const forecast = useWeatherForecastSections({
    entityId,
    tier,
    span: props.span,
    options,
    entityUnit: entity?.attributes?.temperature_unit,
  })

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

  const attributes = entity.attributes as Record<string, unknown> | undefined
  const tempDisplay = getTemperatureDisplay(
    attributes?.temperature,
    attributes?.temperature_unit,
    options.temperatureUnit
  )
  const unavailableStatus = resolveUnavailableStatus(entity.state)

  /*
   * Tier layout (docs/specs/entity-cards/options/weather.md — "Tier layouts").
   * `modern` keeps its identity — a large line-art glyph with the temperature
   * emphasised — and the tier decides the arrangement and how much of it fits;
   * what does not fit is omitted, never clipped:
   *
   *   glance  glyph + name + temperature in the state slot; no condition text,
   *           no secondary line.
   *   row     glyph and meta side by side, condition text in the state slot,
   *           the temperature and the secondary reading beside them.
   *   tall    glyph on top, temperature between it and the meta, secondary
   *           line at the bottom — the variant's resting shape.
   *   full    the big `liebe-value` readout plus a detail line that leads with
   *           the secondary reading; the forecast strips are 0020 PR 2's.
   */
  const isGlance = tier === 'glance'
  const isTall = tier === 'tall'
  const isFull = tier === 'full'

  const secondaryInput = { attributes, temperatureUnit: options.temperatureUnit }
  const secondary = isGlance
    ? undefined
    : resolveSecondaryReading(options.secondaryInfo, secondaryInput)
  const supplemental = isFull ? supplementalReadings(secondary, secondaryInput) : []

  // One glyph size at every tier; a smaller tile omits content rather than
  // scaling it down (docs/specs/design-system — "Size-adaptive layouts").
  const iconSize = 48
  const ConditionGlyph = getConditionGlyph(entity.state)

  // The condition artwork, once the option and the variant have had their say.
  const backgroundImage = resolveConditionBackground({
    condition: entity.state,
    showConditionBackground: options.showConditionBackground,
  })
  const styles = getWeatherTextStyles(!!backgroundImage)
  const emphasisStyles = getWeatherTextStyles(!!backgroundImage, 'emphasis')

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
        <Flex direction="column" align="center" justify="center" gap="3" height="100%">
          <Box style={{ color: 'var(--gray-9)', opacity: 0.5 }}>
            {createElement(ConditionGlyph, { size: iconSize })}
          </Box>
          <GridCard.Title>{entity.attributes?.friendly_name || entity.entity_id}</GridCard.Title>
          <GridCard.Status>{unavailableStatus}</GridCard.Status>
        </Flex>
      </GridCard>
    )
  }

  const temperature = tempDisplay ? (
    isFull ? (
      <div style={emphasisStyles.text}>
        <CardValue domain="weather" value={Math.round(tempDisplay.value)} unit={tempDisplay.unit} />
      </div>
    ) : (
      <Text size="5" weight="bold" style={emphasisStyles.text}>
        {formatTemperature(tempDisplay)}
      </Text>
    )
  ) : undefined

  const secondaryLine = secondary ? (
    <Text size="2" color={getWeatherTextColor(!!backgroundImage, 'gray')} style={styles.text}>
      {secondary.value}
    </Text>
  ) : undefined

  /*
   * `row` has one line, so the temperature and the secondary reading share the
   * control slot; the taller tiers put the secondary line underneath, which is
   * where the option doc places it.
   */
  const control =
    isGlance || (!temperature && !secondaryLine) ? undefined : (
      <GridCard.Controls>
        <Flex direction="column" align="center" gap="1">
          {temperature}
          {!isTall && !isFull && secondaryLine}
        </Flex>
      </GridCard.Controls>
    )

  const detailLine =
    (isTall || isFull) && (secondaryLine || supplemental.length > 0) ? (
      <Flex direction="column" align="center" gap="1">
        {secondaryLine}
        {supplemental.map((reading) => (
          <Text
            key={reading.kind}
            size="2"
            color={getWeatherTextColor(!!backgroundImage, 'gray')}
            style={styles.text}
          >
            {reading.text}
          </Text>
        ))}
      </Flex>
    ) : undefined

  // `undefined` rather than an empty wrapper when there is nothing to put in
  // it, so a card with no forecast lays out as if the options were off.
  const extra =
    detailLine || forecast.hasContent ? (
      // `weather-card-extra` collapses the slot when the content width left
      // room for no forecast column and there was no detail line beside it.
      <Flex direction="column" align="center" gap="2" width="100%" className="weather-card-extra">
        {detailLine}
        <WeatherForecastSections
          sections={forecast}
          hasBackground={!!backgroundImage}
          // With no current temperature there is no main readout to state the
          // unit, so the section label states it once instead.
          statesUnit={!tempDisplay}
        />
      </Flex>
    ) : undefined

  return (
    <GridCard
      domain="weather"
      tier={tier}
      isStale={isStale}
      isSelected={isSelected}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      // Read-only card: `tapAction: default` resolves to `more-info`, per the
      // common contract's read-only rule.
      defaultAction="more-info"
      onConfigure={onConfigure}
      hasConfiguration={!!onConfigure}
      title={isStale ? 'Weather data may be outdated' : undefined}
      backdrop={!backgroundImage}
      className={weatherArtworkClass(!!backgroundImage)}
      style={{
        backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        position: 'relative',
      }}
    >
      <WeatherScrim hasBackground={!!backgroundImage} />

      <CardBody
        arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
        lead={
          <Box
            style={{
              ...styles.icon,
              color: backgroundImage
                ? WEATHER_ARTWORK_FG
                : isStale
                  ? 'var(--orange-9)'
                  : 'var(--accent-9)',
              opacity: isStale ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {createElement(ConditionGlyph, { size: iconSize })}
          </Box>
        }
        meta={
          <GridCard.Meta>
            <GridCard.Title>
              <Text
                size="2"
                color={getWeatherTextColor(!!backgroundImage, 'gray')}
                style={styles.text}
              >
                {entity.attributes?.friendly_name || entity.entity_id}
              </Text>
            </GridCard.Title>

            {/*
             * The state slot: the condition, or the temperature itself at
             * `glance` where the condition text is the first thing to go.
             * Routed through the shell's slot rather than a bare `Text` so
             * `hideState` reaches it, as the common contract requires.
             */}
            <GridCard.Status>
              <Text
                size="3"
                weight="medium"
                style={{ ...styles.text, textTransform: 'capitalize' }}
              >
                {isGlance && tempDisplay ? formatTemperature(tempDisplay) : entity.state}
              </Text>
            </GridCard.Status>
          </GridCard.Meta>
        }
        control={control}
        extra={extra}
      />
    </GridCard>
  )
}

export const WeatherCardModern = Object.assign(withCardErrorBoundary(WeatherCardModernContent), {
  defaultDimensions: { width: 3, height: 3 },
})
