// import original module declarations
import 'styled-components';

// and extend them!
declare module 'styled-components' {
  export interface DefaultTheme {
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
  }
}
