import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";

const LocationContext = createContext();

export function LocationProvider({ children }) {

  const [userLocation, setUserLocation] = useState(null);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const watchIdRef = useRef(null);

  // ----------------------------------------
  // 🔹 START LOCATION
  // CRITICAL: This function must NOT be async.
  // On iOS Safari, geolocation.getCurrentPosition MUST be called
  // synchronously within a user gesture (click) handler.
  // Making the function async breaks the gesture chain on iOS.
  // ----------------------------------------
  const startLocation = () => {
    if (loadingLocation) return;

    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    setLoadingLocation(true);

    // ✅ Called synchronously — preserves user gesture on iOS Safari
    navigator.geolocation.getCurrentPosition(
      // SUCCESS
      (position) => {
        const newLoc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setUserLocation(newLoc);
        setLocationEnabled(true);
        setLoadingLocation(false);

        // Start live tracking
        startWatching();

        // Sync to DB (async is fine here — we're inside the callback, not the gesture)
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) {
            supabase.from("profiles").update({
              latitude: newLoc.lat,
              longitude: newLoc.lng,
              last_location: `POINT(${newLoc.lng} ${newLoc.lat})`,
              is_ghost_mode: false,
              is_location_on: true
            }).eq("id", session.user.id);
          }
        });
      },

      // ERROR
      (error) => {
        console.log("❌ Location error:", error.code, error.message);
        setLoadingLocation(false);
        setLocationEnabled(false);
        setUserLocation(null);

        if (error.code === 1) {
          // PERMISSION_DENIED
          alert(
            "📍 Location permission was denied.\n\n" +
            "To enable:\n" +
            "• Chrome: tap the 🔒 lock icon → Site settings → Location → Allow\n" +
            "• Safari: Settings → Privacy → Location Services → [Browser] → Allow"
          );
        } else if (error.code === 2) {
          // POSITION_UNAVAILABLE
          alert("📍 Location unavailable. Please check your device GPS settings.");
        } else if (error.code === 3) {
          // TIMEOUT
          alert("📍 Location request timed out. Please try again.");
        }

        // Sync denied state to DB
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) {
            supabase.from("profiles").update({
              is_location_on: false,
              is_ghost_mode: true
            }).eq("id", session.user.id);
          }
        });
      },

      // OPTIONS — no timeout so iOS doesn't give up too fast
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
            }).eq("id", session.user.id);
          }
        });
      },
      (err) => {
        console.log("⚠️ Watch error:", err.code, err.message);

        if (watchIdRef.current) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }

        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) {
            supabase.from("profiles").update({
              latitude: null,
              longitude: null,
              last_location: null,
              is_location_on: false,
              is_ghost_mode: true
            }).eq("id", session.user.id);
          }
        });
      },

      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );
  };

  // ----------------------------------------
  // 🔹 STOP LOCATION (Ghost Mode ON)
  // ----------------------------------------
  const stopLocation = () => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setUserLocation(null);
    setLocationEnabled(false);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        supabase.from("profiles").update({
          latitude: null,
          longitude: null,
          last_location: null,
          is_location_on: false,
          is_ghost_mode: true
        }).eq("id", session.user.id);
      }
    });
  };

  // ----------------------------------------
  // 🔹 AUTO-START IF ALREADY GRANTED
  // Only auto-start if permission was previously granted.
  // Never auto-prompt on page load (bad UX + blocked by browsers).
  // navigator.permissions is not available on all browsers (e.g. iOS Safari < 16)
  // so we guard with a check.
  // ----------------------------------------
  useEffect(() => {
    if (!navigator.permissions) {
      // iOS Safari < 16 doesn't support navigator.permissions
      // Don't auto-start — wait for user to click the button
      setLoadingLocation(false);
      return;
    }

    navigator.permissions.query({ name: "geolocation" }).then((result) => {
      if (result.state === "granted") {
        // Already granted — safe to auto-start without a prompt
        startLocation();
      } else {
        // "prompt" or "denied" — wait for user gesture
        setLoadingLocation(false);
      }
    }).catch(() => {
      // permissions.query failed — just wait for user gesture
      setLoadingLocation(false);
    });
  }, []);


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
        loadingLocation,
        startLocation,
        stopLocation,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export const useLocationContext = () => useContext(LocationContext);
