import type { Meta, StoryObj } from '@storybook/react-vite'
import { Flex, Text } from '@radix-ui/themes'
import { renderCardLifecycle, type CardLifecycleProps } from './cardStates'
import type { CardTier } from '~/utils/cardTier'

/**
 * The three tiles a card renders **instead of** itself, when there is no card to
 * render (docs/specs/entity-cards — "Common card shell, sizing, and lifecycle
 * states").
 *
 * They are shown together because the point of the set is that they are told
 * apart. Every card used to answer "there is no entity here" alone, and every
 * card reached the same answer — wait — so a card left pointing at an entity
 * that had been renamed or removed held a skeleton forever, which reads as
 * "still working on it" about a load that will never finish (change 0037 PR 3).
 *
 * Read across a row: pending is progress and says so, missing names the entity
 * and sends the user to reconfigure the card, and disconnected offers the
 * reload that is the one thing that can actually help. Read down a column:
 * each degrades by tier the way a real tile does, and at `glance` the two error
 * tiles become buttons carrying their message as an accessible name rather than
 * dropping it.
 */
const meta: Meta<CardLifecycleProps> = {
  title: 'Cards/Lifecycle States',
  argTypes: {
    tier: {
      control: { type: 'inline-radio' },
      options: ['glance', 'row', 'tall', 'full'] satisfies CardTier[],
    },
  },
  args: {
    entityId: 'light.living_room',
    entity: undefined,
    isConnected: true,
    isLoading: false,
    isMissing: false,
    tier: 'row',
  },
}

export default meta
type Story = StoryObj<CardLifecycleProps>

const TIERS: CardTier[] = ['glance', 'row', 'tall', 'full']

/** One state across every tier, so the degradation is the thing on screen. */
function acrossTiers(args: CardLifecycleProps) {
  return (
    <Flex gap="4" align="start" wrap="wrap">
      {TIERS.map((tier) => (
        <Flex key={tier} direction="column" gap="2" style={{ width: '220px' }}>
          <Text size="1" color="gray">
            {tier}
          </Text>
          {renderCardLifecycle({ ...args, tier })}
        </Flex>
      ))}
    </Flex>
  )
}

/** The entity has not arrived over a live connection. Waiting is honest here. */
export const Pending: Story = {
  args: { isLoading: true },
  render: acrossTiers,
}

/**
 * The snapshot has landed and this entity is not in it — the ordinary outcome
 * of renaming a device or removing an integration. The tile names the entity
 * and offers no retry, because nothing the user can press brings back an entity
 * Home Assistant does not have.
 */
export const Missing: Story = {
  args: { isMissing: true },
  render: acrossTiers,
}

/**
 * Neither of the above: a dropped socket has said nothing about what exists, so
 * reporting the entity as gone would send the user to reconfigure a card that
 * is fine.
 */
export const Disconnected: Story = {
  args: { isConnected: false },
  render: acrossTiers,
}

/** One tile at a time, for driving the states from the controls panel. */
export const Playground: Story = {
  render: (args) => <div style={{ width: '260px' }}>{renderCardLifecycle(args)}</div>,
}
