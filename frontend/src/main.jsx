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

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('LOOP startup/render error:', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <main style={{ minHeight: '100vh', padding: 32, background: '#101014', color: '#fff', fontFamily: 'system-ui', display: 'grid', placeItems: 'center' }}>
          <section style={{ width: 'min(680px, 100%)' }}>
            <p style={{ color: '#e39a9a', letterSpacing: '.12em', fontSize: 12 }}>LOOP STARTUP ERROR</p>
            <h1 style={{ fontSize: 30, margin: '12px 0' }}>We caught a loading issue.</h1>
            <p style={{ color: '#c7c5ce', lineHeight: 1.6 }}>This diagnostic screen prevents a blank page. Send this error text to the LOOP developer.</p>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: 18, borderRadius: 12, background: '#202027', color: '#ffd5d5', fontSize: 13 }}>{String(this.state.error?.stack || this.state.error?.message || this.state.error)}</pre>
            <button onClick={() => window.location.reload()} style={{ padding: '12px 18px', border: 0, borderRadius: 10, background: '#fff', color: '#111', fontWeight: 600, cursor: 'pointer' }}>Reload LOOP</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <PlayerProvider>
              <App />
            </PlayerProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>,
);
