import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useLocationContext } from '../context/LocationContext';

export default function LocationGuard({ children }) {
    const { devicePermissionGranted, loadingLocation, checkingPermission } = useLocationContext();
    const location = useLocation();

    if (checkingPermission) {
        return (
            <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-primary, #000)' }}>
                <div className="spinner" style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid var(--brand-blue, #0084ff)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <style>{'@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }'}</style>
            </div>
        );
    }

    const isManuallyDisabled = localStorage.getItem("manualLocationDisable") === "true";

    // Block if:
    // 1. Permission has not been granted (state is prompt or denied)
    // OR
    // 2. Location tracking has been explicitly disabled/stopped manually AND we are not trying to get a GPS fix.
    if (!devicePermissionGranted || (isManuallyDisabled && !loadingLocation)) {
        return <Navigate to="/enable-location" state={{ from: location }} replace />;
    }

    return children;
}
