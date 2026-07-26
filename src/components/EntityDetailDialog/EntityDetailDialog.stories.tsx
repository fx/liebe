import { useEffect, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { EntityDetailDialog, type EntityDetailDialogProps } from './index'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { CardItemProvider } from '../cardItemContext'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../../.storybook/decorators'
import {
  asUnavailable,
  createInputTextEntity,
  createLightEntity,
  createSensorEntity,
} from '~/test/fixtures'

/**
 * The entity detail dialog — what `more-info` opens, and therefore what a
 * press-and-hold reaches on every card by default.
 *
 * It is read-only on purpose: name, state, attributes, and a history section
 * that stays a placeholder until history data lands (change 0015). Later card
 * changes mount their own controls in the domain slot between the state and the
 * history section.
 *
 * The password-helper story is the one to keep an eye on: the dialog renders
 * state and attributes generically, so without redaction it would print in
 * clear text the secret the card masks.
 */
const meta: Meta<EntityDetailDialogProps> = {
  title: 'Shell/EntityDetailDialog',
  component: EntityDetailDialog,
  parameters: {
    liebe: { entities: [createSensorEntity()] },
  },
  args: {
    entityId: 'sensor.living_room_temperature',
    open: true,
  },
  // Controlled by the story so the Close button, the overlay and Escape all
  // behave as they do in the panel; the toolbar's `open` arg reopens it.
  render: function DialogStory({ open, ...rest }) {
    const [isOpen, setIsOpen] = useState(open)
    // Follow the arg back up after the dialog has closed itself, so toggling the
    // `open` control reopens it instead of doing nothing.
    useEffect(() => setIsOpen(open), [open])
    return <EntityDetailDialog {...rest} open={isOpen} onOpenChange={setIsOpen} />
  },
}

export default meta
type Story = StoryObj<EntityDetailDialogProps>

/** A typical read-only entity: value, unit, and the attributes behind it. */
export const Default: Story = {}

/**
 * A password helper. Both surfaces that could carry the value — the state
 * display and the attribute list — are masked, including an attribute that only
 * embeds the secret in a longer string.
 */
export const PasswordHelper: Story = {
  args: { entityId: 'input_text.wifi_password' },
  parameters: {
    liebe: {
      entities: [
        createInputTextEntity({
          entity_id: 'input_text.wifi_password',
          state: 'hunter2-correct-horse',
          attributes: {
            friendly_name: 'Wifi Password',
            mode: 'password',
            last_value: 'hunter2-correct-horse',
            share_url: 'https://example.invalid/join?key=hunter2-correct-horse',
          },
        }),
      ],
    },
  },
}

/**
 * An unavailable entity still opens — "why has this gone quiet?" is exactly
 * what a hold is for at that moment.
 */
export const Unavailable: Story = {
  parameters: { liebe: { entities: [asUnavailable(createSensorEntity())] } },
}

/** A card left pointing at an entity Home Assistant no longer publishes. */
export const EntityNotPublished: Story = {
  args: { entityId: 'sensor.removed_by_integration' },
  parameters: { liebe: { entities: [] } },
}

/**
 * The gesture itself: press and hold the tile for half a second and the dialog
 * opens — no card-side wiring, because the shell owns both the gesture and the
 * dialog. A quick tap toggles the light instead.
 */
export const HoldACardToOpen: StoryObj<EntityDetailDialogProps & GridCellArgs> = {
  decorators: [withGridCell],
  argTypes: gridCellArgTypes,
  args: { gridWidth: 2, gridHeight: 2 },
  parameters: { liebe: { entities: [createLightEntity()] } },
  render: () => (
    <CardItemProvider entityId="light.living_room">
      <GridCard domain="light" color="light" isOn>
        <GridCard.Icon>💡</GridCard.Icon>
        <GridCard.Title>Living Room</GridCard.Title>
        <GridCard.Status>ON</GridCard.Status>
      </GridCard>
    </CardItemProvider>
  ),
}
