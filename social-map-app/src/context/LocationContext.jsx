import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import { distanceMetres, fuzzyLocationForDB } from "../utils/locationPrivacy";

const LocationContext = createContext();

export function LocationProvider({ children }) {

  // 🚀 Seed from localStorage for instant avatar rendering on re-open
  const [userLocation, setUserLocation] = useState(() => {
    try {
      const cached = localStorage.getItem('lastKnownLocation');
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });

  // App toggle (your internal switch)
  const [locationEnabled, setLocationEnabled] = useState(false);

  // Device permission (OS GPS)
  const [devicePermissionGranted, setDevicePermissionGranted] = useState(false);

  const [loadingLocation, setLoadingLocation] = useState(false);

  const watchIdRef = useRef(null);
  const lastSyncTime = useRef(0);
  const lastSyncLoc = useRef(null);
  const isStationaryRef = useRef(false);
  const stationarySinceRef = useRef(null);

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

    // 🔥 PHASE 1: Immediately broadcast "live" to DB — no GPS fix needed yet.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        supabase.from("profiles").update({
          is_location_on: true,
          is_ghost_mode: false,
          visibility_mode: 'public',
          activity_status: 'live',
          last_seen: new Date().toISOString()
        }).eq("id", session.user.id).then();
      }
    });

    try {
        navigator.geolocation.getCurrentPosition(
          // SUCCESS — Phase 2: Now we have fresh coordinates, update them
          (position) => {
            const newLoc = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            };

            // Reset stationary refs on initial GPS success
            isStationaryRef.current = false;
            stationarySinceRef.current = null;

            setDevicePermissionGranted(true);
            setLocationEnabled(true);
            setUserLocation(newLoc);
            setLoadingLocation(false);
            // 🔥 Persist initial GPS fix for instant avatar on next app open
            try { localStorage.setItem('lastKnownLocation', JSON.stringify(newLoc)); } catch {}

            // Start live tracking
            startWatching();

            // Store FUZZY randomized coordinates in DB to protect user privacy (Never show exact GPS)
            const fLoc = fuzzyLocationForDB(newLoc.lat, newLoc.lng, false, null);
            supabase.auth.getSession().then(({ data: { session } }) => {
              if (session?.user?.id) {
                supabase.from("profiles").update({
                  latitude: fLoc.latitude,
                  longitude: fLoc.longitude,
                  last_location: fLoc.last_location,
                  is_location_on: true,
                  activity_status: 'live',
                  last_seen: new Date().toISOString(),
                  is_stationary: false,
                  stationary_since: null
                }).eq("id", session.user.id).then(({ error }) => {
                  if (error) console.error("Location sync error:", error);
                });
              }
            }).catch(err => console.warn("Session error during location start:", err));
          },

          // ERROR
          (error) => {
            console.log("❌ Location error:", error);
            setLoadingLocation(false);
            setDevicePermissionGranted(false);
            setLocationEnabled(false);
            setUserLocation(null);

            // Revert the Phase 1 "online" signal since GPS actually failed.
            supabase.auth.getSession().then(({ data: { session } }) => {
              if (session?.user) {
                supabase.from("profiles").update({
                  is_location_on: false,
                  is_ghost_mode: true,
                  visibility_mode: 'ghost',
                  activity_status: 'offline'
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
              alert("📍 Location restricted. Please check your device GPS settings.");
            } else if (error.code === 3) {
              alert("📍 Location request timed out. Please try again.");
            }
          },

          // OPTIONS — allow up to 5s cached position to get a quick initial fix
          {
            enableHighAccuracy: true,
            maximumAge: 5000,
            timeout: 30000,
          }
        );
    } catch (e) {
        console.warn("LocationContext: getCurrentPosition hardware lock", e);
        setLoadingLocation(false);
    }
  };

  // ----------------------------------------
  // 🔹 WATCH LIVE MOVEMENT
  // ----------------------------------------
  const startWatching = () => {
    if (watchIdRef.current) return;

    try {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const newLoc = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            };
            // 1. Calculate Jitter (in meters)
            const now = Date.now();
            const localDistMeters = lastSyncLoc.current 
                ? distanceMetres(lastSyncLoc.current.lat, lastSyncLoc.current.lng, newLoc.lat, newLoc.lng)
                : Infinity;

            // 2. Throttled DB update (Update every 10-15s ONLY IF moved 10-20m)
            const timeSinceSync = now - lastSyncTime.current;
            
            // Check threshold: 10s AND 10 meters, OR forced after 30s to keep 'live' status fresh
            const shouldSync = !lastSyncTime.current || 
                (timeSinceSync > 10000 && localDistMeters > 10) || 
                (timeSinceSync > 30000);

            setUserLocation(newLoc);
            // 🔥 Persist for instant restore on next session load
            try { localStorage.setItem('lastKnownLocation', JSON.stringify(newLoc)); } catch {}

            if (shouldSync) {
                lastSyncTime.current = now;
                lastSyncLoc.current = newLoc;

                // Stationary logic: if movement is <= 10m since last sync, we are stationary
                if (localDistMeters <= 10) {
                    if (!isStationaryRef.current) {
                        isStationaryRef.current = true;
                        stationarySinceRef.current = new Date().toISOString();
                    }
                } else {
                    isStationaryRef.current = false;
                    stationarySinceRef.current = null;
                }

                const fLoc = fuzzyLocationForDB(newLoc.lat, newLoc.lng, isStationaryRef.current, stationarySinceRef.current);
                supabase.auth.getSession().then(({ data: { session } }) => {
                    if (session?.user?.id) {
                        supabase.from("profiles").update({
                            latitude: fLoc.latitude,
                            longitude: fLoc.longitude,
                            last_location: fLoc.last_location,
                            is_location_on: true,
                            activity_status: 'live',
                            last_seen: new Date().toISOString(),
                            is_stationary: isStationaryRef.current,
                            stationary_since: stationarySinceRef.current
                        }).eq("id", session.user.id).then(({ error }) => {
                            if (error) console.error("Location sync error:", error);
                        });
                    }
                }).catch(err => console.warn("Session error during location watch sync:", err));
            }
          },
          (err) => {
            // Code 3 is Timeout. It's non-fatal for watchPosition (it will keep trying), but it spams the console.
            if (err.code !== 3) {
                console.log("⚠️ Watch error:", err);
            }
            // If we lose tracking mid-way, stop gracefully
            if (err.code === 1) { // 1 = PERMISSION_DENIED
               // This will handle the OS-level revocation edge case
               internalStopLocation(false);
            } else if (err.code === 2) { // 2 = POSITION_UNAVAILABLE (often happens incorrectly on mobile app wake)
               internalStopLocation(false);
               // Try to restart tracking after a 5-second buffer (app wakes, GPS needs time)
               setTimeout(() => {
                   if (localStorage.getItem("manualLocationDisable") !== "true") {
                       startLocation();
                   }
               }, 5000);
            }
          },
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 }
        );
    } catch (e) {
        console.warn("LocationContext: watchPosition hardware lock on wake", e);
    }
  };

  // ----------------------------------------
  // 🔹 INTERNAL STOP LOGIC
  // ----------------------------------------
  const internalStopLocation = (isManualOverride = false) => {
    if (watchIdRef.current) {
        try {
            navigator.geolocation.clearWatch(watchIdRef.current);
        } catch (e) {
            console.warn("LocationContext: clearWatch lock", e);
        }
        watchIdRef.current = null;
    }

    setLocationEnabled(false);
    // Note: We intentionally do NOT clear `userLocation` or 'lastKnownLocation' here.
    // This ensures the avatar appears instantly on the next map open without waiting for GPS.

    // ✅ If the user actively clicked the toggle to turn it off, record that choice
    if (isManualOverride) {
       localStorage.setItem("manualLocationDisable", "true");
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        supabase.from("profiles").select("visibility_mode, is_ghost_mode").eq("id", session.user.id).maybeSingle().then(({ data }) => {
            const isGhost = data?.visibility_mode === 'ghost' || data?.is_ghost_mode;
            
            // Clear stationary refs when stopped
            isStationaryRef.current = false;
            stationarySinceRef.current = null;

            supabase.from("profiles").update({
              is_location_on: false,
              is_ghost_mode: isGhost,
              visibility_mode: isGhost ? 'ghost' : (data?.visibility_mode || 'public'),
              activity_status: isGhost ? 'offline' : 'recently_active',
              last_seen: new Date().toISOString(),
              is_stationary: false,
              stationary_since: null
            }).eq("id", session.user.id).then(({ error }) => {
              if (error) console.error("Location sync error:", error);
            });
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
  // 🔹 APP VISIBILITY MANAGER (Optimization)
  // ----------------------------------------
  useEffect(() => {
      const handleVisibilityChange = () => {
          if (document.hidden) {
              // App backgrounded: Stop hardware GPS tracking to save battery
              if (watchIdRef.current) {
                  navigator.geolocation.clearWatch(watchIdRef.current);
                  watchIdRef.current = null;
              }
          } else {
              // App foregrounded: Resume tracking if location is enabled
              if (locationEnabled && !watchIdRef.current) {
                  startWatching();
              }
          }
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);
      return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [locationEnabled]);

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
