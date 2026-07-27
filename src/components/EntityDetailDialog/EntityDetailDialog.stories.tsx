import { useMemo, useState, type ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { EntityDetailDialog, type EntityDetailDialogProps } from './index'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { CardItemProvider } from '../cardItemContext'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../../.storybook/decorators'
import { createMockHass } from '../../../.storybook/mockHass'
import { HomeAssistantProvider, type HomeAssistant } from '~/contexts/HomeAssistantContext'
import { entityHistoryService } from '~/services/entityHistory'
import type { HassEntity } from '~/store/entityTypes'
import {
  asUnavailable,
  createHistoryResponse,
  createInputTextEntity,
  createLightEntity,
  createSensorEntity,
  createTemperatureHistory,
} from '~/test/fixtures'

/**
 * The entity detail dialog — what `more-info` opens, and therefore what a
 * press-and-hold reaches on every card by default.
 *
 * It is read-only on purpose: name, state, attributes, and — for entities that
 * have one — a graph of the last 24 hours. Later card changes mount their own
 * controls in the domain slot between the state and the history section.
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
  render: (args) => <ControlledDialog {...args} />,
}

export default meta
type Story = StoryObj<EntityDetailDialogProps>

/**
 * The dialog's own state has to follow the `open` arg back down, so toggling the
 * control reopens a dialog that closed itself — and it does that by REMOUNTING
 * on the arg rather than by writing state. The two alternatives are both worse
 * here: adjusting state during render runs twice under the StrictMode the
 * workshop and the test runner render in, and syncing in an effect is what
 * `react-hooks/set-state-in-effect` rejects. The wrapper holds nothing worth
 * preserving across the toggle, so throwing it away is the cheapest correct
 * answer.
 */
function ControlledDialog(props: EntityDetailDialogProps) {
  return <DialogOpenedByArg key={String(props.open)} {...props} />
}

function DialogOpenedByArg({ open, ...rest }: EntityDetailDialogProps) {
  const [isOpen, setIsOpen] = useState(open)
  return <EntityDetailDialog {...rest} open={isOpen} onOpenChange={setIsOpen} />
}

/**
 * Substitutes the workshop's `hass` for one whose `callWS` answers the recorder
 * request the history section makes — the workshop default resolves every
 * WebSocket message with `undefined`, which is a numeric entity with no recorded
 * rows and therefore an empty graph.
 *
 * The story drives the real pipeline this way rather than seeding the cache:
 * what these stories are for is the states `useEntityHistory` puts the section
 * in, and a seeded store would skip the code that decides them.
 */
function Recorder({ answer, children }: { answer: RecorderAnswer; children: ReactNode }) {
  // `callWS` is generic over the response type it is asked for; a story answers
  // the one message the history service sends, so the cast is the whole gap.
  const hass = useMemo(
    () => ({ ...createMockHass(), callWS: answer as HomeAssistant['callWS'] }),
    [answer]
  )
  return <HomeAssistantProvider hass={hass}>{children}</HomeAssistantProvider>
}

/** How a story's recorder answers `history/history_during_period`. */
type RecorderAnswer = () => Promise<unknown>

/**
 * One history story: its own entity id (the window cache is a singleton keyed by
 * entity, so sharing one id would let the first story's answer decide the rest)
 * and its own recorder behaviour.
 */
function historyStory(entity: HassEntity, answer: RecorderAnswer): Story {
  return {
    args: { entityId: entity.entity_id },
    parameters: { liebe: { entities: [entity] } },
    // The service outlives the story; without this a second visit renders from
    // the window the first one fetched.
    beforeEach: () => {
      entityHistoryService.reset()
      return () => entityHistoryService.reset()
    },
    render: (args) => (
      <Recorder answer={answer}>
        <ControlledDialog {...args} />
      </Recorder>
    ),
  }
}

const temperature = (entityId: string) =>
  createSensorEntity({
    entity_id: entityId,
    attributes: {
      friendly_name: 'Living Room Temperature',
      device_class: 'temperature',
      unit_of_measurement: '°C',
      state_class: 'measurement',
    },
  })

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
 * The history graph: a day of readings drawn through the sparkline anatomy, so
 * a theme restyles it exactly as it restyles the same graph on a card.
 */
export const HistoryGraph: Story = historyStory(temperature('sensor.history_graph'), async () =>
  createHistoryResponse('sensor.history_graph', createTemperatureHistory({ end: Date.now() }))
)

/**
 * The dialog opens before the recorder answers. The skeleton holds the graph's
 * box open, so the attributes below it do not jump when the series lands — this
 * story's recorder never answers, so the state stays on screen.
 */
export const HistoryLoading: Story = historyStory(
  temperature('sensor.history_loading'),
  () => new Promise(() => {})
)

/**
 * A numeric entity the recorder has no rows for: the section stays and the
 * anatomy draws its placeholder baseline, because the entity may yet have a
 * series.
 */
export const HistoryEmpty: Story = historyStory(
  temperature('sensor.history_empty'),
  async () => ({})
)

/**
 * A failed history fetch is non-fatal: the section is gone entirely — no empty
 * frame, no apology — and the rest of the dialog is untouched.
 */
export const HistoryUnavailable: Story = historyStory(temperature('sensor.history_error'), () =>
  Promise.reject(new Error('Recorder unavailable'))
)

/**
 * A non-numeric entity has nothing to graph. `useEntityHistory` resolves it
 * `unsupported` from its live state — no request is made at all — and the
 * section is absent for the same reason as above.
 */
export const HistoryUnsupported: Story = historyStory(
  {
    ...createSensorEntity({
      entity_id: 'device_tracker.phone',
      attributes: { friendly_name: 'Phone', source_type: 'gps' },
    }),
    state: 'home',
  },
  async () => ({})
)

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
