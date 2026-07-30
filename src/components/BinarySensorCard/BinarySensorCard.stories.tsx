import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { BinarySensorCard } from '.'
import { asUnavailable, createBinarySensorEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../../.storybook/decorators'

const entityId = 'binary_sensor.front_door'

type BinarySensorCardStoryProps = ComponentProps<typeof BinarySensorCard> & GridCellArgs

const meta: Meta<BinarySensorCardStoryProps> = {
  title: 'Cards/BinarySensorCard',
  component: BinarySensorCard,
  decorators: [withGridCell],
  argTypes: gridCellArgTypes,
  args: {
    entityId,
    gridWidth: 2,
    gridHeight: 1,
  },
  parameters: {
    liebe: { entities: [createBinarySensorEntity()] },
  },
}

export default meta
type Story = StoryObj<BinarySensorCardStoryProps>

/** The card's state line, which is where every option below shows up. */
function readState(canvasElement: HTMLElement): string {
  return canvasElement.querySelector('.liebe-state')?.textContent ?? ''
}

/** A sensor of one device class, for the option stories. */
const sensor = (deviceClass: string, state: string, friendlyName: string) =>
  createBinarySensorEntity({
    entity_id: entityId,
    state,
    attributes: { friendly_name: friendlyName, device_class: deviceClass },
  })

/** Closed door — the device class picks both the "off" icon and the word. */
export const Off: Story = {
  parameters: { liebe: { entities: [createBinarySensorEntity({ state: 'off' })] } },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Closed')
  },
}

/** Open door — the active tint, the "on" icon, and the device class's word. */
export const On: Story = {
  parameters: { liebe: { entities: [createBinarySensorEntity({ state: 'on' })] } },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Open')
    await expect(canvasElement.querySelector('.liebe-icon')).toHaveAttribute('data-active', 'true')
  },
}

