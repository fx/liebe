import { SunIcon } from '@radix-ui/react-icons'
import { useEntity, useServiceCall } from '~/hooks'
import { memo, useState, useCallback, useMemo } from 'react'
import { SkeletonCard, ErrorDisplay } from '../ui'
import { GridCardWithComponents as GridCard, useGridCardHue } from '../GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from '../CardBody'
import { Pill, PillGroup, Slider } from '../anatomy'
import { useDashboardStore, dashboardActions } from '~/store'
import {
  readShowBrightnessSlider,
  readShowColorControl,
  readShowColorTempControl,
  readUseLightColor,
} from '~/store/lightOptions'
import { kelvinToRgb, resolveLightHue } from './lightColor'
import {
  readColorTempRange,
  supportsBrightness as lightSupportsBrightness,
  supportsColor as lightSupportsColor,
  supportsColorTemp as lightSupportsColorTemp,
  type ColorTempRange,
} from './lightCapabilities'
import { COLOR_SWATCHES, rgbCss, reportedRgb, sameRgb, type Rgb } from './lightPalette'
import { CardConfig } from '../CardConfig'
import type { GridItem } from '~/store/types'
import { isSameSpan, type CardSpan, type CardTier } from '~/utils/cardTier'
import {
  HA_BRIGHTNESS_MAX,
  haBrightnessToPercent,
  percentToHaBrightness,
} from '~/utils/lightBrightness'

interface LightCardProps {
  entityId: string
  tier?: CardTier
  /**
   * The effective grid span behind `tier`. This card owns its own
   * configuration modal, so it is also what the modal's preview renders at —
   * the preview must show the tier the card behind it is rendering
   * (docs/changes/0011-layout-tiers.md).
   */
  span?: CardSpan
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
  item?: GridItem
}

/**
 * The attributes this card reads by name. The index signature is what lets the
 * bag be handed to `./lightColor` and `./lightCapabilities`, which declare their
 * own inputs and read nothing else — it widens what may be passed in, not what
 * this card is entitled to reach for.
 */
interface LightAttributes {
  [attribute: string]: unknown
  brightness?: number
  rgb_color?: [number, number, number]
  hs_color?: [number, number]
  xy_color?: [number, number]
  color_temp_kelvin?: number
  min_color_temp_kelvin?: number
  max_color_temp_kelvin?: number
  effect_list?: string[]
  effect?: string
  supported_features?: number
  supported_color_modes?: string[]
  color_mode?: string
}

/**
 * The brightness slider, as its own component so it can read the shell.
 *
 * The hue it paints with is the one that survived the shell's precedence, taken
 * off `GridCardContext` rather than from the card — see `useGridCardHue`. A
 * control created in the card's render body sits outside the provider until it
 * is rendered into a slot, so reading context is what this boundary buys; the
 * alternative is the card handing the slider its own raw proposal and the icon
 * beside it showing something else.
 */
function BrightnessSlider({
  isOn,
  isTall,
  value,
  onValueChange,
  onValueCommit,
}: {
  isOn: boolean
  isTall: boolean
  value: number
  onValueChange: (value: number) => void
  onValueCommit: (value: number) => void
}) {
  const hue = useGridCardHue()

  return (
    <Slider
      domain="light"
      color="light"
      hue={hue}
      active={isOn}
      label="Brightness"
      // `tall` is the tier that gives a control its own axis; every other one
      // runs it along the row.
      orientation={isTall ? 'vertical' : 'horizontal'}
      value={value}
      readout={`${value}%`}
      onValueChange={onValueChange}
      onValueCommit={onValueCommit}
    />
  )
}

/**
 * The warm→cool colour-temperature slider.
 *
 * Spanning the entity's own reported bounds, never a fixed range — the option
 * doc is explicit, and `readColorTempRange` returns nothing rather than a
 * default when the bulb does not publish usable ones, so this never renders
 * against invented numbers. Kelvin is the only interface: Home Assistant Core
 * 2026.3 removed the mired attributes and the `color_temp`/`kelvin` arguments,
 * so a mired fallback would target a deleted API.
 */
function ColorTempSlider({
  range,
  value,
  isOn,
  onValueChange,
  onValueCommit,
}: {
  range: ColorTempRange
  value: number
  isOn: boolean
  onValueChange: (value: number) => void
  onValueCommit: (value: number) => void
}) {
  return (
    <Slider
      domain="light"
      color="light"
      // Tinted with the colour the position itself means, so the track reads
      // warm→cool rather than needing a legend.
      hue={rgbCss(kelvinToRgb(value))}
      active={isOn}
      label="Colour temperature"
      orientation="horizontal"
      min={range.min}
      max={range.max}
      // 50 K is finer than the eye resolves and coarser than the ~4000 discrete
      // steps a raw 1 K slider would give a keyboard user to arrow through.
      step={50}
      value={value}
      readout={`${value} K`}
      onValueChange={onValueChange}
      onValueCommit={onValueCommit}
    />
  )
}

