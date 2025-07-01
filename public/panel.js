// Bridge for Home Assistant custom panel integration
// This file allows running Liebe from any external URL (localhost or remote server)

class LiebePanel extends HTMLElement {
  constructor() {
    super()
    this._hass = null
    this.iframe = null
    this.stateChangeUnsubscribe = null
    
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
      
      // If we have a stored route, send it to the iframe
      if (this._currentRoute && this._currentRoute !== '/') {
        console.log('Sending initial route to iframe:', this._currentRoute)
        setTimeout(() => {
          // Delay to ensure iframe is ready
          this.iframe.contentWindow.postMessage(
            { type: 'navigate-to', path: this._currentRoute },
            '*'
          )
        }, 100)
      }
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

  handleMessage(event) {
    // Only accept messages from our iframe
    if (event.source !== this.iframe.contentWindow) return

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
    } else if (event.data.type === 'route-change') {
      // Handle route changes within the panel
      const path = event.data.path
      if (path) {
        console.log('Route change received:', path)
        console.log('Current URL:', window.location.pathname)
        
        // Store the sub-route in the panel's state
        this._currentRoute = path
        
        // Update URL without triggering Home Assistant navigation
        // Get the base path (should be /liebe)
        const pathParts = window.location.pathname.split('/')
        const basePath = '/' + pathParts[1] // This should be /liebe
        
        // Create the new path
        const newPath = path === '/' ? basePath : basePath + path
        
        console.log('New URL will be:', newPath)
        
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
  }
}

customElements.define('liebe-panel', LiebePanel)