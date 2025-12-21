import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { id: 'map', label: 'Map', path: '/map', icon: '🌍' },
    { id: 'friends', label: 'Friends', path: '/friends', icon: '👥' },
    { id: 'chat', label: 'Chat', path: '/chat', icon: '💬' },
    { id: 'profile', label: 'Profile', path: '/profile', icon: '👤' },
  ];

  return (
    <div className="bottom-nav">
      {tabs.map(tab => {
        const isActive = location.pathname === tab.path;
        return (
          <button
            key={tab.id}
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={() => navigate(tab.path)}
          >
            <span className="nav-icon">{tab.icon}</span>
            <span className="nav-label">{tab.label}</span>
          </button>
        );
      })}

      <style>{`
        .bottom-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 60px; /* Reduced specific height */
          background: rgba(20, 20, 20, 0.9);
          backdrop-filter: blur(10px);
          border-top: 1px solid var(--glass-border);
          display: flex;
          justify-content: space-around;
          align-items: center;
          z-index: 2000; /* Above Leaflet controls */
          padding-bottom: env(safe-area-inset-bottom);
        }
        
        .nav-item {
          background: none;
          border: none;
          color: var(--text-secondary);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          flex: 1;
          height: 100%;
          justify-content: center;
          transition: all 0.2s;
        }
        
        .nav-item.active {
          color: var(--brand-primary);
        }
        
        .nav-icon {
          font-size: 1.5rem;
          transition: transform 0.2s;
        }
        
        .nav-item.active .nav-icon {
          transform: translateY(-2px);
        }
        
        .nav-label {
          font-size: 0.7rem;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
