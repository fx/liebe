import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@radix-ui/themes'
import { CustomCssDialog } from '../CustomCssDialog'
import { dashboardStore } from '~/store/dashboardStore'
import { DEFAULT_THEME_CONFIG } from '~/store/themeConfig'

function open() {
  return render(
    <Theme>
      <CustomCssDialog open onOpenChange={vi.fn()} />
    </Theme>
  )
}

function editor() {
  // By role, because the dialog itself is labelled "Custom CSS" too.
  return screen.getByRole('textbox', { name: 'Custom CSS' })
}

/**
 * Pasted rather than typed: `user.type` reads `{` as the start of a key
 * descriptor, and every interesting input here is a CSS rule.
 */
async function write(user: ReturnType<typeof userEvent.setup>, css: string) {
  await user.click(editor())
  await user.paste(css)
}

describe('CustomCssDialog', () => {
  beforeEach(() => {
    dashboardStore.setState((state) => ({ ...state, theme: DEFAULT_THEME_CONFIG, isDirty: false }))
  })

  it('opens on the current custom CSS from the configuration', () => {
    dashboardStore.setState((state) => ({
      ...state,
      theme: { ...state.theme, customCss: '.liebe-card { color: red; }' },
    }))

    open()

    expect(editor()).toHaveValue('.liebe-card { color: red; }')
  })

  it('saves the draft to the configuration', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(
      <Theme>
        <CustomCssDialog open onOpenChange={onOpenChange} />
      </Theme>
    )

    await write(user, '.liebe-card{color:red}')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(dashboardStore.state.theme.customCss).toBe('.liebe-card{color:red}')
    // Custom CSS is a portable field, so editing it is a change to save.
    expect(dashboardStore.state.isDirty).toBe(true)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('leaves the configuration alone until Save', async () => {
    const user = userEvent.setup()
    open()

    await write(user, '.a{}')

    expect(dashboardStore.state.theme.customCss).toBe('')
  })

  it('names what the sanitizer will strip, as it is typed', async () => {
    const user = userEvent.setup()
    open()

    await write(user, '.a{background:url(https://evil.example/p.png)}')

    await waitFor(() => {
      expect(screen.getByText(/Some of this CSS will not be applied/)).toBeInTheDocument()
    })
    // Named, never dropped silently — and named with the reference itself.
    expect(screen.getByText(/Removed `background`.*evil\.example/)).toBeInTheDocument()
  })

  it('says so when the CSS cannot be applied at all', async () => {
    const user = userEvent.setup()
    open()

    await write(user, '} .a{color:red}')

    await waitFor(() => {
      expect(screen.getByText('This CSS cannot be applied')).toBeInTheDocument()
    })
  })

  it('reports nothing for CSS that survives whole', async () => {
    const user = userEvent.setup()
    open()

    await write(user, '.liebe-card{--liebe-card-radius:0}')

    expect(screen.queryByText(/will not be applied/)).not.toBeInTheDocument()
    expect(screen.queryByText('This CSS cannot be applied')).not.toBeInTheDocument()
  })
})
