import React, { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import MapHome from './pages/MapHome';
import Friends from './pages/Friends';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import ConfirmEmail from './pages/ConfirmEmail';
import UpdatePassword from './pages/UpdatePassword';
import OAuthProfileSetup from './pages/OAuthProfileSetup';
import BlockedUsers from './pages/BlockedUsers';
import Layout from './components/Layout';
import './App.css';

import { CallProvider } from './context/CallContext';
import { ThemeProvider } from './context/ThemeContext';
import { LocationProvider } from './context/LocationContext';

import { supabase } from './supabaseClient'; // Make sure this path is correct

// VAPID Public Key - Loaded from .env
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function App() {
  useEffect(() => {
      const initPush = async () => {
          if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

          try {
              const registration = await navigator.serviceWorker.register('/sw.js');
              console.log('Service Worker registered with scope:', registration.scope);

              // Request Permission
              const permission = await Notification.requestPermission();
              
              if (permission === 'granted') {
                  // Subscribe to Push
                  if (VAPID_PUBLIC_KEY === 'YOUR_VAPID_PUBLIC_KEY_HERE') {
                      console.warn('⚠️ Push Notifications: VAPID Key is missing. Please generate one and update App.jsx.');
                      return;
                  }

                  const subscription = await registration.pushManager.subscribe({
                      userVisibleOnly: true,
                      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                  });

                  // Save to Supabase
                  const { data: { session } } = await supabase.auth.getSession();
                  if (session?.user) {
                      await supabase.from('push_subscriptions').upsert({
                          user_id: session.user.id,
                          subscription: subscription
                      }, { onConflict: 'user_id, subscription' });
                      console.log('✅ Push Subscription saved!');
                  }
              }
          } catch (err) {
              console.error('Service Worker/Push error:', err);
          }
      };

      initPush();
  }, []);

  return (
    <ThemeProvider>
      <LocationProvider>
        <Router>
          <CallProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Login />} />

            {/* Protected Routes with Bottom Nav */}
            <Route element={<Layout />}>
              <Route path="/map" element={<MapHome />} />
              <Route path="/friends" element={<Friends />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/profile" element={<Profile />} />
            </Route>

            <Route path="/confirm-email" element={<ConfirmEmail />} />
            <Route path="/update-password" element={<UpdatePassword />} />
            <Route path="/oauth-profile-setup" element={<OAuthProfileSetup />} />
            <Route path="/blocked-users" element={<BlockedUsers />} />
            <Route path="/" element={<Navigate to="/login" replace />} />
          </Routes>
        </CallProvider>
      </Router>
      </LocationProvider>
    </ThemeProvider>
  );
}

export default App;
