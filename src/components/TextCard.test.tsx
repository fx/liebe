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
    // View mode so the card renders content instead of the edit textarea.
    vi.mocked(useDashboardStore).mockReturnValue({
      mode: 'view',
      currentScreenId: null,
    } as Partial<DashboardState> as DashboardState)
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
})
