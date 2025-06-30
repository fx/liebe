// Bridge for Home Assistant custom panel integration
// This file allows running Liebe from any external URL (localhost or remote server)

class LiebePanel extends HTMLElement {
  constructor() {
    super()
    this._hass = null
    this.iframe = null
  }

  set hass(hass) {
    this._hass = hass
    if (!this.iframe) {
      this.render()
    } else {
      // Only send if iframe already exists
      this.sendHassToIframe()
    }
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
    
    // Create iframe that loads the app from the same origin
    this.iframe = document.createElement('iframe')
    this.iframe.src = window.location.origin
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
      // Update the URL in Home Assistant
      const path = event.data.path
      if (path) {
        const basePath = window.location.pathname.split('/').slice(0, -1).join('/')
        const newPath = `${basePath}${path}`
        history.pushState(null, '', newPath)
        
        // Notify Home Assistant about the URL change
        this.dispatchEvent(
          new CustomEvent('location-changed', {
            bubbles: true,
            composed: true,
            detail: { path: newPath },
          })
        )
      }
    }
  }

  disconnectedCallback() {
    window.removeEventListener('message', this.handleMessage.bind(this))
  }
}

customElements.define('liebe-panel', LiebePanel)