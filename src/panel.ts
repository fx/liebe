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

  set hass(hass: HomeAssistant) {
    this._hass = hass
    this.render()
  }

  connectedCallback() {
    // Only initialize once - don't recreate on reconnection
    if (!this.initialized) {
      this.initialized = true

      const shadow = this.attachShadow({ mode: 'open' })
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
    }

    this.render()
  }

  disconnectedCallback() {
    // Do NOT unmount or cleanup - Home Assistant will re-add this element
    // when the user navigates back to the panel
  }

  private render() {
    if (!this.root || !this._hass) return
    this.root.render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(Provider, { hass: this._hass }, React.createElement(PanelApp))
      )
    )
  }
}

// Register custom element with environment-specific name
const panelConfig = getPanelConfig()
customElements.define(panelConfig.elementName, LiebePanel)
