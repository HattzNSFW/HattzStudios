import React from 'react';
import ReactDOM from 'react-dom/client';
import '@hattz/design-system/tokens.css';
import '@hattz/profile-view/styles.css';
import './index.css';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
