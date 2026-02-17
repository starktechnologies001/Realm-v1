import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";

const LocationContext = createContext();

export function LocationProvider({ children }) {

  const [userLocation, setUserLocation] = useState(null);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const watchIdRef = useRef(null);

  // ----------------------------------------
  // 🔹 START LOCATION (called from MapHome button)
  // ----------------------------------------
  const startLocation = async () => {

    if (!navigator.geolocation) {
      console.log("Geolocation not supported");
      return;
    }

    setLoadingLocation(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {

        const newLoc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setUserLocation(newLoc);
        setLocationEnabled(true);

        startWatching();

        // 🔥 Update DB
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await supabase.from("profiles").update({
            latitude: newLoc.lat,
            longitude: newLoc.lng,
            is_ghost_mode: false,
            is_location_on: true
          }).eq("id", session.user.id);
        }

        setLoadingLocation(false);
      },

      async (error) => {
        console.log("❌ Location error:", error);

        setLocationEnabled(false);
        setUserLocation(null);
        setLoadingLocation(false);

        // If denied, also sync DB
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await supabase.from("profiles").update({
            is_location_on: false,
            is_ghost_mode: true
          }).eq("id", session.user.id);
        }
      },

      { enableHighAccuracy: true }
    );
  };

  // ----------------------------------------
  // 🔹 WATCH LIVE MOVEMENT
  // ----------------------------------------
  const startWatching = () => {

    if (watchIdRef.current) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {

        const newLoc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };

        setUserLocation(newLoc);

        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await supabase.from("profiles").update({
            latitude: newLoc.lat,
            longitude: newLoc.lng
          }).eq("id", session.user.id);
        }

      },
      (err) => console.log("Watch error:", err),
      { enableHighAccuracy: true }
    );
  };

  // ----------------------------------------
  // 🔹 STOP LOCATION (Ghost Mode ON)
  // ----------------------------------------
  const stopLocation = async () => {

    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setUserLocation(null);
    setLocationEnabled(false);

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await supabase.from("profiles").update({
        latitude: null,
        longitude: null,
        is_location_on: false,
        is_ghost_mode: true
      }).eq("id", session.user.id);
    }
  };

  // ----------------------------------------
  // 🔹 AUTO CHECK ON LOAD (No auto popup)
  // ----------------------------------------
  useEffect(() => {
    if (!navigator.permissions) return;

    navigator.permissions.query({ name: "geolocation" }).then((result) => {

      if (result.state === "granted") {
        startLocation();
      }

      if (result.state === "denied") {
        setLocationEnabled(false);
        setUserLocation(null);
      }
    });

  }, []);

  return (
    <LocationContext.Provider
      value={{
        userLocation,
        locationEnabled,
        loadingLocation,
        startLocation,
        stopLocation
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export const useLocationContext = () => useContext(LocationContext);
