import React, { Suspense, lazy, useEffect, useState } from 'react';
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
        window.location.reload();
        return new Promise(() => {}); // Prevent React from crashing while reloading
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
const Insights = lazyWithRetry(() => import('./pages/Insights'));
const ConfirmEmail = lazyWithRetry(() => import('./pages/ConfirmEmail'));
const UpdatePassword = lazyWithRetry(() => import('./pages/UpdatePassword'));
const OAuthProfileSetup = lazyWithRetry(() => import('./pages/OAuthProfileSetup'));
const BlockedUsers = lazyWithRetry(() => import('./pages/BlockedUsers'));
const LegalPage = lazyWithRetry(() => import('./pages/LegalPage'));
const UserProfilePage = lazyWithRetry(() => import('./pages/UserProfilePage'));
const Landing = lazyWithRetry(() => import('./pages/Landing'));
const Welcome = lazyWithRetry(() => import('./pages/Welcome'));
const VisibilitySettings = lazyWithRetry(() => import('./pages/VisibilitySettings'));
const MessageRequestsPage = lazyWithRetry(() => import('./components/MessageRequestsPage'));
const EnableLocation = lazyWithRetry(() => import('./pages/EnableLocation'));
const Subscription = lazyWithRetry(() => import('./pages/Subscription'));
const PaymentHistory = lazyWithRetry(() => import('./pages/PaymentHistory'));
const Achievements = lazyWithRetry(() => import('./pages/Achievements'));
const StreakDetails = lazyWithRetry(() => import('./pages/StreakDetails'));
const PremiumSettings = lazyWithRetry(() => import('./pages/PremiumSettings'));
const Verification = lazyWithRetry(() => import('./pages/Verification'));
const HelpSupport = lazyWithRetry(() => import('./pages/HelpSupport'));

import LocationGuard from './components/LocationGuard';
import confetti from 'canvas-confetti';

const MilestoneCelebration = () => {
    const [milestone, setMilestone] = useState(null);

    useEffect(() => {
        const handleMilestone = (e) => {
            setMilestone(e.detail);
            
            // Fire confetti
            const end = Date.now() + 3 * 1000;
            const colors = ['#ff7e5f', '#feb47b', '#ffffff'];

            (function frame() {
                confetti({
                    particleCount: 5,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0 },
                    colors: colors
                });
                confetti({
                    particleCount: 5,
                    angle: 120,
                    spread: 55,
                    origin: { x: 1 },
                    colors: colors
                });

                if (Date.now() < end) {
                    requestAnimationFrame(frame);
                }
            }());
        };

        window.addEventListener('streak-milestone', handleMilestone);
        return () => window.removeEventListener('streak-milestone', handleMilestone);
    }, []);

    if (!milestone) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(10px)'
        }} onClick={() => setMilestone(null)}>
            <div style={{
                background: 'var(--card-bg, white)', padding: '40px 32px',
                borderRadius: '32px', textAlign: 'center',
                boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
                transform: 'scale(1)', animation: 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
            }} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: '4rem', marginBottom: '16px' }}>🎉</div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: 'var(--text-primary, #1d1d1f)' }}>
                    Streak Milestone Reached!
                </h2>
                <div style={{
                    margin: '24px auto', background: 'linear-gradient(135deg, rgba(255,126,95,0.1), rgba(254,180,123,0.1))',
                    border: '1px solid rgba(255,126,95,0.3)', borderRadius: '24px', padding: '24px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px'
                }}>
                    <span style={{ fontSize: '3rem' }}>{milestone.reward.icon}</span>
                    <span style={{ fontSize: '2rem', fontWeight: 900, color: '#ff7e5f' }}>{milestone.days} Days</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: milestone.reward.color }}>{milestone.reward.title}</span>
                </div>
                <p style={{ color: 'var(--text-secondary, #6e6e73)', fontWeight: 600, marginBottom: '24px' }}>Keep it up!</p>
                <button onClick={() => setMilestone(null)} style={{
                    background: 'linear-gradient(135deg, #ff7e5f, #feb47b)', color: 'white',
                    border: 'none', padding: '14px 32px', borderRadius: '100px',
                    fontSize: '1.1rem', fontWeight: 700, cursor: 'pointer', width: '100%',
                    boxShadow: '0 8px 16px rgba(255,126,95,0.3)'
                }}>Awesome</button>
                <style>{`@keyframes popIn { 0% { transform: scale(0.8); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }`}</style>
            </div>
        </div>
    );
};

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
          <MilestoneCelebration />
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
                    <LocationGuard>
                      <Suspense fallback={<MapSkeleton />}>
                        <MapHome />
                      </Suspense>
                    </LocationGuard>
                  } />
                  <Route path="/friends" element={<Friends />} />
                  <Route path="/chat" element={<Chat />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/profile/premium-settings" element={<PremiumSettings />} />
                  <Route path="/profile/verification" element={<Verification />} />
                  <Route path="/profile/help" element={<HelpSupport />} />
                  <Route path="/profile/achievements" element={<Achievements />} />
                  <Route path="/profile/streak" element={<StreakDetails />} />
                  <Route path="/profile/insights" element={<Insights />} />
                  <Route path="/subscription" element={<Subscription />} />
                  <Route path="/profile/payments" element={<PaymentHistory />} />
                  <Route path="/profile/:userId" element={<UserProfilePage />} />
                  <Route path="/message-requests" element={<MessageRequestsPage />} />
                </Route>

                <Route path="/enable-location" element={<EnableLocation />} />
                <Route path="/confirm-email" element={<ConfirmEmail />} />
                <Route path="/update-password" element={<UpdatePassword />} />
                <Route path="/oauth-profile-setup" element={<OAuthProfileSetup />} />
                <Route path="/blocked-users" element={<BlockedUsers />} />
                <Route path="/visibility-settings" element={<VisibilitySettings />} />
                <Route path="/legal/:section" element={<LegalPage />} />
                <Route path="/" element={<Welcome />} />
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
