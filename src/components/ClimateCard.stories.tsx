import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ClimateCard } from './ClimateCard'
import { asUnavailable, createClimateEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../.storybook/decorators'

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
 * Resting state for a thermostat: mode `off`, no target arc, no temperature
 * controls — climate never publishes a literal `on`/`off` pair the way a light
 * does, so this is the domain's inactive equivalent.
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

/** Actively heating: orange target arc, `heating` action, ± controls live. */
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

/** Heat/cool range mode — two draggable set points on one arc. */
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
 * Layout tiers (docs/specs/entity-cards/options/climate.md — "Tier layouts").
 * The thermostat is the one card that KEEPS an embedded control at `glance`:
 * the dialog-registered controls that replace it arrive with change 0017, and
 * until then a control-free tile would be a thermostat nobody can turn up
 * (docs/changes/0011-layout-tiers.md — no operability regression). Assertions
 * live in `__tests__/controlCardTierLayouts.test.tsx`.
 */

/** 1×1: icon, name, setpoint — and the compact stepper that stays. */
export const TierGlance: Story = {
  args: { tier: 'glance', gridWidth: 1, gridHeight: 1, span: { width: 1, height: 1 } },
}

/** 2×1: icon and meta with the stepper and its readout on the right. */
export const TierRow: Story = {
  args: { tier: 'row', gridWidth: 2, gridHeight: 1, span: { width: 2, height: 1 } },
}

/** 1×3: the stepper stands up — plus above the readout, minus below. */
export const TierTall: Story = {
  args: { tier: 'tall', gridWidth: 1, gridHeight: 3, span: { width: 1, height: 3 } },
}

/** 4×5: the arc thermostat, unchanged — `variant: dial` is change 0017's. */
export const TierFull: Story = {
  args: { tier: 'full', gridWidth: 4, gridHeight: 5, span: { width: 4, height: 5 } },
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
