import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@radix-ui/themes'
import { CardConfig } from '../CardConfig'
import type { GridItem } from '~/store/types'

vi.mock('~/store', () => ({
  dashboardStore: { state: { mode: 'edit' }, setState: vi.fn() },
  dashboardActions: {},
  useDashboardStore: vi.fn((selector?: (state: { mode: string; screens: [] }) => unknown) => {
    const state = { mode: 'edit' as const, screens: [] as [] }
    return selector ? selector(state) : state
  }),
}))

/**
 * The `controlStyle` form, and the property it must not destroy.
 *
 * `input_number`'s real default is the *absence* of the key — that is how a
 * card asks to follow the helper's own `mode`. A form whose declared default
 * was one of the two concrete styles would show a following card as though it
 * had been set, and pin it on the next save; the loader's version-marker
 * pinning is careful about exactly this, and a careless form undoes it
 * (docs/changes/0022).
 */
describe('input_number controlStyle form', () => {
  const item = (config: Record<string, unknown> = {}): GridItem => ({
    id: 'item-1',
    type: 'entity',
    entityId: 'input_number.volume',
    x: 0,
    y: 0,
    width: 2,
    height: 1,
    config,
  })

  const renderModal = (gridItem: GridItem, onSave = vi.fn()) => {
    render(
      <Theme>
        <CardConfig.Modal open onOpenChange={vi.fn()} item={gridItem} onSave={onSave} />
      </Theme>
    )
    return onSave
  }

  /** The select trigger belonging to a labelled row. */
  const selectFor = (label: string) =>
    screen.getByText(label).parentElement!.querySelector('[role="combobox"]') as HTMLElement

  const choose = async (
    user: ReturnType<typeof userEvent.setup>,
    label: string,
    option: string
  ) => {
    await user.click(selectFor(label))
    await user.click(within(screen.getByRole('listbox')).getByText(option))
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a keyless card as following the helper, not as a stepper', () => {
    renderModal(item())

    expect(selectFor('Control style')).toHaveTextContent('Follow the helper')
  })

  /**
   * The regression this whole change exists for: the user edits something
   * unrelated and saves. A form that wrote its declared default on any change
   * would pin the control style here, silently and permanently.
   */
  it('leaves the key absent when an unrelated field is edited and saved', async () => {
    const user = userEvent.setup()
    const onSave = renderModal(item())

    await user.type(screen.getByPlaceholderText('Entity name'), 'Volume')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    const saved = onSave.mock.calls[0][0] as { config: Record<string, unknown> }
    expect(saved.config).toEqual({ name: 'Volume' })
    expect(saved.config).not.toHaveProperty('controlStyle')
  })

  it('writes a style when one is actually chosen', async () => {
    const user = userEvent.setup()
    const onSave = renderModal(item())

    await choose(user, 'Control style', 'Slider')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(onSave).toHaveBeenCalledWith({ config: { controlStyle: 'slider' } })
  })

  /**
   * The half that decides the design: a user who has pinned a style must be
   * able to get back to following the helper. Only a choice that *removes* the
   * key can do that — with a form that can write values but never clear them,
   * the first save is one-way.
   */
  it('removes the key again when the user goes back to following the helper', async () => {
    const user = userEvent.setup()
    const onSave = renderModal(item({ controlStyle: 'stepper', name: 'Volume' }))

    expect(selectFor('Control style')).toHaveTextContent('Stepper')

    await choose(user, 'Control style', 'Follow the helper')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    const saved = onSave.mock.calls[0][0] as { config: Record<string, unknown> }
    // The rest of the card's configuration survives; only the pin goes.
    expect(saved.config).toEqual({ name: 'Volume' })
  })

  it('stores nothing that a YAML export would have to spell', async () => {
    const user = userEvent.setup()
    const onSave = renderModal(item({ controlStyle: 'slider' }))

    await choose(user, 'Control style', 'Follow the helper')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    const saved = onSave.mock.calls[0][0] as { config: Record<string, unknown> }
    // Absent, not present-and-undefined: the two serialize differently, and a
    // key with an undefined value is neither configured nor unconfigured.
    expect(Object.keys(saved.config)).not.toContain('controlStyle')
    expect(JSON.parse(JSON.stringify(saved.config))).toEqual({})
  })
})

/**
 * The two helpers whose form default matches their card default. Guarding the
 * general shape of the bug — a form default that differs from the card's
 * effective default — rather than only the instance that was reported.
 */
describe('the other helpers’ form defaults match their cards', () => {
  const renderFor = (entityId: string) => {
    const onSave = vi.fn()
    render(
      <Theme>
        <CardConfig.Modal
          open
          onOpenChange={vi.fn()}
          item={{ id: 'i', type: 'entity', entityId, x: 0, y: 0, width: 2, height: 1, config: {} }}
          onSave={onSave}
        />
      </Theme>
    )
    return onSave
  }

  const selectFor = (label: string) =>
    screen.getByText(label).parentElement!.querySelector('[role="combobox"]') as HTMLElement

  it('shows tile for an unconfigured input_boolean, which is what it renders', () => {
    renderFor('input_boolean.guest_mode')
    expect(selectFor('Control style')).toHaveTextContent('Tile only')
  })

  it('shows the dropdown for an unconfigured input_select, which is what it renders', () => {
    renderFor('input_select.house_mode')
    expect(selectFor('Control style')).toHaveTextContent('Dropdown')
  })
})
