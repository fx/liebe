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
})
