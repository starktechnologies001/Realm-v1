import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";

const LocationContext = createContext();

export function LocationProvider({ children }) {

  const [userLocation, setUserLocation] = useState(null);

  // App toggle (your internal switch)
  const [locationEnabled, setLocationEnabled] = useState(false);

  // Device permission (OS GPS)
  const [devicePermissionGranted, setDevicePermissionGranted] = useState(false);

  const [loadingLocation, setLoadingLocation] = useState(false);

  const watchIdRef = useRef(null);

  // ----------------------------------------
  // 🔹 START LOCATION
  // ----------------------------------------
  const startLocation = () => {
    if (loadingLocation) return;

    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    setLoadingLocation(true);

    // ✅ Clear manual disable flag since the user explicitly wants to turn it ON
    localStorage.removeItem("manualLocationDisable");

    navigator.geolocation.getCurrentPosition(
      // SUCCESS
      (position) => {
        const newLoc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setDevicePermissionGranted(true);
        setLocationEnabled(true);
        setUserLocation(newLoc);
        setLoadingLocation(false);

        // Start live tracking
        startWatching();

        // Sync to DB
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) {
            supabase.from("profiles").update({
              latitude: newLoc.lat,
              longitude: newLoc.lng,
              last_location: `POINT(${newLoc.lng} ${newLoc.lat})`,
              is_location_on: true,
              is_ghost_mode: false
            }).eq("id", session.user.id).then(({ error }) => {
              if (error) console.error("Location sync error:", error);
            });
          }
        });
      },

      // ERROR
      (error) => {
        console.log("❌ Location error:", error);
        setLoadingLocation(false);
        setDevicePermissionGranted(false);
        setLocationEnabled(false);
        setUserLocation(null);

        // Sync denied state to DB
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) {
            supabase.from("profiles").update({
              is_location_on: false,
              is_ghost_mode: true,
              latitude: null,
              longitude: null,
              last_location: null
            }).eq("id", session.user.id).then(({ error }) => {
              if (error) console.error("Location sync error:", error);
            });
          }
        });

        if (error.code === 1) {
          alert(
            "📍 Location permission was denied.\n\n" +
            "To enable:\n" +
            "• Chrome: tap the 🔒 lock icon → Site settings → Location → Allow\n" +
            "• Safari: Settings → Privacy → Location Services → [Browser] → Allow"
          );
        } else if (error.code === 2) {
          alert("📍 Location unavailable. Please check your device GPS settings.");
        } else if (error.code === 3) {
          alert("📍 Location request timed out. Please try again.");
        }
      },

      // OPTIONS
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 30000,
      }
    );
  };

  // ----------------------------------------
  // 🔹 WATCH LIVE MOVEMENT
  // ----------------------------------------
  const startWatching = () => {
    if (watchIdRef.current) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newLoc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setUserLocation(newLoc);

        // Throttled DB update
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) {
            supabase.from("profiles").update({
              latitude: newLoc.lat,
              longitude: newLoc.lng,
              last_location: `POINT(${newLoc.lng} ${newLoc.lat})`,
              is_location_on: true,
              is_ghost_mode: false
            }).eq("id", session.user.id).then(({ error }) => {
              if (error) console.error("Location sync error:", error);
            });
          }
        });
      },
      (err) => {
        console.log("⚠️ Watch error:", err);
        // If we lose tracking mid-way, stop gracefully
        if (err.code === 1) { // 1 = PERMISSION_DENIED
           // This will handle the OS-level revocation edge case
           internalStopLocation(false);
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );
  };

  // ----------------------------------------
  // 🔹 INTERNAL STOP LOGIC
  // ----------------------------------------
  const internalStopLocation = (isManualOverride = false) => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setLocationEnabled(false);
    setUserLocation(null);

    // ✅ If the user actively clicked the toggle to turn it off, record that choice
    if (isManualOverride) {
       localStorage.setItem("manualLocationDisable", "true");
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        supabase.from("profiles").update({
          is_location_on: false,
          is_ghost_mode: true,
          latitude: null,
          longitude: null,
          last_location: null
        }).eq("id", session.user.id).then(({ error }) => {
          if (error) console.error("Location sync error:", error);
        });
      }
    });
  };

  // ----------------------------------------
  // 🔹 PUBLIC STOP LOCATION (User Toggle)
  // ----------------------------------------
  const stopLocation = () => {
     internalStopLocation(true); // Yes, this is a manual override by the user
  };

  // ----------------------------------------
  // 🔹 TOGGLE LOCATION SERVICE
  // ----------------------------------------
  const toggleLocationService = () => {
    if (!locationEnabled) {
      startLocation();
    } else {
      stopLocation();
    }
  };

  // ----------------------------------------
  // 🔹 PERMISSIONS API LISTENER (Auto Handlers)
  // ----------------------------------------
  useEffect(() => {
    if (!navigator.permissions) return;

    let permissionStatus = null;

    const handlePermissionChange = (e) => {
       const state = e.target ? e.target.state : permissionStatus.state;
       
       if (state === "granted") {
           setDevicePermissionGranted(true);
           // Rule 1: Auto-start IF user hasn't explicitly disabled it
           const isManuallyDisabled = localStorage.getItem("manualLocationDisable") === "true";
           if (!isManuallyDisabled) {
               startLocation();
           }
       } else if (state === "denied") {
           // Rule 2 & 4: Stop everything. GPS is totally blocked.
           setDevicePermissionGranted(false);
           internalStopLocation(false); // Not a manual toggle override, forced by OS
       }
    };

    navigator.permissions.query({ name: "geolocation" }).then((status) => {
      permissionStatus = status;
      
      // Check initial state on app load
      handlePermissionChange({ target: status });
      
      // Listen for future toggles
      status.onchange = handlePermissionChange;
    }).catch(err => console.error("Permission query failed:", err));

    return () => {
       if (permissionStatus) {
           permissionStatus.onchange = null;
       }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Cleanup watcher on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return (
    <LocationContext.Provider
      value={{
        userLocation,
        locationEnabled,
        devicePermissionGranted,
        loadingLocation,
        toggleLocationService,
        startLocation,
        stopLocation,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export const useLocationContext = () => useContext(LocationContext);
