/* Custom Panel Entry for Home Assistant */

import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'
import { HomeAssistantProvider } from './contexts/HomeAssistantContext'

// Home Assistant custom panel element
class LiebeDashboardPanel extends HTMLElement {
  private _hass: any
  private root?: ReactDOM.Root

  set hass(hass: any) {
    this._hass = hass
    this.render()
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
        React.createElement(
          HomeAssistantProvider,
          { hass: this._hass, children: React.createElement(RouterProvider, { router }) }
        )
      )
    )
  }
}

// Register the custom element
customElements.define('liebe-dashboard-panel', LiebeDashboardPanel)