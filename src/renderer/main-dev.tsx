import React from 'react';
import ReactDOM from 'react-dom/client';
import DevApp from './DevApp';
import './index.css';

// Development entry point for testing Review Page directly
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DevApp />
  </React.StrictMode>
);