/**
 * The curated swatch row, plus the recent-colour slot.
 *
 * The slot holds the last colour committed *from this card*, which is what the
 * option doc specifies. It is component state rather than stored config: writing
 * to the dashboard document on every colour tap would make an ordinary
 * interaction a persisted edit, and a shared YAML would carry one user's last
 * pick as though it were configuration.
 */
function ColorSwatchRow({
  selected,
  recent,
  isOn,
  onPick,
}: {
  selected: Rgb | undefined
  recent: Rgb | undefined
  isOn: boolean
  onPick: (rgb: Rgb) => void
}) {
  return (
    <PillGroup label="Light colour">
      {COLOR_SWATCHES.map((swatch) => (
        <Pill
          key={swatch.name}
          domain="light"
          color="light"
          hue={rgbCss(swatch.rgb)}
          active={isOn && sameRgb(selected, swatch.rgb)}
          label={swatch.name}
          hideLabel
          onClick={() => onPick(swatch.rgb)}
        />
      ))}
      {recent ? (
        <Pill
          domain="light"
          color="light"
          hue={rgbCss(recent)}
          active={isOn && sameRgb(selected, recent)}
          // Named rather than "Recent": the colour is the useful part, and a
          // screen reader reading "Recent" tells nobody which colour it is.
          label={`Last used, ${rgbCss(recent)}`}
          hideLabel
          onClick={() => onPick(recent)}
        />
      ) : null}
    </PillGroup>
  )
}