/** A different device class swaps the icon pair AND the wording. */
export const MotionDetected: Story = {
  parameters: {
    liebe: {
      entities: [
        createBinarySensorEntity({
          entity_id: entityId,
          state: 'on',
          attributes: { friendly_name: 'Hallway Motion', device_class: 'motion' },
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Detected')
  },
}

/** No device class at all falls back to the generic circle icons and On/Off. */
export const WithoutDeviceClass: Story = {
  parameters: {
    liebe: {
      entities: [
        createBinarySensorEntity({
          entity_id: entityId,
          state: 'on',
          attributes: { friendly_name: 'Generic Contact', device_class: undefined },
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('On')
  },
}

export const Unavailable: Story = {
  parameters: { liebe: { entities: [asUnavailable(createBinarySensorEntity())] } },
  play: async ({ canvasElement }) => {
    // Neither open nor closed: the raw state is read out rather than named.
    await expect(readState(canvasElement)).toBe('UNAVAILABLE')
  },
}

export const Loading: Story = {
  parameters: { liebe: { entities: [], initialLoading: true } },
}

/**
 * Read-only card — no service-call path — so its error story is the
 * disconnected state reached through `useEntity`.
 */
export const Disconnected: Story = {
  parameters: { liebe: { entities: [createBinarySensorEntity()], connected: false } },
}

/**
 * An entity id that is not in the store. `useEntity` cannot tell "not loaded
 * yet" from "does not exist", so the card holds its skeleton indefinitely
 * rather than reporting the entity as missing.
 */
export const UnknownEntity: Story = {
  parameters: { liebe: { entities: [] } },
}

/** Edit mode exposes the delete affordance. */
export const EditMode: Story = {
  args: { onDelete: () => {} },
  parameters: { liebe: { entities: [createBinarySensorEntity()], mode: 'edit' } },
}

/* ------------------------------------------------------------------ *
 * Layout tiers
 *
 * One story per tier the card implements, each sized through the
 * grid-cell decorator so the span the tier is derived from is the span
 * the story is rendered at (docs/specs/storybook/index.md). The `grid
 * width` / `grid height` controls resize any of them interactively.
 * ------------------------------------------------------------------ */

/** Icon circle over name and state label, stacked and centred. */
export const TierGlance: Story = {
  name: 'Tier — glance (1×1)',
  args: { gridWidth: 1, gridHeight: 1 },
}

/** Icon and name/state meta in a row. */
export const TierRow: Story = {
  name: 'Tier — row (3×1)',
  args: { gridWidth: 3, gridHeight: 1 },
}

/**
 * The same row arrangement, vertically centred: the option doc gives `tall`
 * the row shape because the vertical one exists to hold a control and this
 * card has none.
 */
export const TierTall: Story = {
  name: 'Tier — tall (1×3)',
  args: { gridWidth: 1, gridHeight: 3 },
}

/**
 * Row arrangement again. The extra real estate stays calm rather than
 * inventing content — no graph, no control.
 */
export const TierFull: Story = {
  name: 'Tier — full (3×2)',
  args: { gridWidth: 3, gridHeight: 2 },
}

/* ------------------------------------------------------------------ *
 * Labels
 * ------------------------------------------------------------------ */

/**
 * The `device_class` naming Liebe ships, across four classes at once — this is
 * the default every unconfigured binary sensor gets.
 */
export const DeviceClassLabels: Story = {
  args: { gridWidth: 3, gridHeight: 1 },
  parameters: { liebe: { entities: [sensor('moisture', 'on', 'Under Sink')] } },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Wet')
  },
}

/** A custom label replaces the device class's word for that state only. */
export const CustomLabels: Story = {
  parameters: {
    liebe: {
      entities: [createBinarySensorEntity({ state: 'on' })],
      itemConfig: { onLabel: 'Ajar' },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Ajar')
  },
}

/* ------------------------------------------------------------------ *
 * Invert
 * ------------------------------------------------------------------ */

/**
 * Hardware wired backwards: the sensor reports `on` while the door is
 * physically closed, so the card is told to swap its presentation. The raw
 * state — and `more-info` with it — is untouched.
 */
export const Inverted: Story = {
  parameters: {
    liebe: {
      entities: [createBinarySensorEntity({ state: 'on' })],
      itemConfig: { invert: true },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Closed')
    await expect(canvasElement.querySelector('.liebe-icon')).not.toHaveAttribute('data-active')
  },
}

/** The same option on the opposite state, so both halves of the swap are shown. */
export const InvertedWhileOff: Story = {
  parameters: {
    liebe: {
      entities: [createBinarySensorEntity({ state: 'off' })],
      itemConfig: { invert: true },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Open')
    await expect(canvasElement.querySelector('.liebe-icon')).toHaveAttribute('data-active', 'true')
  },
}

/* ------------------------------------------------------------------ *
 * Active colour by device class
 * ------------------------------------------------------------------ */

/** An alert-class sensor sounding: red, not the amber a lamp would take. */
export const AlertClassActive: Story = {
  parameters: { liebe: { entities: [sensor('smoke', 'on', 'Kitchen Smoke')] } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.liebe-card')).toHaveAttribute('data-color', 'alert')
    await expect(readState(canvasElement)).toBe('Detected')
  },
}

/** A leak sensor takes the water colour. */
export const WaterClassActive: Story = {
  parameters: { liebe: { entities: [sensor('moisture', 'on', 'Under Sink')] } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.liebe-card')).toHaveAttribute('data-color', 'water')
  },
}

/** A light sensor takes the light colour — the one the design system reserves. */
export const LightClassActive: Story = {
  parameters: { liebe: { entities: [sensor('light', 'on', 'Porch Daylight')] } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.liebe-card')).toHaveAttribute('data-color', 'light')
  },
}

/**
 * The rule that outranks every option: a sounding hazard sensor configured to
 * look calm in every way it can be — recoloured, relabelled, re-iconed,
 * inverted, with its state and name hidden — still renders as an alarm.
 */
export const HazardIsNotRestylable: Story = {
  args: { gridWidth: 3, gridHeight: 1 },
  parameters: {
    liebe: {
      entities: [sensor('smoke', 'on', 'Kitchen Smoke')],
      itemConfig: {
        color: 'ok',
        hideState: true,
        hideName: true,
        icon: 'Circle',
        invert: true,
        onLabel: 'All clear',
        onIcon: 'Circle',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvasElement.querySelector('.liebe-card')).toHaveAttribute('data-color', 'alert')
    await expect(readState(canvasElement)).toBe('Detected')
    await expect(canvas.getByText('Kitchen Smoke')).toBeInTheDocument()
  },
}

/** The same detector quiet: every one of those options applies normally again. */
export const HazardQuietHonoursOptions: Story = {
  args: { gridWidth: 3, gridHeight: 1 },
  parameters: {
    liebe: {
      entities: [sensor('smoke', 'off', 'Kitchen Smoke')],
      itemConfig: { onLabel: 'All clear', hideState: true },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.liebe-state')).toBeNull()
  },
}

/* ------------------------------------------------------------------ *
 * Recency
 * ------------------------------------------------------------------ */

const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

/** The `full` tier's one addition: how long the sensor has held its state. */
export const FullTierSince: Story = {
  args: { gridWidth: 3, gridHeight: 2 },
  parameters: {
    liebe: {
      entities: [createBinarySensorEntity({ state: 'off', last_changed: twoHoursAgo })],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('binary-sensor-since')).toHaveTextContent(
      'for 2 h'
    )
  },
}

/**
 * An entity whose `last_changed` cannot be read. The line is absent rather than
 * reading "for NaN min" — the sensor has not said how long anything has held.
 */
export const FullTierSinceUnparseable: Story = {
  args: { gridWidth: 3, gridHeight: 2 },
  parameters: {
    liebe: {
      entities: [
        createBinarySensorEntity({ state: 'off', last_changed: 'the day before yesterday' }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByTestId('binary-sensor-since')).toBeNull()
    await expect(readState(canvasElement)).toBe('Closed')
  },
}
