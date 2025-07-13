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
  _hass: HomeAssistant | null = null
  private root?: ReactDOM.Root
  private initialized = false
  private instanceId = Math.random().toString(36).substr(2, 9)
  private visibilityHandler?: () => void
  private beforeUnloadHandler?: () => void
  private keepAliveInterval?: number
  private lastInteraction = Date.now()
  private parentObserver?: MutationObserver
  private reconnectCheckInterval?: number
  private lastParentElement?: Element | null
  connectionCheckInterval?: number
  lastEntityUpdateTime = Date.now()
  lastStaleEventTime = 0

  constructor() {
    super()
    console.log(`[Liebe Panel ${this.instanceId}] Constructor called`)

    // Prevent panel from being garbage collected
    ;(window as unknown as { __liebePanel?: LiebePanel }).__liebePanel = this

    // Override remove method to prevent removal
    const originalRemove = this.remove
    this.remove = () => {
      console.log(`[Liebe Panel ${this.instanceId}] remove() called - ignoring if we have hass`)
      if (!this._hass) {
        originalRemove.call(this)
      }
    }

    // Set up mutation observer to detect removal attempts
    this.setupParentObserver()
  }

  set hass(hass: HomeAssistant) {
    console.log(`[Liebe Panel ${this.instanceId}] hass setter called`, {
      hasHass: !!hass,
      initialized: this.initialized,
      connected: this.isConnected,
    })

    // Check if this is a significant update after being stale
    const wasStale = this._hass && Date.now() - this.lastEntityUpdateTime > 120000

    this._hass = hass

    // Track that we received an update
    this.lastEntityUpdateTime = Date.now()

    // If we were stale and now getting updates again, force a full re-render
    if (wasStale) {
      console.log(
        `[Liebe Panel ${this.instanceId}] Received update after being stale, forcing full re-render`
      )
      // Clear and recreate the React root to ensure fresh state
      if (this.root && this.shadowRoot) {
        const container = this.shadowRoot.querySelector('div')
        if (container) {
          this.root.unmount()
          this.root = ReactDOM.createRoot(container)
        }
      }
    }

    this.render()
  }

  startConnectionHealthCheck() {
    // Clear any existing interval
    this.stopConnectionHealthCheck()

    // Monitor connection health by checking if we're receiving updates
    this.connectionCheckInterval = window.setInterval(() => {
      const timeSinceLastUpdate = Date.now() - this.lastEntityUpdateTime
      const connectionTimeout = 60000 // 1 minute

      if (timeSinceLastUpdate > connectionTimeout && this._hass && !document.hidden) {
        console.log(
          `[Liebe Panel ${this.instanceId}] Connection health check: No updates for ${Math.round(
            timeSinceLastUpdate / 1000
          )}s, attempting to restore connection`
        )

        // Try to trigger a reconnection by calling a service or getting states
        if (this._hass.connection && this._hass.connection.socket) {
          // Check if socket is actually connected
          const socket = this._hass.connection.socket as WebSocket
          if (socket.readyState !== WebSocket.OPEN) {
            console.log(
              `[Liebe Panel ${this.instanceId}] WebSocket is not open, triggering reconnect`
            )

            // Try to reconnect by getting current states
            if (this._hass.callWS) {
              this._hass
                .callWS({ type: 'get_states' })
                .then(() => {
                  console.log(`[Liebe Panel ${this.instanceId}] Successfully refreshed states`)
                  this.lastEntityUpdateTime = Date.now()

                  // Dispatch stale connection event when WebSocket is disconnected (debounced)
                  const timeSinceLastStaleEvent = Date.now() - this.lastStaleEventTime
                  if (timeSinceLastStaleEvent > 30000) {
                    // Only dispatch once every 30 seconds
                    this.lastStaleEventTime = Date.now()
                    this.dispatchEvent(
                      new CustomEvent('liebe-connection-stale', {
                        detail: { instanceId: this.instanceId },
                        bubbles: true,
                        composed: true,
                      })
                    )
                  }
                })
                .catch((error: Error) => {
                  console.error(`[Liebe Panel ${this.instanceId}] Failed to refresh states:`, error)
                  // Try to force a page reload as last resort
                  if (timeSinceLastUpdate > 120000) {
                    // 2 minutes
                    console.log(
                      `[Liebe Panel ${this.instanceId}] Forcing page reload to restore connection`
                    )
                    window.location.reload()
                  }
                })
            }
          } else {
            // Socket is open but we're not getting updates, try to ping
            console.log(`[Liebe Panel ${this.instanceId}] WebSocket open but stale, sending ping`)

            // Dispatch stale connection event to force WebRTC reconnection (debounced)
            const timeSinceLastStaleEvent = Date.now() - this.lastStaleEventTime
            if (timeSinceLastStaleEvent > 30000) {
              // Only dispatch once every 30 seconds
              this.lastStaleEventTime = Date.now()
              this.dispatchEvent(
                new CustomEvent('liebe-connection-stale', {
                  detail: { instanceId: this.instanceId },
                  bubbles: true,
                  composed: true,
                })
              )
            }

            if (this._hass.callWS) {
              this._hass
                .callWS({ type: 'ping' })
                .then(() => {
                  console.log(`[Liebe Panel ${this.instanceId}] Ping successful`)
                  this.lastEntityUpdateTime = Date.now()

                  // If still not getting updates after ping, force refresh states
                  setTimeout(() => {
                    const timeSinceLastUpdate = Date.now() - this.lastEntityUpdateTime
                    if (timeSinceLastUpdate > 30000) {
                      // 30 seconds
                      console.log(
                        `[Liebe Panel ${this.instanceId}] Still no updates after ping, refreshing states`
                      )
                      if (this._hass) {
                        this._hass
                          .callWS({ type: 'get_states' })
                          .then(() => {
                            console.log(`[Liebe Panel ${this.instanceId}] States refreshed`)
                            this.lastEntityUpdateTime = Date.now()
                          })
                          .catch((error: Error) => {
                            console.error(
                              `[Liebe Panel ${this.instanceId}] Failed to refresh states:`,
                              error
                            )
                          })
                      }
                    }
                  }, 5000)
                })
                .catch((error: Error) => {
                  console.error(`[Liebe Panel ${this.instanceId}] Ping failed:`, error)
                })
            }
          }
        }
      }
    }, 15000) // Check every 15 seconds
  }

  private stopConnectionHealthCheck() {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval)
      this.connectionCheckInterval = undefined
    }
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
          isConnected: this.isConnected,
        })

        // Update interaction time when page becomes visible
        if (!document.hidden) {
          this.lastInteraction = Date.now()
          this.startKeepAlive()

          // If we're not connected but should be, try to reconnect
          if (!this.isConnected && this._hass && this.lastParentElement) {
            console.log(`[Liebe Panel ${this.instanceId}] Attempting to reconnect to parent`)
            try {
              this.lastParentElement.appendChild(this)
            } catch (error) {
              console.error(`[Liebe Panel ${this.instanceId}] Failed to reconnect:`, error)
            }
          }

          // Also restart connection health check when becoming visible
          this.startConnectionHealthCheck()
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

    // Store parent element reference
    if (this.parentNode) {
      this.lastParentElement = this.parentNode as Element
    }

    // Set up parent observer if not already set
    if (!this.parentObserver && this.parentNode) {
      this.setupParentObserver()
    }

    // Start reconnect check
    this.startReconnectCheck()

    // Start connection health monitoring
    this.startConnectionHealthCheck()

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
      parentElement: this.lastParentElement?.tagName,
    })

    // Do NOT stop keep-alive or cleanup - we want to stay ready for reconnection
    // Only clean up if we're truly being destroyed (no hass object)
    if (!this._hass) {
      this.stopKeepAlive()
      this.stopReconnectCheck()
      this.stopConnectionHealthCheck()
      this.cleanupParentObserver()
    }

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
            if (
              node === this ||
              (node.nodeType === Node.ELEMENT_NODE && (node as Element).contains(this))
            ) {
              console.log(
                `[Liebe Panel ${this.instanceId}] Detected removal from parent, attempting to prevent`
              )
              // If we're being removed and we have a parent, try to add ourselves back
              if (mutation.target && this._hass) {
                // Store the parent for reconnection attempts
                this.lastParentElement = mutation.target as Element

                setTimeout(() => {
                  if (!this.isConnected && mutation.target) {
                    console.log(`[Liebe Panel ${this.instanceId}] Re-adding panel to parent`)
                    try {
                      mutation.target.appendChild(this)
                    } catch (error) {
                      console.error(
                        `[Liebe Panel ${this.instanceId}] Failed to re-add to parent:`,
                        error
                      )
                    }
                  }
                }, 0)
              }
            }
          })
        }
      })
    })

    // Observe multiple levels up the DOM tree
    if (this.parentNode) {
      this.parentObserver.observe(this.parentNode, { childList: true, subtree: true })

      // Also observe the document body for more aggressive monitoring
      if (document.body && !document.body.contains(this)) {
        this.parentObserver.observe(document.body, { childList: true, subtree: true })
      }
    }
  }

  private cleanupParentObserver() {
    if (this.parentObserver) {
      this.parentObserver.disconnect()
      this.parentObserver = undefined
    }
  }

  private startReconnectCheck() {
    // Clear any existing interval
    this.stopReconnectCheck()

    // Check periodically if we need to reconnect
    this.reconnectCheckInterval = window.setInterval(() => {
      if (!this.isConnected && this._hass && this.lastParentElement && !document.hidden) {
        console.log(`[Liebe Panel ${this.instanceId}] Reconnect check: attempting to reconnect`)

        // Try to find the panel container in Home Assistant
        const panelContainer =
          document.querySelector('partial-panel-resolver') ||
          document.querySelector('[id^="panel-"]') ||
          this.lastParentElement

        if (panelContainer && !panelContainer.contains(this)) {
          try {
            panelContainer.appendChild(this)
            console.log(
              `[Liebe Panel ${this.instanceId}] Successfully reconnected to panel container`
            )
          } catch (error) {
            console.error(
              `[Liebe Panel ${this.instanceId}] Failed to reconnect during check:`,
              error
            )
          }
        }
      }
    }, 5000) // Check every 5 seconds
  }

  private stopReconnectCheck() {
    if (this.reconnectCheckInterval) {
      clearInterval(this.reconnectCheckInterval)
      this.reconnectCheckInterval = undefined
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

// Global panel guardian - ensures panel stays connected
let globalPanelCheck: number | undefined
const startGlobalPanelGuardian = () => {
  if (globalPanelCheck) return

  globalPanelCheck = window.setInterval(() => {
    const panel = (window as unknown as { __liebePanel?: LiebePanel }).__liebePanel

    if (panel && document.visibilityState === 'visible') {
      // Check if panel is disconnected from DOM
      if (!panel.isConnected) {
        console.log(
          '[Global Panel Guardian] Panel disconnected while page visible, attempting recovery'
        )

        // Try to find where the panel should be
        const possibleContainers = [
          document.querySelector('partial-panel-resolver'),
          document.querySelector('[id^="panel-"]'),
          document.querySelector('ha-panel-iframe'),
          document.querySelector('.view'),
        ].filter(Boolean)

        for (const container of possibleContainers) {
          if (container && !container.contains(panel)) {
            try {
              container.appendChild(panel)
              console.log('[Global Panel Guardian] Successfully restored panel to container')
              break
            } catch (error) {
              // Continue trying other containers
            }
          }
        }
      }

      // Also check connection health
      const timeSinceUpdate = Date.now() - panel.lastEntityUpdateTime
      if (timeSinceUpdate > 90000 && panel._hass) {
        // 90 seconds
        console.log(
          `[Global Panel Guardian] Detected stale connection (${Math.round(timeSinceUpdate / 1000)}s since last update)`
        )

        // Try to trigger connection health check
        if (!panel.connectionCheckInterval) {
          console.log('[Global Panel Guardian] Restarting connection health check')
          panel.startConnectionHealthCheck()
        }
      }
    }
  }, 10000) // Check every 10 seconds
}

// Start the guardian
startGlobalPanelGuardian()
