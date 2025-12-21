import React from 'react';
import 'leaflet/dist/leaflet.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import MapHome from './pages/MapHome';
import Friends from './pages/Friends';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import Layout from './components/Layout';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Protected Routes with Bottom Nav */}
        <Route element={<Layout />}>
          <Route path="/map" element={<MapHome />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/profile" element={<Profile />} />
        </Route>

        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
