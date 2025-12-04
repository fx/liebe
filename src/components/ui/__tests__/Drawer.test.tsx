import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@radix-ui/themes'
import { Drawer } from '../Drawer'

describe('Drawer', () => {
  const mockOnOpenChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render content when open', () => {
    render(
      <Drawer open={true} onOpenChange={mockOnOpenChange}>
        <div>Drawer Content</div>
      </Drawer>
    )

    expect(screen.getByText('Drawer Content')).toBeInTheDocument()
  })

  it('should not render content when closed', () => {
    render(
      <Drawer open={false} onOpenChange={mockOnOpenChange}>
        <div>Drawer Content</div>
      </Drawer>
    )

    expect(screen.queryByText('Drawer Content')).not.toBeInTheDocument()
  })

  it('should close on ESC key press', async () => {
    const user = userEvent.setup()

    render(
      <Drawer open={true} onOpenChange={mockOnOpenChange}>
        <div>Drawer Content</div>
      </Drawer>
    )

    await user.keyboard('{Escape}')

    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })

  it('should not close on ESC when closeOnEsc is false', async () => {
    const user = userEvent.setup()

    render(
      <Drawer open={true} onOpenChange={mockOnOpenChange} closeOnEsc={false}>
        <div>Drawer Content</div>
      </Drawer>
    )

    await user.keyboard('{Escape}')

    expect(mockOnOpenChange).not.toHaveBeenCalled()
  })

  it('should show close button by default', () => {
    render(
      <Drawer open={true} onOpenChange={mockOnOpenChange}>
        <div>Drawer Content</div>
      </Drawer>
    )

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('should hide close button when showCloseButton is false', () => {
    render(
      <Drawer open={true} onOpenChange={mockOnOpenChange} showCloseButton={false}>
        <div>Drawer Content</div>
      </Drawer>
    )

    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
  })

  it('should close when close button is clicked', async () => {
    const user = userEvent.setup()

    render(
      <Drawer open={true} onOpenChange={mockOnOpenChange}>
        <div>Drawer Content</div>
      </Drawer>
    )

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })

  it('should inherit dark theme appearance from parent Theme', () => {
    render(
      <Theme appearance="dark">
        <Drawer open={true} onOpenChange={mockOnOpenChange}>
          <div data-testid="drawer-content">Drawer Content</div>
        </Drawer>
      </Theme>
    )

    // The drawer content should be inside a Theme with dark appearance
    const drawerContent = screen.getByTestId('drawer-content')
    // Find the Theme wrapper in the portal - it should have the dark appearance class
    const themeWrapper = drawerContent.closest('[data-is-root-theme]')
    expect(themeWrapper).toHaveAttribute('data-is-root-theme', 'false')
    // The drawer's Theme should have class indicating dark mode
    expect(themeWrapper).toHaveClass('dark')
  })

  it('should inherit light theme appearance from parent Theme', () => {
    render(
      <Theme appearance="light">
        <Drawer open={true} onOpenChange={mockOnOpenChange}>
          <div data-testid="drawer-content">Drawer Content</div>
        </Drawer>
      </Theme>
    )

    const drawerContent = screen.getByTestId('drawer-content')
    const themeWrapper = drawerContent.closest('[data-is-root-theme]')
    expect(themeWrapper).toHaveAttribute('data-is-root-theme', 'false')
    expect(themeWrapper).toHaveClass('light')
  })

  it('should work without parent Theme (fallback)', () => {
    // This should not throw - it should render with default theme
    render(
      <Drawer open={true} onOpenChange={mockOnOpenChange}>
        <div>Drawer Content</div>
      </Drawer>
    )

    expect(screen.getByText('Drawer Content')).toBeInTheDocument()
  })

  it('should apply custom size', () => {
    render(
      <Drawer open={true} onOpenChange={mockOnOpenChange} size="400px">
        <div data-testid="drawer-content">Drawer Content</div>
      </Drawer>
    )

    const drawerContent = screen.getByTestId('drawer-content')
    const dialogContent = drawerContent.closest('.drawer-content')
    expect(dialogContent).toHaveStyle({ width: '400px' })
  })

  it('should apply direction class', () => {
    render(
      <Drawer open={true} onOpenChange={mockOnOpenChange} direction="left">
        <div data-testid="drawer-content">Drawer Content</div>
      </Drawer>
    )

    const drawerContent = screen.getByTestId('drawer-content')
    const dialogContent = drawerContent.closest('.drawer-content')
    expect(dialogContent).toHaveClass('drawer-left')
  })

  it('should render accessibility title and description', () => {
    render(
      <Drawer
        open={true}
        onOpenChange={mockOnOpenChange}
        title="Test Title"
        description="Test Description"
      >
        <div>Drawer Content</div>
      </Drawer>
    )

    // Title and description are visually hidden but present for screen readers
    expect(screen.getByText('Test Title')).toBeInTheDocument()
    expect(screen.getByText('Test Description')).toBeInTheDocument()
  })
})
