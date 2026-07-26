import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { ImportPreviewDialog } from '../ImportPreviewDialog'
import type { DashboardConfig } from '~/store/types'

function preview(theme: DashboardConfig['theme']) {
  return render(
    <Theme>
      <ImportPreviewDialog
        open
        onOpenChange={vi.fn()}
        config={{ version: '1.0.0', screens: [], theme }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    </Theme>
  )
}

describe('ImportPreviewDialog theming summary', () => {
  it('names the theme, the appearance, and whether custom CSS comes with it', () => {
    preview({ id: 'default', appearance: 'dark', customCss: '.liebe-card { color: red; }' })

    expect(screen.getByText('Default · dark · custom CSS')).toBeInTheDocument()
  })

  it('says nothing about custom CSS when there is none', () => {
    preview({ id: 'default', appearance: 'light', customCss: '' })

    expect(screen.getByText('Default · light')).toBeInTheDocument()
  })

  it('shows a legacy scalar as what the import would make of it', () => {
    // The preview has to describe the migrated document, not the file: that is
    // what confirming the import would apply.
    preview('dark')

    expect(screen.getByText('Default · dark')).toBeInTheDocument()
  })

  it('falls back to the theme that would actually render', () => {
    // An id from a newer Liebe renders as Default, and the preview says so
    // rather than naming a theme this build cannot show.
    preview({ id: 'from-a-newer-liebe', appearance: 'auto', customCss: '' })

    expect(screen.getByText('Default · auto')).toBeInTheDocument()
  })

  it('renders nothing without a config', () => {
    const { container } = render(
      <Theme>
        <ImportPreviewDialog
          open
          onOpenChange={vi.fn()}
          config={null}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </Theme>
    )

    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })
})
