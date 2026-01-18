import React, { createContext, useContext, useState, useEffect } from 'react';

const LocationContext = createContext();

export function LocationProvider({ children }) {
    const [permissionStatus, setPermissionStatus] = useState(() => {
        return localStorage.getItem('locationPermission') || 'prompt';
    });

    const isLocationEnabled = permissionStatus === 'granted';

    const setPermission = (status, persist = true) => {
        setPermissionStatus(status);
        
        if (persist) {
            if (status === 'prompt') {
                localStorage.removeItem('locationPermission');
            } else {
                localStorage.setItem('locationPermission', status);
            }
        } else {
            // Temporary session grant - ensure we don't have a conflicting stored denial?
            // Usually 'once' implies we proceed for now. 
            // We don't necessarily clear 'denied' from storage if we want it to revert to denied?
            // But if user explicitly says "Allow This Time", they are overriding.
            // Let's assume 'once' is ephemeral.
        }
    };

    // Helper to reset and allow re-prompting
    const resetPermission = () => {
        setPermission('prompt');
    };

    return (
        <LocationContext.Provider value={{ 
            permissionStatus, 
            isLocationEnabled, 
            setPermission, 
            resetPermission 
        }}>
            {children}
        </LocationContext.Provider>
    );
}

export const useLocationContext = () => useContext(LocationContext);
