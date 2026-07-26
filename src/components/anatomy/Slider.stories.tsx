import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Box, Flex } from '@radix-ui/themes'
import { expect, userEvent, within } from 'storybook/test'
import { Slider } from './Slider'
import type { DomainColorName } from '~/theme/tokens'
import { AppearanceSplit, PartStage, domainColorOptions } from '../../../.storybook/anatomyStage'

interface DemoSliderProps {
  label: string
  /** Starting value; the demo owns it from there, as a card would. */
  initial?: number
  unit?: string
  color?: DomainColorName
  /** Required here for the same reason it is on the part itself. */
  domain: string
  active?: boolean
  disabled?: boolean
  orientation?: 'horizontal' | 'vertical'
  /** Stands in for a bulb's real RGB — the one data-driven colour the spec allows. */
  hue?: string
}

/**
 * The card's half of the contract: it holds the value, repaints on every
 * change, and dispatches once on commit. The commit count is rendered so the
 * drag stories can show that a whole drag produces one service call, not eighty.
 */
function DemoSlider({
  label,
  initial = 50,
  unit = '%',
  orientation = 'horizontal',
  ...part
}: DemoSliderProps) {
  const [value, setValue] = useState(initial)
  const [commits, setCommits] = useState(0)

  const slider = (
    <Slider
      {...part}
      label={label}
      value={value}
      orientation={orientation}
      readout={`${value}${unit}`}
      onValueChange={setValue}
      onValueCommit={() => setCommits((count) => count + 1)}
    />
  )

  return (
    <Flex direction="column" gap="2">
      {orientation === 'vertical' ? <Box height="180px">{slider}</Box> : slider}
      <Box data-testid="commits" style={{ color: 'var(--liebe-muted)', fontSize: '12px' }}>
        {commits} commit{commits === 1 ? '' : 's'}
      </Box>
    </Flex>
  )
}

/**
 * The embedded slider (`liebe-slider`) — a `--liebe-control-height` track with
 * a 20% domain-tint fill and a 3px saturated leading edge, in either
 * orientation, with the value read out inside the track.
 *
 * It is built on the unstyled `@radix-ui/react-slider` primitive rather than
 * the themed Radix slider, so every visual attribute comes from the token
 * contract and the hue from the `--liebe-c-*` triplet a theme can remap.
 *
 * The accessible name lands on the **thumb**, which is the element Radix gives
 * `role="slider"` — labelling the root instead is what left the cards' sliders
 * anonymous to screen readers (issue #192). `label` is required, so no slider
 * can be built without one.
 */
const meta: Meta<typeof DemoSlider> = {
  title: 'Design System/Anatomy/Slider',
  component: DemoSlider,
  argTypes: {
    color: { control: { type: 'select' }, options: domainColorOptions },
    orientation: { control: { type: 'inline-radio' }, options: ['horizontal', 'vertical'] },
    hue: { control: { type: 'color' } },
  },
  args: {
    label: 'Brightness',
    initial: 60,
    color: 'light',
    domain: 'light',
    active: true,
  },
  render: (args) => (
    <PartStage>
      <DemoSlider {...args} />
    </PartStage>
  ),
}

export default meta
type Story = StoryObj<typeof DemoSlider>

/** Active: the fill takes the domain's 20% tint, the leading edge its base hue. */
export const Horizontal: Story = {}

/** Inactive — no state to carry, so no hue: a neutral fill on the neutral track. */
export const Inactive: Story = {
  args: { active: false, initial: 25 },
}

/** Turned on its side for a `tall`-tier card; the track fills the height it is given. */
export const Vertical: Story = {
  args: { orientation: 'vertical' },
}

/** Both orientations side by side, on one card ground. */
export const BothOrientations: Story = {
  render: (args) => (
    <PartStage>
      <Flex gap="4" align="stretch">
        <DemoSlider {...args} orientation="vertical" />
        <Box flexGrow="1">
          <DemoSlider {...args} />
        </Box>
      </Flex>
    </PartStage>
  ),
}

/** Held back by the card — nothing drags, nothing takes focus. */
export const Disabled: Story = {
  args: { disabled: true },
}

/**
 * A cover's position slider: the same control on a different triplet, which is
 * all a domain change is.
 */
export const CoverPosition: Story = {
  args: { label: 'Position', color: 'cool', domain: 'cover', initial: 35 },
}

/**
 * The bulb's own colour, passed as `hue` — the one documented exception to
 * token-only colour, and the reason it may land inline.
 */
export const LiveBulbColour: Story = {
  args: { hue: 'rgb(255, 138, 66)' },
}

/** Both appearances — active and resting sliders against each ground. */
export const BothAppearances: Story = {
  render: (args) => (
    <AppearanceSplit>
      <PartStage>
        <Flex direction="column" gap="3">
          <DemoSlider {...args} />
          <DemoSlider {...args} label="Position" active={false} initial={25} />
        </Flex>
      </PartStage>
    </AppearanceSplit>
  ),
}

