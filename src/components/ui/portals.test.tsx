import { describe, expect, it, vi } from 'vitest'
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
  portalMountPoint,
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
 * DESCENDANT OF THE `liebe-portal-root` CONTAINER.
 *
 * What these CANNOT show is the half only a real Home Assistant frontend can:
 * the container is what it is because the panel sits several shadow roots deep
 * there, and jsdom puts everything one level under `document.body`. The e2e
 * theming specs own that half.
 */
function host(): HTMLElement {
  const found = document.querySelector('.liebe-portal-root')
  if (!found) throw new Error('no portal container rendered')
  return found as HTMLElement
}

function renderInHost(ui: React.ReactNode) {
  // A `Theme` around the host, because Radix's Tooltip needs the provider the
  // theme root renders — and because it is what the panel does.
  return render(
    <Theme>
      <PortalHost themeId="default" appearance="dark">
        {ui}
      </PortalHost>
    </Theme>
  )
}

describe('portalMountPoint', () => {
  it('is the document body', () => {
    expect(portalMountPoint()).toBe(document.body)
  })

  it('is nothing outside a document, so a DOM-less render does not throw', () => {
    // A prerender pass has no `document`, and reading the global would take the
    // render down rather than simply leaving the overlay to Radix's default.
    // Both callers — the container below and `FullscreenModal`'s fallback —
    // route through here so the case is decided once.
    vi.stubGlobal('document', undefined)
    try {
      expect(portalMountPoint()).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('PortalHost', () => {
  it('publishes the container element it mounts', () => {
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

  it('mounts the container at the document level, where hideOthers can resolve it', () => {
    // The whole reason the container is here and not in the shadow root: Radix's
    // modal overlays reconcile their target against `document.body` and climb
    // only to the first shadow host, which in Home Assistant is not enough.
    renderInHost(<span />)

    expect(host().parentElement).toBe(document.body)
  })

  it('is itself a Radix theme root carrying liebe-root, so overlays inherit the tokens', () => {
    // Both halves are load-bearing and fail differently: without `liebe-root`
    // the container declares no `--liebe-*` at all, and without `radix-themes`
    // every one of them that aliases a Radix variable computes to nothing.
    renderInHost(<span />)

    expect(host().classList.contains('liebe-root')).toBe(true)
    expect(host().classList.contains('radix-themes')).toBe(true)
  })

  it('is a nested theme, so it establishes no stacking context', () => {
    // Radix gives `position: relative; z-index: 0; min-height: 100vh` to the
    // ROOT theme only. A stacking context here would cap a full-viewport overlay
    // below Home Assistant's chrome (docs/changes/0008-…), which is why the
    // container is rendered inside the provider's theme rather than beside it.
    renderInHost(<span />)

    expect(host().getAttribute('data-is-root-theme')).toBe('false')
  })

  it('carries the same stamps as the panel root, so scoped theme rules reach an overlay', () => {
    renderInHost(<span />)

    expect(host().getAttribute('data-liebe-theme')).toBe('default')
    expect(host().getAttribute('data-appearance')).toBe('dark')
  })

  it("stamps the panel's instance token, so a keyed mirror matches only its own overlays", () => {
    // The scope half of the two-panel keying (change 0036 PR 7): the mirror
    // slots carry `data-liebe-instance` per panel, and the container carries
    // the same token, so one panel's keyed sheets match only its own
    // container. Generated per mount when no explicit token is passed —
    // stable across re-renders, unique across trees.
    const { rerender } = renderInHost(<span />)

    const token = host().getAttribute('data-liebe-instance')
    expect(token).toBeTruthy()

    // Rerender the ORIGINAL tree: a second mount would mint a second token,
    // so only re-driving the same host proves stability rather than
    // coincidence.
    rerender(
      <Theme>
        <PortalHost themeId="default" appearance="dark">
          <span />
        </PortalHost>
      </Theme>
    )
    expect(host().getAttribute('data-liebe-instance')).toBe(token)
  })

  it('stamps an explicit instance token when one is passed', () => {
    render(
      <Theme>
        <PortalHost themeId="default" appearance="dark" instance="panel-a">
          <span />
        </PortalHost>
      </Theme>
    )

    expect(host().getAttribute('data-liebe-instance')).toBe('panel-a')
  })
  it('leaves the container empty, so React never reconciles portalled content away', () => {
    renderInHost(<span data-testid="child" />)

    expect(screen.getByTestId('child').closest('.liebe-portal-root')).toBeNull()
    expect(host().childNodes).toHaveLength(0)
  })

  it('takes the container out of the document when the tree unmounts', () => {
    const { unmount } = renderInHost(<span />)
    expect(document.querySelector('.liebe-portal-root')).not.toBeNull()

    unmount()

    expect(document.querySelector('.liebe-portal-root')).toBeNull()
  })
})

describe('portalled overlays', () => {
  it('mounts a Dialog in the container', () => {
    renderInHost(
      <Dialog.Root open>
        <Dialog.Content>
          <Dialog.Title>Title</Dialog.Title>
          <span data-testid="overlay" />
        </Dialog.Content>
      </Dialog.Root>
    )

    expect(screen.getByTestId('overlay').closest('.liebe-portal-root')).toBe(host())
  })

  it('mounts an AlertDialog in the container', () => {
    renderInHost(
      <AlertDialog.Root open>
        <AlertDialog.Content>
          <AlertDialog.Title>Title</AlertDialog.Title>
          <span data-testid="overlay" />
        </AlertDialog.Content>
      </AlertDialog.Root>
    )

    expect(screen.getByTestId('overlay').closest('.liebe-portal-root')).toBe(host())
  })

  it('mounts a DropdownMenu and its submenu in the container', () => {
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

    expect(screen.getByTestId('overlay').closest('.liebe-portal-root')).toBe(host())
    expect(screen.getByTestId('sub-overlay').closest('.liebe-portal-root')).toBe(host())
  })

  it('mounts a Select in the container', () => {
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

    expect(screen.getByTestId('overlay').closest('.liebe-portal-root')).toBe(host())
  })

  it('mounts a Popover in the container', () => {
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

    expect(screen.getByTestId('overlay').closest('.liebe-portal-root')).toBe(host())
  })

  it('mounts a ContextMenu and its submenu in the container', () => {
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

    expect(screen.getByTestId('overlay').closest('.liebe-portal-root')).toBe(host())
    expect(screen.getByTestId('sub-overlay').closest('.liebe-portal-root')).toBe(host())
  })

  it('mounts a HoverCard in the container', () => {
    renderInHost(
      <HoverCard.Root open>
        <HoverCard.Trigger>
          <button>hover</button>
        </HoverCard.Trigger>
        <HoverCard.Content data-testid="overlay" />
      </HoverCard.Root>
    )

    expect(screen.getByTestId('overlay').closest('.liebe-portal-root')).toBe(host())
  })

  it('mounts a Tooltip in the container', () => {
    renderInHost(
      // On the content element for the same reason as Select: Radix renders a
      // visually hidden copy of the tip for assistive technology.
      <Tooltip open content="Tip" data-testid="overlay">
        <button>hover</button>
      </Tooltip>
    )

    expect(screen.getByTestId('overlay').closest('.liebe-portal-root')).toBe(host())
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
    // A tree rendered outside `LiebeThemeProvider` — a bare story, a unit test —
    // has no container above it, and must still render its overlay where Radix
    // would have put it.
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

    expect(document.querySelector('.liebe-portal-root')).toBeNull()
    expect(screen.getByTestId('overlay')).toBeTruthy()
  })
})
