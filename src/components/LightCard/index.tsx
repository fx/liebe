import { SunIcon } from '@radix-ui/react-icons'
import { useEntity, useServiceCall } from '~/hooks'
import { memo, useState, useCallback, useMemo } from 'react'
import { renderCardLifecycle } from '../ui'
import { GridCardWithComponents as GridCard, useGridCardHue } from '../GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from '../CardBody'
import { Pill, PillGroup, Slider } from '../anatomy'
import { useDashboardStore, dashboardActions } from '~/store'
import {
  readBrightnessPresets,
  readShowBrightnessSlider,
  readShowColorControl,
  readShowColorTempControl,
  readUseLightColor,
} from '~/store/lightOptions'
import { readSliderOrientation, type SliderOrientation } from '~/store/sliderPlacement'
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
import { withCardErrorBoundary } from '../cardErrorBoundary'
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
  orientation,
  value,
  onValueChange,
  onValueCommit,
}: {
  isOn: boolean
  orientation: SliderOrientation
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
      // Resolved by the card from `sliderPlacement` and the tier: `tall` is the
      // tier that gives a control its own axis and every other one runs it along
      // the row, unless the option forces the other way
      // (docs/specs/entity-cards/options/common.md — "Shared slider placement").
      orientation={orientation}
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

/**
 * The brightness preset pills.
 *
 * Data rather than layout: a map over the filtered percentages using the
 * existing pill anatomy, with no new primitive (change 0016 — "Design
 * Decisions").
 *
 * Unlike the colour controls beside it, this row renders while the light is
 * OFF. A preset is "turn on at N%", which is the case it is most useful in — a
 * dimmer-first user reaching for 20% at night wants one tap, not a tap to turn
 * on at full and a second to bring it down.
 */
function BrightnessPresets({
  presets,
  currentPercent,
  onPick,
}: {
  presets: number[]
  /**
   * The level the card is displaying, which is `0` whenever the light is off —
   * Home Assistant keeps the last `brightness` on the entity, and the card
   * deliberately does not read it while the light is dark.
   */
  currentPercent: number
  onPick: (percent: number) => void
}) {
  return (
    <PillGroup label="Brightness presets">
      {presets.map((percent) => (
        <Pill
          key={percent}
          domain="light"
          color="light"
          /*
           * No separate "is the light on" test. It would be unreachable: an off
           * light displays 0%, and 0 is not a legal preset, so no pill can match
           * while the light is dark. The guarantee rests entirely on that — the
           * displayed level being 0 when off — which is asserted directly rather
           * than left to a second condition that could never fire.
           */
          active={currentPercent === percent}
          label={`${percent}%`}
          onClick={() => onPick(percent)}
        />
      ))}
    </PillGroup>
  )
}

/** Which embedded slider owns the drag. One more member is all a new one costs. */
type DragControl = 'brightness' | 'colorTemp'

function LightCardComponent({
  entityId,
  tier = 'row',
  span,
  onDelete,
  isSelected = false,
  onSelect,
  item,
}: LightCardProps) {
  const {
    entity,
    isConnected,
    isStale,
    isMissing,
    isLoading: isEntityLoading,
  } = useEntity(entityId)
  const { loading: isLoading, error, dispatchGuarded, clearError } = useServiceCall()
  const mode = useDashboardStore((state) => state.mode)
  const currentScreenId = useDashboardStore((state) => state.currentScreenId)
  const isEditMode = mode === 'edit'

  // Local state for slider while dragging
  /*
   * The one drag in flight, whichever control owns it.
   *
   * A single slot rather than a flag and a value per slider, because the two
   * facts are the same fact: a control has an optimistic value exactly while it
   * is being dragged. Splitting them let the tile's toggle guard enumerate the
   * sliders that existed when it was written — it checked brightness and not
   * colour temperature, so a tap landing on the tile mid-drag switched the light
   * off under the finger adjusting it. With one slot a control cannot occupy it
   * without also raising the guard, so a slider added later is covered by
   * construction rather than by remembering.
   */
  const [drag, setDrag] = useState<{ control: DragControl; value: number } | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
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

  /*
   * The anatomy slider reports every value the control passes through, which is
   * also the signal that a drag is under way: the card must not toggle the light
   * the finger is adjusting. Both facts are recorded by claiming the drag slot.
   */
  const beginDrag = useCallback((control: DragControl, value: number) => {
    setDrag({ control, value })
  }, [])

  /*
   * Released by the control that claimed it, and only if it still holds it — a
   * commit awaits its dispatch, and in that window the other slider may already
   * have taken the slot. Clearing unconditionally would wipe a drag in progress.
   */
  const endDrag = useCallback((control: DragControl) => {
    setDrag((current) => (current?.control === control ? null : current))
  }, [])

  const handleBrightnessChange = useCallback(
    (value: number) => beginDrag('brightness', value),
    [beginDrag]
  )

  const handleBrightnessCommit = useCallback(
    async (value: number) => {
      // Only a slider dropped at 0 turns the light off; the conversion never
      // rounds a nonzero position down into that (docs/specs/entity-cards/
      // options/light.md — "Brightness").
      const brightness = percentToHaBrightness(value)

      await dispatchGuarded(
        brightness === 0
          ? { domain: 'light', service: 'turn_off', entityId }
          : { domain: 'light', service: 'turn_on', entityId, data: { brightness } }
      )

      endDrag('brightness')
    },
    [dispatchGuarded, endDrag, entityId]
  )

  const handleKelvinChange = useCallback(
    (value: number) => beginDrag('colorTemp', value),
    [beginDrag]
  )

  const handleKelvinCommit = useCallback(
    async (value: number) => {
      await dispatchGuarded({
        domain: 'light',
        service: 'turn_on',
        entityId,
        data: { color_temp_kelvin: value },
      })
      endDrag('colorTemp')
    },
    [dispatchGuarded, endDrag, entityId]
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

  const handlePresetPick = useCallback(
    async (percent: number) => {
      // Always `turn_on`, never a toggle: a preset states the level it wants,
      // and on a light that is already there it is a no-op rather than an off
      // switch (docs/specs/entity-cards/options/light.md — "Brightness
      // presets"). The shared conversion floors at 1, so no preset can round
      // into an off command.
      await dispatchGuarded({
        domain: 'light',
        service: 'turn_on',
        entityId,
        data: { brightness: percentToHaBrightness(percent) },
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

  /** The dragged value while this control owns the drag, else what the entity reports. */
  const dragValue = (control: DragControl) => (drag?.control === control ? drag.value : undefined)

  const displayBrightness = dragValue('brightness') ?? currentBrightness

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

  const isUnavailable = entity.state === 'unavailable'

  const friendlyName = entity.attributes.friendly_name || entity.entity_id
  const isOn = entity.state === 'on'

  const handleToggle = async () => {
    // Any drag, not a list of the sliders that existed when this was written.
    if (isLoading || drag !== null) return

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
  const isFull = tier === 'full'

  /*
   * Where the brightness slider runs, and whether the tier renders one at all
   * (docs/specs/entity-cards/options/light.md — `sliderPlacement`; the contract
   * itself is options/common's). `undefined` is `glance`, under every value:
   * the tier keeps deciding *whether* a slider renders and the option only
   * decides its axis.
   */
  const sliderOrientation = readSliderOrientation(config, tier)
  const showBrightness =
    sliderOrientation !== undefined &&
    !isEditMode &&
    isOn &&
    supportsBrightness &&
    showBrightnessSlider

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

  /*
   * The presets, unlike the two controls above, do NOT require the light to be
   * on: "tapping a preset pill MUST call `light.turn_on` with the converted
   * brightness, even when the light is `off` (presets act as 'turn on at N%')".
   *
   * They do require brightness support — a preset on an `onoff` light would
   * dispatch a `brightness` the entity cannot honour — and a list with nothing
   * usable left in it hides the row rather than rendering an empty group.
   */
  const brightnessPresets = readBrightnessPresets(config)
  const showPresets = isFull && !isEditMode && supportsBrightness && brightnessPresets.length > 0

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
        orientation={sliderOrientation}
        value={displayBrightness}
        onValueChange={handleBrightnessChange}
        onValueCommit={handleBrightnessCommit}
      />
    </GridCard.Controls>
  ) : undefined

  const displayKelvin = dragValue('colorTemp') ?? currentKelvin

  const extras =
    showColorTemp || showColor || showPresets ? (
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
        {showPresets ? (
          <BrightnessPresets
            presets={brightnessPresets}
            currentPercent={displayBrightness}
            onPick={handlePresetPick}
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
        /*
         * What an icon-only tile modulates its state tint by, so a dimmed lamp
         * reads dimmer than a full one. The displayed brightness rather than
         * the reported one, so a tile being dragged tints with the value under
         * the finger — and only where the bulb has a brightness to report: an
         * on/off bulb has no level, which is not the same as being at zero.
         */
        level={supportsBrightness ? displayBrightness / 100 : undefined}
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
          controlOrientation={sliderOrientation}
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
          /*
           * Written here rather than through a `handleConfigSave` above, so the
           * `item` this needs is the one JSX has already narrowed. Hoisting it
           * meant re-testing `item` inside a branch only reachable when it
           * exists — an arm no input could take.
           *
           * The screen is not looked up first either: `updateGridItem` walks
           * the tree itself and leaves a `screenId` it cannot find alone, so a
           * guard here would only duplicate that and add a second branch
           * nothing distinguishes.
           */
          onSave={(updates) => {
            if (currentScreenId) {
              dashboardActions.updateGridItem(currentScreenId, item.id, updates)
            }
          }}
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

export const LightCard = Object.assign(withCardErrorBoundary(MemoizedLightCard), {
  defaultDimensions: { width: 2, height: 2 },
})
