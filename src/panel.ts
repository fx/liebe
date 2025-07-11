import React from 'react'
import ReactDOM from 'react-dom/client'
import { HomeAssistantProvider } from './contexts/HomeAssistantContext'
import { PanelApp } from './components/PanelApp'
import { getPanelConfig } from './config/panel'
import type { HomeAssistant } from './contexts/HomeAssistantContext'

// Type fix for React.createElement
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Provider = HomeAssistantProvider as any

// Import styles
import '@radix-ui/themes/styles.css'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import '~/styles/app.css'

class LiebePanel extends HTMLElement {
  private _hass: HomeAssistant | null = null
  private root?: ReactDOM.Root
  private initialized = false
  private instanceId = Math.random().toString(36).substr(2, 9)
  private visibilityHandler?: () => void
  private beforeUnloadHandler?: () => void
  private keepAliveInterval?: number
  private lastInteraction = Date.now()
  private parentObserver?: MutationObserver

  constructor() {
    super()
    console.log(`[Liebe Panel ${this.instanceId}] Constructor called`)

    // Prevent panel from being garbage collected
    ;(window as unknown as { __liebePanel?: LiebePanel }).__liebePanel = this

    // Set up mutation observer to detect removal attempts
    this.setupParentObserver()
  }

  set hass(hass: HomeAssistant) {
    console.log(`[Liebe Panel ${this.instanceId}] hass setter called`, {
      hasHass: !!hass,
      initialized: this.initialized,
      connected: this.isConnected,
    })
    this._hass = hass
    this.render()
  }

  connectedCallback() {
    console.log(`[Liebe Panel ${this.instanceId}] connectedCallback called`, {
      initialized: this.initialized,
      hasHass: !!this._hass,
      isConnected: this.isConnected,
      hasShadowRoot: !!this.shadowRoot,
    })

    // Check if we need to re-initialize (e.g., if shadow root was lost)
    const needsInit = !this.initialized || !this.shadowRoot || !this.root

    if (needsInit) {
      console.log(`[Liebe Panel ${this.instanceId}] Initializing/Re-initializing panel`)
      this.initialized = true

      // Create or get shadow root
      const shadow = this.shadowRoot || this.attachShadow({ mode: 'open' })

      // Clear shadow root if re-initializing
      if (this.shadowRoot && shadow.childNodes.length > 0) {
        shadow.innerHTML = ''
      }

      const container = document.createElement('div')
      container.style.height = '100%'
      shadow.appendChild(container)

      // Load CSS
      const script = document.currentScript || document.querySelector('script[src*="panel.js"]')
      if (script && 'src' in script) {
        const cssUrl = new URL(script.src).href.replace(/panel\.js$/, 'liebe.css')
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = cssUrl
        shadow.appendChild(link)

        // For Radix UI portals
        if (!document.querySelector(`link[href="${cssUrl}"]`)) {
          const globalLink = link.cloneNode() as HTMLLinkElement
          document.head.appendChild(globalLink)
        }
      }

      this.root = ReactDOM.createRoot(container)

      // Track visibility changes
      this.visibilityHandler = () => {
        console.log(`[Liebe Panel ${this.instanceId}] Visibility changed`, {
          hidden: document.hidden,
          visibilityState: document.visibilityState,
          timestamp: new Date().toISOString(),
        })

        // Update interaction time when page becomes visible
        if (!document.hidden) {
          this.lastInteraction = Date.now()
          this.startKeepAlive()
        }
      }
      document.addEventListener('visibilitychange', this.visibilityHandler)

      // Track page unload
      this.beforeUnloadHandler = () => {
        console.log(`[Liebe Panel ${this.instanceId}] Page unloading`)
      }
      window.addEventListener('beforeunload', this.beforeUnloadHandler)

      // Start keep-alive mechanism
      this.startKeepAlive()
    }

    // Set up parent observer if not already set
    if (!this.parentObserver && this.parentNode) {
      this.setupParentObserver()
    }

    this.render()
  }

  disconnectedCallback() {
    console.log(`[Liebe Panel ${this.instanceId}] disconnectedCallback called`, {
      initialized: this.initialized,
      hasHass: !!this._hass,
      timestamp: new Date().toISOString(),
      documentHidden: document.hidden,
      visibilityState: document.visibilityState,
      timeSinceLastInteraction: Date.now() - this.lastInteraction,
    })

    // Stop keep-alive when disconnected
    this.stopKeepAlive()

    // Clean up parent observer
    this.cleanupParentObserver()

    // Do NOT unmount or cleanup React - Home Assistant will re-add this element
    // when the user navigates back to the panel
  }

  private startKeepAlive() {
    // Clear any existing interval
    this.stopKeepAlive()

    // Set up a keep-alive mechanism that periodically touches the DOM
    // to prevent Home Assistant from removing the panel
    this.keepAliveInterval = window.setInterval(() => {
      if (this.isConnected) {
        // Touch a DOM property to keep the element "active"
        void this.offsetHeight

        // Periodically re-render if we have hass object
        if (this._hass && this.root) {
          const timeSinceInteraction = Date.now() - this.lastInteraction
          // Only re-render if page has been inactive for more than 5 minutes
          if (timeSinceInteraction > 5 * 60 * 1000) {
            console.log(`[Liebe Panel ${this.instanceId}] Keep-alive render triggered`)
            this.render()
            this.lastInteraction = Date.now()
          }
        }
      }
    }, 30000) // Check every 30 seconds
  }

  private stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval)
      this.keepAliveInterval = undefined
    }
  }

  private setupParentObserver() {
    // Watch for removal from parent
    this.parentObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
          mutation.removedNodes.forEach((node) => {
            if (node === this) {
              console.log(
                `[Liebe Panel ${this.instanceId}] Detected removal from parent, attempting to prevent`
              )
              // If we're being removed and we have a parent, try to add ourselves back
              if (mutation.target && this._hass) {
                setTimeout(() => {
                  if (!this.isConnected && mutation.target) {
                    console.log(`[Liebe Panel ${this.instanceId}] Re-adding panel to parent`)
                    mutation.target.appendChild(this)
                  }
                }, 0)
              }
            }
          })
        }
      })
    })

    // Start observing when we have a parent
    if (this.parentNode) {
      this.parentObserver.observe(this.parentNode, { childList: true })
    }
  }

  private cleanupParentObserver() {
    if (this.parentObserver) {
      this.parentObserver.disconnect()
      this.parentObserver = undefined
    }
  }

  private render() {
    console.log(`[Liebe Panel ${this.instanceId}] render called`, {
      hasRoot: !!this.root,
      hasHass: !!this._hass,
      initialized: this.initialized,
    })

    if (!this.root || !this._hass) return

    try {
      this.root.render(
        React.createElement(
          React.StrictMode,
          null,
          React.createElement(Provider, { hass: this._hass }, React.createElement(PanelApp))
        )
      )
    } catch (error) {
      console.error(`[Liebe Panel ${this.instanceId}] Render error:`, error)
    }
  }
}

// Register custom element with environment-specific name
const panelConfig = getPanelConfig()
customElements.define(panelConfig.elementName, LiebePanel)
