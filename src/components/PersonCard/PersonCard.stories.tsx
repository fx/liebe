import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { PersonCard } from '.'
import { asUnavailable, createPersonEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../../.storybook/decorators'

const entityId = 'person.jane_doe'

type PersonCardStoryProps = ComponentProps<typeof PersonCard> & GridCellArgs

const meta: Meta<PersonCardStoryProps> = {
  title: 'Cards/PersonCard',
  component: PersonCard,
  decorators: [withGridCell],
  argTypes: {
    ...gridCellArgTypes,
    tier: { control: { type: 'inline-radio' }, options: ['glance', 'row', 'tall', 'full'] },
  },
  args: {
    entityId,
    tier: 'row',
    gridWidth: 3,
    gridHeight: 2,
  },
  parameters: {
    liebe: { entities: [createPersonEntity()] },
  },
}

export default meta
type Story = StoryObj<PersonCardStoryProps>

/** The card's state line — where presence lands. */
function readState(canvasElement: HTMLElement): string {
  return canvasElement.querySelector('.liebe-state')?.textContent ?? ''
}

/** Which presence the badge dot is showing. */
function readBadge(canvasElement: HTMLElement): string | null {
  return canvasElement.querySelector('.liebe-person-badge')?.getAttribute('data-presence') ?? null
}

/** The initials, or `null` when the avatar is showing something else. */
function readInitials(canvasElement: HTMLElement): string | null {
  return canvasElement.querySelector('.liebe-person-initials')?.textContent ?? null
}

const personIn = (state: string, attributes?: Record<string, unknown>) => ({
  liebe: { entities: [createPersonEntity({ state, attributes })] },
})

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * Presence. Every state the card distinguishes, per the storybook spec's
 * story-coverage rule: the two Home Assistant defines, a named zone, and the
 * two indeterminate ones — which share a dot and must not share a state line.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Home: the calm state, and the one the colour discipline paints green. */
export const Home: Story = {
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Home')
    await expect(readBadge(canvasElement)).toBe('home')
  },
}

/** Away: red, the one state that is worth noticing across a room. */
export const Away: Story = {
  parameters: personIn('not_home'),
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Away')
    await expect(readBadge(canvasElement)).toBe('away')
  },
}

/**
 * A named zone: neutral dot, and the zone's own name doing the work. Hue would
 * have to invent a meaning for "Work" that the colour discipline does not have.
 */
export const InNamedZone: Story = {
  parameters: personIn('Work'),
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Work')
    await expect(readBadge(canvasElement)).toBe('zone')
  },
}

/** Indeterminate presence: the hollow dot, and the word for it. */
export const UnknownLocation: Story = {
  parameters: personIn('unknown'),
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Unknown')
    await expect(readBadge(canvasElement)).toBe('unknown')
  },
}

/**
 * Unavailable: the same hollow dot on a card that says so.
 *
 * The pair that must stay distinguishable — a person whose entity is
 * disconnected is a different fact from a person whose location is unknown, and
 * only the dot is shared between them.
 */
export const Unavailable: Story = {
  parameters: { liebe: { entities: [asUnavailable(createPersonEntity())] } },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('UNAVAILABLE')
    await expect(readBadge(canvasElement)).toBe('unknown')
  },
}

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * The avatar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** No photo: initials on the colour derived from this person's entity id. */
export const InitialsAvatar: Story = {
  play: async ({ canvasElement }) => {
    await expect(readInitials(canvasElement)).toBe('JD')
    await expect(readBadge(canvasElement)).toBe('home')
  },
}

/**
 * A photo, which always wins. Data URI rather than a Home Assistant path so the
 * story is self-contained — the workshop fetches nothing external.
 */
export const PhotoAvatar: Story = {
  parameters: personIn('home', {
    entity_picture:
      'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"%3E%3Crect width="40" height="40" fill="%237c3aed"/%3E%3C/svg%3E',
  }),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('img')).toBeInTheDocument()
    await expect(readInitials(canvasElement)).toBe(null)
    // The badge rides on the photo exactly as it rides on the initials.
    await expect(readBadge(canvasElement)).toBe('home')
  },
}

/** A single-word name, which yields one letter rather than two. */
export const SingleWordName: Story = {
  parameters: personIn('home', { friendly_name: 'Marian' }),
  play: async ({ canvasElement }) => {
    await expect(readInitials(canvasElement)).toBe('M')
  },
}

/**
 * A name outside the Latin alphabet. Included as a story rather than only as a
 * unit test because the failure it guards against is visual: half a surrogate
 * pair renders as a replacement glyph, which no string assertion in a unit test
 * makes obvious.
 */
export const NonLatinName: Story = {
  parameters: personIn('home', { friendly_name: 'Мария Иванова' }),
  play: async ({ canvasElement }) => {
    await expect(readInitials(canvasElement)).toBe('МИ')
  },
}

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * Tiers. What each one carries, and what it leaves out
 * (docs/specs/entity-cards/options/person.md — "Tier layouts").
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** `glance`: avatar, name, presence. No duration — there is no room for one. */
export const TierGlance: Story = {
  args: { tier: 'glance', gridWidth: 1, gridHeight: 1 },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Home')
    await expect(readBadge(canvasElement)).toBe('home')
    await expect(canvasElement.querySelector('[data-testid="person-since"]')).toBeNull()
  },
}

/** `row`: the showcase — everything this card has, on one line. */
export const TierRow: Story = {
  args: { tier: 'row', gridWidth: 2, gridHeight: 1 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Jane Doe')).toBeInTheDocument()
    await expect(canvasElement.querySelector('[data-testid="person-since"]')).not.toBeNull()
  },
}

/** `tall`: avatar over name, and deliberately no secondary metadata. */
export const TierTall: Story = {
  args: { tier: 'tall', gridWidth: 1, gridHeight: 2 },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Home')
    await expect(canvasElement.querySelector('[data-testid="person-since"]')).toBeNull()
  },
}

/**
 * `full`: the row content with more room around it, and nothing invented to
 * fill the space. Zone history and distance-to-home are open questions with no
 * data source behind them yet.
 */
export const TierFull: Story = {
  args: { tier: 'full', gridWidth: 3, gridHeight: 2 },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Home')
    await expect(canvasElement.querySelector('[data-testid="person-since"]')).not.toBeNull()
  },
}

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * Options.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** `showZone: false` — presence stays, as the dot alone. */
export const ZoneHidden: Story = {
  parameters: {
    liebe: {
      entities: [createPersonEntity({ state: 'not_home' })],
      itemConfig: { showZone: false },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(readState(canvasElement)).toBe('')
    await expect(canvas.getByText('Jane Doe')).toBeInTheDocument()
    await expect(readBadge(canvasElement)).toBe('away')
  },
}

/** `showLastChanged: false` — the state line keeps its own company. */
export const DurationHidden: Story = {
  parameters: {
    liebe: { entities: [createPersonEntity()], itemConfig: { showLastChanged: false } },
  },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Home')
    await expect(canvasElement.querySelector('[data-testid="person-since"]')).toBeNull()
  },
}
