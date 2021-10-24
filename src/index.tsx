import './wdyr';

import React from 'react';
import { Panel } from './Panel';
import { createReactPanel } from './ReactPanel';

const panel = createReactPanel(Panel);
// eslint-disable-next-line no-undef
customElements.define('liebe-panel', panel);
