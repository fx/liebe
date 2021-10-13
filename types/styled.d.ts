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

declare module '@mui/material/styles/createTheme' {
  interface Theme extends LiebeTheme {}
  interface ThemeOptions extends LiebeTheme {}
}
