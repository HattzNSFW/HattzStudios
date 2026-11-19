import React from 'react';
import ReactDOM from 'react-dom/client';
import '@hattz/design-system/tokens.css';
import './hub.css';
import { Hub } from './Hub';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Hub />
  </React.StrictMode>,
);
