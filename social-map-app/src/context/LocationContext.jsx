import React, { createContext, useContext, useState, useRef } from "react";
import { supabase } from "../supabaseClient";

const LocationContext = createContext();

export function LocationProvider({ children }) {
  const [permissionStatus, setPermissionStatus] = useState("prompt");
  const [userLocation, setUserLocation] = useState(null);
  const watchIdRef = useRef(null);


  const trackingRef = useRef(false);

  // Auto-detect permission changes (e.g. system settings)
  React.useEffect(() => {
      if (navigator.permissions && navigator.permissions.query) {
          navigator.permissions.query({ name: 'geolocation' }).then((result) => {
              const handleChange = () => {
                  if (result.state === 'granted') {
                      requestPermissionFromUser(); // Will start watching and update DB
                  } else if (result.state === 'denied') {
                      setPermissionStatus('denied');
                      stopWatching();
                  }
              };
              
              // Initial check
              if (result.state === 'granted') {
                  requestPermissionFromUser();
              }

              result.addEventListener('change', handleChange);
              return () => result.removeEventListener('change', handleChange);
          });
      }
  }, []);

  // Internal helper to just clear the watcher without DB updates
  const cleanupWatcher = () => {
    trackingRef.current = false; 
    if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
    }
  };

  const stopWatching = async () => {
    cleanupWatcher(); // Stop tracking locally

    // 🔥 HIDE USER when location is off
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
          await supabase.from("profiles").update({
              is_location_on: false,
              is_ghost_mode: true, // 🔥 Sync Ghost Mode ON
              last_active: new Date().toISOString()
          }).eq("id", session.user.id);
      }
    } catch (err) {
      console.error("Failed to update visibility:", err);
    }
  };

  const startWatchingLocation = () => {
    if (!navigator.geolocation) return;
    
    // Stop previous watchers internal
    cleanupWatcher();

    trackingRef.current = true; // 🔥 Allow updates

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        if (!trackingRef.current) return; // 🔥 Guard against race condition

        const newLoc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setUserLocation(newLoc);

        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user && trackingRef.current) { // Double check before async DB call
          await supabase.from("profiles").update({
            latitude: newLoc.lat,
            longitude: newLoc.lng,
            is_location_on: true, // 🔥 SHOW USER
            is_ghost_mode: false, // 🔥 Force Ghost Mode OFF
            last_location: `POINT(${newLoc.lng} ${newLoc.lat})`,
            last_active: new Date().toISOString()
          }).eq("id", session.user.id);
        }
      },
      (error) => {
        // Suppress timeout errors (Code 3) to avoid console spam as watchPosition keeps retrying
        if (error.code === 3) return; 

        console.warn("Location watch error:", error.message);

        if (error.code === 1) {
          setPermissionStatus("denied");
          trackingRef.current = false; // Stop on denial
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,    // Allow 10s old cached position to reduce timeouts
        timeout: 30000        // 30s timeout
      }
    );
  };

  const requestPermissionFromUser = () => {
    if (!navigator.geolocation) {
      alert("Geolocation not supported.");
      return;
    }

    cleanupWatcher(); // 🔥 internal reset only - no DB update

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const newLoc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setPermissionStatus("granted");
        setUserLocation(newLoc);

        // 🔥 Update DB IMMEDIATELY so map unblocks even if watcher times out later
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                await supabase.from("profiles").update({
                    latitude: newLoc.lat,
                    longitude: newLoc.lng,
                    is_location_on: true, // 🔥 SHOW USER
                    is_ghost_mode: false,
                    last_location: `POINT(${newLoc.lng} ${newLoc.lat})`,
                    last_active: new Date().toISOString()
                }).eq("id", session.user.id);
            }
        } catch (err) {
            console.error("Failed to update initial location:", err);
        }

        startWatchingLocation(); // 🔥 Start real-time tracking
      },
      (error) => {
        console.warn("Initial location check failed:", error.message);

        if (error.code === 1) {
          setPermissionStatus("denied");
          alert("Location access denied. Please enable it in settings.");
          return; 
        } 
        
        // For Timeout (3) or Unavailable (2), we proceed to start the watcher anyway.
        // The watcher has better retry logic (maximumAge, etc.)
        console.log("⚠️ Initial location timed out/unavailable. Starting watcher anyway...");
        
        // We still want to try tracking!
        startWatchingLocation(); 
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,  
        timeout: 30000 // Increased to 30s
      }
    );
  };

  // console.log("📍 [LocationProvider] Rendering provider", { childrenPresent: !!children });

  return (
    <LocationContext.Provider
      value={{
        isLocationEnabled: permissionStatus === 'granted',
        permissionStatus,
        userLocation,
        requestPermissionFromUser,
        setPermission: (status) => {
            if (status === 'denied') {
                setPermissionStatus(status);
                stopWatching();
            } else if (status === 'granted') {
                // Don't set status yet - wait for success callback in requestPermissionFromUser
                requestPermissionFromUser();
            } else {
                setPermissionStatus(status);
            }
        },
        resetPermission: () => {
            setPermissionStatus('prompt');
            stopWatching(); // Ensure we stop tracking and hide user
        },
        stopWatching // Explicitly expose stopWatching
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export const useLocationContext = () => {
    const context = useContext(LocationContext);
    if (context === undefined) {
        throw new Error('useLocationContext must be used within a LocationProvider');
    }
    return context;
};
