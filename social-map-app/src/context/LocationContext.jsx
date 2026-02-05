import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

const LocationContext = createContext();

export function LocationProvider({ children }) {
    const [permissionStatus, setPermissionStatus] = useState(() => {
        return localStorage.getItem('locationPermission') || 'prompt';
    });
    
    // Live Location State
    const [userLocation, setUserLocation] = useState(null);
    const watchIdRef = useRef(null);
    const lastDbUpdateRef = useRef(0);
    const lastLocationRef = useRef(null);

    const isLocationEnabled = permissionStatus === 'granted';

    const setPermission = (status, persist = true) => {
        setPermissionStatus(status);
        
        if (persist) {
            if (status === 'prompt') {
                localStorage.removeItem('locationPermission');
            } else {
                localStorage.setItem('locationPermission', status);
            }
        }
    };

    // Helper: Calculate distance in km
    const getDistanceKm = (lat1, lon1, lat2, lon2) => {
        const R = 6371; 
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
        return R * c;
    };

    // Real-time Tracking
    useEffect(() => {
        if (!isLocationEnabled) {
            if (watchIdRef.current) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
            return;
        }

        if ('geolocation' in navigator) {
            watchIdRef.current = navigator.geolocation.watchPosition(
                async (position) => {
                    const { latitude, longitude } = position.coords;
                    const newLoc = { lat: latitude, lng: longitude };
                    
                    setUserLocation(newLoc);

                    // DB Update Logic (Throttled)
                    const now = Date.now();
                    const TIME_THRESHOLD = 30000; // 30 seconds
                    const DIST_THRESHOLD = 0.02; // 20 meters

                    const timeDiff = now - lastDbUpdateRef.current;
                    let distDiff = 100; // Force update if no last location
                    
                    if (lastLocationRef.current) {
                        distDiff = getDistanceKm(lastLocationRef.current.lat, lastLocationRef.current.lng, latitude, longitude);
                    }

                    // Update DB if: Time > 30s OR Moved > 20m
                    if (timeDiff > TIME_THRESHOLD || distDiff > DIST_THRESHOLD) {
                        lastDbUpdateRef.current = now;
                        lastLocationRef.current = newLoc;

                        const { data: { session } } = await supabase.auth.getSession();
                        if (session?.user) {
                             // Update Profile
                             console.log('📍 Syncing Location to DB:', newLoc);
                             await supabase.from('profiles').update({ 
                                 last_location: `POINT(${longitude} ${latitude})`,
                                 last_active: new Date().toISOString()
                             }).eq('id', session.user.id);
                        }
                    }
                },
                (err) => {
                    console.error("Location Watch Error:", err);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 20000,
                    maximumAge: 5000
                }
            );
        }

        return () => {
             if (watchIdRef.current) {
                navigator.geolocation.clearWatch(watchIdRef.current);
            }
        };
    }, [isLocationEnabled]);

    // Helper to reset and allow re-prompting
    const resetPermission = () => {
        setPermission('prompt');
    };

    return (
        <LocationContext.Provider value={{ 
            permissionStatus, 
            isLocationEnabled, 
            userLocation, // Expose live location
            setPermission, 
            resetPermission 
        }}>
            {children}
        </LocationContext.Provider>
    );
}

export const useLocationContext = () => useContext(LocationContext);
