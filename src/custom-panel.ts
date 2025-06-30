/* Custom Panel Entry for Home Assistant */

import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import { HomeAssistantProvider } from './contexts/HomeAssistantContext'
import type { HomeAssistant } from './contexts/HomeAssistantContext'

interface PanelConfig {
  route?: string
  [key: string]: unknown
}

interface Panel {
  config?: PanelConfig
  [key: string]: unknown
}

// Home Assistant custom panel element
class LiebeDashboardPanel extends HTMLElement {
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

      // Listen for route changes from the React app
      window.addEventListener('liebe-route-change', this.handleRouteChange)
    }
    this.render()
  }

  disconnectedCallback() {
    if (this.root) {
      this.root.unmount()
    }
    window.removeEventListener('liebe-route-change', this.handleRouteChange)
  }

  private handleRouteChange = (event: Event) => {
    const customEvent = event as CustomEvent
    const path = customEvent.detail.path

    // Update the browser URL via Home Assistant's history API
    if (this._hass && path) {
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

  private render() {
    if (!this.root || !this._hass) return

    this.root.render(
      React.createElement(
        React.StrictMode,
        null,
        // eslint-disable-next-line react/no-children-prop
        React.createElement(HomeAssistantProvider, {
          hass: this._hass,
          children: React.createElement(RouterProvider, { router }),
        })
      )
    )
  }
}

// Register the custom element
customElements.define('liebe-dashboard-panel', LiebeDashboardPanel)
