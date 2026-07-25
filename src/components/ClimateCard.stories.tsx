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
    size: { control: { type: 'inline-radio' }, options: ['small', 'medium', 'large'] },
  },
  args: {
    entityId,
    size: 'medium',
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
