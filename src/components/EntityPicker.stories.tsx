import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Box, Code, Flex, Text } from '@radix-ui/themes'
import { EntityPicker } from './EntityPicker'
import { createBinarySensorEntity, createLightEntity, createSensorEntity } from '~/test/fixtures'

const MOTION = createBinarySensorEntity({
  entity_id: 'binary_sensor.driveway_motion',
  attributes: { friendly_name: 'Driveway Motion', device_class: 'motion' },
})

const HALLWAY_MOTION = createBinarySensorEntity({
  entity_id: 'binary_sensor.hallway_motion',
  attributes: { friendly_name: 'Hallway Motion', device_class: 'motion' },
})

const BATTERY = createSensorEntity({
  entity_id: 'sensor.phone_battery',
  state: '64',
  attributes: { friendly_name: 'Phone Battery', device_class: 'battery', unit_of_measurement: '%' },
})

const ENTITIES = [
  MOTION,
  HALLWAY_MOTION,
  createBinarySensorEntity(),
  BATTERY,
  createLightEntity(),
  createSensorEntity(),
]

/**
 * The entity picker — the configuration control behind every option that links
 * a second entity to a card (`motionEntity` on the camera card, `doorEntity` on
 * the lock card, `batteryEntity` on the person and vacuum cards).
 *
 * The value is one entity id, picked from the list rather than typed, so the
 * control cannot produce a link that points nowhere. What it is *given* is a
 * different matter: an id this Home Assistant does not have is kept and
 * reported, never rewritten — a dashboard shared as YAML regularly lands on an
 * instance that names its sensors differently.
 */
const meta: Meta<typeof EntityPicker> = {
  title: 'Shell/Card Configuration/Entity Picker',
  component: EntityPicker,
  args: { label: 'Motion sensor' },
  parameters: { liebe: { entities: ENTITIES } },
  render: function Render({ value: initialValue, ...args }) {
    const [value, setValue] = useState<string>((initialValue as string) ?? '')

    return (
      <Box style={{ maxWidth: '380px' }}>
        <Flex direction="column" gap="3">
          <EntityPicker {...args} value={value} onChange={setValue} />
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
}

export default meta
type Story = StoryObj<typeof EntityPicker>

/** The default for every linking option: nothing linked. */
export const Empty: Story = {
  args: { value: '', description: 'Adds a motion line to the camera overlay.' },
}

/** A linked entity reads as its friendly name, not its id. */
export const Linked: Story = {
  args: { value: 'binary_sensor.driveway_motion' },
}

/** Narrowed to what the option can actually use — here, motion sensors. */
export const FilteredToMotionSensors: Story = {
  args: {
    value: '',
    domains: ['binary_sensor'],
    deviceClasses: ['motion'],
    placeholder: 'No motion sensor',
  },
}

/** Battery sensors, the shape `batteryEntity` asks for on the person card. */
export const FilteredToBatterySensors: Story = {
  args: { value: 'sensor.phone_battery', domains: ['sensor'], deviceClasses: ['battery'] },
}

/**
 * The imported-dashboard case: the linked entity does not exist here. The card
 * renders without it, and the configuration keeps the id until the user changes
 * it.
 */
export const LinkedEntityMissing: Story = {
  args: { value: 'binary_sensor.moved_house' },
}

/** With no entities at all, the list says so rather than looking broken. */
export const NoEntities: Story = {
  args: { value: '' },
  parameters: { liebe: { entities: [] } },
}
