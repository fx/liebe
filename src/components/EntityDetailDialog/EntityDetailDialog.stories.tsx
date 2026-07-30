import { useMemo, useState, type ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { EntityDetailDialog, type EntityDetailDialogProps } from './index'
import { GridCardWithComponents as GridCard, type GridCardProps } from '../GridCard'
import { CardItemProvider } from '../cardItemContext'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../../.storybook/decorators'
import { createMockHass } from '../../../.storybook/mockHass'
import { HomeAssistantProvider, type HomeAssistant } from '~/contexts/HomeAssistantContext'
import { entityHistoryService } from '~/services/entityHistory'
import type { HassEntity } from '~/store/entityTypes'
import {
  asUnavailable,
  createHistoryResponse,
  createInputBooleanEntity,
  createInputDateTimeEntity,
  createInputNumberEntity,
  createInputSelectEntity,
  createInputTextEntity,
  createLightEntity,
  createSensorEntity,
  createTemperatureHistory,
} from '~/test/fixtures'
/*
 * Imported for the registration each module performs at its own scope: the
 * dialog's domain control slot is filled by the card families, never by the
 * dialog reaching for them (docs/changes/0022-switch-input-helpers-to-spec.md).
 * In the panel these imports come from the card registry; a story file that
 * renders only the dialog has to name them itself.
 */
import '../InputBooleanCard'
import '../InputDateTimeCard'
import '../InputNumberCard'
import '../InputSelectCard'
import '../InputTextCard'

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
 *
 * The tile takes the tier the decorator derives from the cell controls, like
 * every other story in the workshop. A custom `render` is where that is easy to
 * lose: this one ignored its args entirely, so the tile sat at the shell's `row`
 * default inside a cell that says `full` and resizing the controls moved the box
 * without moving the layout.
 */
export const HoldACardToOpen: StoryObj<
  EntityDetailDialogProps & GridCellArgs & Pick<GridCardProps, 'tier'>
> = {
  decorators: [withGridCell],
  argTypes: gridCellArgTypes,
  args: { gridWidth: 2, gridHeight: 2 },
  parameters: { liebe: { entities: [createLightEntity()] } },
  render: ({ tier }) => (
    <CardItemProvider entityId="light.living_room">
      <GridCard domain="light" color="light" isOn tier={tier}>
        <GridCard.Icon>💡</GridCard.Icon>
        <GridCard.Title>Living Room</GridCard.Title>
        <GridCard.Status>ON</GridCard.Status>
      </GridCard>
    </CardItemProvider>
  ),
}

/* ------------------------------------------------------------------------- *
 * The domain control slot
 * ------------------------------------------------------------------------- */

/**
 * One helper-control story. The control is not wired up here — the card family
 * registers it at its own module scope, and importing the card module above is
 * what puts it in the registry, exactly as the card registry does in the panel
 * (docs/changes/0022-switch-input-helpers-to-spec.md — PR 4).
 *
 * The dialog is portalled, so every assertion below queries `document.body`
 * rather than the story canvas.
 */
function helperControlStory(
  entity: HassEntity,
  assert: (controls: HTMLElement) => Promise<void>
): Story {
  return {
    args: { entityId: entity.entity_id },
    parameters: { liebe: { entities: [entity] } },
    play: async () => {
      const body = within(document.body)
      const controls = await body.findByTestId('detail-controls')
      await assert(controls)
    },
  }
}

/**
 * `input_boolean` — the discrete switch, the same control the
 * `controlStyle: switch` tiers render. The boolean helper is the one whose
 * card never needed this (its whole tile toggles); the dialog has no tile, so
 * without a control here it would be the only helper whose details cannot
 * operate it.
 */
export const BooleanControl = helperControlStory(createInputBooleanEntity(), async (controls) => {
  const toggle = within(controls).getByRole('switch')
  await expect(toggle).not.toBeChecked()
  await userEvent.click(toggle)
  await expect(toggle).toBeChecked()
})

/**
 * `input_number` — the control a 1×1 number tile defers to. Which one renders
 * follows the helper's own `mode`, so this `slider` helper gets the slider an
 * unconfigured card's `full` tier would show.
 */
export const NumberControl = helperControlStory(createInputNumberEntity(), async (controls) => {
  const slider = within(controls).getByRole('slider')
  await expect(slider).toHaveAttribute('aria-valuenow', '45')
  await expect(slider).toHaveAttribute('aria-valuemax', '100')
})

/** `input_number` again, for a helper preferring the box: the stepper. */
export const NumberControlStepper = helperControlStory(
  createInputNumberEntity({ entity_id: 'input_number.oven_target', attributes: { mode: 'box' } }),
  async (controls) => {
    await expect(within(controls).getByLabelText('Increase value')).toBeInTheDocument()
    await expect(within(controls).getByRole('button', { name: /Set value/ })).toBeInTheDocument()
  }
)

/**
 * `input_select` — the dropdown, never the pills: pills are a `full`-tier
 * presentation a *card* opts into, and the dialog is opened for an entity.
 */
export const SelectControl = helperControlStory(createInputSelectEntity(), async (controls) => {
  await expect(within(controls).getByRole('combobox')).toHaveTextContent('Home')
})

/** `input_text` — the readout and its edit affordance. */
export const TextControl = helperControlStory(createInputTextEntity(), async (controls) => {
  await expect(
    within(controls).getByText('Please leave parcels at the side door')
  ).toBeInTheDocument()
  await expect(within(controls).getByRole('button', { name: 'Edit value' })).toBeInTheDocument()
})

/**
 * `input_text` in `mode: password` — the control the dialog mounts is masked
 * too. Redaction covers the state display and the attribute list; it would not
 * have covered a field rendered over the same value, and the guarantee is per
 * value rather than per surface.
 */
export const TextControlPassword = helperControlStory(
  createInputTextEntity({
    entity_id: 'input_text.wifi_key',
    state: 'hunter2-correct-horse',
    attributes: { friendly_name: 'Wifi Key', mode: 'password' },
  }),
  async (controls) => {
    await expect(document.body).not.toHaveTextContent('hunter2-correct-horse')
    await userEvent.click(within(controls).getByRole('button', { name: 'Edit value' }))
    await expect(within(controls).getByLabelText('Value')).toHaveAttribute('type', 'password')
    await expect(document.body).not.toHaveTextContent('hunter2-correct-horse')
  }
)

/** `input_datetime` — the formatted readout, with the native picker behind it. */
export const DateTimeControl = helperControlStory(createInputDateTimeEntity(), async (controls) => {
  await userEvent.click(within(controls).getByRole('button', { name: 'Edit value' }))
  await expect(within(controls).getByLabelText('Value')).toHaveValue('2026-07-26T06:30')
})
