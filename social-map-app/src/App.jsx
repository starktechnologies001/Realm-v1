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
import LegalPage from './pages/LegalPage';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

import { CallProvider } from './context/CallContext';
import { ThemeProvider } from './context/ThemeContext';
import { LocationProvider } from './context/LocationContext';

import { supabase } from './supabaseClient'; // Make sure this path is correct

function App() {
  // Logic moved to usePushNotifications hook in Layout
  // Keeping App simple

  return (
    <ErrorBoundary>
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
              <Route path="/legal/:section" element={<LegalPage />} />
              <Route path="/" element={<Navigate to="/login" replace />} />
            </Routes>
          </CallProvider>
        </Router>
        </LocationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
