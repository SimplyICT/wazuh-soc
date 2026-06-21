import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './context/ToastContext';
import { RefreshProvider } from './components/RefreshContext';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <RefreshProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </RefreshProvider>
    </HashRouter>
  </React.StrictMode>
);
