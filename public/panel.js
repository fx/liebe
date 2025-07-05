// Bridge for Home Assistant custom panel integration
// This file allows running Liebe from any external URL (localhost or remote server)

class LiebePanel extends HTMLElement {
  constructor() {
    super()
    this._hass = null
    this.iframe = null
    this.stateChangeUnsubscribe = null
    this.messageHandlers = new Map()
    this.messageId = 0
    
    // Extract initial route from current URL
    const pathParts = window.location.pathname.split('/')
    if (pathParts.length > 2) {
      // Remove the first part (empty) and second part (liebe)
      this._currentRoute = '/' + pathParts.slice(2).join('/')
    } else {
      this._currentRoute = '/'
    }
  }

  set hass(hass) {
    this._hass = hass
    if (!this.iframe) {
      this.render()
    } else {
      // Only send if iframe already exists
      this.sendHassToIframe()
    }
    
    // Subscribe to state changes
    this.subscribeToStateChanges()
  }

  set panel(panel) {
    this._panel = panel
  }

  set route(route) {
    this._route = route
    if (this.iframe && this.iframe.contentWindow) {
      try {
        this.iframe.contentWindow.postMessage(
          { type: 'navigate-to', path: route },
          '*'
        )
      } catch (error) {
        console.error('Failed to send route to iframe:', error)
      }
    }
  }

  connectedCallback() {
    this.render()
  }

  render() {
    this.innerHTML = ''
    
    // Create iframe that loads the app from the correct origin
    this.iframe = document.createElement('iframe')
    // Get the script's src to determine where we're hosted
    const currentScript = document.currentScript || document.querySelector('script[src*="panel.js"]')
    const scriptUrl = new URL(currentScript.src)
    // Use the script's origin as the iframe source
    this.iframe.src = scriptUrl.origin
    this.iframe.style.width = '100%'
    this.iframe.style.height = '100%'
    this.iframe.style.border = 'none'
    this.iframe.style.display = 'block'
    
    this.appendChild(this.iframe)

    // Listen for messages from iframe
    window.addEventListener('message', this.handleMessage.bind(this))

    // Send initial hass object once iframe loads
    this.iframe.addEventListener('load', () => {
      this.sendHassToIframe()
      
      // The iframe app will request the route when it's ready
    })
  }

  sendHassToIframe() {
    if (this.iframe && this.iframe.contentWindow && this._hass) {
      try {
        // Create a serializable version of hass
        const hassData = {
          states: this._hass.states,
          services: this._hass.services,
          config: this._hass.config,
          user: this._hass.user,
          panels: this._hass.panels,
          language: this._hass.language,
          selectedLanguage: this._hass.selectedLanguage,
          themes: this._hass.themes,
          selectedTheme: this._hass.selectedTheme,
          // Include connection info
          auth: {
            data: {
              hassUrl: this._hass.auth.data.hassUrl
            }
          }
        }

        this.iframe.contentWindow.postMessage(
          { type: 'hass-update', hass: hassData },
          '*'
        )
      } catch (error) {
        console.error('Failed to send hass to iframe:', error)
      }
    }
  }

  /**
   * Creates a promise-based WebSocket message handler
   * @param {number} id - The message ID
   * @returns {Promise} A promise that resolves with the response
   */
  createMessagePromise(id) {
    return new Promise((resolve, reject) => {
      // Set a timeout to prevent hanging promises
      const timeout = setTimeout(() => {
        this.messageHandlers.delete(id)
        reject(new Error('WebSocket message timeout'))
      }, 30000) // 30 second timeout

      this.messageHandlers.set(id, {
        resolve: (response) => {
          clearTimeout(timeout)
          this.messageHandlers.delete(id)
          resolve(response)
        },
        reject: (error) => {
          clearTimeout(timeout)
          this.messageHandlers.delete(id)
          reject(error)
        }
      })
    })
  }

