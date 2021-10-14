import { StyledPanel } from './Panel';
import { createReactPanel } from './ReactPanel';

const panel = createReactPanel(StyledPanel);
// eslint-disable-next-line no-undef
customElements.define('liebe-panel', panel);
