import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Badge from './Badge';

const BottomNav = React.memo(function BottomNav({ friendRequestCount = 0, unreadMessageCount = 0 }) {
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
    <div className="bottom-nav" role="navigation" aria-label="Main Navigation">
      {tabs.map(tab => {
        const isActive = location.pathname === tab.path;
        const notificationCount = tab.id === 'friends' ? friendRequestCount : tab.id === 'chat' ? unreadMessageCount : 0;
        
        return (
          <button
            key={tab.id}
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={() => navigate(tab.path)}
            aria-label={`${tab.label} tab`}
            aria-current={isActive ? 'page' : undefined}
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
    </div>
  );
});

export default BottomNav;
