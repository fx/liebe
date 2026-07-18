import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '../test/utils'
import { TextCard } from './TextCard'
import { useDashboardStore } from '~/store'
import type { DashboardState } from '~/store/types'

vi.mock('~/store')

const PLACEHOLDER = 'Double-click to edit'

describe('TextCard content resolution', () => {
  beforeEach(() => {
    cleanup()
    // View mode so the card renders content instead of the edit textarea. Honor
    // the selector contract — the hook takes a selector, so apply it to the mock
    // state rather than returning the whole state object for every call.
    const mockState = { mode: 'view', currentScreenId: null } as unknown as DashboardState
    vi.mocked(useDashboardStore).mockImplementation(((
      selector: (state: DashboardState) => unknown
    ) => selector(mockState)) as typeof useDashboardStore)
  })

  it('renders empty content when content is an explicit empty string', () => {
    render(<TextCard content="" />)
    expect(screen.queryByText(PLACEHOLDER)).not.toBeInTheDocument()
  })

  it('renders empty content when config.content is cleared to an empty string', () => {
    render(<TextCard config={{ content: '' }} content="previous value" />)
    expect(screen.queryByText(PLACEHOLDER)).not.toBeInTheDocument()
    expect(screen.queryByText('previous value')).not.toBeInTheDocument()
  })

  it('falls back to the placeholder only when no content is provided', () => {
    render(<TextCard />)
    expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument()
  })

  it('renders provided content', () => {
    render(<TextCard content="Hello world" />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('prefers config content over the prop', () => {
    render(<TextCard config={{ content: 'from config' }} content="from prop" />)
    expect(screen.getByText('from config')).toBeInTheDocument()
    expect(screen.queryByText('from prop')).not.toBeInTheDocument()
  })

  it('falls back on empty enum-like config fields without breaking rendering', () => {
    // Empty alignment/textSize/textColor are invalid; they must fall back to
    // prop/default rather than being preserved as empty strings.
    render(<TextCard config={{ content: 'Body', alignment: '', textSize: '', textColor: '' }} />)
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('ignores an invalid non-empty config value and falls back to the default', () => {
    // 'sideways' is not a supported alignment, so the content must render with the
    // default 'left' text-align rather than the invalid value.
    const { container } = render(
      <TextCard config={{ content: 'Body', alignment: 'sideways', textSize: 'xxl' }} />
    )
    const box = container.querySelector('.text-card-content') as HTMLElement | null
    expect(box).not.toBeNull()
    expect(box?.style.textAlign).toBe('left')
  })

  it('applies a valid alignment from config', () => {
    const { container } = render(<TextCard config={{ content: 'Body', alignment: 'right' }} />)
    const box = container.querySelector('.text-card-content') as HTMLElement | null
    expect(box?.style.textAlign).toBe('right')
  })
})
