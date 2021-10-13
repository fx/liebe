import React from 'react';
import ReactDOM from 'react-dom';
import fs from 'fs';
import {
  ThemeProvider,
  StyleSheetManager,
  createGlobalStyle,
} from 'styled-components';
import { lighten, rgba } from 'polished';
import { Theme, ThemeOptions } from '@mui/material/styles';
import createTheme from '@mui/material/styles/createTheme';

const GlobalStyle = createGlobalStyle`
  body { overflow: hidden; }

  // Can't figure out how to tell Dialog not to be scrolly
  .MuiDialog-paper {
    overflow-y: visible !important;
  }

  * {
    ::-webkit-scrollbar,
    ::-webkit-scrollbar-corner {
      height: 15px;
      width: 15px;
    }

    &::-webkit-scrollbar-thumb {
      background-clip: content-box;
      background-color: ${({ theme: LiebeTheme }) => theme.liebe.text.color};
      border: 5px solid transparent;
      border-radius: 16px;
    }

    &::-webkit-scrollbar-thumb:hover {
      background-color: ${({ theme }) =>
        lighten('10%', theme.liebe.text.color)};
    }

    &::-webkit-scrollbar-track:hover {
      background-color: transparent;
      box-shadow: none;
    }
  }
`;

// https://mui.com/customization/default-theme/
const theme = createTheme({
  palette: {
    mode: 'dark',
  },
  zIndex: {},
  liebe: {
    sidebar: {
      width: 250,
      background: '#212326',
    },
    card: {
      background: rgba('#212326', 0.55),
    },
    text: {
      color: '#BDBEBF',
    },
  },
});

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
        root: this.root,
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
      this.mountPoint = document.createElement('div');
      this.render();
      this.root.appendChild(this.mountPoint);
      this.attachShadow({ mode: 'open' }).appendChild(this.root);
    }
  };
};
