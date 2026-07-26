import { useLayoutEffect, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Box, Code, Flex, Text } from '@radix-ui/themes'
import { ActionEditor } from './ActionEditor'
import { dashboardStore } from '~/store/dashboardStore'
import type { CardAction } from '~/store/cardActions'
import type { ScreenConfig } from '~/store/types'

const SCREENS: ScreenConfig[] = [
  {
    id: 'screen-1',
    name: 'Living Room',
    slug: 'living-room',
    type: 'grid',
    children: [{ id: 'screen-2', name: 'Reading Corner', slug: 'reading-corner', type: 'grid' }],
  },
  { id: 'screen-3', name: 'Kitchen', slug: 'kitchen', type: 'grid' },
]

/**
 * Seeds the screen tree the `navigate` target list is built from. Written
 * straight to the store because the workshop's store decorator seeds entities
 * and mode, not screens.
 */
function WithScreens({
  screens = SCREENS,
  children,
}: {
  screens?: ScreenConfig[]
  children: React.ReactNode
}) {
  useLayoutEffect(() => {
    dashboardStore.setState((state) => ({ ...state, screens }))
    return () => dashboardStore.setState((state) => ({ ...state, screens: [] }))
  }, [screens])

  return <>{children}</>
}

/**
 * The action editor — the configuration control behind `tapAction`,
 * `holdAction` and `doubleTapAction`.
 *
 * The four parameterless actions are a plain choice; `navigate` and
 * `call-service` reveal the fields they need. What the card stores is shown
 * underneath each story, because the serialized shape is the contract: bare
 * strings for the parameterless actions, `action`-discriminated objects for the
 * two that carry parameters. The control only ever emits a value that
 * validates, so an incomplete service call shows an error instead of being
 * written to the card.
 */
const meta: Meta<typeof ActionEditor> = {
  title: 'Shell/Card Configuration/Action Editor',
  component: ActionEditor,
  args: { label: 'Tap', defaultValue: 'default' },
  render: function Render({ value: initialValue, ...args }) {
    const [value, setValue] = useState<CardAction>((initialValue as CardAction) ?? 'default')

    return (
      <Box style={{ maxWidth: '380px' }}>
        <Flex direction="column" gap="3">
          <ActionEditor {...args} value={value} onChange={setValue} />
          <Flex direction="column" gap="1">
            <Text size="1" color="gray">
              Stored as
            </Text>
            <Code size="1">{JSON.stringify(value)}</Code>
          </Flex>
        </Flex>
      </Box>
    )
  },
  decorators: [
    (Story) => (
      <WithScreens>
        <Story />
      </WithScreens>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ActionEditor>

/** The stored default for every card: the card's own primary action. */
export const Default: Story = { args: { value: 'default' } }

/** The card family's toggle semantics, gates included. */
export const Toggle: Story = { args: { value: 'toggle' } }

/** The hold default — opens the entity detail dialog. */
export const MoreInfo: Story = { args: { label: 'Hold', value: 'more-info' } }

/** Inert. The double-tap default, which is also what keeps taps instant. */
export const Nothing: Story = { args: { label: 'Double tap', value: 'none' } }

/** Parameterized: the target is a screen, offered from the screen tree. */
export const Navigate: Story = {
  args: { value: { action: 'navigate', target: 'kitchen' } },
}

/** A target whose screen was renamed or deleted is kept, not silently dropped. */
export const NavigateToMissingScreen: Story = {
  args: { value: { action: 'navigate', target: 'guest-room' } },
}

/** With no screens to point at, there is nothing valid to commit. */
export const NavigateWithoutScreens: Story = {
  args: { value: 'default' },
  decorators: [
    (Story) => (
      <WithScreens screens={[]}>
        <Story />
      </WithScreens>
    ),
  ],
}

/** Parameterized: any service, with the card's entity as the implicit target. */
export const CallService: Story = {
  args: { value: { action: 'call-service', service: 'light.turn_on' } },
}

/** Optional service data, edited as YAML and stored as a mapping. */
export const CallServiceWithData: Story = {
  args: {
    value: {
      action: 'call-service',
      service: 'light.turn_on',
      data: { brightness: 180, transition: 2 },
    },
  },
}
