import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import LocationOnboarding from '../components/LocationOnboarding';
import { useLocationContext } from '../context/LocationContext';
import { useTheme } from '../context/ThemeContext';

export default function EnableLocation() {
    const navigate = useNavigate();
    const location = useLocation();
    const { startLocation, devicePermissionGranted, loadingLocation } = useLocationContext();
    const { theme } = useTheme();

    const isDarkMode = theme === 'dark';

    // Once permission is granted, redirect the user to their destination or /map
    useEffect(() => {
        const isManuallyDisabled = localStorage.getItem("manualLocationDisable") === "true";
        if (devicePermissionGranted && !isManuallyDisabled) {
            const destination = location.state?.from?.pathname || '/map';
            navigate(destination, { replace: true });
        }
    }, [devicePermissionGranted, location.state, navigate]);

    const handleEnableLocation = () => {
        startLocation();
    };

    return (
        <div style={{
            height: '100dvh',
            width: '100vw',
            background: isDarkMode ? 'linear-gradient(160deg, #0a0a0f 0%, #13111a 100%)' : 'linear-gradient(160deg, #f9f7ff 0%, #f0eeff 50%, #e8f0fe 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            position: 'relative'
        }}>
            {loadingLocation ? (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '16px',
                    color: isDarkMode ? '#fff' : '#1e1b4b',
                    fontFamily: '"Inter", sans-serif',
                    zIndex: 2
                }}>
                    <div className="spinner" style={{
                        width: '46px',
                        height: '46px',
                        border: '3px solid rgba(139, 92, 246, 0.1)',
                        borderTop: '3px solid #8B5CF6',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                    }} />
                    <style>{'@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }'}</style>
                    <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, letterSpacing: '0.2px' }}>
                        Verifying location services...
                    </p>
                </div>
            ) : (
                <LocationOnboarding 
                    onEnable={handleEnableLocation} 
                    isDarkMode={isDarkMode} 
                    fullHeight={true}
                />
            )}
        </div>
    );
}
