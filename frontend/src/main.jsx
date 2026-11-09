import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './hooks/useToast';
import { PlayerProvider } from './hooks/usePlayer';
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/hanken-grotesk';
import './styles/global.css';
import './styles/rewear-inspired.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <PlayerProvider>
            <App />
          </PlayerProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