  handleMessage(event) {
    // Ignore messages without a type (not from our app)
    if (!event.data || !event.data.type) {
      return
    }
    
    // Get the expected origin from the iframe
    let expectedOrigin = null
    try {
      expectedOrigin = new URL(this.iframe.src).origin
    } catch (e) {
      console.error('[Panel] Failed to parse iframe URL:', e)
    }
    
    // Check if the message is from our iframe
    // In some cases, event.source might not match exactly due to cross-origin restrictions
    // So we also check the origin
    const isFromOurIframe = event.source === this.iframe.contentWindow || 
                           (expectedOrigin && event.origin === expectedOrigin)
    
    if (!isFromOurIframe) {
      // Silently ignore messages from non-iframe sources
      return
    }

    if (event.data.type === 'call-service') {
      const { domain, service, serviceData } = event.data
      this._hass.callService(domain, service, serviceData)
        .then(() => {
          event.source.postMessage(
            { type: 'service-response', success: true, id: event.data.id },
            '*'
          )
        })
        .catch((error) => {
          event.source.postMessage(
            { type: 'service-response', success: false, error: error.message, id: event.data.id },
            '*'
          )
        })
    } else if (event.data.type === 'websocket-message') {
      // Handle WebSocket messages with robust error handling
      const { message, id } = event.data
      
      // Check if we have all required components
      if (!this._hass) {
        event.source.postMessage(
          { type: 'websocket-response', success: false, error: 'No hass object available', id },
          '*'
        )
        return
      }

      if (!this._hass.connection) {
        event.source.postMessage(
          { type: 'websocket-response', success: false, error: 'No connection available', id },
          '*'
        )
        return
      }

      if (!this._hass.connection.sendMessagePromise) {
        event.source.postMessage(
          { type: 'websocket-response', success: false, error: 'No sendMessagePromise method available', id },
          '*'
        )
        return
      }
      
      // Send the message and handle the response
      this._hass.connection.sendMessagePromise(message)
        .then((response) => {
          event.source.postMessage(
            { type: 'websocket-response', success: true, response, id },
            '*'
          )
        })
        .catch((error) => {
          // Send detailed error information
          const errorMessage = error?.message || error?.toString() || 'Unknown error'
          const errorDetails = {
            message: errorMessage,
            code: error?.code,
            type: error?.type,
            stack: error?.stack
          }
          event.source.postMessage(
            { type: 'websocket-response', success: false, error: errorMessage, errorDetails, id },
            '*'
          )
        })
    } else if (event.data.type === 'get-hass') {
      // Iframe app is requesting the hass object
      this.sendHassToIframe()
    } else if (event.data.type === 'get-route') {
      // Iframe app is requesting the current route
      event.source.postMessage(
        { type: 'navigate-to', path: this._currentRoute },
        '*'
      )
    } else if (event.data.type === 'route-change') {
      // Handle route changes within the panel
      const path = event.data.path
      if (path) {
        // Store the sub-route in the panel's state
        this._currentRoute = path
        
        // Update URL without triggering Home Assistant navigation
        // Get the base path (should be /liebe)
        const pathParts = window.location.pathname.split('/')
        const basePath = '/' + pathParts[1]
        
        // Create the new path
        const newPath = path === '/' ? basePath : basePath + path
        
        // Use replaceState to avoid adding to history
        history.replaceState({ panelRoute: path }, '', newPath)
        
        // Don't dispatch location-changed event for sub-routes
        // This prevents Home Assistant from trying to load non-existent panels
      }
    }
  }

  subscribeToStateChanges() {
    // Unsubscribe from previous subscription if any
    if (this.stateChangeUnsubscribe && typeof this.stateChangeUnsubscribe === 'function') {
      this.stateChangeUnsubscribe()
      this.stateChangeUnsubscribe = null
    }

    // Subscribe to state changes if we have a connection
    if (this._hass && this._hass.connection) {
      try {
        this.stateChangeUnsubscribe = this._hass.connection.subscribeEvents(
          (event) => {
            // Forward state change events to iframe
            if (this.iframe && this.iframe.contentWindow) {
              try {
                this.iframe.contentWindow.postMessage(
                  { type: 'state-changed', event },
                  '*'
                )
              } catch (error) {
                console.error('Failed to forward state change:', error)
              }
            }
          },
          'state_changed'
        )
      } catch (error) {
        console.error('Failed to subscribe to state changes:', error)
      }
    }
  }

  disconnectedCallback() {
    window.removeEventListener('message', this.handleMessage.bind(this))
    
    // Unsubscribe from state changes
    if (this.stateChangeUnsubscribe && typeof this.stateChangeUnsubscribe === 'function') {
      this.stateChangeUnsubscribe()
      this.stateChangeUnsubscribe = null
    }

    // Clean up any pending message handlers
    for (const [id, handler] of this.messageHandlers) {
      handler.reject(new Error('Panel disconnected'))
    }
    this.messageHandlers.clear()
  }
}

customElements.define('liebe-panel', LiebePanel)