import React, { Suspense, lazy, useEffect } from 'react';
import 'leaflet/dist/leaflet.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Core layout and context providers need to load immediately
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

import { CallProvider } from './context/CallContext';
import { ThemeProvider } from './context/ThemeContext';
import { LocationProvider } from './context/LocationContext';

import { supabase } from './supabaseClient';

// Wrapper for React.lazy to handle Vite dynamic import failures
const lazyWithRetry = (componentImport) =>
  lazy(async () => {
    const pageHasAlreadyBeenForceRefreshed = JSON.parse(
      window.sessionStorage.getItem('page-has-been-force-refreshed') || 'false'
    );

    try {
      const component = await componentImport();
      window.sessionStorage.setItem('page-has-been-force-refreshed', 'false');
      return component;
    } catch (error) {
      if (!pageHasAlreadyBeenForceRefreshed) {
        // Assume that the error was because of a stale cache 
        // (TypeError: Failed to fetch dynamically imported module)
        console.warn('Dynamic import failed, reloading page to fetch latest chunks...', error);
        window.sessionStorage.setItem('page-has-been-force-refreshed', 'true');
        return window.location.reload();
      }
      
      // The page has already been reloaded, so assuming this is an actual error
      throw error;
    }
  });

// Lazy loaded page components
const Login = lazyWithRetry(() => import('./pages/Login'));
const MapHome = lazyWithRetry(() => import('./pages/MapHome'));
const Friends = lazyWithRetry(() => import('./pages/Friends'));
const Chat = lazyWithRetry(() => import('./pages/Chat'));
const Profile = lazyWithRetry(() => import('./pages/Profile'));
const ConfirmEmail = lazyWithRetry(() => import('./pages/ConfirmEmail'));
const UpdatePassword = lazyWithRetry(() => import('./pages/UpdatePassword'));
const OAuthProfileSetup = lazyWithRetry(() => import('./pages/OAuthProfileSetup'));
const BlockedUsers = lazyWithRetry(() => import('./pages/BlockedUsers'));
const LegalPage = lazyWithRetry(() => import('./pages/LegalPage'));
const UserProfilePage = lazyWithRetry(() => import('./pages/UserProfilePage'));

// A simple loading fallback for general pages
const LoadingFallback = () => (
    <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-primary, #000)' }}>
        <div className="spinner" style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid var(--brand-blue, #0084ff)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{'@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }'}</style>
    </div>
);

// Map-specific skeleton — matches the map's dark green palette so the transition is seamless
const MapSkeleton = () => (
    <div style={{
        width: '100%',
        height: 'calc(100dvh - 60px)', // matches layout padding-bottom: 60px
        background: 'linear-gradient(135deg, #1a1f2e 0%, #12181b 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '14px',
        position: 'relative',
        overflow: 'hidden',
    }}>
        {/* Subtle grid pattern to hint at a map */}
        <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
        }} />
        {/* Pulsing location pin */}
        <div style={{ fontSize: '2.4rem', animation: 'mapPinPulse 1.4s ease-in-out infinite', position: 'relative', zIndex: 1 }}>📍</div>
        <div style={{
            background: 'rgba(0,132,255,0.15)',
            border: '1px solid rgba(0,132,255,0.3)',
            borderRadius: '100px',
            padding: '8px 22px',
            color: '#0084ff',
            fontSize: '0.85rem',
            fontWeight: 600,
            letterSpacing: '0.05em',
            position: 'relative', zIndex: 1,
        }}>
            Loading Map…
        </div>
        <style>{`
            @keyframes mapPinPulse {
                0%, 100% { transform: translateY(0) scale(1); opacity: 1; }
                50% { transform: translateY(-8px) scale(1.1); opacity: 0.75; }
            }
        `}</style>
    </div>
);

import { useVersionCheck } from './hooks/useVersionCheck';

function App() {
  // Setup background version polling
  useVersionCheck();

  // Logic moved to usePushNotifications hook in Layout
  // Keeping App simple

  useEffect(() => {
    const handleUnhandledRejection = (event) => {
      // Prevent the default console error (optional, but keeps console cleaner if we handle it)
      // event.preventDefault(); 
      console.warn('⚠️ Global Unhandled Rejection:', event.reason);
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <LocationProvider>
          <Router>
            <CallProvider>
            <Suspense fallback={<LoadingFallback />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Login />} />

                {/* Protected Routes with Bottom Nav */}
                <Route element={<Layout />}>
                  {/* Map gets its own Suspense so Layout/BottomNav render instantly */}
                  <Route path="/map" element={
                    <Suspense fallback={<MapSkeleton />}>
                      <MapHome />
                    </Suspense>
                  } />
                  <Route path="/friends" element={<Friends />} />
                  <Route path="/chat" element={<Chat />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/profile/:userId" element={<UserProfilePage />} />
                </Route>

                <Route path="/confirm-email" element={<ConfirmEmail />} />
                <Route path="/update-password" element={<UpdatePassword />} />
                <Route path="/oauth-profile-setup" element={<OAuthProfileSetup />} />
                <Route path="/blocked-users" element={<BlockedUsers />} />
                <Route path="/legal/:section" element={<LegalPage />} />
                <Route path="/" element={<Navigate to="/login" replace />} />
              </Routes>
            </Suspense>
          </CallProvider>
        </Router>
        </LocationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
