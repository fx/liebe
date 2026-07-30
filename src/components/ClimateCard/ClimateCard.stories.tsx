import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { ClimateCard } from '.'
import { asUnavailable, createClimateEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../../.storybook/decorators'

/** The registered `dial` variant, rendered the way the grid dispatches it. */
const ClimateDialCard = ClimateCard.variants.dial

const entityId = 'climate.hallway'

type ClimateCardStoryProps = ComponentProps<typeof ClimateCard> & GridCellArgs

const meta: Meta<ClimateCardStoryProps> = {
  title: 'Cards/ClimateCard',
  component: ClimateCard,
  decorators: [withGridCell],
  argTypes: {
    ...gridCellArgTypes,
    tier: { control: { type: 'inline-radio' }, options: ['glance', 'row', 'tall', 'full'] },
  },
  args: {
    entityId,
    tier: 'row',
    gridWidth: 4,
    gridHeight: 5,
  },
  parameters: {
    liebe: { entities: [createClimateEntity()] },
  },
}

export default meta
type Story = StoryObj<ClimateCardStoryProps>

/**
 * Resting state for a thermostat: mode `off`, no temperature controls — climate
 * never publishes a literal `on`/`off` pair the way a light does, so this is the
 * domain's inactive equivalent.
 */
export const Idle: Story = {
  parameters: {
    liebe: {
      entities: [
        createClimateEntity({ state: 'off', attributes: { hvac_action: 'off', temperature: 21 } }),
      ],
    },
  },
}

/** Actively heating: the `heating` action colours the tile, ± controls live. */
export const Heating: Story = {
  parameters: { liebe: { entities: [createClimateEntity()] } },
}

/** Cooling, driven purely by the fixture's mode and action. */
export const Cooling: Story = {
  parameters: {
    liebe: {
      entities: [
        createClimateEntity({
          state: 'cool',
          attributes: {
            hvac_action: 'cooling',
            current_temperature: 26.5,
            temperature: 22,
          },
        }),
      ],
    },
  },
}

/** Heat/cool range mode — the band, with the stepper that shifts it. */
export const HeatCoolRange: Story = {
  parameters: {
    liebe: {
      entities: [
        createClimateEntity({
          state: 'heat_cool',
          attributes: {
            hvac_action: 'idle',
            target_temp_low: 19,
            target_temp_high: 24,
            temperature: undefined,
          },
        }),
      ],
    },
  },
}

/**
 * A heat pump resting in a mode this build has never heard of.
 *
 * `hvac_modes` belongs to the integration, so the row renders every mode the
 * entity reports: the unrecognised one takes the title-cased form of its own
 * value for a label, the neutral triplet for a colour and the two-letter glyph
 * fallback, and selecting it sends the raw value. Dropping it — which is what the
 * row used to do — left a mode the thermostat has unselectable and invisible
 * (change 0037 PR 1).
 */
export const VendorHvacMode: Story = {
  args: { tier: 'full', gridWidth: 4, gridHeight: 5, span: { width: 4, height: 5 } },
  parameters: {
    liebe: {
      entities: [
        createClimateEntity({
          state: 'heat_pump_boost',
          attributes: {
            hvac_action: 'heating',
            hvac_modes: ['off', 'heat', 'cool', 'heat_pump_boost'],
          },
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByRole('group', { name: 'HVAC mode' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: /heat pump boost/i })).toHaveAttribute(
      'data-active',
      'true'
    )
  },
}

export const Unavailable: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [asUnavailable(createClimateEntity())] } },
}

export const Loading: Story = {
  args: { gridHeight: 3 },
  parameters: { liebe: { entities: [], initialLoading: true } },
}

/**
 * Every service call fails, so changing the HVAC mode surfaces the card's error
 * border. `HassService` retries three times with 1s/2s/4s backoff before the
 * error lands.
 */
export const ServiceCallFailure: Story = {
  parameters: {
    liebe: {
      entities: [createClimateEntity()],
      serviceCall: 'error',
      serviceCallError: 'climate.set_hvac_mode is not available',
    },
  },
}

export const Disconnected: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [createClimateEntity()], connected: false } },
}

/** Edit mode hides the temperature and HVAC-mode controls. */
export const EditMode: Story = {
  args: { onDelete: () => {}, gridHeight: 4 },
  parameters: { liebe: { entities: [createClimateEntity()], mode: 'edit' } },
}

/*
 * Layout tiers (docs/specs/entity-cards/options/climate.md — "Tier layouts"),
 * in the default `compact` variant. The full tier tables are asserted in
 * `../__tests__/controlCardTierLayouts.test.tsx`.
 */

