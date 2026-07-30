import { createElement } from 'react'
import { Flex, Text } from '@radix-ui/themes'
import { Thermometer } from 'lucide-react'
import { useEntity } from '../../hooks'
import { SkeletonCard, ErrorDisplay } from '../ui'
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
  getWeatherTextStyles,
  resolveConditionBackground,
  resolveSecondaryReading,
  resolveUnavailableStatus,
  WEATHER_ARTWORK_FG,
  supplementalReadings,
  type WeatherSecondaryReading,
} from './presentation'

function WeatherCardDefaultContent(props: CardProps) {
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
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)

  /*
   * Before the early returns, because a hook cannot be called after one — and
   * harmlessly so: a section this tier or these options switch off subscribes
   * to nothing, so a card sitting in its skeleton asks for exactly what a card
   * showing a forecast would.
   */
  const forecast = useWeatherForecastSections({
    entityId,
    tier,
    span: props.span,
    options,
    entityUnit: entity?.attributes?.temperature_unit,
  })

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

  const attributes = entity.attributes as Record<string, unknown> | undefined
  const tempDisplay = getTemperatureDisplay(
    attributes?.temperature,
    attributes?.temperature_unit,
    options.temperatureUnit
  )
  /*
   * Tier layout (docs/specs/entity-cards/options/weather.md — "Tier layouts").
   * The variant chooses the information density, the tier chooses the
   * arrangement and how much of it fits; content that does not fit is omitted,
   * never clipped (docs/specs/design-system — "Size-adaptive layouts"):
   *
   *   glance  condition icon + name + the temperature in the state slot. No
   *           condition text, no secondary line.
   *   row     icon and meta side by side, condition text back in the state
   *           slot, the temperature and the secondary reading beside them.
   *   tall    icon on top, the temperature between it and the meta, the
   *           secondary line at the bottom — the height is used rather than
   *           filled with air.
   *   full    the big `liebe-value` readout, and a detail line that leads with
   *           the secondary reading and continues with what it did not use.
   *
   * The forecast sections sit under all of it, at the tiers with room for them:
   * the hourly strip from `row` up, the multi-day row at `full` only. What is
   * available comes from the entity, never from the options
   * (`useWeatherForecastSections`).
   */
  const isGlance = tier === 'glance'
  const isTall = tier === 'tall'
  const isFull = tier === 'full'

  const secondaryInput = { attributes, temperatureUnit: options.temperatureUnit }
  const secondary = isGlance
    ? undefined
    : resolveSecondaryReading(options.secondaryInfo, secondaryInput)
  const supplemental = isFull ? supplementalReadings(secondary, secondaryInput) : []

  const unavailableStatus = resolveUnavailableStatus(entity.state)

  /*
   * The card's ONE icon language. This variant used to draw an emoji here and
   * line-art glyphs in its forecast columns, which is the mismatch the option
   * doc settles: "all four variants draw every condition icon — header and
   * forecast columns alike — from the shared line-art condition-glyph set; the
   * `default` variant's emoji header is retired". Line art takes the muted
   * foreground on the plain surface and the artwork token over a scrim; an
   * emoji takes neither.
   */
  const ConditionGlyph = getConditionGlyph(entity.state)

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
        <Flex direction="column" align="center" justify="center" gap="2">
          <GridCard.Icon>
            <span
              style={{
                color: 'var(--gray-9)',
                opacity: 0.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {createElement(ConditionGlyph, { size: 24 })}
            </span>
          </GridCard.Icon>
          <GridCard.Title>{entity.attributes?.friendly_name || entityId}</GridCard.Title>
          <GridCard.Status>{unavailableStatus}</GridCard.Status>
        </Flex>
      </GridCard>
    )
  }

  // The condition artwork, once the option and the variant have had their say.
  const backgroundImage = resolveConditionBackground({
    condition: entity.state,
    showConditionBackground: options.showConditionBackground,
  })
  const textStyles = getWeatherTextStyles(!!backgroundImage)
  const iconStyles = textStyles.icon

  const readingChip = (reading: WeatherSecondaryReading, key?: string) => (
    <Flex align="center" gap="1" key={key ?? reading.kind}>
      {createElement(reading.icon, {
        size: 18,
        style: {
          color: backgroundImage ? WEATHER_ARTWORK_FG : 'var(--gray-9)',
          filter: backgroundImage ? iconStyles.filter : undefined,
        },
      })}
      <Text
        size="2"
        color={backgroundImage ? undefined : 'gray'}
        style={backgroundImage ? textStyles.text : {}}
      >
        {reading.value}
      </Text>
    </Flex>
  )

  const temperature = tempDisplay ? (
    <Flex align="center" gap="1">
      <Thermometer
        size={18}
        style={{
          color: backgroundImage
            ? WEATHER_ARTWORK_FG
            : isStale
              ? 'var(--orange-9)'
              : 'var(--gray-9)',
          filter: backgroundImage ? iconStyles.filter : undefined,
        }}
      />
      {isFull ? (
        <div style={getWeatherTextStyles(!!backgroundImage, 'emphasis').text}>
          <CardValue
            domain="weather"
            value={Math.round(tempDisplay.value)}
            unit={tempDisplay.unit}
          />
        </div>
      ) : (
        <Text size="3" weight="bold" style={backgroundImage ? textStyles.text : {}}>
          {formatTemperature(tempDisplay)}
        </Text>
      )}
    </Flex>
  ) : undefined

  /*
   * The control slot is a position, not a promise of something interactive: a
   * read-only card puts its readout there. `row` has one line to work with, so
   * the secondary reading rides along beside the temperature; the taller tiers
   * give it a line of its own below.
   */
  const control =
    isGlance || (!temperature && !secondary) ? undefined : (
      <GridCard.Controls>
        <Flex gap="3" align="center" wrap="wrap">
          {temperature}
          {!isTall && !isFull && secondary && readingChip(secondary)}
        </Flex>
      </GridCard.Controls>
    )

  const detailLine =
    (isTall || isFull) && (secondary || supplemental.length > 0) ? (
      <Flex gap="3" align="center" wrap="wrap">
        {secondary && readingChip(secondary)}
        {/* `full` continues the detail line past the featured value — each of
            these only when the entity actually reports it, and never repeating
            the one already featured. */}
        {supplemental.map((reading) => (
          <Text
            key={reading.kind}
            size="2"
            color={backgroundImage ? undefined : 'gray'}
            style={backgroundImage ? textStyles.text : {}}
          >
            {reading.text}
          </Text>
        ))}
      </Flex>
    ) : undefined

  /*
   * The slot is `undefined` — not an empty wrapper — when there is neither a
   * detail line nor a forecast to draw. That is what makes an unavailable
   * forecast lay the card out "as if the options were `false`" rather than
   * leaving a gap where a strip would have gone (option doc — "Forecast options
   * degrade gracefully without the service").
   */
  const extra =
    detailLine || forecast.hasContent ? (
      /*
       * `weather-card-extra` collapses the slot when the width left room for no
       * forecast column and there was no detail line to keep it company — the
       * one case this decision cannot make, because the content width is only
       * readable inside the shell (`WeatherForecast.tsx`).
       */
      <Flex direction="column" gap="2" width="100%" className="weather-card-extra">
        {detailLine}
        <WeatherForecastSections
          sections={forecast}
          hasBackground={!!backgroundImage}
          // Nothing else on this card states the unit when the entity
          // publishes no current temperature, so the section label does.
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
          <GridCard.Icon>
            <span
              style={{
                color: backgroundImage
                  ? WEATHER_ARTWORK_FG
                  : isStale
                    ? 'var(--orange-9)'
                    : 'var(--accent-9)',
                filter: backgroundImage ? iconStyles.filter : undefined,
                opacity: isStale ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {createElement(ConditionGlyph, { size: 24 })}
            </span>
          </GridCard.Icon>
        }
        meta={
          <GridCard.Meta>
            <GridCard.Title>
              <Text weight="medium" style={backgroundImage ? textStyles.text : {}}>
                {entity.attributes?.friendly_name || entity.entity_id}
              </Text>
            </GridCard.Title>

            {/*
             * `glance` puts the temperature in the state slot and drops the
             * condition text with it, so `hideState` still hides exactly one
             * line (option doc — "Tier layouts").
             */}
            <GridCard.Status>
              <Text
                size="2"
                color={backgroundImage ? undefined : 'gray'}
                style={{
                  textTransform: 'capitalize',
                  ...(backgroundImage ? textStyles.text : {}),
                }}
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

export const WeatherCardDefault = Object.assign(withCardErrorBoundary(WeatherCardDefaultContent), {
  defaultDimensions: { width: 4, height: 3 },
})
