import { createElement } from 'react'
import { Flex, Text, Heading, Box } from '@radix-ui/themes'
import { Thermometer } from 'lucide-react'
import { useEntity } from '../../hooks'
import { SkeletonCard, ErrorDisplay } from '../ui'
import { GridCardWithComponents as GridCard } from '../GridCard'
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
  readWeatherReading,
  resolveConditionBackground,
  resolveSecondaryReading,
  resolveUnavailableStatus,
  WEATHER_ARTWORK_FG,
  supplementalReadings,
  type WeatherSecondaryReading,
} from './presentation'

function WeatherCardDetailedContent(props: CardProps) {
  const {
    entityId,
    tier = 'row',
    onDelete,
    isSelected = false,
    onSelect,
    config,
    onConfigure,
  } = props
  const options = readWeatherOptions(config)
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)

  // Before the early returns, because a hook cannot be called after one; a
  // section this tier or these options switch off subscribes to nothing.
  const forecast = useWeatherForecastSections({
    entityId,
    tier,
    span: props.span,
    options,
    entityUnit: entity?.attributes?.temperature_unit,
  })

  // Show skeleton while loading initial data
  if (isEntityLoading || (!entity && isConnected)) {
    return <SkeletonCard tier={tier} showIcon={true} lines={3} />
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

  /*
   * Tier layout (docs/specs/entity-cards/options/weather.md — "Tier layouts").
   * `detailed` is the variant that adds pressure, and the tier decides how much
   * of its labelled block fits:
   *
   *   glance  glyph + name + the temperature in the state slot; no condition
   *           text and no data block at all.
   *   row     header plus the temperature and the featured secondary row —
   *           anything further is the first thing that does not fit.
   *   tall    the same content, stacked down the tile.
   *   full    the big `liebe-value` readout and the whole block: the featured
   *           reading, what the detail line continues with, and pressure —
   *           this variant's own third data point.
   */
  const isGlance = tier === 'glance'
  const isTall = tier === 'tall'
  const isFull = tier === 'full'

  const secondaryInput = { attributes, temperatureUnit: options.temperatureUnit }
  const secondary = isGlance
    ? undefined
    : resolveSecondaryReading(options.secondaryInfo, secondaryInput)
  /*
   * `detailed`'s identity is the extra data point, so `full` appends pressure
   * to what the shared detail line already carries — deduplicated, so featuring
   * pressure through `secondaryInfo` does not list it twice.
   */
  const pressure = isFull ? readWeatherReading('pressure', secondaryInput) : undefined
  const detail = isFull
    ? [
        ...supplementalReadings(secondary, secondaryInput),
        ...(pressure && pressure.kind !== secondary?.kind ? [pressure] : []),
      ]
    : []

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
        <Flex direction="column" gap="3">
          <GridCard.Icon>
            <span style={{ color: 'var(--gray-9)', opacity: 0.5 }}>
              {createElement(ConditionGlyph, { size: 24 })}
            </span>
          </GridCard.Icon>
          <GridCard.Title>{entity.attributes?.friendly_name || entityId}</GridCard.Title>
          <GridCard.Status>{unavailableStatus}</GridCard.Status>
        </Flex>
      </GridCard>
    )
  }

  /** One labelled row — the shape that gives this variant its density. */
  const labelledRow = (label: string, value: React.ReactNode, icon: React.ReactNode) => (
    <Flex align="center" gap="2" key={label}>
      {icon}
      <Flex direction="column" gap="0">
        <Text size="1" color={getWeatherTextColor(!!backgroundImage, 'gray')} style={styles.text}>
          {label}
        </Text>
        {value}
      </Flex>
    </Flex>
  )

  const readingRow = (reading: WeatherSecondaryReading) =>
    labelledRow(
      reading.label,
      <Text size="3" weight="bold" style={styles.text}>
        {reading.value}
      </Text>,
      createElement(reading.icon, {
        size: 18,
        style: { ...styles.icon, color: backgroundImage ? WEATHER_ARTWORK_FG : 'var(--gray-9)' },
      })
    )

  const temperatureRow = tempDisplay
    ? labelledRow(
        'Temperature',
        isFull ? (
          <div style={emphasisStyles.text}>
            <CardValue
              domain="weather"
              value={Math.round(tempDisplay.value)}
              unit={tempDisplay.unit}
            />
          </div>
        ) : (
          <Text size="4" weight="bold" style={styles.text}>
            {formatTemperature(tempDisplay)}
          </Text>
        ),
        <Thermometer
          size={20}
          style={{
            ...styles.icon,
            color: backgroundImage
              ? WEATHER_ARTWORK_FG
              : isStale
                ? 'var(--orange-9)'
                : 'var(--gray-9)',
          }}
        />
      )
    : undefined

  const control =
    isGlance || (!temperatureRow && !secondary) ? undefined : (
      <GridCard.Controls>
        <Flex direction="column" gap="3">
          {temperatureRow}
          {secondary && readingRow(secondary)}
        </Flex>
      </GridCard.Controls>
    )

  const detailRows =
    detail.length > 0 ? (
      <Flex direction="column" gap="3">
        {detail.map(readingRow)}
      </Flex>
    ) : undefined

  // `undefined` rather than an empty wrapper when there is nothing to put in
  // it, so a card with no forecast lays out as if the options were off.
  const extra =
    detailRows || forecast.hasContent ? (
      <Flex direction="column" gap="3" width="100%">
        {detailRows}
        <WeatherForecastSections sections={forecast} hasBackground={!!backgroundImage} />
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
        // `tall` runs glyph → data → meta down the tile like every other card;
        // the other three tiers take the default shapes.
        arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
        lead={
          <GridCard.Icon>
            <span
              style={{
                color: isStale ? 'var(--orange-9)' : 'var(--accent-9)',
                opacity: isStale ? 0.6 : 1,
              }}
            >
              {createElement(ConditionGlyph, { size: isTall ? 24 : 32 })}
            </span>
          </GridCard.Icon>
        }
        meta={
          <GridCard.Meta>
            <Box>
              <GridCard.Title>
                <Heading size="3" style={emphasisStyles.text}>
                  {entity.attributes?.friendly_name || entity.entity_id}
                </Heading>
              </GridCard.Title>
              <GridCard.Status>
                <Text
                  size="2"
                  color={getWeatherTextColor(!!backgroundImage, 'gray')}
                  style={{ ...styles.text, textTransform: 'capitalize' }}
                >
                  {isGlance && tempDisplay ? formatTemperature(tempDisplay) : entity.state}
                </Text>
              </GridCard.Status>
            </Box>
          </GridCard.Meta>
        }
        control={control}
        extra={extra}
      />
    </GridCard>
  )
}

export const WeatherCardDetailed = Object.assign(
  withCardErrorBoundary(WeatherCardDetailedContent),
  {
    defaultDimensions: { width: 4, height: 4 },
  }
)