function LightCardComponent({
  entityId,
  tier = 'row',
  span,
  onDelete,
  isSelected = false,
  onSelect,
  item,
}: LightCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)
  const { loading: isLoading, error, dispatchGuarded, clearError } = useServiceCall()
  const { mode, screens, currentScreenId } = useDashboardStore()
  const isEditMode = mode === 'edit'

  // Local state for slider while dragging
  const [localBrightness, setLocalBrightness] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [localKelvin, setLocalKelvin] = useState<number | null>(null)
  const [isDraggingKelvin, setIsDraggingKelvin] = useState(false)
  /*
   * The recent-colour slot. Deliberately not persisted: it is the trace of an
   * interaction, not a setting, and a card that rewrote its stored config on
   * every swatch tap would put a user's last pick into the exported YAML as
   * though somebody had configured it. It therefore resets when the card
   * unmounts, which for the wall-tablet case this control exists for is a page
   * the user does not leave.
   */
  const [recentColor, setRecentColor] = useState<Rgb | undefined>(undefined)

  // Get config from item
  const config = item?.config || {}

  const handleBrightnessChange = useCallback((value: number) => {
    // The anatomy slider reports every value the control passes through, which
    // is also the signal that a drag is under way: the card must not toggle the
    // light the finger is dimming.
    setIsDragging(true)
    setLocalBrightness(value)
  }, [])

  const handleBrightnessCommit = useCallback(
    async (value: number) => {
      setIsDragging(false)
      // Only a slider dropped at 0 turns the light off; the conversion never
      // rounds a nonzero position down into that (docs/specs/entity-cards/
      // options/light.md — "Brightness").
      const brightness = percentToHaBrightness(value)

      await dispatchGuarded(
        brightness === 0
          ? { domain: 'light', service: 'turn_off', entityId }
          : { domain: 'light', service: 'turn_on', entityId, data: { brightness } }
      )

      setLocalBrightness(null)
    },
    [dispatchGuarded, entityId]
  )

  const handleKelvinChange = useCallback((value: number) => {
    setIsDraggingKelvin(true)
    setLocalKelvin(value)
  }, [])

  const handleKelvinCommit = useCallback(
    async (value: number) => {
      setIsDraggingKelvin(false)
      await dispatchGuarded({
        domain: 'light',
        service: 'turn_on',
        entityId,
        data: { color_temp_kelvin: value },
      })
      setLocalKelvin(null)
    },
    [dispatchGuarded, entityId]
  )

  const handleColorPick = useCallback(
    async (rgb: Rgb) => {
      // Recorded before the dispatch, not after: the slot is what this card last
      // *asked for*, and a refused repeat or a failed call should not make the
      // swatch the user just tapped vanish from it.
      setRecentColor(rgb)
      await dispatchGuarded({
        domain: 'light',
        service: 'turn_on',
        entityId,
        data: { rgb_color: rgb },
      })
    },
    [dispatchGuarded, entityId]
  )

  const lightAttributes = entity?.attributes as LightAttributes | undefined

  // What the bulb can do, per `supported_color_modes` with the legacy feature
  // bits behind it (common contract, convention 3). An entity declaring a mode
  // this build has never heard of simply answers "no" to each, which is what
  // keeps the card rendering against a newer Home Assistant
  // (`./lightCapabilities`).
  const supportsBrightness = useMemo(
    () => lightSupportsBrightness(lightAttributes),
    [lightAttributes]
  )
  const supportsColorTemp = useMemo(
    () => lightSupportsColorTemp(lightAttributes),
    [lightAttributes]
  )
  const supportsColor = useMemo(() => lightSupportsColor(lightAttributes), [lightAttributes])

  /*
   * The bounds the temperature control spans. Read from the entity, and absent
   * when it publishes none — the control is then withheld rather than given an
   * invented range (docs/specs/entity-cards/options/light.md — "never a
   * hardcoded range").
   */
  const colorTempRange = useMemo(() => readColorTempRange(lightAttributes), [lightAttributes])

  /*
   * Where the temperature slider sits. The reported value, clamped into the
   * range the bulb declares — the two can disagree, and Radix would place a
   * thumb outside its own track.
   *
   * When the bulb reports no temperature at all — a colour bulb currently
   * running in `hs` mode, say — the slider still has to be somewhere, and it
   * takes the warm end rather than a midpoint. A midpoint would be a value the
   * bulb never reported sitting under a readout that looks like a reading;
   * the warm end is the same in that respect but is at least the range's own
   * boundary rather than an invented interior point.
   */
  const reportedKelvin = lightAttributes?.color_temp_kelvin
  const currentKelvin = useMemo(() => {
    if (!colorTempRange) return 0
    const reported = typeof reportedKelvin === 'number' && Number.isFinite(reportedKelvin)
    if (!reported) return colorTempRange.min
    return Math.min(colorTempRange.max, Math.max(colorTempRange.min, reportedKelvin))
  }, [colorTempRange, reportedKelvin])

  /** The swatch to mark selected — only an exactly reported `rgb_color` counts. */
  const selectedColor = useMemo(() => reportedRgb(lightAttributes), [lightAttributes])

  /*
   * The bulb's own colour, OFFERED to the shell rather than applied.
   *
   * `useLightColor` is the card's own option and is therefore read here; the
   * precedence around it is not. Whether this survives an explicit universal
   * `color` or a danger state is `resolveCardHue`'s decision, made once in
   * `GridCard` — so this is deliberately not gated a second time. A card that
   * re-applied that precedence would be a second implementation of it, free to
   * drift from the first, and the drift would show up as the icon and the
   * slider disagreeing about whether the tint applies.
   */
  // Read outside the memo rather than inside it: `config` is rebuilt by the
  // `item?.config || {}` fallback on every render, so depending on it directly
  // would defeat the memo entirely. The boolean it resolves to is stable.
  const followsBulbColor = readUseLightColor(config)
  const bulbHue = useMemo(
    () => (followsBulbColor ? resolveLightHue(entity?.state, lightAttributes) : undefined),
    [followsBulbColor, entity?.state, lightAttributes]
  )

  // Get current brightness (0-255 scale from HA, convert to 0-100 for UI)
  const currentBrightness = useMemo(() => {
    if (!entity || entity.state === 'off') return 0
    return haBrightnessToPercent(lightAttributes?.brightness ?? HA_BRIGHTNESS_MAX)
  }, [entity, lightAttributes?.brightness])

  const displayBrightness =
    isDragging && localBrightness !== null ? localBrightness : currentBrightness

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

  const isUnavailable = entity.state === 'unavailable'

  const friendlyName = entity.attributes.friendly_name || entity.entity_id
  const isOn = entity.state === 'on'

  const handleToggle = async () => {
    if (isLoading || isDragging) return

    // Clear any previous errors
    if (error) {
      clearError()
    }

    await dispatchGuarded({
      domain: 'light',
      service: isOn ? 'turn_off' : 'turn_on',
      entityId: entity.entity_id,
    })
  }

  const handleConfigSave = (updates: Partial<GridItem>) => {
    if (item && currentScreenId) {
      const screen = screens.find((s) => s.id === currentScreenId)
      if (screen) {
        dashboardActions.updateGridItem(currentScreenId, item.id, updates)
      }
    }
  }

  // Apply configuration. The loader has already rewritten the legacy
  // `enableBrightness` key, so only the current one is ever read here.
  const showBrightnessSlider = readShowBrightnessSlider(config)

  /*
   * What each tier carries (docs/specs/entity-cards/options/light.md — "Tier
   * layouts"). Content that does not fit a tier is omitted, never clipped or
   * scaled down (docs/specs/design-system — "Size-adaptive layouts"):
   *
   *   glance  icon over name/state; no embedded control — the whole tile
   *           toggles, and hold opens the detail dialog (change 0014), which is
   *           what makes dropping the slider here not an operability regression.
   *   row     icon + meta in a row, plus the horizontal brightness slider.
   *   tall    icon on top, vertical slider filling the middle, meta at the
   *           bottom.
   *   full    row content plus colour temperature and colour; the
   *           brightness-preset row joins them with PR 3.
   */
  const isTall = tier === 'tall'
  const isFull = tier === 'full'
  const showBrightness =
    tier !== 'glance' && !isEditMode && isOn && supportsBrightness && showBrightnessSlider

  /*
   * Both extras are `full`-only and both require the light to be on, matching
   * the brightness slider: setting a colour on a light that is off would turn it
   * on as a side effect of a control that does not look like a switch, and the
   * tile's own tap is what turns it on.
   *
   * The capability half comes from `./lightCapabilities` rather than being
   * re-derived here — one answer to "can this bulb do that", so the control and
   * anything else asking cannot disagree.
   */
  const showColorTemp =
    isFull &&
    !isEditMode &&
    isOn &&
    supportsColorTemp &&
    readShowColorTempControl(config) &&
    colorTempRange !== undefined
  const showColor = isFull && !isEditMode && isOn && supportsColor && readShowColorControl(config)

  const icon = (
    <GridCard.Icon>
      <SunIcon width={20} height={20} />
    </GridCard.Icon>
  )

  const meta = (
    <GridCard.Meta>
      <GridCard.Title>{friendlyName}</GridCard.Title>
      <GridCard.Status>
        {error
          ? 'ERROR'
          : isOn && displayBrightness < 100 && supportsBrightness
            ? `${displayBrightness}%`
            : entity.state.toUpperCase()}
      </GridCard.Status>
    </GridCard.Meta>
  )

  const brightnessSlider = showBrightness ? (
    <GridCard.Controls>
      <BrightnessSlider
        isOn={isOn}
        isTall={isTall}
        value={displayBrightness}
        onValueChange={handleBrightnessChange}
        onValueCommit={handleBrightnessCommit}
      />
    </GridCard.Controls>
  ) : undefined

  const displayKelvin = isDraggingKelvin && localKelvin !== null ? localKelvin : currentKelvin

  const extras =
    showColorTemp || showColor ? (
      <>
        {showColorTemp && colorTempRange ? (
          <ColorTempSlider
            range={colorTempRange}
            value={displayKelvin}
            isOn={isOn}
            onValueChange={handleKelvinChange}
            onValueCommit={handleKelvinCommit}
          />
        ) : null}
        {showColor ? (
          <ColorSwatchRow
            selected={selectedColor}
            recent={recentColor}
            isOn={isOn}
            onPick={handleColorPick}
          />
        ) : null}
      </>
    ) : undefined

  return (
    <>
      <GridCard
        domain="light"
        color="light"
        hue={bulbHue}
        tier={tier}
        isLoading={isLoading}
        isError={!!error}
        isStale={isStale}
        isSelected={isSelected}
        isOn={isOn}
        isUnavailable={isUnavailable}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
        /*
         * Passed unconditionally, and `handleToggle` declines while a drag is
         * in flight. Withholding it instead would tell the shell this card has
         * no toggle semantics at all, and `toggle` would fall through to
         * `homeassistant.toggle` on the entity — toggling the very light the
         * finger was dimming, which is the case the guard exists to prevent.
         */
        onClick={handleToggle}
        onConfigure={() => setConfigOpen(true)}
        hasConfiguration={true}
        title={error || undefined}
        className="light-card"
      >
        {/* The slider takes the room its tier leaves over rather than being
            sized by its content — the width the icon and the meta do not use
            on a row, the height they do not use in `tall`. That is the tier's
            whole point: a taller tile gives the control more travel rather
            than more whitespace. */}
        <CardBody
          arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
          controlSize="fill"
          lead={icon}
          meta={meta}
          control={brightnessSlider}
          extra={extras}
        />
      </GridCard>

      {item && (
        <CardConfig.Modal
          open={configOpen}
          onOpenChange={setConfigOpen}
          item={item}
          span={span}
          onSave={handleConfigSave}
        />
      )}
    </>
  )
}

// Memoize the component to prevent unnecessary re-renders
const MemoizedLightCard = memo(LightCardComponent, (prevProps, nextProps) => {
  // Re-render if any of these props change
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.tier === nextProps.tier &&
    // The span as well as the tier: the tier is lossy, so a `row` 3×1 becoming
    // a `row` 4×1 changes nothing here — and this card's own configuration
    // modal previews at the span it was handed, so it would open stale.
    isSameSpan(prevProps.span, nextProps.span) &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect &&
    prevProps.item === nextProps.item
  )
})

export const LightCard = Object.assign(MemoizedLightCard, {
  defaultDimensions: { width: 2, height: 2 },
})