/** The centre of an element, in viewport coordinates. */
function centre(element: Element) {
  const { left, top, width, height } = element.getBoundingClientRect()
  return { clientX: left + width / 2, clientY: top + height / 2 }
}

/** The track of the slider in a story's canvas. */
function trackOf(canvasElement: HTMLElement): HTMLElement {
  const track = canvasElement.querySelector<HTMLElement>('.liebe-slider-track')
  if (!track) throw new Error('no .liebe-slider-track in the story')
  return track
}

/**
 * Presses on the track, drags to `to`, and releases.
 *
 * The pointer-capture stubs are what make a drag possible from a play
 * function. Radix gates `pointermove` and `pointerup` on
 * `hasPointerCapture()`, and a *synthetic* pointer sequence — the only kind a
 * play function can dispatch — cannot establish real capture in the browser:
 * capture belongs to a physical pointer the page did not create. So the
 * bookkeeping is stubbed for the length of the gesture and nothing else is:
 * the coordinates, Radix's value math, our change/commit plumbing and the
 * repaint are all real, which is what the test is about.
 */
async function dragAcross(track: HTMLElement, to: { clientX: number; clientY: number }) {
  const stubs = {
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    hasPointerCapture: () => true,
  }
  Object.assign(track, stubs)

  await userEvent.pointer([
    { keys: '[MouseLeft>]', target: track, coords: centre(track) },
    { target: track, coords: to },
    { keys: '[/MouseLeft]', target: track, coords: to },
  ])

  // Back to the prototype's implementations, so nothing leaks into the next
  // interaction with this story.
  for (const name of Object.keys(stubs)) Reflect.deleteProperty(track, name)
}

/**
 * Dragging horizontally past the end of the track drives the value to its
 * maximum and dispatches exactly one commit — the whole point of separating
 * change from commit, since a card that dispatched per change would send a
 * service call for every pixel of this drag.
 */
export const DragToMaximum: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const thumb = canvas.getByRole('slider', { name: 'Brightness' })
    const track = trackOf(canvasElement)
    const { left, top, width, height } = track.getBoundingClientRect()

    // Well past the right edge, so the value clamps to the maximum rather than
    // landing on whatever fraction a pixel offset works out to.
    await dragAcross(track, { clientX: left + width + 100, clientY: top + height / 2 })

    await expect(thumb).toHaveAttribute('aria-valuenow', '100')
    await expect(thumb).toHaveAttribute('aria-valuetext', '100%')
    await expect(canvas.getByTestId('commits')).toHaveTextContent('1 commit')
  },
}

/** The same drag the other way: off the left edge parks the value at zero. */
export const DragToMinimum: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const thumb = canvas.getByRole('slider', { name: 'Brightness' })
    const track = trackOf(canvasElement)
    const { left, top, height } = track.getBoundingClientRect()

    await dragAcross(track, { clientX: left - 100, clientY: top + height / 2 })

    await expect(thumb).toHaveAttribute('aria-valuenow', '0')
    await expect(canvas.getByTestId('commits')).toHaveTextContent('1 commit')
  },
}

/**
 * A vertical drag runs bottom to top, so dragging above the track fills it —
 * the axis is the only thing that changes about the gesture.
 */
export const DragVertical: Story = {
  args: { orientation: 'vertical' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const thumb = canvas.getByRole('slider', { name: 'Brightness' })
    const track = trackOf(canvasElement)
    const { left, top, width } = track.getBoundingClientRect()

    await dragAcross(track, { clientX: left + width / 2, clientY: top - 100 })

    await expect(thumb).toHaveAttribute('aria-valuenow', '100')
    await expect(canvas.getByTestId('commits')).toHaveTextContent('1 commit')
  },
}

/**
 * The keyboard path, which is also the accessible-name pin for issue #192:
 * `getByRole('slider', { name })` only resolves if the element carrying
 * `role="slider"` — the thumb, not the root — has the name.
 */
export const KeyboardAdjust: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const thumb = canvas.getByRole('slider', { name: 'Brightness' })

    await userEvent.tab()
    await expect(thumb).toHaveFocus()

    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    await expect(thumb).toHaveAttribute('aria-valuenow', '62')
    await userEvent.keyboard('{End}')
    await expect(thumb).toHaveAttribute('aria-valuenow', '100')
  },
}

/** Disabled means disabled: no drag moves it and no key reaches it. */
export const DisabledDoesNotMove: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const thumb = canvas.getByRole('slider', { name: 'Brightness' })
    const track = trackOf(canvasElement)
    const { left, top, width, height } = track.getBoundingClientRect()

    await dragAcross(track, { clientX: left + width + 100, clientY: top + height / 2 })

    await expect(thumb).toHaveAttribute('aria-valuenow', '60')
    await expect(canvas.getByTestId('commits')).toHaveTextContent('0 commits')
  },
}
