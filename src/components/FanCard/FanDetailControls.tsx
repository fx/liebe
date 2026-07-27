import { Box, Heading } from '@radix-ui/themes'
import { useCallback, useState } from 'react'
import { useServiceCall } from '~/hooks'
import { Pill, PillGroup, Slider } from '../anatomy'
import { readFanPercentage } from './speedSteps'
import { readFanFeatures, type FanAttributes } from './features'
import type { EntityDetailControlsProps } from '../EntityDetailDialog/detailControls'

/**
 * The fan's speed slider and preset pills inside the entity detail dialog.
 *
 * Two tiers need it and one option removes it: `glance` carries no embedded
 * control at all, `speedControl: none` takes the speed control off every other
 * tier, and the option doc puts the preset row at `full` only — so without this
 * a preset-only fan on a `row` card, or any fan configured to `none`, would be
 * a card that can be switched on and off and nothing more
 * (docs/changes/0019 — PR 2).
 *
 * The dialog is opened for an *entity*, not a placed item, so it renders what
 * the entity supports rather than what a card was configured to show — which is
 * the point: it is the surface that stays operable whatever the card hides.
 */
export function FanDetailControls({ entity }: EntityDetailControlsProps) {
  const { dispatchGuarded } = useServiceCall()
  const [localPercentage, setLocalPercentage] = useState<number | null>(null)

  const attributes = entity.attributes as FanAttributes | undefined
  const features = readFanFeatures(attributes)
  const percentage = readFanPercentage(attributes?.percentage)
  const presetMode =
    typeof attributes?.preset_mode === 'string' ? attributes.preset_mode : undefined
  const presetModes = Array.isArray(attributes?.preset_modes)
    ? attributes.preset_modes.filter((mode): mode is string => typeof mode === 'string')
    : []

  const entityId = entity.entity_id

  const dispatch = useCallback(
    (service: string, data?: Record<string, unknown>) =>
      dispatchGuarded({ domain: 'fan', service, entityId, data }),
    [dispatchGuarded, entityId]
  )

  const handleCommit = useCallback(
    async (value: number) => {
      // Zero is a stop, never `set_percentage: 0` — the same rule the card
      // follows, so the two surfaces cannot disagree about what 0% means.
      await (value <= 0 ? dispatch('turn_off') : dispatch('set_percentage', { percentage: value }))
      setLocalPercentage(null)
    },
    [dispatch]
  )

  const showSpeed = features.speed
  const showPresets = features.preset && presetModes.length > 0

  /*
   * What the slider sits at: the value being dragged, else the fan's own, else
   * zero for a speed-capable fan that has not reported one. Resolved once — a
   * slider whose `value`, `readout` and `active` were computed separately could
   * disagree with itself mid-drag.
   */
  const sliderValue = localPercentage ?? percentage ?? 0

  // Nothing to mount rather than an empty heading: a plain on/off fan has no
  // control surface here, and the tile's own tap already carries it.
  if (!showSpeed && !showPresets) return null

  return (
    <Box>
      <Heading size="2" mb="2">
        Controls
      </Heading>
      {showSpeed && (
        <Slider
          domain="fan"
          color="ok"
          active={sliderValue > 0}
          label="Fan speed"
          value={sliderValue}
          readout={`${sliderValue}%`}
          onValueChange={setLocalPercentage}
          onValueCommit={handleCommit}
        />
      )}
      {showPresets && (
        <Box mt={showSpeed ? '3' : '0'}>
          <PillGroup label="Fan preset">
            {presetModes.map((preset) => (
              <Pill
                key={preset}
                domain="fan"
                color="ok"
                active={presetMode === preset}
                label={preset}
                onClick={() => void dispatch('set_preset_mode', { preset_mode: preset })}
              />
            ))}
          </PillGroup>
        </Box>
      )}
    </Box>
  )
}
