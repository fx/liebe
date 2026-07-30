import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { FullscreenModal } from './FullscreenModal'
import { PortalHost } from './portals'

describe('FullscreenModal portal target', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders nothing when closed', () => {
    render(
      <FullscreenModal open={false} onClose={() => {}}>
        <span data-testid="modal-content">hi</span>
      </FullscreenModal>
    )
    expect(document.querySelector('[data-testid="modal-content"]')).toBeNull()
  })

  it('portals into document.body when there is no portal host above it', () => {
    render(
      <FullscreenModal open onClose={() => {}} includeTheme={false}>
        <span data-testid="modal-content">hi</span>
      </FullscreenModal>
    )
    const content = document.querySelector('[data-testid="modal-content"]')
    expect(content).not.toBeNull()
    expect(content?.closest('body')).toBe(document.body)
  })

  it('portals into the panel portal host when one is above it', () => {
    // What `LiebeThemeProvider` puts inside the theme root: the entity browser
    // opens through this modal, and outside that host it would render without
    // the theme and user layers the panel injects into its shadow root
    // (docs/specs/theming — "Portalled UI MUST stay inside the token scope").
    render(
      <PortalHost>
        <FullscreenModal open onClose={() => {}} includeTheme={false}>
          <span data-testid="modal-content">hi</span>
        </FullscreenModal>
      </PortalHost>
    )
    const content = document.querySelector('[data-testid="modal-content"]')
    expect(content?.closest('.liebe-portal-host')).not.toBeNull()
  })

  it('wraps content in the Radix Theme by default', () => {
    render(
      <FullscreenModal open onClose={() => {}}>
        <span data-testid="modal-content">hi</span>
      </FullscreenModal>
    )
    const content = document.querySelector('[data-testid="modal-content"]')
    expect(content?.closest('.radix-themes')).not.toBeNull()
  })

  it('portals into a custom portalContainer when provided', () => {
    const container = document.createElement('div')
    container.id = 'custom-portal-target'
    document.body.appendChild(container)
    try {
      render(
        <FullscreenModal open onClose={() => {}} includeTheme={false} portalContainer={container}>
          <span data-testid="modal-content">hi</span>
        </FullscreenModal>
      )
      const content = document.querySelector('[data-testid="modal-content"]')
      expect(content).not.toBeNull()
      expect(content?.closest('#custom-portal-target')).toBe(container)
    } finally {
      container.remove()
    }
  })
  it('closes on Escape but not on other keys', () => {
    const onClose = vi.fn()
    render(
      <FullscreenModal open onClose={onClose} includeTheme={false}>
        <span data-testid="modal-content">hi</span>
      </FullscreenModal>
    )
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores Escape and backdrop clicks when disabled', () => {
    const onClose = vi.fn()
    render(
      <FullscreenModal
        open
        onClose={onClose}
        includeTheme={false}
        closeOnEsc={false}
        closeOnBackdropClick={false}
      >
        <span data-testid="modal-content">hi</span>
      </FullscreenModal>
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    const content = document.querySelector('[data-testid="modal-content"]') as Element
    fireEvent.click(content.parentElement!.parentElement!)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on backdrop click but not on content click', () => {
    const onClose = vi.fn()
    render(
      <FullscreenModal open onClose={onClose} includeTheme={false}>
        <span data-testid="modal-content">hi</span>
      </FullscreenModal>
    )
    const content = document.querySelector('[data-testid="modal-content"]') as Element
    fireEvent.click(content)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(content.parentElement!.parentElement!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
