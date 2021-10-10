import React from 'react';
import ReactDOM from 'react-dom';
import { StyledPanel } from './Panel';
import { createReactPanel } from './ReactPanel';

const panel = createReactPanel(StyledPanel);
customElements.define('liebe-panel', panel);
