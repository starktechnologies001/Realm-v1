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

   const isLocationEnabled =
       permissionStatus === 'granted' &&
       typeof window !== 'undefined' &&
       'geolocation' in navigator;



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

    // 🔁 Sync browser permission state on load + external changes
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!navigator.permissions?.query) return;

        navigator.permissions.query({ name: 'geolocation' }).then((result) => {
            setPermission(result.state, true);

            result.onchange = () => {
                setPermission(result.state, true);
            };
        });
    }, []);

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
                        const lastLoc = lastLocationRef.current;        

                        let movedEnough = true;
                        if (lastLoc) {
                            const distKm = getDistanceKm(
                                lastLoc.lat,
                                lastLoc.lng,
                                newLoc.lat,
                                newLoc.lng
                            );
                            movedEnough = distKm > 0.02; // 20 meters
                        }
                        
                        // Smart throttling: Update if >30s or >20m moved
                        if (    
                            timeDiff > 30000 || 
                            (movedEnough && timeDiff > 10000)
                        ) {
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
                    (err) => {
                        // Suppress transient errors
                        if (err.code === 1) { 
                            if (permissionStatus !== 'denied') {    
                                setPermission('denied', true);
                            }

                            if (watchIdRef.current) {
                                navigator.geolocation.clearWatch(watchIdRef.current);
                                watchIdRef.current = null;
                            }
                            return;
                        }   
                        
                        if ((err.code === 2 || err.code === 3) && highAccuracy) {                                   
                            // If High Accuracy fails, downgrade to Low Accuracy automatically
                            console.log("📍 Location: High accuracy failed, switching to low accuracy...");
                            if (watchIdRef.current) {   
                                navigator.geolocation.clearWatch(watchIdRef.current);
                            }
                            startWatch(false);
                        }
                        // Already on low accuracy or other error - just silence it to avoid spam
                        
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
                watchIdRef.current = null;
            }
        };
    }, [isLocationEnabled]);

    // Clear location from DB when permission is denied/revoked
    useEffect(() => {
        if (permissionStatus !== 'denied') return;

        const clearLocation = async () => {
            console.log("🚫 Permission denied/revoked. Clearing location from DB...");
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) return;

            await supabase
                .from('profiles')
                .update({
                    latitude: null,
                    longitude: null,
                    last_location: null,
                    last_active: new Date().toISOString()
                })
                .eq('id', session.user.id);
            setUserLocation(null);
        };
        clearLocation();
    }, [permissionStatus]);

    // Helper to reset and allow re-prompting
    const resetPermission = () => {
        setPermission('prompt');
    };

    const requestPermissionFromUser = () => {
    if (!navigator.geolocation) {
        setPermission('denied', true);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        () => {
            setPermission('granted', true);
        },
        (err) => {
            if (err.code === 1) {
                // User clicked "Block"
                setPermission('denied', true);
                alert("Location is blocked. Please enable it from browser settings.");
            } else {
                console.log("Location error:", err);
            }
        },
        {
            enableHighAccuracy: true
        }
    );
};

    return (
        <LocationContext.Provider value={{ 
            permissionStatus, 
            isLocationEnabled, 
            userLocation, // Expose live location
            setPermission, 
            resetPermission,
            requestPermissionFromUser 
        }}>
            {children}
        </LocationContext.Provider>
    );
}

export const useLocationContext = () => useContext(LocationContext);
