import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './fonts';
import './styles/app.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline support: caches the app shell and fonts after the first visit.
if ('serviceWorker' in navigator && import.meta.env.PROD && !window.deckforgeDesktop) {
  registerSW({ immediate: true });
}
