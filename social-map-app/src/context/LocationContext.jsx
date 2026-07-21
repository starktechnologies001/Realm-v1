import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import { distanceMetres, fuzzyLocationForDB } from "../utils/locationPrivacy";
import { setOnline } from "../services/presenceService";

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
  const [checkingPermission, setCheckingPermission] = useState(true);

  const [loadingLocation, setLoadingLocation] = useState(false);

  const watchIdRef = useRef(null);
  const lastSyncTime = useRef(0);
  const lastSyncLoc = useRef(null);
  const isStationaryRef = useRef(false);
  const stationarySinceRef = useRef(null);
  const fuzzyCacheRef = useRef(null);
  // Cache visibility_mode to avoid an extra SELECT on every location sync
  const visibilityModeRef = useRef(null);
  const visibilityLastFetched = useRef(0);

  // Initialize fuzzy location cache from localStorage safely on first paint
  if (fuzzyCacheRef.current === null) {
      try {
          const cached = localStorage.getItem('lastFuzzyCache');
          if (cached) {
              fuzzyCacheRef.current = JSON.parse(cached);
          }
      } catch (e) {
          console.warn("Failed to load fuzzy location cache:", e);
      }
  }

  const getCachedFuzzyLocation = (newLoc, isStationary, stationarySince) => {
      const now = Date.now();
      const cache = fuzzyCacheRef.current;
      let shouldRegenerate = false;

      if (!cache) {
          shouldRegenerate = true;
      } else {
          const distMoved = distanceMetres(cache.realLat, cache.realLng, newLoc.lat, newLoc.lng);
          // Stable threshold of 100 meters to keep avatars still
          if (distMoved > 100) {
              shouldRegenerate = true;
          }
      }

      if (shouldRegenerate) {
          const fLoc = fuzzyLocationForDB(newLoc.lat, newLoc.lng, isStationary, stationarySince);
          fuzzyCacheRef.current = {
              realLat: newLoc.lat,
              realLng: newLoc.lng,
              fLat: fLoc.latitude,
              fLng: fLoc.longitude,
              last_location: fLoc.last_location,
              lastGeneratedTime: now
          };
          try {
              localStorage.setItem('lastFuzzyCache', JSON.stringify(fuzzyCacheRef.current));
          } catch (e) {
              console.warn("Error saving fuzzy cache to localStorage:", e);
          }
      }

      return {
          latitude: fuzzyCacheRef.current.fLat,
          longitude: fuzzyCacheRef.current.fLng,
          last_location: fuzzyCacheRef.current.last_location
      };
  };

  // ----------------------------------------
  // 🔹 START LOCATION
  // ----------------------------------------
  const startLocation = (forcePublic = false) => {
    if (loadingLocation) return;

    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    // If tracking is already active and we have a location, just update visibility settings in the background
    // without triggering a slow GPS lookup or showing the loading spinner.
    if (locationEnabled && userLocation) {
      localStorage.removeItem("manualLocationDisable");
      
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          supabase.from("profiles").select("visibility_mode, is_ghost_mode").eq("id", session.user.id).maybeSingle().then(({ data }) => {
            let currentMode = data?.visibility_mode || 'public';
            if (forcePublic && currentMode === 'ghost') {
                currentMode = 'public';
            }
            const isGhost = currentMode === 'ghost';
            
            const fLoc = getCachedFuzzyLocation(userLocation, isStationaryRef.current, stationarySinceRef.current);
            
            supabase.from("profiles").update({
              latitude: isGhost ? null : fLoc.latitude,
              longitude: isGhost ? null : fLoc.longitude,
              last_location: isGhost ? null : fLoc.last_location,
              is_location_on: !isGhost,
              is_ghost_mode: isGhost,
              visibility_mode: currentMode,
              activity_status: isGhost ? 'offline' : 'live',
              last_seen: new Date().toISOString(),
              is_stationary: isStationaryRef.current,
              stationary_since: stationarySinceRef.current
            }).eq("id", session.user.id).then(({ error }) => {
              if (error) console.error("Location sync error in background:", error);
            });
          });
        }
      }).catch(err => console.warn("Session error during background location start:", err));

      if (!watchIdRef.current) {
          startWatching();
      }
      return;
    }

    setLoadingLocation(true);

    // ✅ Clear manual disable flag since the user explicitly wants to turn it ON
    localStorage.removeItem("manualLocationDisable");

    // 🔥 PHASE 1: Immediately broadcast "live" + cached location to DB — zero delay for nearby users!
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        supabase.from("profiles").select("visibility_mode, is_ghost_mode, latitude, longitude").eq("id", session.user.id).maybeSingle().then(({ data }) => {
          let currentMode = data?.visibility_mode || 'public';
          if (forcePublic && currentMode === 'ghost') {
              currentMode = 'public';
          }
          const isGhost = currentMode === 'ghost';

          const cachedLoc = userLocation || (() => {
            try {
              const c = localStorage.getItem('lastKnownLocation');
              return c ? JSON.parse(c) : null;
            } catch { return null; }
          })();
          
          const updatePayload = {
            is_location_on: !isGhost,
            is_ghost_mode: isGhost,
            visibility_mode: currentMode,
            activity_status: isGhost ? 'offline' : 'live',
            is_online: !isGhost,
            last_seen: new Date().toISOString()
          };

          const useLat = cachedLoc?.lat || (data?.latitude ? parseFloat(data.latitude) : null);
          const useLng = cachedLoc?.lng || (data?.longitude ? parseFloat(data.longitude) : null);
          if (useLat && useLng && !isGhost) {
            const fLoc = getCachedFuzzyLocation({ lat: useLat, lng: useLng }, false, null);
            updatePayload.latitude = fLoc.latitude;
            updatePayload.longitude = fLoc.longitude;
            updatePayload.last_location = fLoc.last_location;
          }

          supabase.from("profiles").update(updatePayload).eq("id", session.user.id).then();
        });
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
            const fLoc = getCachedFuzzyLocation(newLoc, false, null);
            supabase.auth.getSession().then(({ data: { session } }) => {
              if (session?.user?.id) {
                supabase.from("profiles").select("visibility_mode, is_ghost_mode").eq("id", session.user.id).maybeSingle().then(({ data }) => {
                  let currentMode = data?.visibility_mode || 'public';
                  if (forcePublic && currentMode === 'ghost') {
                      currentMode = 'public';
                  }
                  const isGhost = currentMode === 'ghost';

                  supabase.from("profiles").update({
                    latitude: isGhost ? null : fLoc.latitude,
                    longitude: isGhost ? null : fLoc.longitude,
                    last_location: isGhost ? null : fLoc.last_location,
                    is_location_on: !isGhost,
                    is_ghost_mode: isGhost,
                    visibility_mode: currentMode,
                    activity_status: isGhost ? 'offline' : 'live',
                    last_seen: new Date().toISOString(),
                    is_stationary: false,
                    stationary_since: null
                  }).eq("id", session.user.id).then(({ error }) => {
                    if (error) console.error("Location sync error:", error);
                  });
                });
              }
            }).catch(err => console.warn("Session error during location start:", err));
          },

          // ERROR
          (error) => {
            console.log("❌ Location error:", error);

            // Code 3 = Timeout — very common on mobile cold-start GPS.
            // Silently retry once with a relaxed timeout rather than killing the session.
            if (error.code === 3) {
              console.warn("📍 GPS timeout — retrying with relaxed timeout...");
              setLoadingLocation(false);
              // Retry with a much longer timeout and accept any cached position
              try {
                navigator.geolocation.getCurrentPosition(
                  (position) => {
                    const newLoc = { lat: position.coords.latitude, lng: position.coords.longitude };
                    isStationaryRef.current = false;
                    stationarySinceRef.current = null;
                    setDevicePermissionGranted(true);
                    setLocationEnabled(true);
                    setUserLocation(newLoc);
                    try { localStorage.setItem('lastKnownLocation', JSON.stringify(newLoc)); } catch {}
                    startWatching();
                    const fLoc = getCachedFuzzyLocation(newLoc, false, null);
                    supabase.auth.getSession().then(({ data: { session } }) => {
                      if (session?.user?.id) {
                        supabase.from("profiles").select("visibility_mode, is_ghost_mode").eq("id", session.user.id).maybeSingle().then(({ data }) => {
                          let currentMode = data?.visibility_mode || 'public';
                          if (forcePublic && currentMode === 'ghost') {
                              currentMode = 'public';
                          }
                          const isGhost = currentMode === 'ghost';
                          supabase.from("profiles").update({
                            latitude: isGhost ? null : fLoc.latitude,
                            longitude: isGhost ? null : fLoc.longitude,
                            last_location: isGhost ? null : fLoc.last_location,
                            is_location_on: !isGhost,
                            is_ghost_mode: isGhost,
                            visibility_mode: currentMode,
                            activity_status: isGhost ? 'offline' : 'live',
                            last_seen: new Date().toISOString(),
                            is_stationary: false,
                            stationary_since: null
                          }).eq("id", session.user.id).then();
                        });
                      }
                    });
                  },
                  (retryError) => {
                    // Retry also failed — log silently, do not show alert or mark offline
                    console.warn("📍 GPS retry also timed out. Will try again when user moves.", retryError);
                    setLoadingLocation(false);
                  },
                  { enableHighAccuracy: false, maximumAge: 60000, timeout: 60000 }
                );
              } catch (e) {
                console.warn("LocationContext: retry getCurrentPosition failed", e);
                setLoadingLocation(false);
              }
              return; // Do NOT mark user offline for a timeout
            }

            // Non-timeout errors (code 1 = permission denied, code 2 = unavailable)
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
            }
          },

          // OPTIONS — fast first-fix options (non-high-accuracy & large maximumAge)
          {
            enableHighAccuracy: false,
            maximumAge: 300000,
            timeout: 10000,
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
            // 1. Calculate distance moved since last DB sync
            const now = Date.now();
            const localDistMeters = lastSyncLoc.current 
                ? distanceMetres(lastSyncLoc.current.lat, lastSyncLoc.current.lng, newLoc.lat, newLoc.lng)
                : Infinity;

            // 2. Throttling: sync only if moved ≥15m AND ≥15s elapsed,
            //    OR force a heartbeat every 30s to keep 'live' status alive.
            const timeSinceSync = now - lastSyncTime.current;
            const shouldSync = !lastSyncTime.current || 
                (timeSinceSync > 15000 && localDistMeters > 15) || 
                (timeSinceSync > 30000);

            setUserLocation(prev => {
                if (prev && distanceMetres(prev.lat, prev.lng, newLoc.lat, newLoc.lng) < 1) {
                    return prev;
                }
                return newLoc;
            });
            try { localStorage.setItem('lastKnownLocation', JSON.stringify(newLoc)); } catch {}

            if (!shouldSync) return;

            lastSyncTime.current = now;
            lastSyncLoc.current = newLoc;

            // Stationary logic
            if (localDistMeters <= 15) {
                if (!isStationaryRef.current) {
                    isStationaryRef.current = true;
                    stationarySinceRef.current = new Date().toISOString();
                }
            } else {
                isStationaryRef.current = false;
                stationarySinceRef.current = null;
            }

            const fLoc = getCachedFuzzyLocation(newLoc, isStationaryRef.current, stationarySinceRef.current);

            // Use cached visibility mode — only re-fetch from DB every 60s
            // to avoid an extra SELECT round-trip on every location sync.
            const needsVisibilityRefresh = (now - visibilityLastFetched.current) > 60000;

            supabase.auth.getSession().then(({ data: { session } }) => {
                if (!session?.user?.id) return;
                const userId = session.user.id;

                // performSync is defined here so userId is in scope
                const performSync = (visibilityMode) => {
                    const isGhost = visibilityMode === 'ghost';
                    supabase.from("profiles").update({
                        latitude:         isGhost ? null : fLoc.latitude,
                        longitude:        isGhost ? null : fLoc.longitude,
                        last_location:    isGhost ? null : fLoc.last_location,
                        is_location_on:   !isGhost,
                        is_ghost_mode:    isGhost,
                        visibility_mode:  visibilityMode,
                        activity_status:  isGhost ? 'offline' : 'live',
                        last_seen:        new Date().toISOString(),
                        is_stationary:    isStationaryRef.current,
                        stationary_since: stationarySinceRef.current
                    }).eq("id", userId).then(({ error }) => {
                        if (error) console.error("Location sync error:", error);
                    });
                };

                if (visibilityModeRef.current && !needsVisibilityRefresh) {
                    // Use cached value — no extra SELECT
                    performSync(visibilityModeRef.current);
                } else {
                    // Refresh visibility mode from DB
                    supabase.from("profiles")
                        .select("visibility_mode")
                        .eq("id", userId)
                        .maybeSingle()
                        .then(({ data }) => {
                            const mode = data?.visibility_mode || 'public';
                            visibilityModeRef.current = mode;
                            visibilityLastFetched.current = now;
                            performSync(mode);
                        });
                }
            }).catch(err => console.warn("Session error during location watch sync:", err));
          },
          (err) => {
            // Code 3 is Timeout. It's non-fatal for watchPosition (it will keep trying), but it spams the console.
            if (err.code !== 3) {
                console.log("⚠️ Watch error:", err);
            }
            // If we lose tracking mid-way, stop gracefully
            if (err.code === 1) { // 1 = PERMISSION_DENIED
               // This will handle the OS-level revocation edge case
               setDevicePermissionGranted(false);
               internalStopLocation(false);
            } else if (err.code === 2) { // 2 = POSITION_UNAVAILABLE (often happens incorrectly on mobile app wake)
               setDevicePermissionGranted(false);
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
            const isGhost = data?.visibility_mode === 'ghost';
            
            // Clear stationary refs when stopped
            isStationaryRef.current = false;
            stationarySinceRef.current = null;

            supabase.from("profiles").update({
              is_location_on: false,
              is_ghost_mode: isGhost,
              visibility_mode: data?.visibility_mode || 'public',
              activity_status: 'offline',
              is_online: false,
              latitude: null,
              longitude: null,
              last_location: null,
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
  // 🔹 HEARTBEAT SYSTEM (30s Lightweight Heartbeat)
  // ----------------------------------------
  useEffect(() => {
    if (!locationEnabled) return;

    const heartbeatInterval = setInterval(() => {
      const now = Date.now();
      // Avoid extra DB calls if watchPosition already synced within the last 20 seconds
      if (now - lastSyncTime.current < 20000) return;

      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session?.user?.id) return;
        const userId = session.user.id;

        const isGhost = visibilityModeRef.current === 'ghost';
        if (isGhost) return; // Do NOT send heartbeat in ghost mode

        lastSyncTime.current = now;
        supabase.from("profiles").update({
          last_seen: new Date().toISOString(),
          activity_status: 'live',
          is_online: true
        }).eq("id", userId).then(({ error }) => {
          if (error) console.error("Heartbeat sync error:", error);
        });
      }).catch(err => console.warn("Session error during heartbeat:", err));
    }, 30000); // 30s heartbeat

    return () => clearInterval(heartbeatInterval);
  }, [locationEnabled]);

  // ----------------------------------------
  // 🔹 PRESENCE & APP VISIBILITY MANAGER
  // ----------------------------------------
  useEffect(() => {
      // Global startup: Mark online when user is logged in
      supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user?.id) {
              setOnline(session.user.id, true);
          }
      });

      const handleUnload = () => {
          supabase.auth.getSession().then(({ data: { session } }) => {
              if (session?.user?.id) {
                  setOnline(session.user.id, false);
              }
          });
      };

      const handleVisibilityChange = () => {
          supabase.auth.getSession().then(({ data: { session } }) => {
              if (!session?.user?.id) return;
              const userId = session.user.id;

              if (document.hidden) {
                  // Tab switched / backgrounded: Send final timestamp, preserve 2-5m grace period (do NOT set offline immediately)
                  if (locationEnabled && visibilityModeRef.current !== 'ghost') {
                      supabase.from("profiles").update({
                          last_seen: new Date().toISOString()
                      }).eq("id", userId).then();
                  }
                  if (watchIdRef.current) {
                      try { navigator.geolocation.clearWatch(watchIdRef.current); } catch {}
                      watchIdRef.current = null;
                  }
              } else {
                  // Tab foregrounded / returned: Immediately refresh heartbeat & resume tracking
                  setOnline(userId, true);
                  if (locationEnabled && !watchIdRef.current) {
                      startWatching();
                  }
              }
          });
      };

      window.addEventListener("beforeunload", handleUnload);
      document.addEventListener("visibilitychange", handleVisibilityChange);
      return () => {
          window.removeEventListener("beforeunload", handleUnload);
          document.removeEventListener("visibilitychange", handleVisibilityChange);
      };
  }, [locationEnabled]);

  // ----------------------------------------
  // 🔹 PERMISSIONS API LISTENER (Auto Handlers)
  // ----------------------------------------
  useEffect(() => {
    if (!navigator.permissions) {
      setCheckingPermission(false);
      return;
    }

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
       } else {
           setDevicePermissionGranted(false);
           if (state === "denied") {
               internalStopLocation(false); // Not a manual toggle override, forced by OS
           }
       }
    };

    navigator.permissions.query({ name: "geolocation" }).then((status) => {
      permissionStatus = status;
      
      // Check initial state on app load
      handlePermissionChange({ target: status });
      
      // Listen for future toggles
      status.onchange = handlePermissionChange;
      setCheckingPermission(false);
    }).catch(err => {
      console.error("Permission query failed:", err);
      setCheckingPermission(false);
    });

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
        checkingPermission,
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
