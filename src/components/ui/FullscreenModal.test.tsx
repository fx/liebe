import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, renderHook, act } from '@testing-library/react'
import {
  FullscreenModal,
  resolvePanelPortalContainer,
  usePanelPortalContainer,
} from './FullscreenModal'

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

  it('portals into document.body by default', () => {
    render(
      <FullscreenModal open onClose={() => {}} includeTheme={false}>
        <span data-testid="modal-content">hi</span>
      </FullscreenModal>
    )
    const content = document.querySelector('[data-testid="modal-content"]')
    expect(content).not.toBeNull()
    expect(content?.closest('body')).toBe(document.body)
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

describe('resolvePanelPortalContainer', () => {
  it('returns document.body for null', () => {
    expect(resolvePanelPortalContainer(null)).toBe(document.body)
  })

  it('returns document.body for a light-DOM element', () => {
    const el = document.createElement('span')
    document.body.appendChild(el)
    try {
      expect(resolvePanelPortalContainer(el)).toBe(document.body)
    } finally {
      el.remove()
    }
  })

  it('returns the React root container div inside the panel shadow root', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    try {
      const shadow = host.attachShadow({ mode: 'open' })
      // Mirrors panel.ts: a container <div> is the React mount point.
      const container = document.createElement('div')
      shadow.appendChild(container)
      const inner = document.createElement('span')
      container.appendChild(inner)
      expect(resolvePanelPortalContainer(inner)).toBe(container)
    } finally {
      host.remove()
    }
  })

  it('prefers the data-liebe-root tagged container over the first div', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    try {
      const shadow = host.attachShadow({ mode: 'open' })
      // An untagged div (e.g. an injected style host) precedes the tagged
      // React root, mirroring the panel.ts contract.
      shadow.appendChild(document.createElement('div'))
      const tagged = document.createElement('div')
      tagged.setAttribute('data-liebe-root', '')
      shadow.appendChild(tagged)
      const inner = document.createElement('span')
      tagged.appendChild(inner)
      expect(resolvePanelPortalContainer(inner)).toBe(tagged)
    } finally {
      host.remove()
    }
  })

  it('falls back to document.body when the shadow root has no div container', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    try {
      const shadow = host.attachShadow({ mode: 'open' })
      const inner = document.createElement('span')
      shadow.appendChild(inner)
      expect(resolvePanelPortalContainer(inner)).toBe(document.body)
    } finally {
      host.remove()
    }
  })
})

describe('usePanelPortalContainer', () => {
  it('resolves the container once the callback ref receives an element', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    try {
      const shadow = host.attachShadow({ mode: 'open' })
      const root = document.createElement('div')
      root.setAttribute('data-liebe-root', '')
      shadow.appendChild(root)
      const inner = document.createElement('span')
      root.appendChild(inner)

      const { result } = renderHook(() => usePanelPortalContainer())
      expect(result.current.container).toBeUndefined()

      act(() => result.current.ref(inner))
      expect(result.current.container).toBe(root)

      // Detach (null ref) keeps the last resolved container.
      act(() => result.current.ref(null))
      expect(result.current.container).toBe(root)
    } finally {
      host.remove()
    }
  })
})
