/* Custom Panel Entry for Home Assistant */

import React from 'react'
import ReactDOM from 'react-dom/client'
import { HomeAssistantProvider } from './contexts/HomeAssistantContext'
import { PanelApp } from './components/PanelApp'
import type { HomeAssistant } from './contexts/HomeAssistantContext'

// Import styles
import '@radix-ui/themes/styles.css'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import '~/styles/app.css'

interface PanelConfig {
  route?: string
  [key: string]: unknown
}

interface Panel {
  config?: PanelConfig
  [key: string]: unknown
}

// Home Assistant custom panel element
class LiebePanel extends HTMLElement {
  private _hass: HomeAssistant | null = null
  private root?: ReactDOM.Root
  private _panel?: Panel
  private _route?: string

  set hass(hass: HomeAssistant) {
    this._hass = hass
    this.render()
  }

  set panel(panel: Panel) {
    this._panel = panel
    // Extract initial route from panel config if available
    if (panel?.config?.route) {
      this._route = panel.config.route
    }
  }

  set route(route: string) {
    this._route = route
    // Navigate to the specified route
    window.dispatchEvent(
      new CustomEvent('liebe-navigate', {
        detail: { path: route },
      })
    )
  }

  connectedCallback() {
    if (!this.root) {
      const container = document.createElement('div')
      container.style.height = '100%'
      this.appendChild(container)
      this.root = ReactDOM.createRoot(container)
      
      // Load CSS file if not already loaded
      if (!document.querySelector('link[href*="panel.css"]')) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        // Get the base URL from where this script was loaded
        const scriptUrl = new URL(import.meta.url)
        link.href = `${scriptUrl.origin}/panel.css`
        document.head.appendChild(link)
      }
    }
    this.render()
  }

  disconnectedCallback() {
    if (this.root) {
      this.root.unmount()
    }
  }

  private render() {
    if (!this.root || !this._hass) return

    this.root.render(
      React.createElement(
        React.StrictMode,
        null,
        // eslint-disable-next-line react/no-children-prop
        React.createElement(HomeAssistantProvider, {
          hass: this._hass,
          children: React.createElement(PanelApp),
        })
      )
    )
  }
}

// Register the custom element
customElements.define('liebe-panel', LiebePanel)
