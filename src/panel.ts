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

class LiebePanel extends HTMLElement {
  private _hass: HomeAssistant | null = null
  private root?: ReactDOM.Root

  set hass(hass: HomeAssistant) {
    this._hass = hass
    this.render()
  }

  connectedCallback() {
    if (!this.root) {
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
    this.root?.unmount()
  }

  private render() {
    if (!this.root || !this._hass) return
    this.root.render(
      React.createElement(React.StrictMode, null,
        React.createElement(HomeAssistantProvider, {
          hass: this._hass,
          children: React.createElement(PanelApp),
        })
      )
    )
  }
}

customElements.define('liebe-panel', LiebePanel)
