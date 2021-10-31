import { createTheme } from '@mui/material/styles/createTheme';

interface LiebeTheme extends Theme {
  liebe: {
    sidebar: {
      width: number;
      background: string;
    };
    card: {
      background: string;
    };
    text: {
      color: string;
    };
  };
}

interface DefaultTheme extends LiebeTheme {}

declare module '@mui/material/styles/createTheme' {
  interface Theme extends LiebeTheme {}
  interface ThemeOptions extends LiebeTheme {}
}

declare module 'styled-components' {
  export interface DefaultTheme extends LiebeTheme {}
}
