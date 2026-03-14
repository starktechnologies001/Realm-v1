const PROD_DOMAIN = 'realm-v1.vercel.app';

if (
  window.location.hostname.includes('vercel.app') &&
  window.location.hostname !== PROD_DOMAIN
) {
  window.location.replace(
    `https://${PROD_DOMAIN}${window.location.pathname}`
  );
} 

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register Service Worker for PWA & Push Notifications
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('SW registered: ', registration);
      })
      .catch(registrationError => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

// =========================================================================
// GLOBAL VITE ERROR HANDLER (Production-Grade Dynamic Import Recovery)
// =========================================================================

// Catch specific Vite preload errors (when a chunk fails to load)
window.addEventListener('vite:preloadError', (event) => {
  console.warn('⚡ Vite chunk preload error detected! Forcing page hard reload...', event);
  
  // Prevent the error from crashing the app before we can reload
  event.preventDefault();

  // Cache bust check to avoid infinite reload loops
  const hasRefreshed = sessionStorage.getItem('vite-preload-error-hard-reload');
  if (!hasRefreshed) {
    sessionStorage.setItem('vite-preload-error-hard-reload', 'true');
    // Hard refresh bypassing cache
    window.location.reload(true);
  } else {
    console.error('Repeated chunk loading failures. Awaiting manual refresh.');
    // Clear the flag so they can try again later
    setTimeout(() => {
      sessionStorage.removeItem('vite-preload-error-hard-reload');
    }, 10000); 
  }
});
