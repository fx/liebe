/* Custom Panel Entry for Home Assistant */

import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { panelRouter } from './panel-router'
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
          children: React.createElement(RouterProvider, { router: panelRouter }),
        })
      )
    )
  }
}

// Register the custom element
customElements.define('liebe-panel', LiebePanel)
