import React from 'react';
import ReactDOM from 'react-dom';
import fs from 'fs';
import {
  ThemeProvider,
  StyleSheetManager,
  createGlobalStyle,
} from 'styled-components';
import { rgba } from 'polished';

const blueprintCSS = fs.readFileSync(
  'node_modules/@blueprintjs/core/lib/css/blueprint.css',
);

const GlobalStyle = createGlobalStyle`
  body { overflow: hidden; }
`;

const theme = {
  card: {
    background: rgba('#212326', 0.55),
  },
  text: {
    color: '#BDBEBF',
  },
};

export const createReactPanel = (app: any): CustomElementConstructor => {
  return class extends HTMLElement {
    constructor() {
      super();
      Object.defineProperties(this, {
        hass: {
          set(value) {
            this._hass = value;
            this.render();
          },
        },
        // narrow: { type: Boolean },
        // route: { type: Object },
        // panel: { type: Object },
      });
    }

    render() {
      if (!this.isConnected) return;

      const panel = React.createElement(app, {
        panel: this,
        hass: this._hass,
      });

      ReactDOM.render(
        <ThemeProvider theme={theme}>
          <StyleSheetManager target={this.root}>
            <>
              <GlobalStyle />
              {panel}
            </>
          </StyleSheetManager>
        </ThemeProvider>,
        this.mountPoint,
      );
    }

    connectedCallback() {
      this.root = document.createElement('div');
      // this.root.style = 'min-height: 100%; height: 1px;';
      this.mountPoint = document.createElement('div');
      // this.mountPoint.style = 'min-height: 100%; height: 1px;';
      this.render();
      this.root.appendChild(this.mountPoint);
      const blueprintStyles = document.createElement('style');
      blueprintStyles.textContent = blueprintCSS;
      this.root.appendChild(blueprintStyles);
      this.attachShadow({ mode: 'open' }).appendChild(this.root);
    }
  };
};