/**
 * 1×1: icon, name and the target — no controls at all. The tile itself is the
 * action, and the stepper it does not carry lives in the detail dialog its tap
 * opens (`ClimateDetailControls.tsx`).
 */
export const TierGlance: Story = {
  args: { tier: 'glance', gridWidth: 1, gridHeight: 1, span: { width: 1, height: 1 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.queryByLabelText('Increase temperature')).not.toBeInTheDocument()
    await expect(canvas.getByText('21.0°C')).toBeInTheDocument()
  },
}

/** 2×1: icon and meta with the stepper and its readout on the right. */
export const TierRow: Story = {
  args: { tier: 'row', gridWidth: 2, gridHeight: 1, span: { width: 2, height: 1 } },
}

/** 1×3: the stepper stands up — plus above the readout, minus below. */
export const TierTall: Story = {
  args: { tier: 'tall', gridWidth: 1, gridHeight: 3, span: { width: 1, height: 3 } },
}

/** 4×5: the row layout plus the HVAC mode pills — no dial, this is `compact`. */
export const TierFull: Story = {
  args: { tier: 'full', gridWidth: 4, gridHeight: 5, span: { width: 4, height: 5 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByRole('group', { name: 'HVAC mode' })).toBeInTheDocument()
    await expect(canvas.getByLabelText('Increase temperature')).toBeInTheDocument()
    // The arc is the other variant's; the centred name it draws is absent here.
    await expect(canvasElement.querySelector('.climate-card-name')).not.toBeInTheDocument()
  },
}

/**
 * Range mode at width 2: one stepper pair moving both setpoints in lockstep,
 * because two independent ones do not fit. The span, not the tier, is what
 * decides that — `row` covers 2×1 through N×1.
 */
export const TierRowRangeNarrow: Story = {
  args: { tier: 'row', gridWidth: 2, gridHeight: 1, span: { width: 2, height: 1 } },
  parameters: {
    liebe: {
      entities: [
        createClimateEntity({
          state: 'heat_cool',
          attributes: {
            hvac_action: 'idle',
            supported_features: 2,
            target_temp_low: 19,
            target_temp_high: 24,
            temperature: undefined,
          },
        }),
      ],
    },
  },
}

/** The same thermostat at width 3: independent low and high setpoints. */
export const TierRowRangeWide: Story = {
  args: { tier: 'row', gridWidth: 3, gridHeight: 1, span: { width: 3, height: 1 } },
  parameters: TierRowRangeNarrow.parameters,
}

/*
 * The `dial` variant (option doc — "variant"). It is not the default, but it is
 * what every climate card placed before change 0017 is pinned to by the loader
 * migration, so it is the presentation most existing dashboards show.
 */

/** The arc thermostat at `full`, where it is the only tier it renders in. */
export const VariantDial: Story = {
  render: (args) => <ClimateDialCard {...args} />,
  args: { tier: 'full', gridWidth: 4, gridHeight: 5, span: { width: 4, height: 5 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvasElement.querySelector('.climate-card-name')).toBeInTheDocument()
    await expect(canvas.getByRole('group', { name: 'HVAC mode' })).toBeInTheDocument()
  },
}

/**
 * Range mode on the dial: two setpoint handles on one arc. Each is a `slider` —
 * draggable, and adjustable with the arrow keys once focused, so the band can be
 * set without a pointer (issue #225).
 */
