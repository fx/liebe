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
      // Create shadow DOM
      const shadow = this.attachShadow({ mode: 'open' })
      
      // Create container for React
      const container = document.createElement('div')
      container.style.height = '100%'
      shadow.appendChild(container)
      
      // Load CSS into shadow DOM
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      // Get the URL from the script tag that loaded this panel
      const currentScript = document.currentScript || document.querySelector('script[src*="panel.js"]')
      if (currentScript && 'src' in currentScript) {
        const scriptUrl = new URL(currentScript.src)
        // In development mode (localhost), vite serves CSS separately
        // In production, CSS is bundled as liebe.css
        const cssUrl = scriptUrl.href.replace(/panel\.js$/, 'liebe.css')
        link.href = cssUrl
        shadow.appendChild(link)
        
        // Also inject styles into document head for Radix UI portals (popovers, dialogs, etc)
        // Check if styles are already injected to avoid duplicates
        if (!document.querySelector(`link[href="${cssUrl}"]`)) {
          const globalLink = document.createElement('link')
          globalLink.rel = 'stylesheet'
          globalLink.href = cssUrl
          document.head.appendChild(globalLink)
        }
      }
      
      // Create React root in shadow DOM
      this.root = ReactDOM.createRoot(container)
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
