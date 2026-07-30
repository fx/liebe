import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
 * The draft the configuration modal edits, and when it is reseeded.
 *
 * The modal is the fifth of the five call sites
 * docs/changes/0040-test-harness-reliability.md sends PR 4 to audit, and the
 * one no linter ever reported: the React compiler bails on this component, so
 * `react-hooks/set-state-in-effect` is silent here whatever form the call takes.
 * It was found by reading, and these pin what the reading concluded — that the
 * reseed belongs in render, guarded on the item, rather than in an effect.
 *
 * Text cards are the subject because their draft is visible as text in a field,
 * so "which item's values are in the form" is directly observable.
 */
describe('CardConfig modal draft', () => {
  const textItem = (id: string, content: string): GridItem => ({
    id,
    type: 'text',
    x: 0,
    y: 0,
    width: 2,
    height: 1,
    content,
  })

  const FIRST = textItem('item-1', 'First card')
  const SECOND = textItem('item-2', 'Second card')

  const tree = (item: GridItem, onSave: () => void) => (
    <Theme>
      <CardConfig.Modal open onOpenChange={vi.fn()} item={item} onSave={onSave} />
    </Theme>
  )

  /**
   * The markdown body field, which shows the draft's `content`. Selected by its
   * placeholder: the modal renders a second textarea for the same draft (the
   * card's own form beside the universal one), so a value-based query matches
   * both.
   */
  const contentField = () =>
    screen.getByPlaceholderText('Enter your text here...') as HTMLTextAreaElement

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the item it was opened for', () => {
    render(tree(FIRST, vi.fn()))

    expect(contentField()).toHaveValue('First card')
  })

  it('reseeds when the modal is pointed at another item', () => {
    // The grid reuses one modal, so an unsaved draft for one card must not
    // survive onto the next — editing "Second card" and saving would otherwise
    // write the first card's body onto it.
    const { rerender } = render(tree(FIRST, vi.fn()))
    expect(contentField()).toHaveValue('First card')

    rerender(tree(SECOND, vi.fn()))

    expect(contentField()).toHaveValue('Second card')
  })

  it('keeps an in-progress edit across a re-render for any other reason', async () => {
    // The guard is a previous-value comparison on the item, so a render caused
    // by anything else — a parent re-rendering, a sibling's state — must leave
    // the draft alone. A reseed on every render would make the field untypable.
    const user = userEvent.setup()
    const { rerender } = render(tree(FIRST, vi.fn()))

    await user.clear(contentField())
    await user.type(contentField(), 'Half-typed card')
    expect(contentField()).toHaveValue('Half-typed card')

    rerender(tree(FIRST, vi.fn()))

    expect(contentField()).toHaveValue('Half-typed card')
  })

  it('saves the reseeded item’s values, not the one it was opened on', async () => {
    // The consequence the reseed exists for, asserted at the save rather than
    // at the field: a stale draft is only harmful once it is written.
    const user = userEvent.setup()
    const onSave = vi.fn()
    const { rerender } = render(tree(FIRST, onSave))

    rerender(tree(SECOND, onSave))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toMatchObject({ content: 'Second card' })
  })
})
