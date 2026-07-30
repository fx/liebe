import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { VacuumCard } from '.'
import { asUnavailable, createVacuumEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../../.storybook/decorators'

const entityId = 'vacuum.robby'

type VacuumCardStoryProps = ComponentProps<typeof VacuumCard> & GridCellArgs

/**
 * The state × tier matrix the change doc requires, plus the option toggles PR 1
 * ships.
 *
 * Every story asserts rather than merely rendering: the matrix is the point of
 * this file, and a tier that silently stopped drawing its command cluster would
 * still look like a card.
 *
 * Note for anyone reading a green Storybook as evidence: these `play` functions
 * are executed by neither `npm test` nor CI (#259). They are checked assertions
 * when someone runs them, and documentation the rest of the time.
 */
const meta: Meta<VacuumCardStoryProps> = {
  title: 'Cards/VacuumCard',
  component: VacuumCard,
  decorators: [withGridCell],
  argTypes: gridCellArgTypes,
  args: {
    entityId,
    gridWidth: 3,
    gridHeight: 3,
  },
  parameters: {
    liebe: { entities: [createVacuumEntity()] },
  },
}

export default meta
type Story = StoryObj<VacuumCardStoryProps>

const nameLine = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('.liebe-name')?.textContent ?? ''
const stateLine = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('.liebe-state')?.textContent ?? ''
const cluster = (canvasElement: HTMLElement) =>
  [...canvasElement.querySelectorAll('.liebe-pill')].map((pill) => pill.getAttribute('aria-label'))
const pill = (canvasElement: HTMLElement, label: string) =>
  canvasElement.querySelector(`.liebe-pill[aria-label="${label}"]`) as HTMLButtonElement | null
const color = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('.liebe-card')?.getAttribute('data-color') ?? ''

/* ------------------------------------------------------------------ *
 * The canonical states
 * ------------------------------------------------------------------ */

/** Parked on the dock: Start offered, dock button dead because it is home. */
export const Docked: Story = {
  play: async ({ canvasElement }) => {
    await expect(nameLine(canvasElement)).toBe('Robby')
    await expect(stateLine(canvasElement)).toBe('Docked')
    await expect(cluster(canvasElement)).toEqual(['Start', 'Return to dock'])
    await expect(pill(canvasElement, 'Return to dock')).toBeDisabled()
    await expect(color(canvasElement)).toBe('default')
  },
}

/** Mid-run: the teal active tint, and the run button becomes Pause. */
export const Cleaning: Story = {
  parameters: { liebe: { entities: [createVacuumEntity({ state: 'cleaning' })] } },
  play: async ({ canvasElement }) => {
    await expect(stateLine(canvasElement)).toBe('Cleaning')
    await expect(cluster(canvasElement)).toEqual(['Pause', 'Return to dock'])
    await expect(pill(canvasElement, 'Return to dock')).not.toBeDisabled()
    await expect(color(canvasElement)).toBe('vacuum')
  },
}

/** Paused mid-run: Resume, not Start — the run is still in progress. */
export const Paused: Story = {
  parameters: { liebe: { entities: [createVacuumEntity({ state: 'paused' })] } },
  play: async ({ canvasElement }) => {
    await expect(cluster(canvasElement)).toEqual(['Resume', 'Return to dock'])
    await expect(color(canvasElement)).toBe('default')
  },
}

/**
 * Heading home. The deliberate divergence lives here: the button offers Pause —
 * the explicit interruption — while a tap on the tile opens the detail dialog
 * rather than commanding anything.
 */
export const Returning: Story = {
  parameters: { liebe: { entities: [createVacuumEntity({ state: 'returning' })] } },
  play: async ({ canvasElement }) => {
    await expect(stateLine(canvasElement)).toBe('Returning')
    await expect(cluster(canvasElement)).toEqual(['Pause', 'Return to dock'])
    await expect(pill(canvasElement, 'Pause')).not.toBeDisabled()
    // Already on its way home; there is nothing to send it to.
    await expect(pill(canvasElement, 'Return to dock')).toBeDisabled()
    await expect(color(canvasElement)).toBe('vacuum')
  },
}

/** Failed: alert colour, the diagnostic on the line, every command dead. */
export const ErrorState: Story = {
  parameters: {
    liebe: {
      entities: [createVacuumEntity({ state: 'error', attributes: { error: 'Main brush stuck' } })],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(stateLine(canvasElement)).toBe('Main brush stuck')
    await expect(color(canvasElement)).toBe('alert')
    await expect(pill(canvasElement, 'Start')).toBeDisabled()
    await expect(pill(canvasElement, 'Return to dock')).toBeDisabled()
  },
}

export const Unavailable: Story = {
  parameters: { liebe: { entities: [asUnavailable(createVacuumEntity())] } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('UNAVAILABLE')).toBeInTheDocument()
  },
}

/* ------------------------------------------------------------------ *
 * Tiers
 * ------------------------------------------------------------------ */

/** 1×1: icon, name and state only. The tile's own action is the control. */
export const Glance: Story = {
  args: { gridWidth: 1, gridHeight: 1 },
  play: async ({ canvasElement }) => {
    await expect(nameLine(canvasElement)).toBe('Robby')
    await expect(cluster(canvasElement)).toEqual([])
  },
}

/** 3×1: the same content plus the command cluster. */
export const Row: Story = {
  args: { gridWidth: 3, gridHeight: 1 },
  play: async ({ canvasElement }) => {
    await expect(cluster(canvasElement)).toEqual(['Start', 'Return to dock'])
  },
}

/** 1×3: no `tall` layout is specified, so the card renders `glance`. */
export const Tall: Story = {
  args: { gridWidth: 1, gridHeight: 3 },
  play: async ({ canvasElement }) => {
    await expect(cluster(canvasElement)).toEqual([])
  },
}

/* ------------------------------------------------------------------ *
 * Feature gating and options
 * ------------------------------------------------------------------ */

/**
 * The option doc's scenario: options cannot enable a capability the entity does
 * not advertise. START | RETURN_HOME only — no pause, so a cleaning vacuum falls
 * to the stop fallback, and here there is no STOP either.
 */
export const StartAndDockOnly: Story = {
  parameters: {
    liebe: {
      // START | RETURN_HOME
      entities: [createVacuumEntity({ attributes: { supported_features: 8192 | 16 } })],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(cluster(canvasElement)).toEqual(['Start', 'Return to dock'])
  },
}

/** A vacuum that cannot dock itself: the button is absent, not disabled. */
export const NoReturnHome: Story = {
  parameters: {
    liebe: {
      // START only
      entities: [createVacuumEntity({ attributes: { supported_features: 8192 } })],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(cluster(canvasElement)).toEqual(['Start'])
  },
}

/** A cleaning vacuum with no PAUSE falls through to Stop, never to Start. */
export const CleaningWithoutPause: Story = {
  parameters: {
    liebe: {
      entities: [
        createVacuumEntity({
          state: 'cleaning',
          // START | STOP | RETURN_HOME
          attributes: { supported_features: 8192 | 8 | 16 },
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(cluster(canvasElement)).toEqual(['Stop', 'Return to dock'])
  },
}

/** The battery segment, from the legacy attribute this build still reads. */
export const WithBattery: Story = {
  parameters: {
    liebe: { entities: [createVacuumEntity({ attributes: { battery_level: 87 } })] },
  },
  play: async ({ canvasElement }) => {
    await expect(stateLine(canvasElement)).toBe('Docked 87%')
  },
}

/** Under 20% the segment takes the amber low-battery emphasis. */
export const LowBattery: Story = {
  parameters: {
    liebe: { entities: [createVacuumEntity({ attributes: { battery_level: 14 } })] },
  },
  play: async ({ canvasElement }) => {
    await expect(stateLine(canvasElement)).toBe('Docked 14%')
    await expect(canvasElement.querySelector('.liebe-vacuum-battery')).toHaveAttribute(
      'data-low',
      'true'
    )
  },
}

export const BatteryHidden: Story = {
  parameters: {
    liebe: {
      entities: [createVacuumEntity({ attributes: { battery_level: 87 } })],
      itemConfig: { showBattery: false },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(stateLine(canvasElement)).toBe('Docked')
  },
}

export const CommandsHidden: Story = {
  parameters: {
    liebe: { entities: [createVacuumEntity()], itemConfig: { showCommands: false } },
  },
  play: async ({ canvasElement }) => {
    await expect(cluster(canvasElement)).toEqual([])
  },
}

/* ------------------------------------------------------------------ *
 * The `full`-tier option surface (change 0025 PR 2)
 * ------------------------------------------------------------------ */

/** The fan-speed select: the vacuum's own speeds, never a fixed list. */
export const FanSpeed: Story = {
  play: async ({ canvasElement }) => {
    const select = canvasElement.querySelector('[aria-label="Fan speed"]')
    await expect(select).not.toBeNull()
    await expect(select).not.toBeDisabled()
  },
}

/** Hidden when the vacuum advertises no `FAN_SPEED`, whatever the option says. */
export const FanSpeedUnsupported: Story = {
  parameters: {
    liebe: {
      // PAUSE | STOP | RETURN_HOME | START — no FAN_SPEED
      entities: [createVacuumEntity({ attributes: { supported_features: 4 | 8 | 16 | 8192 } })],
      itemConfig: { showFanSpeed: true },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[aria-label="Fan speed"]')).toBeNull()
  },
}

/** Off by default — locating is occasional, not routine. */
export const LocateButton: Story = {
  parameters: {
    liebe: { entities: [createVacuumEntity()], itemConfig: { showLocate: true } },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Locate' })).toBeInTheDocument()
  },
}

/** Cleaning stats, also off by default: not every integration reports them. */
export const Stats: Story = {
  parameters: {
    liebe: { entities: [createVacuumEntity()], itemConfig: { showStats: true } },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.liebe-vacuum-stats')?.textContent).toBe(
      '35 m² · 42m'
    )
  },
}

/** No line at all when the entity reports neither reading — never an empty row. */
export const StatsUnreported: Story = {
  parameters: {
    liebe: {
      entities: [
        createVacuumEntity({ attributes: { cleaned_area: undefined, cleaning_time: undefined } }),
      ],
      itemConfig: { showStats: true },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.liebe-vacuum-stats')).toBeNull()
  },
}

/** Every command control dead in `error`, the select included. */
export const ErrorDisablesEverything: Story = {
  parameters: {
    liebe: {
      entities: [createVacuumEntity({ state: 'error', attributes: { error: 'Main brush stuck' } })],
      itemConfig: { showLocate: true },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[aria-label="Fan speed"]')).toBeDisabled()
    await expect(within(canvasElement).getByRole('button', { name: 'Locate' })).toBeDisabled()
  },
}
