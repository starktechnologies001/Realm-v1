import React, { createContext, useContext, useState, useRef, useEffect } from "react";
import { supabase } from "../supabaseClient";

const LocationContext = createContext();

export function LocationProvider({ children }) {

  // ⚡️ LOAD CACHED STATE (Instant Load)
  const [userLocation, setUserLocation] = useState(() => {
    try {
        const cached = localStorage.getItem('cached_user_location');
        return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });

  const [locationEnabled, setLocationEnabled] = useState(() => {
    return localStorage.getItem('cached_location_enabled') === 'true';
  });

  const [ghostMode, setGhostMode] = useState(() => {
     // Default to true if nothing cached, for safety
     const cached = localStorage.getItem('cached_ghost_mode');
     return cached ? cached === 'true' : true;
  });

  // If we have a cached location, we aren't "loading" visually
  const [loadingLocation, setLoadingLocation] = useState(() => {
      // If we have location and it's enabled, we are ready to show map
      return !(localStorage.getItem('cached_user_location') && localStorage.getItem('cached_location_enabled') === 'true');
  }); 
  
  const watchIdRef = useRef(null);

  // -------------------------------------------------
  // 🚀 START LOCATION (Device Permission Trigger)
  // -------------------------------------------------
  const startLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation not supported on this device.");
      setLoadingLocation(false);
      return;
    }

    // console.log("📍 Requesting device location...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {

        const newLoc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setUserLocation(newLoc);
        setLocationEnabled(true);
        setGhostMode(false);
        setLoadingLocation(false); 

        // 💾 Cache Logic
        localStorage.setItem('cached_user_location', JSON.stringify(newLoc));
        localStorage.setItem('cached_location_enabled', 'true');
        localStorage.setItem('cached_ghost_mode', 'false');

        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          await supabase.from("profiles").update({
            latitude: newLoc.lat,
            longitude: newLoc.lng,
            last_location: `POINT(${newLoc.lng} ${newLoc.lat})`,
            is_location_on: true,
            is_ghost_mode: false
          }).eq("id", session.user.id);
        }

        lastUpdateRef.current = Date.now(); // Prevent immediate second update
        startWatching();
      },
      (error) => {
        console.log("❌ Location error:", error);

        if (error.code === 1) {
             // Check if we already alerted recently to avoid spam (optional)
             // alert("📍 Location Access Denied...");
        } else if (error.code === 3) {
             console.log("⚠️ Location timeout - retrying...");
        }

        setLocationEnabled(false);
        setLoadingLocation(false); // ✅ Failed but check done
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 30000,
      }
    );
  };

  // -------------------------------------------------
  // 🔄 LIVE LOCATION TRACKING
  // -------------------------------------------------
  // -------------------------------------------------
  // 🔄 LIVE LOCATION TRACKING
  // -------------------------------------------------
  const lastUpdateRef = useRef(0); // For throttling

  const startWatching = () => {
    if (watchIdRef.current) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const newLoc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setUserLocation(newLoc);
        localStorage.setItem('cached_user_location', JSON.stringify(newLoc)); // 💾 Sync cache

        // Throttled DB Update (every 5s)
        const now = Date.now();
        if (now - lastUpdateRef.current > 5000) {
            lastUpdateRef.current = now;
            
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                 await supabase.from("profiles").update({
                    latitude: newLoc.lat,
                    longitude: newLoc.lng,
                    last_location: `POINT(${newLoc.lng} ${newLoc.lat})`,
                    // Keep status active
                    is_location_on: true
                  }).eq("id", session.user.id);
            }
        }
      },
      (err) => {
        console.log("⚠️ Live tracking error:", err);
      },
      { 
        enableHighAccuracy: true,
        maximumAge: 0, 
        timeout: 10000 
      }
    );
  };

  // -------------------------------------------------
  // 🛑 STOP LOCATION (Ghost Mode ON)
  // -------------------------------------------------
  const stopLocation = async () => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setUserLocation(null);
    setLocationEnabled(false);
    setGhostMode(true);
    setLoadingLocation(false);

    // 🧹 Clear Cache
    localStorage.removeItem('cached_user_location');
    localStorage.setItem('cached_location_enabled', 'false');
    localStorage.setItem('cached_ghost_mode', 'true');

    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      await supabase.from("profiles").update({
        latitude: null,
        longitude: null,
        last_location: null,
        is_location_on: false,
        is_ghost_mode: true
      }).eq("id", session.user.id);
    }
  };

  // -------------------------------------------------
  // 🔁 AUTO SYNC FROM DATABASE ON LOGIN
  // -------------------------------------------------
  useEffect(() => {
    const syncFromDatabase = async () => {

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
          setLoadingLocation(false);
          return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("is_location_on, is_ghost_mode")
        .eq("id", session.user.id)
        .single();

      if (!profile) {
          setLoadingLocation(false); 
          return;
      }

      // If user INTENDS to be on, try starting
      if (profile.is_location_on && !profile.is_ghost_mode) {
        startLocation(); // This triggers async geolocation which sets loading=false when done/error
      } else {
        stopLocation(); // Sets loading=false immediately
      }
    };

    syncFromDatabase();
  }, []);

  return (
    <LocationContext.Provider
      value={{
        userLocation,
        locationEnabled,
        ghostMode,
        loadingLocation, // 🔥 Exposed
        startLocation,
        stopLocation
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export const useLocationContext = () => useContext(LocationContext);
