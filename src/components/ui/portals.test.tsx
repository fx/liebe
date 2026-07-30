import { describe, expect, it } from 'vitest'
import { createPortal } from 'react-dom'
import { render, screen } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import {
  AlertDialog,
  ContextMenu,
  Dialog,
  DropdownMenu,
  HoverCard,
  Popover,
  PortalHost,
  Select,
  Tooltip,
  usePortalContainer,
} from './portals'

/**
 * Every one of these overlays defaults to `document.body`, which in the panel is
 * outside the shadow root and so outside the three layers the theming engine
 * injects there — a dialog that renders perfectly on the Default theme and
 * silently ignores the user's custom CSS. The wrappers exist so that one change
 * of mount point moves all of them, and the assertion each test makes is
 * therefore always the same one: with a host above it, the open overlay is a
 * DESCENDANT OF THAT HOST.
 *
 * Nothing in the panel mounts a host yet (see the module's own note), so these
 * tests are what holds the wrappers to their contract until the
 * `liebe-portal-root` container arrives — including the case that matters most
 * today, the last one: with no host above it, an overlay must still render.
 */
function host(): HTMLElement {
  const found = document.querySelector('.liebe-portal-host')
  if (!found) throw new Error('no portal host rendered')
  return found as HTMLElement
}

function renderInHost(ui: React.ReactNode) {
  // A `Theme` around the host, because Radix's Tooltip needs the provider the
  // theme root renders — and because it is what the panel does.
  return render(
    <Theme>
      <PortalHost>{ui}</PortalHost>
    </Theme>
  )
}

describe('PortalHost', () => {
  it('publishes the host element it renders', () => {
    // Read back through a portal rather than into a captured variable: what the
    // hook is FOR is being handed to `createPortal`, and assigning during render
    // is the side effect `react-hooks/globals` rejects.
    function Probe() {
      const container = usePortalContainer()
      return container ? createPortal(<span data-testid="probe" />, container) : null
    }

    renderInHost(<Probe />)

    expect(screen.getByTestId('probe').parentElement).toBe(host())
  })

  it('renders the host where it is placed, so a container can position it', () => {
    // Which container that is, is the caller's decision and the open question
    // change 0036 carries: an overlay has to be inside the layers AND inside the
    // token scope, and only a `liebe-root`-carrying host delivers the second.
    renderInHost(<span />)

    expect(host().closest('.radix-themes')).not.toBeNull()
  })

  it('leaves the host empty, so React never reconciles portalled content away', () => {
    renderInHost(<span data-testid="child" />)

    expect(screen.getByTestId('child').closest('.liebe-portal-host')).toBeNull()
    expect(host().childNodes).toHaveLength(0)
  })
})

