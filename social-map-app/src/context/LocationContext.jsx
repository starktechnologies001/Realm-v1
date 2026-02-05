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
            const startWatch = (highAccuracy = true) => {
                watchIdRef.current = navigator.geolocation.watchPosition(
                    async (position) => {
                        const { latitude, longitude } = position.coords;
                        const newLoc = { lat: latitude, lng: longitude };
                        setUserLocation(newLoc);

                        // DB Update Logic (Throttled)
                        const now = Date.now();
                        const timeDiff = now - lastDbUpdateRef.current;
                        
                        // Smart throttling: Update if >30s or >20m moved
                        if (timeDiff > 30000) {
                            lastDbUpdateRef.current = now;
                            lastLocationRef.current = newLoc;
                            
                            const { data: { session } } = await supabase.auth.getSession();
                            if (session?.user) {
                                // Combined Update
                                await supabase.from('profiles').update({ 
                                    latitude: newLoc.lat,
                                    longitude: newLoc.lng,
                                    last_location: `POINT(${newLoc.lng} ${newLoc.lat})`,
                                    last_active: new Date().toISOString()
                                }).eq('id', session.user.id);
                            }
                        }
                    },
                    async (err) => {
                        // Suppress transient errors
                        if (err.code === 1) { // PERMISSION_DENIED
                            console.error("Location Permission Denied. Clearing location from DB.");
                            
                            // Explicitly HIDE user from map if they revoke permission
                            const { data: { session } } = await supabase.auth.getSession();
                            if (session?.user) {
                                await supabase.from('profiles').update({ 
                                    latitude: null,
                                    longitude: null,
                                    last_location: null,
                                    last_active: new Date().toISOString()
                                }).eq('id', session.user.id);
                            }
                            
                            setPermissionStatus('denied'); // Sync local status
                        } else if ((err.code === 2 || err.code === 3) && highAccuracy) { 
                            // If High Accuracy fails, downgrade to Low Accuracy automatically
                            console.log("📍 Location: High accuracy failed, switching to low accuracy...");
                            navigator.geolocation.clearWatch(watchIdRef.current);
                            startWatch(false); // Restart with low accuracy
                        } else {
                            // Already on low accuracy or other error - just silence it to avoid spam
                        }
                    },
                    {
                        enableHighAccuracy: highAccuracy,
                        timeout: 20000,
                        maximumAge: 10000
                    }
                );
            };

            startWatch(true); // Start with high accuracy
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
