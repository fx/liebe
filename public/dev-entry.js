// Minimal custom panel that loads the Vite app in an iframe
// but provides access to the hass object via postMessage

class LiebeDashboardDevPanel extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (this.iframe) {
      this.sendHassUpdate();
    }
  }

  connectedCallback() {
    this.innerHTML = '<iframe src="http://localhost:3000" style="width:100%;height:100%;border:0"></iframe>';
    this.iframe = this.querySelector('iframe');
    
    // Send hass updates when iframe loads
    this.iframe.addEventListener('load', () => this.sendHassUpdate());
    
    // Listen for messages from iframe
    window.addEventListener('message', (e) => {
      if (e.origin !== 'http://localhost:3000') return;
      
      if (e.data.type === 'call-service' && this._hass) {
        this._hass.callService(e.data.domain, e.data.service, e.data.serviceData);
      } else if (e.data.type === 'route-change') {
        // Handle route changes from the iframe
        console.log('Route change requested:', e.data.path);
        // Get the base path (everything before the last segment)
        const pathParts = window.location.pathname.split('/');
        // Remove empty parts and find where 'liebe-dev' is
        const liebeIndex = pathParts.findIndex(part => part === 'liebe-dev');
        if (liebeIndex >= 0) {
          // Keep everything up to and including 'liebe-dev'
          const basePath = pathParts.slice(0, liebeIndex + 1).join('/');
          const newPath = basePath + e.data.path;
          console.log('Updating URL to:', newPath);
          history.pushState(null, '', newPath);
        }
      }
    });
  }

  sendHassUpdate() {
    if (this._hass && this.iframe && this.iframe.contentWindow) {
      try {
        this.iframe.contentWindow.postMessage({
          type: 'hass-update',
          hass: {
            states: this._hass.states,
            user: this._hass.user,
            config: this._hass.config,
            themes: this._hass.themes,
            language: this._hass.language
          }
        }, 'http://localhost:3000');
      } catch (e) {
        // Ignore CORS errors during initial load
        console.debug('Could not send hass update:', e.message);
      }
    }
  }
}

customElements.define('liebe-dashboard-dev', LiebeDashboardDevPanel);