describe('portalled overlays', () => {
  it('mounts a Dialog in the host', () => {
    renderInHost(
      <Dialog.Root open>
        <Dialog.Content>
          <Dialog.Title>Title</Dialog.Title>
          <span data-testid="overlay" />
        </Dialog.Content>
      </Dialog.Root>
    )

    expect(screen.getByTestId('overlay').closest('.liebe-portal-host')).toBe(host())
  })

  it('mounts an AlertDialog in the host', () => {
    renderInHost(
      <AlertDialog.Root open>
        <AlertDialog.Content>
          <AlertDialog.Title>Title</AlertDialog.Title>
          <span data-testid="overlay" />
        </AlertDialog.Content>
      </AlertDialog.Root>
    )

    expect(screen.getByTestId('overlay').closest('.liebe-portal-host')).toBe(host())
  })

  it('mounts a DropdownMenu and its submenu in the host', () => {
    renderInHost(
      <DropdownMenu.Root open>
        <DropdownMenu.Trigger>
          <button>open</button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <span data-testid="overlay" />
          <DropdownMenu.Sub open>
            <DropdownMenu.SubTrigger>more</DropdownMenu.SubTrigger>
            <DropdownMenu.SubContent>
              <span data-testid="sub-overlay" />
            </DropdownMenu.SubContent>
          </DropdownMenu.Sub>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    )

    expect(screen.getByTestId('overlay').closest('.liebe-portal-host')).toBe(host())
    expect(screen.getByTestId('sub-overlay').closest('.liebe-portal-host')).toBe(host())
  })

  it('mounts a Select in the host', () => {
    renderInHost(
      <Select.Root open value="a">
        <Select.Trigger />
        {/*
         * The marker goes on the content rather than inside it: Select renders
         * a hidden native `<select>` mirroring its items, so an item-level
         * testid matches twice and neither match is the portalled one.
         */}
        <Select.Content data-testid="overlay">
          <Select.Item value="a">A</Select.Item>
        </Select.Content>
      </Select.Root>
    )

    expect(screen.getByTestId('overlay').closest('.liebe-portal-host')).toBe(host())
  })

  it('mounts a Popover in the host', () => {
    renderInHost(
      <Popover.Root open>
        <Popover.Trigger>
          <button>open</button>
        </Popover.Trigger>
        <Popover.Content>
          <span data-testid="overlay" />
        </Popover.Content>
      </Popover.Root>
    )

    expect(screen.getByTestId('overlay').closest('.liebe-portal-host')).toBe(host())
  })

  it('mounts a ContextMenu and its submenu in the host', () => {
    // No call site in the panel yet. Wrapped and asserted anyway, because
    // `~/components/ui` re-exports the whole Radix library: an unwrapped
    // portalling component stays reachable through the barrel that everything
    // else is told to import from.
    renderInHost(
      <ContextMenu.Root>
        <ContextMenu.Trigger>
          <button>open</button>
        </ContextMenu.Trigger>
        <ContextMenu.Content forceMount data-testid="overlay">
          <ContextMenu.Sub open>
            <ContextMenu.SubTrigger>more</ContextMenu.SubTrigger>
            <ContextMenu.SubContent forceMount data-testid="sub-overlay" />
          </ContextMenu.Sub>
        </ContextMenu.Content>
      </ContextMenu.Root>
    )

    expect(screen.getByTestId('overlay').closest('.liebe-portal-host')).toBe(host())
    expect(screen.getByTestId('sub-overlay').closest('.liebe-portal-host')).toBe(host())
  })

  it('mounts a HoverCard in the host', () => {
    renderInHost(
      <HoverCard.Root open>
        <HoverCard.Trigger>
          <button>hover</button>
        </HoverCard.Trigger>
        <HoverCard.Content data-testid="overlay" />
      </HoverCard.Root>
    )

    expect(screen.getByTestId('overlay').closest('.liebe-portal-host')).toBe(host())
  })

  it('mounts a Tooltip in the host', () => {
    renderInHost(
      // On the content element for the same reason as Select: Radix renders a
      // visually hidden copy of the tip for assistive technology.
      <Tooltip open content="Tip" data-testid="overlay">
        <button>hover</button>
      </Tooltip>
    )

    expect(screen.getByTestId('overlay').closest('.liebe-portal-host')).toBe(host())
  })

  it('lets an explicit container win, for content that must land elsewhere', () => {
    const elsewhere = document.createElement('div')
    document.body.appendChild(elsewhere)

    try {
      renderInHost(
        <Dialog.Root open>
          <Dialog.Content container={elsewhere}>
            <Dialog.Title>Title</Dialog.Title>
            <span data-testid="overlay" />
          </Dialog.Content>
        </Dialog.Root>
      )

      expect(elsewhere.contains(screen.getByTestId('overlay'))).toBe(true)
    } finally {
      elsewhere.remove()
    }
  })

  it('falls back to the Radix default with no host above it', () => {
    // The path the whole panel is on today, so this is the assertion that says
    // these wrappers changed no behaviour: no host, no container prop, and the
    // overlay lands where Radix would have put it anyway.
    render(
      <Theme>
        <Dialog.Root open>
          <Dialog.Content>
            <Dialog.Title>Title</Dialog.Title>
            <span data-testid="overlay" />
          </Dialog.Content>
        </Dialog.Root>
      </Theme>
    )

    expect(document.querySelector('.liebe-portal-host')).toBeNull()
    expect(screen.getByTestId('overlay')).toBeTruthy()
  })
})
