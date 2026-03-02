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

// Lazy loaded page components
const Login = lazy(() => import('./pages/Login'));
const MapHome = lazy(() => import('./pages/MapHome'));
const Friends = lazy(() => import('./pages/Friends'));
const Chat = lazy(() => import('./pages/Chat'));
const Profile = lazy(() => import('./pages/Profile'));
const ConfirmEmail = lazy(() => import('./pages/ConfirmEmail'));
const UpdatePassword = lazy(() => import('./pages/UpdatePassword'));
const OAuthProfileSetup = lazy(() => import('./pages/OAuthProfileSetup'));
const BlockedUsers = lazy(() => import('./pages/BlockedUsers'));
const LegalPage = lazy(() => import('./pages/LegalPage'));
const UserProfilePage = lazy(() => import('./pages/UserProfilePage'));

// A simple loading fallback
const LoadingFallback = () => (
    <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-primary, #000)' }}>
        <div className="spinner" style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid var(--brand-blue, #0084ff)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <style>{'@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }'}</style>
    </div>
);

function App() {
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
                  <Route path="/map" element={<MapHome />} />
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
