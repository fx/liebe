import React, { createContext, useEffect, useReducer } from 'react';
import ReactDOM from 'react-dom';
import {
  ThemeProvider,
  StyleSheetManager,
  createGlobalStyle,
} from 'styled-components';
import { lighten, rgba } from 'polished';
import createTheme from '@mui/material/styles/createTheme';
import type { GridItem } from './components';
import type { Layout, Layouts } from 'react-grid-layout';
import useLocalStorageState from 'use-local-storage-state';

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

class PanelElement extends HTMLElement {
  hass = undefined;

  root: HTMLElement | undefined = undefined;

  mountPoint: any = undefined;
}

const emptySettings = {
  grid: {
    items: [
      {
        entityId: 'camera.marian_office',
      },
    ],
    layouts: {},
  },
  options: {
    gridEditable: false,
  },
  updateOptions: () => {},
  addItem: () => {},
  updateLayouts: () => {},
};

export interface LiebeSettings {
  grid: {
    items: GridItem[];
    layouts: Layouts;
  };
  options: {
    gridEditable: boolean;
  };
  updateOptions: Function;
  addItem: Function;
  updateLayouts: Function;
}

export const Settings = createContext<LiebeSettings>(emptySettings);

export const SettingsReducer = (state: LiebeSettings, action: any) => {
  console.log('reduce', state, action);
  switch (action.type) {
    case 'SET_OPTIONS':
      return { ...state, options: action.payload };
    case 'ADD_ITEM':
      return {
        ...state,
        grid: {
          ...state.grid,
          items: [...state.grid.items, action.payload],
        },
      };
    case 'SET_LAYOUTS':
      return {
        ...state,
        grid: {
          ...state.grid,
          layouts: action.payload,
        },
      };
    default:
      return state;
  }
};

export const SettingsProvider = ({ children }: any) => {
  const [state, setState] = useLocalStorageState<LiebeSettings>(
    'liebe:settings',
    emptySettings,
  );
  const [settings, dispatch] = useReducer(SettingsReducer, state);

  useEffect(() => {
    setState(settings);
  }, [settings]);

  const updateOptions = (options = {}) => {
    console.log('new', options);
    dispatch({
      type: 'SET_OPTIONS',
      payload: {
        ...settings.options,
        ...options,
      },
    });
  };

  const addItem = (item: GridItem) => {
    console.log('add item', item);
    dispatch({
      type: 'ADD_ITEM',
      payload: item,
    });
  };

  const updateLayouts = (layouts: Layouts) => {
    dispatch({
      type: 'SET_LAYOUTS',
      payload: layouts,
    });
  };

  return (
    <Settings.Provider
      value={{ ...settings, updateOptions, addItem, updateLayouts }}
    >
      {children}
    </Settings.Provider>
  );
};

export const createReactPanel = (app: any): CustomElementConstructor =>
  class extends PanelElement {
    render() {
      if (!this.isConnected) return;

      const panel = React.createElement(app, {
        root: this.root,
        hass: this.hass,
      });

      ReactDOM.render(
        <ThemeProvider theme={theme}>
          <StyleSheetManager target={this.root}>
            <SettingsProvider>
              <GlobalStyle />
              {panel}
            </SettingsProvider>
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
