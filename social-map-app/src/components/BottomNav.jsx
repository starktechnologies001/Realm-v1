import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Badge from './Badge';

export default function BottomNav({ friendRequestCount = 0, unreadMessageCount = 0 }) {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    { 
      id: 'map', 
      label: 'Map', 
      path: '/map', 
      icon: (active) => (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? "2" : "2"} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
      )
    },
    { 
      id: 'friends', 
      label: 'Friends', 
      path: '/friends', 
      icon: (active) => (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
      )
    },
    { 
      id: 'chat', 
      label: 'Chat', 
      path: '/chat', 
      icon: (active) => (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      )
    },
    { 
      id: 'profile', 
      label: 'Profile', 
      path: '/profile', 
      icon: (active) => (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      )
    },
  ];

  return (
    <div className="bottom-nav">
      {tabs.map(tab => {
        const isActive = location.pathname === tab.path;
        const notificationCount = tab.id === 'friends' ? friendRequestCount : tab.id === 'chat' ? unreadMessageCount : 0;
        
        return (
          <button
            key={tab.id}
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={() => navigate(tab.path)}
          >
            <span className="nav-icon-wrapper">
                {tab.icon(isActive)}
                <Badge count={notificationCount} size="small" />
            </span>
            <span className="nav-label">{tab.label}</span>
            {isActive && <div className="active-dot" />}
          </button>
        );
      })}

      <style>{`
        .bottom-nav {
          position: fixed;
          bottom: 0; left: 0; right: 0;
          height: 60px; /* Reduced specific height for sleekness */
          background: rgba(10, 10, 10, 0.85); /* Slightly darker for contrast */
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          justify-content: space-around;
          align-items: center;
          z-index: 2000;
          padding-bottom: env(safe-area-inset-bottom);
          box-shadow: 0 -4px 30px rgba(0,0,0,0.3);
        }
        
        .nav-item {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          flex: 1;
          height: 100%;
          justify-content: center;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          cursor: pointer;
        }
        
        .nav-item.active {
          color: #4285F4; /* Brand Primary */
        }
        
        .nav-icon-wrapper {
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .nav-item svg {
            transition: all 0.2s ease;
        }

        .nav-item.active .nav-icon-wrapper {
          transform: translateY(-2px);
        }
        
        .nav-label {
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.3px;
          opacity: 0.8;
        }
        .nav-item.active .nav-label {
            opacity: 1;
        }
        
        /* Subtle Glow Dot for Active State */
        .active-dot {
            position: absolute;
            bottom: 4px;
            width: 4px; height: 4px;
            background: #4285F4;
            border-radius: 50%;
            box-shadow: 0 0 8px #4285F4;
            animation: fadeIn 0.3s ease;
        }

        @media (min-width: 768px) {
            .bottom-nav {
                max-width: 500px;
                left: 50%;
                transform: translateX(-50%);
                bottom: 20px;
                border-radius: 20px;
                border: 1px solid rgba(255,255,255,0.1);
            }
        }
      `}</style>
    </div>
  );
}