export const VariantDialRange: Story = {
  render: (args) => <ClimateDialCard {...args} />,
  args: { tier: 'full', gridWidth: 4, gridHeight: 5, span: { width: 4, height: 5 } },
  parameters: {
    liebe: {
      entities: [
        createClimateEntity({
          state: 'heat_cool',
          attributes: {
            hvac_action: 'idle',
            target_temp_low: 19,
            target_temp_high: 24,
            temperature: undefined,
          },
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByRole('slider', { name: 'Heat setpoint' })).toHaveAttribute(
      'aria-valuenow',
      '19'
    )
    await expect(canvas.getByRole('slider', { name: 'Cool setpoint' })).toHaveAttribute(
      'aria-valuenow',
      '24'
    )
  },
}

/**
 * The same `dial` card at 2×1. The arc needs the room to be draggable at all, so
 * below `full` it renders the compact layout for that tier rather than shrinking
 * — the option doc's fallback, and the reason resizing a dial card never leaves
 * it unoperable.
 */
export const VariantDialFallsBackBelowFull: Story = {
  render: (args) => <ClimateDialCard {...args} />,
  args: { tier: 'row', gridWidth: 2, gridHeight: 1, span: { width: 2, height: 1 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByLabelText('Increase temperature')).toBeInTheDocument()
    await expect(canvasElement.querySelector('.climate-card-name')).not.toBeInTheDocument()
  },
}

/*
 * The per-card options (option doc — "Options"). Each renders at `full`, the
 * only tier the secondary rows and the humidity fragment appear in.
 */

const thermostatWithEverything = () =>
  createClimateEntity({
    attributes: {
      // TARGET_TEMPERATURE | FAN_MODE | PRESET_MODE
      supported_features: 25,
      preset_modes: ['home', 'away', 'eco'],
      preset_mode: 'home',
      fan_modes: ['auto', 'low', 'high'],
      fan_mode: 'auto',
      current_humidity: 44,
    },
  })

const fullTier = {
  tier: 'full' as const,
  gridWidth: 4,
  gridHeight: 5,
  span: { width: 4, height: 5 },
}

/** `showModePills: false` — the state line still says what the unit is doing. */
export const OptionModePillsHidden: Story = {
  args: fullTier,
  parameters: {
    liebe: { entities: [thermostatWithEverything()], itemConfig: { showModePills: false } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.queryByRole('group', { name: 'HVAC mode' })).not.toBeInTheDocument()
    await expect(canvas.getByLabelText('Increase temperature')).toBeInTheDocument()
  },
}

/** `showPresets: true` — opt-in, and only on a thermostat that offers presets. */
export const OptionPresets: Story = {
  args: fullTier,
  parameters: {
    liebe: { entities: [thermostatWithEverything()], itemConfig: { showPresets: true } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByRole('group', { name: 'Preset mode' })).toBeInTheDocument()
    await expect(canvas.queryByRole('group', { name: 'Fan mode' })).not.toBeInTheDocument()
  },
}

/** `showFanModes: true`, the same way round. */
export const OptionFanModes: Story = {
  args: fullTier,
  parameters: {
    liebe: { entities: [thermostatWithEverything()], itemConfig: { showFanModes: true } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByRole('group', { name: 'Fan mode' })).toBeInTheDocument()
  },
}

/**
 * Both secondary rows at once, which is the densest the `full` tier gets — and
 * the reason both default to off.
 */
export const OptionPresetsAndFanModes: Story = {
  args: fullTier,
  parameters: {
    liebe: {
      entities: [thermostatWithEverything()],
      itemConfig: { showPresets: true, showFanModes: true },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByRole('group', { name: 'Preset mode' })).toBeInTheDocument()
    await expect(canvas.getByRole('group', { name: 'Fan mode' })).toBeInTheDocument()
  },
}

/** `showCurrentTemp: false` — the state line keeps the mode and drops the room. */
export const OptionCurrentTempHidden: Story = {
  args: fullTier,
  parameters: {
    liebe: { entities: [thermostatWithEverything()], itemConfig: { showCurrentTemp: false } },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.grid-card-status')!.textContent).not.toContain(
      'currently'
    )
  },
}

/** The default: what the unit is doing, what the room reads, and the humidity. */
export const OptionCurrentTempAndHumidity: Story = {
  args: fullTier,
  parameters: { liebe: { entities: [thermostatWithEverything()] } },
  play: async ({ canvasElement }) => {
    const status = canvasElement.querySelector('.grid-card-status')!.textContent

    await expect(status).toContain('currently')
    await expect(status).toContain('44%')
  },
}

/** `showHumidity: false` — the droplet goes, the rest of the line stays. */
export const OptionHumidityHidden: Story = {
  args: fullTier,
  parameters: {
    liebe: { entities: [thermostatWithEverything()], itemConfig: { showHumidity: false } },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.grid-card-status')!.textContent).not.toContain('44%')
  },
}

/**
 * `displayUnit: fahrenheit` over a Celsius unit system. Display only: the card
 * still steps and sends in Celsius, which is what the option doc's scenario
 * pins — 21°C reads as 69.8°F.
 */
export const OptionDisplayUnitFahrenheit: Story = {
  args: fullTier,
  parameters: {
    liebe: { entities: [thermostatWithEverything()], itemConfig: { displayUnit: 'fahrenheit' } },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.liebe-value')!.textContent).toBe('69.8°F')
  },
}

/** `displayUnit: celsius`, which for a Celsius unit system changes nothing. */
export const OptionDisplayUnitCelsius: Story = {
  args: fullTier,
  parameters: {
    liebe: { entities: [thermostatWithEverything()], itemConfig: { displayUnit: 'celsius' } },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.liebe-value')!.textContent).toBe('21.0°C')
  },
}

/** `displayUnit: auto` — whatever Home Assistant's unit system says. */
export const OptionDisplayUnitAuto: Story = {
  args: fullTier,
  parameters: {
    liebe: { entities: [thermostatWithEverything()], itemConfig: { displayUnit: 'auto' } },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.liebe-value')!.textContent).toBe('21.0°C')
  },
}
