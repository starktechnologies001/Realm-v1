import { MapContainer, TileLayer, Circle, useMap, LayersControl, LayerGroup } from 'react-leaflet';
import L from 'leaflet';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import MapProfileCard from '../components/MapProfileCard';
import FullProfileModal from '../components/FullProfileModal';
import PokeNotifications from '../components/PokeNotifications';
import Toast from '../components/Toast';
import { getAvatar2D, generateRandomRPMAvatar } from '../utils/avatarUtils';
import { getBlockedUserIds, getBlockerIds, isUserBlocked, isBlockedMutual } from '../utils/blockUtils';
import { useLocationContext } from '../context/LocationContext';
import { useCall } from '../context/CallContext';
import LimitedModeScreen from '../components/LimitedModeScreen';
import StoryViewer from '../components/StoryViewer';
import { uploadToStorage } from '../utils/fileUpload';
import { DEFAULT_MALE_AVATAR, DEFAULT_FEMALE_AVATAR, DEFAULT_GENERIC_AVATAR } from '../utils/avatarUtils';
import ImageCropper from '../components/ImageCropper';
import BottomNav from '../components/BottomNav';

// Fix icon issues
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: null,
    iconUrl: null,
    shadowUrl: null,
});

// Cross-tab communication channel for extremely fast local overrides
export const mapEventChannel = new BroadcastChannel('map_events');

// Helper: Distance
const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    var dLat = deg2rad(lat2 - lat1);
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c;
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// Generate Users with Drift for Animation
const generateMockUsers = (centerLat, centerLng) => {
    const users = [];
    const MOODS = ['Happy 🌞', 'Chilling ☕', 'Working 💻', 'Gym 💪', 'Party 🎉'];
    const STATUSES = ['Online', 'Busy', 'At Work'];
    const RELATIONSHIPS = ['Single 🕺', 'Married 💍', 'Committed 💖', 'It\'s Complicated 🌀'];
    const THOUGHTS = ['Let\'s talk 💬', 'Coffee? ☕', 'Anyone here? 👋', 'Gym? 💪', 'Food run! 🍔'];

    for (let i = 0; i < 20; i++) {
        // Fuzzing: Random offset within 500m
        const renderLat = lat;
        const renderLng = lng;
        users.push({
            id: i,
            name: `User ${i}`,
            lat: centerLat + latOffset,
            lng: centerLng + lngOffset,
            // Store target for animation (not implemented in this simple mock, but good for structure)
            targetLat: centerLat + latOffset,
            targetLng: centerLng + lngOffset,
            // Use realistic defaults instead of cartoons
            avatar: i % 2 === 0 ? '/defaults/male_avatar.jpg' : '/defaults/female_avatar.jpg',
            lastActive: 'Now',
            isLocationOn: Math.random() > 0.2,
            mood: MOODS[Math.floor(Math.random() * MOODS.length)],
            // Randomly assign thoughts to some users (High probability for demo)
            thought: Math.random() > 0.2 ? THOUGHTS[Math.floor(Math.random() * THOUGHTS.length)] : null,
            thoughtTime: Date.now() - Math.floor(Math.random() * 3600000), // Within last hour
            relationshipStatus: RELATIONSHIPS[Math.floor(Math.random() * RELATIONSHIPS.length)],
            isLocationShared: Math.random() > 0.8 // Only 20% agree to share exact location interactions
        });
    }
    return users;
};

// Control to manually recenter map
function RecenterControl({ markerRefs, currentUserId, fallbackLat, fallbackLng }) {
    const map = useMap();
    const controlRef = useRef(null);

    useEffect(() => {
        if (controlRef.current) {
            // 🔥 Natively disable Leaflet from capturing clicks/drags originating inside this div
            L.DomEvent.disableClickPropagation(controlRef.current);
            L.DomEvent.disableScrollPropagation(controlRef.current);
        }
    }, []);

    const handleRecenter = () => {
        // 🔥 Read the LIVE native marker position (not stale React state)
        // The native marker is updated every GPS tick via animateNativeMarker.
        const liveMarker = markerRefs?.current?.get(currentUserId);
        const liveLatLng = liveMarker ? liveMarker.getLatLng() : null;
        const lat = liveLatLng?.lat ?? fallbackLat;
        const lng = liveLatLng?.lng ?? fallbackLng;

        if (!lat || !lng) return;

        const currentCenter = map.getCenter();
        const targetLatLng = L.latLng(lat, lng);
        const distance = currentCenter.distanceTo(targetLatLng);
        const currentZoom = map.getZoom();

        if (distance < 5 && currentZoom >= 17) {
            map.setView(targetLatLng, currentZoom, { animate: false });
            return;
        }

        if (distance < 50) {
            map.flyTo(targetLatLng, 17, { 
                animate: true, 
                duration: 0.8,
                easeLinearity: 0.25
            });
        } else {
            map.flyTo(targetLatLng, 17, { 
                animate: true, 
                duration: 1.8,
                easeLinearity: 0.25
            });
        }
    };

    return (
        <div 
            ref={controlRef}
            className="leaflet-bottom leaflet-right" 
            style={{ 
                bottom: 'calc(80px + env(safe-area-inset-bottom))',
                right: '8px',
                zIndex: 400,
                pointerEvents: 'auto',
                position: 'absolute'
            }}
        >
            <div className="leaflet-control">
                <button
                    onClick={handleRecenter}
                    title="Recenter Map"
                    style={{
                        width: '44px',
                        height: '44px',
                        backgroundColor: '#4285F4',
                        border: 'none',
                        borderRadius: '50%',
                        boxShadow: '0 4px 12px rgba(66, 133, 244, 0.4)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        transition: 'all 0.2s ease',
                        padding: 0
                    }}
                    onMouseDown={(e) => {
                        e.currentTarget.style.transform = 'scale(0.96)';
                    }}
                    onMouseUp={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                    }}
                    onMouseEnter={(e) => { 
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(66, 133, 244, 0.5)';
                        e.currentTarget.style.transform = 'scale(1.05)';
                    }}
                    onMouseLeave={(e) => { 
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(66, 133, 244, 0.4)';
                        e.currentTarget.style.transform = 'scale(1)';
                    }}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 8C9.79 8 8 9.79 8 12C8 14.21 9.79 16 12 16C14.21 16 16 14.21 16 12C16 9.79 14.21 8 12 8ZM12 19C8.13 19 5 15.87 5 12C5 8.13 8.13 5 12 5C15.87 5 19 8.13 19 12C19 15.87 15.87 19 12 19ZM12 3C7.03 3 3 7.03 3 12C3 16.97 7.03 21 12 21C16.97 21 21 16.97 21 12C21 7.03 16.97 3 12 3Z" fill="currentColor" fillOpacity="0.9"/>
                        <path d="M12 3V1M21 12H23M12 21V23M3 12H1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                </button>
            </div>
        </div>
    );
}


// Component to handle automatic recentering on load
function RecenterAutomatically({ lat, lng, mapMode }) {
    const map = useMap();
    const hasCentered = useRef(false);
    const prevMapMode = useRef(mapMode); // Track previous mapMode to detect real changes

    // Initial Center — only once, on first valid location
    useEffect(() => {
        if (lat && lng && !hasCentered.current) {
            const zoomLevel = 17; // This is approx 250m area
            const timer = setTimeout(() => {
                 map.setView([lat, lng], zoomLevel, { animate: false });
                 hasCentered.current = true;
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [lat, lng, map]);

    // Re-center ONLY when map mode actually switches
    useEffect(() => {
        if (prevMapMode.current !== mapMode) {
            prevMapMode.current = mapMode;
            if (lat && lng) {
                map.flyTo([lat, lng], map.getZoom(), { 
                    animate: true, 
                    duration: 1.2,
                    easeLinearity: 0.25
                });
            }
        }
    }, [mapMode, lat, lng, map]);

    return null;
}

// 📍 NATIVE MARKERS SYNC COMPONENT (Bypasses React Re-renders)
function NativeMarkerSync({ users, currentUser, userLocation, currentUserIcon, createAvatarIcon, markerRefs, handleMarkerClick, animateNativeMarker, setSelectedUser }) {
    const map = useMap();

    // Sync remote users
    useEffect(() => {
        if (!map) return;
        const currentIds = new Set(users.map(u => u.id));

        // 1. Remove markers for users no longer active or visible
        for (const [id, marker] of markerRefs.current.entries()) {
            if (id === currentUser?.id) continue; // handle self separately
            if (!currentIds.has(id)) {
                marker.remove();
                markerRefs.current.delete(id);
            }
        }

        // 2. Add or update markers
        users.forEach((u) => {
            let marker = markerRefs.current.get(u.id);

            let displayThought = u.thought;
            // Use camelCase moodUpdatedAt — nearbyUsers stores all timestamps in camelCase
            const thoughtUpdatedAt = u.status_updated_at || u.statusUpdatedAt;
            if (thoughtUpdatedAt) {
                const diffHours = (new Date() - new Date(thoughtUpdatedAt)) / (1000 * 60 * 60);
                if (diffHours > 3) displayThought = null;
            }

            // moodUpdatedAt is camelCase in nearbyUsers; fallback to snake_case for safety
            const moodUpdatedAt = u.moodUpdatedAt || u.mood_updated_at;

            const icon = createAvatarIcon(
                getAvatar2D(u.avatar_url || u.avatar), 
                false, 
                displayThought, 
                u.name || u.username || 'User', 
                u.status, 
                u.mood, 
                moodUpdatedAt,
                0 // no stagger delay needed natively
            );

            if (!marker) {
                // Create native Leaflet marker
                marker = L.marker([u.lat, u.lng], { icon, zIndexOffset: 100 }).addTo(map);
                marker.on('click', () => handleMarkerClick(u));
                markerRefs.current.set(u.id, marker);
            } else {
                // 🔥 CRITICAL: Only rebuild the DOM node when the icon HTML actually changed
                // (e.g. avatar image, status, mood). DO NOT rebuild on every GPS update — 
                // that kills the requestAnimationFrame glide mid-flight.
                if (marker.options.icon !== icon) {
                    marker.setIcon(icon);
                }
            }
        });
    }, [users, map, currentUser?.id, createAvatarIcon, handleMarkerClick, markerRefs]);

    // Sync local user marker visually (initial creation and icon changes)
    useEffect(() => {
        if (!map || !currentUser || !userLocation || !currentUserIcon) return;
        
        let marker = markerRefs.current.get(currentUser.id);
        if (!marker) {
            // First time spawn
            marker = L.marker([userLocation.lat, userLocation.lng], { icon: currentUserIcon, zIndexOffset: 1000 }).addTo(map);
            // Clicking your own avatar closes any open profile card — it does NOT open one for yourself
            marker.on('click', () => setSelectedUser(null));
            markerRefs.current.set(currentUser.id, marker);
        } else {
            // DO NOT update position here. That is handled by animateNativeMarker.
            // Only update the icon if the user changed their image, status, mood, etc.
            // We verify if the icon DOM HTML actually changed by checking its cached HTML string
            // to prevent Leaflet from destroying the DOM node mid-flight.
            if (marker.options.icon !== currentUserIcon) {
                marker.setIcon(currentUserIcon);
            }
        }
    }, [currentUser?.id, currentUserIcon, map, handleMarkerClick, markerRefs]); 
    // 🔥 CRITICAL: Removed `userLocation` from deps. 
    // React should NEVER re-run this effect just because LocationContext updated the coordinates.

    return null;
}

// Map Controller: Handle User Selection & Zoom (with Mobile Offset)
function UserSelectionController({ selectedUser }) {
    const map = useMap();

    useEffect(() => {
        // console.log('🗺️ [UserSelectionController] selectedUser changed:', selectedUser);
        
        if (!selectedUser) {
            return;
        }

        // Support both lat/lng and latitude/longitude property names
        const lat = selectedUser.latitude || selectedUser.lat;
        const lng = selectedUser.longitude || selectedUser.lng;

        if (!lat || !lng) {
            console.log('🗺️ [UserSelectionController] No valid coordinates. lat:', lat, 'lng:', lng);
            return;
        }

        const targetLat = parseFloat(lat);
        const targetLng = parseFloat(lng);
        const zoomLevel = 18; // Close zoom for profile view

        // Check for Mobile (Approximate check using window width)
        const isMobile = window.innerWidth <= 768;
        console.log('🗺️ [UserSelectionController] isMobile:', isMobile, 'width:', window.innerWidth);

        if (isMobile) {
            // Calculate Offset used by MapProfileCard (Usually ~45-50vh height)
            // We want the user marker to be in the Top ~40% of the screen
            // Standard flyTo centers in middle (50%)
            // We need to shift the center "Down" so the marker appears "Up"

            // Convert LatLng to Container Point (Pixels)
            const point = map.project([targetLat, targetLng], zoomLevel);
            
            // Shift Y down by 25% of screen height (to move center down)
            const yOffset = window.innerHeight * 0.25; 
            const targetPoint = L.point(point.x, point.y + yOffset);
            
            // Convert back to LatLng
            const newCenter = map.unproject(targetPoint, zoomLevel);

            console.log('🗺️ [UserSelectionController] Flying to (mobile offset):', newCenter, 'zoom:', zoomLevel);
            
            // Use setTimeout to ensure map is ready
            setTimeout(() => {
                map.flyTo(newCenter, zoomLevel, {
                    animate: true,
                    duration: 2.0, // Slow & majestic for mobile offset
                    easeLinearity: 0.2
                });
            }, 100);
        } else {
            // Desktop: Center normally
            console.log('🗺️ [UserSelectionController] Flying to (desktop):', [targetLat, targetLng], 'zoom:', zoomLevel);
            
            setTimeout(() => {
                map.flyTo([targetLat, targetLng], zoomLevel, {
                    animate: true,
                    duration: 1.8,
                    easeLinearity: 0.2
                });
            }, 100);
        }

    }, [selectedUser, map]);

    return null;
}

// Ensure the style exists in MapHome
const mapAvatarStyle = `
    @keyframes avatarPopIn {
        0% { transform: scale(0) translateY(15px); opacity: 0; }
        60% { transform: scale(1.1) translateY(-3px); opacity: 1; }
        100% { transform: scale(1) translateY(0); opacity: 1; }
    }
`;

export default function MapHome() {
    // Map UI State
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('All');
    const [showFilters, setShowFilters] = useState(false);
    const [mapMode, setMapMode] = useState('street'); // 'street', 'hybrid', 'satellite'

    // Theme & Location Context (Moved to top)
    const { theme } = useTheme();
    const { 
        userLocation,
        locationEnabled,
        loadingLocation,
        startLocation,
        stopLocation,
    } = useLocationContext();

    // Notification State
    const [friendRequests, setFriendRequests] = useState([]);

    // Fetch Notifications
    useEffect(() => {
        const fetchNotifications = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user;
            if (!user) return;

            // Requests — fetch actual IDs so realtime accept/decline filtering works correctly
            const { data: pendingRequests } = await supabase
                .from('friendships')
                .select('id')
                .eq('receiver_id', user.id)
                .eq('status', 'pending');
            
            if (pendingRequests) {
                setFriendRequests(pendingRequests.map(r => r.id));
            }
        };

        fetchNotifications();
    }, []);

    // Filter Options
    const FILTERS = ['All', 'Online', 'Nearby', 'Friends'];

    // Call Context
    const { startCall } = useCall();

    const [viewingStoryUser, setViewingStoryUser] = useState(null);

    // Initialize state synchronously to prevent flash
    const [isDarkMode, setIsDarkMode] = useState(() => {
        if (theme === 'dark') return true;
        if (theme === 'light') return false;
        if (typeof window !== 'undefined' && window.matchMedia) {
            return window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        return false;
    });

    useEffect(() => {
        const checkDarkMode = () => {
            if (theme === 'dark') return true;
            if (theme === 'light') return false;
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        };
        setIsDarkMode(checkDarkMode());

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
            if (theme === 'system') setIsDarkMode(mediaQuery.matches);
        };
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme]);

    const friendshipsRef = useRef(new Map()); // Map<friendship_id, partner_id>
    const blockedIdsRef = useRef(new Set()); // Blocked users cache

    const [nearbyUsers, setNearbyUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [loading, setLoading] = useState(true);
    // const [isGhostMode, setGhostMode] = useState(false); // 🔥 REMOVED local state
    const navigate = useNavigate();
    const routeLocation = useLocation();

    const [profileReady, setProfileReady] = useState(false);

    // Initialize from LocalStorage + Nav State for Zero Latency
    const [currentUser, setCurrentUser] = useState(() => {
        try {
            const stored = localStorage.getItem('currentUser');
            let user = stored ? JSON.parse(stored) : null;

            // Instant Override from Login Navigation (Healing)
            if (routeLocation?.state?.preloadedAvatar && user) {
                user.avatar_url = routeLocation.state.preloadedAvatar;
            }
            return user;
        } catch (e) {
            return null;
        }
    });
    const [toastMsg, setToastMsg] = useState(null);
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportTarget, setReportTarget] = useState(null);
    const [showMuteModal, setShowMuteModal] = useState(false);
    const [muteTarget, setMuteTarget] = useState(null);
    const [showFullProfile, setShowFullProfile] = useState(false);
    const [fullProfileUser, setFullProfileUser] = useState(null);

    // 🚀 INSTANT Preload: current user's avatar from localStorage on first paint (no Supabase wait)
    useEffect(() => {
        if (currentUser?.avatar_url) {
            const img = new Image();
            img.src = getAvatar2D(currentUser.avatar_url);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally runs only once on mount with localStorage data

    // Image Preloader for Instant Rendering (fires when nearby users arrive)
    useEffect(() => {
        if (!nearbyUsers || nearbyUsers.length === 0) return;

        nearbyUsers.forEach(user => {
            if (user.avatar) {
                const img = new Image();
                img.src = getAvatar2D(user.avatar);
            }
        });
    }, [nearbyUsers]);


    // Floating Thought State
    const [showThoughtInput, setShowThoughtInput] = useState(false);
    const [myThought, setMyThought] = useState('');

    // --- Onboarding State ---
    const [showProfileSetup, setShowProfileSetup] = useState(false);
    const [setupErrors, setSetupErrors] = useState({ username: false, gender: false, relationshipStatus: false });
    const [setupData, setSetupData] = useState({
        username: '', gender: '', relationshipStatus: '',
    });
    // New state for modal upload
    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(null);
    const [cropImage, setCropImage] = useState(null); // State for cropping

    // Initial Marker Animation state
    const isFirstMapLoad = useRef(!sessionStorage.getItem('avatars_animated_once'));
    useEffect(() => {
        if (isFirstMapLoad.current) {
            // Give the markers time to mount and run their CSS animation, 
            // then set it so future renders (filtering, moving, real-time) skip animation.
            setTimeout(() => {
                isFirstMapLoad.current = false;
                sessionStorage.setItem('avatars_animated_once', 'true');
            }, 2500); 
        }
    }, []);

    // ------------------------------------------------------------------
    // EFFECTS & FETCHING
    const [onboardingImage, setOnboardingImage] = useState(null);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const videoRef = React.useRef(null);
    const canvasRef = React.useRef(null);
    const markerRefs = React.useRef(new Map());
    const animationRefs = React.useRef(new Map());
    // 🔥 Ref-based location for non-reactive reads (prevents GPS updates causing full re-renders)
    const userLocationRef = React.useRef(userLocation);

    // 🔥 NATIVE HARDWARE ACCELERATED ANIMATION MANAGER
    const animateNativeMarker = React.useCallback((id, newLat, newLng) => {
        const marker = markerRefs.current.get(id);
        if (!marker) return;

        const currentLatLng = marker.getLatLng();
        const startLat = currentLatLng.lat;
        const startLng = currentLatLng.lng;

        // Ignore micro GPS jitter (do not animate if movement < 3 meters)
        const dist = getDistance(startLat, startLng, newLat, newLng);
        if (dist < 3) return;

        // Cancel previous animation to prevent stacking/flickering
        if (animationRefs.current.has(id)) {
            cancelAnimationFrame(animationRefs.current.get(id));
        }

        let startTime = null;
        const duration = 1000; // 1 second smooth glide

        const animate = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const progress = timestamp - startTime;

            // EaseOutCubic interpolation
            let t = Math.min(progress / duration, 1);
            t = 1 - Math.pow(1 - t, 3);

            const lat = startLat + (newLat - startLat) * t;
            const lng = startLng + (newLng - startLng) * t;

            marker.setLatLng([lat, lng]);

            if (progress < duration) {
                animationRefs.current.set(id, requestAnimationFrame(animate));
            } else {
                marker.setLatLng([newLat, newLng]); // Snap exactly to target at end
                animationRefs.current.delete(id);
            }
        };

        animationRefs.current.set(id, requestAnimationFrame(animate));
    }, []);

    // 🔥 Keep userLocationRef in sync with context without causing downstream re-renders
    useEffect(() => {
        userLocationRef.current = userLocation;
    }, [userLocation]);

    // 🚀 LOCAL USER HIGH-FREQUENCY GPS TRACKING (Overrides Context internally for map smoothness)
    useEffect(() => {
        if (!locationEnabled || !currentUser || currentUser.is_ghost_mode) {
            // If location turned OFF, visually remove marker & update DB
            if (currentUser) {
                const marker = markerRefs.current.get(currentUser.id);
                if (marker) {
                    marker.remove();
                    markerRefs.current.delete(currentUser.id);
                }
            }
            return;
        }

        let lastDbUpdate = 0;
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const newLat = pos.coords.latitude;
                const newLng = pos.coords.longitude;

                // Animate local marker natively IMMEDIATELY (no React state wait)
                animateNativeMarker(currentUser.id, newLat, newLng);

                // Update Supabase throttled (every 2-3 seconds)
                const now = Date.now();
                if (now - lastDbUpdate >= 2500) {
                    lastDbUpdate = now;
                    supabase.from("profiles").update({
                        latitude: newLat,
                        longitude: newLng,
                        last_location: `POINT(${newLng} ${newLat})`,
                        is_location_on: true,
                        is_ghost_mode: false
                    }).eq("id", currentUser.id).then();
                }
            },
            (err) => console.log("High-freq map watch error", err),
            { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, [locationEnabled, currentUser, animateNativeMarker]);

    // Check Profile Completeness
    useEffect(() => {
        const checkUser = async () => {

            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user;
            if (!user) return;

            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .maybeSingle();

            if (!profile) {
                await supabase.from('profiles').insert({
                    id: user.id,
                    username: '',
                    gender: null,
                    relationship_status: null,
                    avatar_url: null,
                    onboarding_completed: false,
                    is_location_on: false,
                    is_ghost_mode: true
                });

                setShowProfileSetup(true);
                setProfileReady(true);
                return;
            }

            setCurrentUser(profile);

            if (!profile.onboarding_completed) {
                setSetupData({
                    username: profile.username || '',
                    gender: profile.gender || '',
                    relationshipStatus: profile.relationship_status || '',
                });
                setShowProfileSetup(true);
            } else {
                setShowProfileSetup(false);
            }

            setProfileReady(true);
        };

        checkUser();
    }, []);


    // Global Unread Count Logic
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (!currentUser?.id) return;

        // Fetch initial count
        const fetchUnread = async () => {
            const { count, error } = await supabase
                .from('messages')
                .select('id', { count: 'exact', head: true })
                .eq('receiver_id', currentUser.id)
                .eq('is_read', false);
            if (!error) setUnreadCount(count || 0);
        };
        fetchUnread();

        // Subscribe to new messages
        const channel = supabase
            .channel('global_unread')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${currentUser.id}` }, async (payload) => {
                const newMessage = payload.new;
                setUnreadCount(prev => prev + 1);

                // Check mute settings before notifying
                const { data: muteData } = await supabase
                    .from('chat_settings')
                    .select('muted_until')
                    .eq('user_id', currentUser.id)
                    .eq('partner_id', newMessage.sender_id)
                    .maybeSingle();

                const isMuted = muteData?.muted_until && new Date(muteData.muted_until) > new Date();

                if (!isMuted) {
                    showToast(`New message from user! 📩`);
                }
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `receiver_id=eq.${currentUser.id}` }, async () => {
                // Re-fetch if messages are marked read elsewhere
                fetchUnread();
            })
            .subscribe();

        // Listen for all friendship changes
        const friendshipChannel = supabase
            .channel('friendships_changes_map')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'friendships'
            }, (payload) => {
                const { eventType, old: oldRec, new: newRec } = payload;

                // CASE 1: DELETE (Unfriend / Decline Request)
                if (eventType === 'DELETE') {
                    const deletedId = oldRec.id;
                    const partnerId = friendshipsRef.current.get(deletedId);

                    if (partnerId) {
                        friendshipsRef.current.delete(deletedId);
                        // Reset status in UI
                        setSelectedUser(prev => prev && prev.id === partnerId ? { ...prev, friendshipStatus: null } : prev);
                        setNearbyUsers(prev => prev.map(u => u.id === partnerId ? { ...u, friendshipStatus: null } : u));
                        showToast("Friend removed. You can now poke them again.");
                    }
                    // Also remove from pending requests badge if it was a pending request
                    setFriendRequests(prev => prev.filter(id => id !== deletedId));
                    return;
                }

                // Identify partner for INSERT/UPDATE
                const relevantId = newRec?.requester_id === currentUser.id ? newRec.receiver_id
                    : newRec?.receiver_id === currentUser.id ? newRec.requester_id
                        : null;

                if (!relevantId) return;

                // CASE 2: BLOCKED
                if (newRec?.status === 'blocked') {
                    // Update blockedIds ref instantly
                    blockedIdsRef.current.add(relevantId);
                    
                    // Remove from nearbyUsers instantly
                    setNearbyUsers(prev => prev.filter(u => u.id !== relevantId));
                    
                    // Close selected user profile if they are the one blocked
                    setSelectedUser(prev => prev && prev.id === relevantId ? null : prev);
                    
                    showToast("User blocked and removed from map.");
                    return;
                }

                // CASE 3: ACCEPTED
                if (newRec?.status === 'accepted') {
                    friendshipsRef.current.set(newRec.id, relevantId); // Cache it
                    showToast(`Friend request accepted! 🎉`);
                    setSelectedUser(prev => prev && prev.id === relevantId ? { ...prev, friendshipStatus: 'accepted' } : prev);
                    setNearbyUsers(prev => prev.map(u => u.id === relevantId ? { ...u, friendshipStatus: 'accepted' } : u));
                    // Remove from pending requests badge (I accepted their poke)
                    setFriendRequests(prev => prev.filter(id => id !== newRec.id));
                }

                // CASE 4: PENDING (New Poke)
                if (newRec?.status === 'pending') {
                    friendshipsRef.current.set(newRec.id, relevantId); // Cache it

                    const isIncoming = newRec.receiver_id === currentUser.id;
                    if (isIncoming) {
                        showToast(`New Poke received! 👋`);
                        // Increment badge INSTANTLY for incoming poke requests
                        setFriendRequests(prev => [...prev, newRec.id]);
                    }

                    // Update UI
                    setSelectedUser(prev => prev && prev.id === relevantId ? {
                        ...prev,
                        friendshipStatus: 'pending',
                        requesterId: newRec.requester_id,
                        friendshipId: newRec.id
                    } : prev);

                    setNearbyUsers(prev => prev.map(u => u.id === relevantId ? {
                        ...u,
                        friendshipStatus: 'pending',
                        requesterId: newRec.requester_id,
                        friendshipId: newRec.id
                    } : u));
                }
            })
            .subscribe();

        // Listen for new blocks in 'blocked_users' table AND custom broadcasts (cross-device instant)
        const blockChannel = supabase
            .channel('global_map_events')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'blocked_users'
            }, (payload) => {
                const { new: newBlock } = payload;
                if (!newBlock) return;

                const isMeBlocker = newBlock.blocker_id === currentUser.id;
                const isMeBlocked = newBlock.blocked_id === currentUser.id;

                // If I am involved in this block in any way
                if (isMeBlocker || isMeBlocked) {
                    const partnerId = isMeBlocker ? newBlock.blocked_id : newBlock.blocker_id;
                    
                    // Add to our blocked set to prevent them from showing up again
                    blockedIdsRef.current.add(partnerId);

                    // Remove them from the map instantly
                    setNearbyUsers(prev => prev.filter(u => u.id !== partnerId));

                    // If they are currently selected, close their profile
                    setSelectedUser(prev => prev && prev.id === partnerId ? null : prev);
                }
            })
            .on('postgres_changes', {
                event: 'DELETE',
                schema: 'public',
                table: 'blocked_users'
            }, (payload) => {
                const { old: oldBlock } = payload;
                if (!oldBlock) return;
                
                // If the block is lifted, we just remove them from the ref. 
                // They will reappear next time nearbyUsers is polled.
                if (oldBlock.blocker_id === currentUser.id) {
                    blockedIdsRef.current.delete(oldBlock.blocked_id);
                } else if (oldBlock.blocked_id === currentUser.id) {
                    blockedIdsRef.current.delete(oldBlock.blocker_id);
                }
            })
            // ADD BROADCAST LISTENER
            .on('broadcast', { event: 'USER_BLOCKED_CROSS_DEVICE' }, (payload) => {
                const { blocker_id, blocked_id } = payload.payload;
                if (currentUser.id === blocker_id || currentUser.id === blocked_id) {
                    const partnerId = currentUser.id === blocker_id ? blocked_id : blocker_id;
                    blockedIdsRef.current.add(partnerId);
                    setNearbyUsers(prev => prev.filter(u => u.id !== partnerId));
                    setSelectedUser(prev => prev && prev.id === partnerId ? null : prev);
                    console.log('⚡ Received Cross-Device Block Event for:', partnerId);
                }
            })
            .on('broadcast', { event: 'USER_UNBLOCKED_CROSS_DEVICE' }, (payload) => {
                const { blocker_id, blocked_id } = payload.payload;
                if (currentUser.id === blocker_id || currentUser.id === blocked_id) {
                    const partnerId = currentUser.id === blocker_id ? blocked_id : blocker_id;
                    blockedIdsRef.current.delete(partnerId);
                    console.log('⚡ Received Cross-Device Unblock Event for:', partnerId);
                }
            })
            .subscribe((status) => {
                if(status === 'SUBSCRIBED') {
                    console.log('⚡ Subscribed to global_map_events');
                }
            });

        return () => {
            supabase.removeChannel(channel);
            supabase.removeChannel(friendshipChannel);
            supabase.removeChannel(blockChannel);
        };
    }, [currentUser, userLocation]);

    // Fast-path block listener (Cross-tab BroadcastChannel)
    // Supabase real-time is good, but BroadcastChannel is INSTANT across tabs.
    useEffect(() => {
        const handleMapEvent = (event) => {
            if (event.data?.type === 'USER_BLOCKED' && event.data?.userId) {
                const blockedUserId = event.data.userId;
                
                // Instantly update block cache
                blockedIdsRef.current.add(blockedUserId);
                
                // Instantly remove from map
                setNearbyUsers(prev => prev.filter(u => u.id !== blockedUserId));
                
                // Close profile if open
                setSelectedUser(prev => prev && prev.id === blockedUserId ? null : prev);
                
                console.log('⚡ Fast-path block processed for user:', blockedUserId);
            } else if (event.data?.type === 'USER_UNBLOCKED' && event.data?.userId) {
                // If unblocked, just remove from ref so they can appear next poll
                blockedIdsRef.current.delete(event.data.userId);
            }
        };

        mapEventChannel.addEventListener('message', handleMapEvent);
        return () => {
            mapEventChannel.removeEventListener('message', handleMapEvent);
        };
    }, []);

    // Poll for nearby users
    useEffect(() => {
        if (!currentUser) return; // Wait for user, but don't need location to fetch others

        const fetchNearbyUsers = async () => {
            if (!currentUser?.id) return; // Prevent API calls if user not loaded

            try {
                // Fetch blocked user IDs (both directions - users I blocked and users who blocked me)
                const [blockedByMe, blockedMe] = await Promise.all([
                    getBlockedUserIds(currentUser.id),  // Users I blocked
                    getBlockerIds(currentUser.id)        // Users who blocked me
                ]);

                // Combine both lists for mutual hiding
                const allBlockedIds = new Set([...blockedByMe, ...blockedMe]);
                blockedIdsRef.current = allBlockedIds; // Update Ref for real-time subscriptions

                // Run queries in parallel for faster loading.
                // Use allSettled so a failed sub-query (e.g. 525 SSL) doesn't cancel the rest.
                const [profilesResult, friendshipResult, storiesResult, viewsResult] = await Promise.allSettled([
                    // Fetch all profiles with only needed fields
                    supabase
                        .from('profiles')
                        .select('id, username, full_name, gender, latitude, longitude, status, relationship_status, status_message, status_updated_at, last_active, avatar_url, hide_status, show_last_seen, is_public, is_location_on, mood, mood_updated_at')
                        .neq('id', currentUser.id)
                        .or('is_ghost_mode.eq.false,is_ghost_mode.is.null') // Allow NULL as false (visible)
                        .not('latitude', 'is', null)
                        .not('longitude', 'is', null),

                    // Fetch my friendships (to sync map)
                    supabase
                        .from('friendships')
                        .select('id, requester_id, receiver_id, status')
                        .or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`),

                    // Fetch Active Stories (Last 24h)
                    supabase
                        .from('stories')
                        .select('id, user_id')
                        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),

                    // Fetch my story views (to distinguish Seen/Unseen)
                    supabase
                        .from('story_views')
                        .select('story_id')
                        .eq('viewer_id', currentUser.id)
                ]);

                // Unwrap allSettled results safely — a rejected promise won't crash the rest
                const safeValue = (settled) => settled?.status === 'fulfilled' ? settled.value : { data: null, error: settled?.reason };
                const pr = safeValue(profilesResult);
                const fr = safeValue(friendshipResult);
                const sr = safeValue(storiesResult);
                const vr = safeValue(viewsResult);

                // Silently warn on non-critical failures (stories/views can gracefully degrade)
                if (sr.error) console.warn('⚠️ Stories fetch failed (non-fatal):', sr.error?.message || sr.error);
                if (vr.error) console.warn('⚠️ Views fetch failed (non-fatal):', vr.error?.message || vr.error);

                // Reassign to familiar variable names
                const profilesData = pr;
                const friendshipData = fr;
                const storiesData = sr;
                const viewsData = vr;


                // Populate friendships map
                const myFriendships = new Map();

                if (friendshipData.data) {
                    friendshipData.data.forEach(f => {
                        const partnerId = f.requester_id === currentUser.id ? f.receiver_id : f.requester_id;
                        if (f.status === 'accepted') {
                            friendshipsRef.current.set(f.id, partnerId);
                            myFriendships.set(partnerId, { status: 'accepted', id: f.id });
                        }
                        if (f.status === 'pending') {
                            // Cache pending ID too for deletion lookup
                            friendshipsRef.current.set(f.id, partnerId);
                            myFriendships.set(partnerId, {
                                status: 'pending',
                                id: f.id,
                                requesterId: f.requester_id // Store requester to know direction
                            });
                        }
                    });
                }

                // Process Stories & Views
                const usersWithStories = new Set();
                const usersWithUnseenStories = new Set();

                const myViewedStoryIds = new Set(
                    viewsData.data ? viewsData.data.map(v => v.story_id) : []
                );

                if (storiesData.data) {
                    // Group stories by user
                    const storiesByUser = {};
                    storiesData.data.forEach(s => {
                        if (!storiesByUser[s.user_id]) storiesByUser[s.user_id] = [];
                        storiesByUser[s.user_id].push(s);
                        usersWithStories.add(s.user_id);
                    });

                    // Check for unseen
                    Object.keys(storiesByUser).forEach(userId => {
                        const userStories = storiesByUser[userId];
                        const hasUnseen = userStories.some(s => !myViewedStoryIds.has(s.id));
                        if (hasUnseen) {
                            usersWithUnseenStories.add(userId);
                        }
                    });
                }

                // Debug: Log raw fetch results
                if (profilesData.error) {
                    console.error('❌ [MapHome] Fetch Error:', profilesData.error);
                }

                // Filter and map users (exclude blocked users, those with location off, AND current user)
                const validUsers = (profilesData.data || [])
                    .filter(u => {
                        const isBlocked = allBlockedIds.has(u.id);
                        const isMe = u.id === currentUser.id;
                        const isLocationOff = u.is_location_on !== true; // strictly require location to be on
                        
                        if (isBlocked || isMe || isLocationOff) {
                            return false;
                        }
                        return true;
                    })
                    .map(u => {
                        // Use actual avatar if available, otherwise gender-based fallback
                        const safeName = encodeURIComponent(u.username || u.full_name || 'User');
                        // Standardized Fallback Logic (No DiceBear)
                        let fallbackAvatar;
                        if (u.gender === 'Male') fallbackAvatar = DEFAULT_MALE_AVATAR;
                        else if (u.gender === 'Female') fallbackAvatar = DEFAULT_FEMALE_AVATAR;
                        else fallbackAvatar = DEFAULT_GENERIC_AVATAR;

                        // Micro-jitter for initial load
                        // Ensure we work with Numbers
                        const lat = parseFloat(u.latitude);
                        const lng = parseFloat(u.longitude);
                        const renderLat = lat + (Math.random() - 0.5) * 0.0002;
                        const renderLng = lng + (Math.random() - 0.5) * 0.0002;

                        // Get friendship data from map
                        const fData = myFriendships.get(u.id);

                        // Check Status Expiration (3 Hours)
                        let statusMessage = u.status_message;
                        let statusEmoji = u.status;
                        
                        if (u.status_updated_at) {
                            const statusDate = new Date(u.status_updated_at);
                            const now = new Date();
                            const diffHours = (now - statusDate) / (1000 * 60 * 60);
                            
                            if (diffHours > 3) {
                                statusMessage = null;
                                statusEmoji = null;
                            }
                        }

                        return {
                            id: u.id,
                            name: u.username || 'User',
                            lat: renderLat,
                            lng: renderLng,
                            avatar: u.avatar_url || fallbackAvatar, // Use real avatar if exists
                            originalAvatar: u.avatar_url,
                            status: statusEmoji,
                            hide_status: u.hide_status,
                            show_last_seen: u.show_last_seen,
                            relationshipStatus: u.relationship_status,
                            thought: statusMessage,
                            mood: u.mood,
                            moodUpdatedAt: u.mood_updated_at,
                            lastActive: u.last_active,
                            isLocationOn: u.is_location_on,
                            isLocationShared: true,
                            friendshipStatus: fData?.status || null,
                            friendshipId: fData?.id || null,
                            is_public: u.is_public,
                            status_updated_at: u.status_updated_at, // 🔥 Critical for expiration check
                            // PRIVACY CHECK: Only show story if public OR friends
                            hasStory: usersWithStories.has(u.id) && (u.is_public !== false || fData?.status === 'accepted'),
                            hasUnseenStory: usersWithUnseenStories.has(u.id) && (u.is_public !== false || fData?.status === 'accepted')
                        };
                    });

                console.log("📍 [MapHome] Fetched Users:", validUsers.length, validUsers);
                validUsers.forEach(u => console.log(`   - ${u.name}: ${u.lat}, ${u.lng} (Avatar: ${u.avatar ? 'Yes' : 'No'})`));
                setNearbyUsers(prev => {
                    const map = new Map();

                    // keep existing realtime users
                    prev.forEach(u => map.set(u.id, u));

                    // update / insert fetched users
                    validUsers.forEach(u => {
                        map.set(u.id, {
                            ...map.get(u.id),
                            ...u
                        });
                    });
                    return Array.from(map.values());
                });
            } catch (err) {
                console.error(err);
            }
        };

        // Real-time Subscription for Instant Updates (both UPDATE and INSERT)
        const channel = supabase
            .channel('public:profiles')
            // Unified UPDATE listener for Location + Profile changes
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
                console.log("📍 [MapHome] Realtime UPDATE received:", payload);
                const updatedUser = payload.new;

                console.log("Realtime UPDATE:", {
                    username: updatedUser.username,
                    is_location_on: updatedUser.is_location_on,
                    is_ghost_mode: updatedUser.is_ghost_mode,
                    latitude: updatedUser.latitude,
                    longitude: updatedUser.longitude
                });

                if (updatedUser.id === currentUser.id) return; // Skip self

                // FILTER BLOCKED USERS
                if (blockedIdsRef.current.has(updatedUser.id)) {
                    // Start removing them if they are currently on map
                    setNearbyUsers(prev => prev.filter(u => u.id !== updatedUser.id));
                    return;
                }

                // Check visibility criteria
                const hasLocation =
                    updatedUser.latitude != null &&
                    updatedUser.longitude != null;

                const isVisible =
                    updatedUser.is_location_on !== false &&
                    updatedUser.is_ghost_mode !== true &&
                    updatedUser.latitude != null &&
                    updatedUser.longitude != null;



                setNearbyUsers(prev => {

                    const existingIndex = prev.findIndex(u => u.id === updatedUser.id);
                    const exists = existingIndex !== -1;

                    if (!isVisible) {
                        // 🔥 Close card if selected user goes invisible
                        setSelectedUser(prev => prev?.id === updatedUser.id ? null : prev);
                        // 🔥 If user should NOT be visible → remove safely
                        if (exists) {
                            return prev.filter(u => u.id !== updatedUser.id);
                        }
                        return prev;
                    }

                    // ---------- Visible User ----------

                    const renderLat = parseFloat(updatedUser.latitude);
                    const renderLng = parseFloat(updatedUser.longitude);

                    const newUserObj = {
                        id: updatedUser.id,
                        name: updatedUser.username || 'User',
                        lat: renderLat,
                        lng: renderLng,
                        avatar: updatedUser.avatar_url || DEFAULT_GENERIC_AVATAR,
                        originalAvatar: updatedUser.avatar_url,
                        status: updatedUser.status,
                        thought: updatedUser.status_message,
                        lastActive: updatedUser.last_active,
                        isLocationShared: true,
                        isLocationOn: updatedUser.is_location_on,
                        relationshipStatus: updatedUser.relationship_status,
                        mood: updatedUser.mood,
                        moodUpdatedAt: updatedUser.mood_updated_at,
                        status_updated_at: updatedUser.status_updated_at,
                        is_public: updatedUser.is_public,
                        hide_status: updatedUser.hide_status,
                        show_last_seen: updatedUser.show_last_seen,
                        friendshipStatus: exists ? prev[existingIndex].friendshipStatus : null,
                        hasStory: exists ? prev[existingIndex].hasStory : false,
                        hasUnseenStory: exists ? prev[existingIndex].hasUnseenStory : false
                    };

                    if (exists) {
                        const existingUser = prev[existingIndex];
                        
                        // Check if pure data changed (anything other than location)
                        const didDataChange = 
                            existingUser.name !== newUserObj.name ||
                            existingUser.avatar !== newUserObj.avatar ||
                            existingUser.status !== newUserObj.status ||
                            existingUser.thought !== newUserObj.thought ||
                            existingUser.isLocationOn !== newUserObj.isLocationOn ||
                            existingUser.relationshipStatus !== newUserObj.relationshipStatus ||
                            existingUser.mood !== newUserObj.mood ||
                            existingUser.moodUpdatedAt !== newUserObj.moodUpdatedAt ||
                            existingUser.status_updated_at !== newUserObj.status_updated_at ||
                            existingUser.is_public !== newUserObj.is_public ||
                            existingUser.hide_status !== newUserObj.hide_status ||
                            existingUser.show_last_seen !== newUserObj.show_last_seen;

                        // 🔥 Update card dynamically if focused
                        setSelectedUser(prevSelected => prevSelected?.id === updatedUser.id ? { ...prevSelected, ...newUserObj } : prevSelected);

                        if (didDataChange) {
                            // Data changed (like avatar or status), so update React state and NativeMarkerSync will handle icon refresh
                            return prev.map(u => u.id === updatedUser.id ? { ...u, ...newUserObj } : u);
                        } else {
                            // 🔥 REALTIME SMOOTH MOVEMENT OPTIMIZATION
                            // ONLY coordinates changed. Animate marker locally natively to avoid a full MapHome re-render.
                            animateNativeMarker(updatedUser.id, renderLat, renderLng);
                            
                            // Silently mutate internal state array element for future calculations without triggering re-render
                            existingUser.lat = renderLat;
                            existingUser.lng = renderLng;
                            existingUser.lastActive = newUserObj.lastActive;
                            return prev;
                        }

                    } else {

                        // 🔥 CRITICAL: Re-add immediately if user turned ON location
                        return [...prev, newUserObj];

                    }

                });
            })
            // Listen for new user logins (INSERT events)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, (payload) => {
                const newUser = payload.new;
                if (!newUser.latitude || !newUser.longitude) return;
                if (newUser.id === currentUser.id) return; // Skip self

                // FILTER BLOCKED USERS
                if (blockedIdsRef.current.has(newUser.id)) return;

                // Show new user if not in ghost mode and location is on
                if (
                    newUser.is_location_on === true &&
                    newUser.is_ghost_mode === false &&
                    newUser.latitude != null &&
                    newUser.longitude != null
                ) {

                    // Preload Image Immediately
                    const mapAvatar = newUser.avatar_url;

                    // Preload Image Immediately
                    const img = new Image();
                    img.src = mapAvatar;

                   setNearbyUsers(prev => {
                        // Avoid duplicates
                        if (prev.some(u => u.id === newUser.id)) return prev;

                        // Add new user
                        return [...prev, {
                            id: newUser.id,
                            name: newUser.username || 'User',
                            lat: parseFloat(newUser.latitude),
                            lng: parseFloat(newUser.longitude),
                            avatar: mapAvatar,
                            originalAvatar: newUser.avatar_url,
                            status: newUser.status,
                            thought: newUser.status_message,
                            lastActive: newUser.last_active,

                            isLocationOn: true,
                            isLocationShared: true,
                            relationshipStatus: newUser.relationship_status,
                            mood: newUser.mood,
                            moodUpdatedAt: newUser.mood_updated_at,

                            status_updated_at: newUser.status_updated_at,
                            is_public: newUser.is_public,
                            hide_status: newUser.hide_status,
                            show_last_seen: newUser.show_last_seen,

                            friendshipStatus: null,
                            hasStory: false,
                            hasUnseenStory: false
                        }];
                    });
                }
            })   // ← CLOSES INSERT .on()

            // Real-time Story Updates (Ring Indicator)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'stories' },
                (payload) => {

                    const story = payload.new;

                    setNearbyUsers(prev =>
                        prev.map(u => {

                            if (u.id === story.user_id) {

                                const isFriend = u.friendshipStatus === 'accepted';
                                const isPublic = u.is_public !== false;

                                if (isFriend || isPublic) {
                                    return {
                                        ...u,
                                        hasStory: true,
                                        hasUnseenStory: true
                                    };
                                }
                            }

                            return u;
                        })
                    );

                }
            )
            .subscribe();


        const interval = setInterval(fetchNearbyUsers, 30000); // Poll every 30s (Realtime handles immediate changes)
        fetchNearbyUsers(); // Initial fetch

        return () => {
            clearInterval(interval);
            supabase.removeChannel(channel);
        };
    }, [currentUser]); // 🔥 Removed userLocation to prevent re-fetching on every move

    // Live Location is now handled entirely by LocationContext.
    // We just listen to userLocation via the useEffect above.
    // Removed redundant local watcher to prevent kCLErrorLocationUnknown and resource contention. 

    // Preload avatar images to eliminate lag
    useEffect(() => {
        const preloadImage = (url) => {
            if (!url) return;
            const img = new Image();
            img.src = url;
        };

        // Preload current user avatar
        if (currentUser?.avatar_url) {
            const avatar2D = getAvatar2D(currentUser.avatar_url);
            preloadImage(avatar2D);
        }

        // Preload nearby users avatars
        nearbyUsers.forEach(user => {
            if (user.avatar) {
                const avatar2D = user.avatar.includes('.glb') ? getAvatar2D(user.avatar) : user.avatar;
                preloadImage(avatar2D);
            }
        });
    }, [currentUser, nearbyUsers]);


    // Auth & Location Tracking
    useEffect(() => {
        let isMounted = true;
        
        const initUser = async () => {
            // Give Supabase a tiny window to parse hash tokens if we just arrived from OAuth
            if (window.location.hash.includes('access_token')) {
                console.log("⏳ [MapHome] Detected OAuth token in hash, waiting for Supabase...");
                await new Promise(r => setTimeout(r, 500)); // Small buffer for session parsing
            }

            let userStr = localStorage.getItem('currentUser');
            let parsedUser = null;
            
            // 1. Verify Auth (Handles OAuth Redirection gap)
            if (!userStr) {
                console.log("🟡 [MapHome] No local user found, checking Supabase session...");
                const { data: { session } } = await supabase.auth.getSession();
                
                if (session?.user) {
                    parsedUser = { id: session.user.id };
                    localStorage.setItem('currentUser', JSON.stringify(parsedUser));
                    console.log("🟢 [MapHome] Session recovered from Supabase!");
                } else if (!window.location.hash.includes('access_token')) {
                    // Only redirect if there's no session AND no token currently being processed
                    console.log("🔴 [MapHome] No session found, redirecting to login.");
                    navigate('/login');
                    return;
                } else {
                    // Hash is present but session is still null? Wait another moment.
                    console.log("⏳ [MapHome] Token present but session not ready, retrying...");
                    return; // The effect will eventually re-run or Layout will catch it
                }
            } else {
                try {
                    parsedUser = JSON.parse(userStr);
                } catch (e) {
                    console.error("Failed to parse local user:", e);
                    localStorage.removeItem('currentUser');
                    navigate('/login');
                    return;
                }
            }
            
            if (!isMounted || !parsedUser) return;
            
            // Optimistically set from cache first
            setCurrentUser(parsedUser);

            // 2. Refresh Profile (Critical for syncing Gender/Avatar updates)
            const { data: freshProfile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', parsedUser.id)
                .maybeSingle();

            if (freshProfile && isMounted) {
                // Version Check for Avatar: Optimistic local update might be newer than DB
                let finalAvatarUrl = freshProfile.avatar_url;
                if (parsedUser.avatar_url && freshProfile.avatar_url) {
                    const getTimestamp = (url) => {
                        const match = url ? url.match(/t=(\d+)/) : null;
                        return match ? parseInt(match[1]) : 0;
                    };
                    const localTs = getTimestamp(parsedUser.avatar_url);
                    const remoteTs = getTimestamp(freshProfile.avatar_url);
                    if (localTs > remoteTs) {
                        finalAvatarUrl = parsedUser.avatar_url;
                    }
                }

                const mergedUser = { ...parsedUser, ...freshProfile, avatar_url: finalAvatarUrl };
                setCurrentUser(mergedUser);
                localStorage.setItem('currentUser', JSON.stringify(mergedUser));
            }

            if (isMounted) setLoading(false); 
        };

        initUser();

        // Listen for local updates from Profile page (optimistic updates)
        const handleLocalUpdate = () => {
            const stored = localStorage.getItem('currentUser');
            if (stored) {
                setCurrentUser(JSON.parse(stored));
            }
        };
        window.addEventListener('local-user-update', handleLocalUpdate);

        // Subscribe to my own profile changes (avatar, status updates)
        // Note: we use window level check here because parsedUser is local to initUser
        // But initUser calls setCurrentUser which we can rely on for subsequent updates
        
        return () => {
            isMounted = false;
            window.removeEventListener('local-user-update', handleLocalUpdate);
        };
    }, [navigate]);



    const handlePermissionSelect = (choice) => {
        if (choice === 'while-using' || choice === 'once') {
            startLocation(); 
        }
    };


    const handleEnableLocation = async () => {
        setCurrentUser(prev => ({ ...prev, is_location_on: true }));
        
        startLocation();

    };

    const showToast = (msg) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(null), 3000);
    };

    const startCamera = async () => {
        setIsCameraOpen(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
            if (videoRef.current) videoRef.current.srcObject = stream;
        } catch (err) {
            console.error("Camera error", err);
            showToast("Camera access failed");
            setIsCameraOpen(false);
        }
    };

    const capturePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const context = canvasRef.current.getContext('2d');
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
            context.drawImage(videoRef.current, 0, 0);
            const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.8);
            setOnboardingImage(dataUrl);
            const stream = videoRef.current.srcObject;
            if (stream) stream.getTracks().forEach(t => t.stop());
            setIsCameraOpen(false);
        }
    };

    const handleCompleteSetup = async () => {
        // Validation
        const newErrors = {
            username: !setupData.username || setupData.username.trim() === '',
            gender: !setupData.gender,
            relationshipStatus: !setupData.relationshipStatus
        };

        if (newErrors.username || newErrors.gender || newErrors.relationshipStatus) {
            setSetupErrors(newErrors);
            showToast("Please fill in all required fields.");
            // Slight visual shake effect could be added here later
            return;
        }
        
        // Clear errors if any existed
        setSetupErrors({ username: false, gender: false, relationshipStatus: false });

        try {
            showToast("Saving profile... ⏳");

            let userId = currentUser?.id;
            if (!userId) {
                const { data: { session } } = await supabase.auth.getSession();
                const user = session?.user;
                if (!user) throw new Error("No authenticated user found.");
                userId = user.id;
            }

            // 1. Determine Avatar URL (Upload > Gender Default)
            let finalAvatarUrl;

            // Priority 1: Uploaded File
            if (avatarFile) {
                // Upload to 'chat-images' using userId as folder prefix if possible, or just unique name
                // Using existing uploadToStorage utility
                const { fileUrl, error: uploadError } = await uploadToStorage(avatarFile, userId, null, 'chat-images'); // Using chat-images as it's public
                if (uploadError) throw new Error("Image upload failed: " + uploadError.message);
                finalAvatarUrl = fileUrl;
            } else {
                // Priority 2: Gender Default
                if (setupData.gender === 'Male') finalAvatarUrl = DEFAULT_MALE_AVATAR;
                else if (setupData.gender === 'Female') finalAvatarUrl = DEFAULT_FEMALE_AVATAR;
                else finalAvatarUrl = DEFAULT_GENERIC_AVATAR;
            }

            // Update Profile
            const updates = {
                gender: setupData.gender,
                // status: setupData.status, // Don't overwrite status here, let it be default or whatever it was
                relationship_status: setupData.relationshipStatus,
                username: setupData.username,
                avatar_url: finalAvatarUrl,
                onboarding_completed: true  
            };
            
            // If status is empty, set a default "Available"
            if (!setupData.status) {
                updates.status = 'Online';
            } else {
                updates.status = setupData.status;
            }

            // Validate username
            if (!updates.username) {
                showToast("Username is required!");
                return;
            }

            const { error: updateError } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', userId);

            if (updateError) {
                console.error("DB Error:", updateError);
                throw new Error("DB Update Failed: " + updateError.message);
            }

            showToast("Profile Complete! Welcome! 🎉");
            setShowProfileSetup(false);

            // Sync to LocalStorage
            const updatedUser = {
                ...currentUser,
                id: userId,
                ...updates
            };
            setCurrentUser(updatedUser);
            localStorage.setItem('currentUser', JSON.stringify(updatedUser));

        } catch (error) {
            console.error("Setup Error:", error);
            showToast(`Setup Failed: ${error.message}`);
        }
    };



    const handleDeleteThought = async () => {
        if (!currentUser) return;

        try {
            // Optimistic update
            const updatedUser = { ...currentUser, thought: null, thoughtTime: null };
            setCurrentUser(updatedUser);
            setMyThought(''); // Clear input
            localStorage.setItem('currentUser', JSON.stringify(updatedUser));
            setShowThoughtInput(false);

            // DB Update
            const { error } = await supabase
                .from('profiles')
                .update({
                    status_message: null,
                    status_updated_at: null
                })
                .eq('id', currentUser.id);

            if (error) throw error;
            showToast('Thought removed');
        } catch (err) {
            console.error("Error deleting thought:", err);
            showToast("Failed to remove thought");
        }
    };

    const handlePostThought = async (e) => {
        e.preventDefault();
        if (!currentUser) return;

        try {
            // Optimistic update
            const updatedUser = { ...currentUser, thought: myThought, thoughtTime: Date.now() };
            setCurrentUser(updatedUser);
            localStorage.setItem('currentUser', JSON.stringify(updatedUser));
            setShowThoughtInput(false);

            // DB Update for global visibility
            const { error } = await supabase
                .from('profiles')
                .update({
                    status_message: myThought,
                    last_active: new Date().toISOString(),
                    status_updated_at: new Date().toISOString()
                })
                .eq('id', currentUser.id);

            if (error) throw error;
            
            setNearbyUsers(prev =>
            prev.map(u =>
                u.id === currentUser.id
                    ? {
                        ...u,
                        thought: myThought,
                        status_updated_at: new Date().toISOString(),
                        lastActive: new Date().toISOString()
                      }
                    : u
            )
        );

            showToast('Thought posted to map! 🌍');
        } catch (err) {
            console.error("Error posting thought:", err);
            showToast("Failed to post thought");
        }
    };

    // Calculate distance between two coordinates in meters (Haversine formula)
  // Helper: Distance
// Cross-tab communication channel for extremely fast local overrides 
// (e.g. instantly hiding a blocked user without waiting for DB sync)
// export const mapEventChannel = new BroadcastChannel('map_events'); // Distance in meters
    const handleUserAction = async (action, targetUser) => {
        if (!currentUser) return;

        if (action === 'message') {
            // Check if friends first
            const { data } = await supabase
                .from('friendships')
                .select('*')
                .or(`and(requester_id.eq.${currentUser.id},receiver_id.eq.${targetUser.id}),and(requester_id.eq.${targetUser.id},receiver_id.eq.${currentUser.id})`)
                .eq('status', 'accepted')
                .maybeSingle();

            if (data) {
                const chatUser = {
                    ...targetUser,
                    avatar_url: targetUser.avatar_url || targetUser.avatar, // Ensure Chat gets a URL
                    name: targetUser.name || targetUser.username || targetUser.full_name // Ensure Name
                };
                navigate('/chat', { state: { targetUser: chatUser } });
            } else {
                showToast("You need to be friends to chat! Poke them first. 👉");
            }
        }
        else if (action === 'poke') {
            try {
                // 1. Check Block Status (New Table)
                const isBlocked = await isUserBlocked(targetUser.id, currentUser.id); // target blocked me
                if (isBlocked) {
                    showToast("Failed to send poke.");
                    return;
                }
                const iBlocked = await isUserBlocked(currentUser.id, targetUser.id); // I blocked target
                if (iBlocked) {
                    showToast("Unblock user to poke them.");
                    return;
                }

                // 2. Check if already friends or requested
                const { data: existing } = await supabase
                    .from('friendships')
                    .select('*')
                    .or(`and(requester_id.eq.${currentUser.id},receiver_id.eq.${targetUser.id}),and(requester_id.eq.${targetUser.id},receiver_id.eq.${currentUser.id})`)
                    .maybeSingle();

                if (existing) {
                    if (existing.status === 'accepted') {
                        showToast(`You are already friends with ${targetUser.name}!`);
                        return;
                    }
                    else if (existing.status === 'pending') {
                        // Check who sent the request
                        if (existing.requester_id === currentUser.id) {
                            showToast(`Poke already sent to ${targetUser.name}!`);
                            return;
                        } else {
                            // THEY sent the request, and I am Poking them back -> ACCEPT IT!
                            const { error: acceptError } = await supabase
                                .from('friendships')
                                .update({ status: 'accepted' })
                                .eq('id', existing.id);

                            if (acceptError) throw acceptError;

                            showToast(`You and ${targetUser.name} are now friends! 🤝`);
                            setSelectedUser((prev) => ({ ...prev, friendshipStatus: 'accepted' }));
                            return;
                        }
                    }

                    // For 'declined' OR 'blocked' status (legacy), we delete and start fresh
                    const { error: deleteError } = await supabase
                        .from('friendships')
                        .delete()
                        .eq('id', existing.id);

                    if (deleteError) {
                        console.error('Error deleting existing record:', deleteError);
                        // Fallback: try update to pending
                        await supabase
                            .from('friendships')
                            .update({
                                status: 'pending',
                                requester_id: currentUser.id,
                                receiver_id: targetUser.id
                            })
                            .eq('id', existing.id);

                        showToast(`👋 Poked ${targetUser.name}!`);
                        setSelectedUser({ ...targetUser, friendshipStatus: 'pending' });
                        return;
                    }
                }

                // OPTIMISTIC UPDATE: Show "Requested" immediately
                showToast(`Poke Request Sent 📨`);

                // Track previous state for rollback
                const prevSelectedUser = { ...selectedUser };

                setSelectedUser({
                    ...targetUser,
                    friendshipStatus: 'pending',
                    requesterId: currentUser.id,
                    // Temporary ID or null, will update after DB
                    friendshipId: 'temp-' + Date.now()
                });

                // Send Poke Request
                const { data: newRecs, error } = await supabase
                    .from('friendships')
                    .insert({
                        requester_id: currentUser.id,
                        receiver_id: targetUser.id,
                        status: 'pending'
                    })
                    .select();

                if (error) {
                    // Revert UI on error
                    setSelectedUser(prevSelectedUser);
                    console.error('Poke error:', error);

                    if (error.code === '23505') {
                        console.warn('Handling duplicate poke insert...');
                        // Was already requested maybe? Refresh user?
                        showToast("Poke already sent!");
                        // Refetch to get truth
                    } else {
                        showToast("Failed to send poke.");
                        throw error;
                    }
                } else {
                    // Success: Update with real ID so Cancel works
                    const newFriendship = newRecs[0];
                    friendshipsRef.current.set(newFriendship.id, targetUser.id);

                    setSelectedUser(prev => ({
                        ...prev,
                        friendshipId: newFriendship.id
                    }));
                }
            } catch (err) {
                // Already handled rollback above for most cases
            }
        }
        else if (action === 'cancel-poke') {
            try {
                // Delete the friendship row (cancels request)
                // Remove from ref first so realtime listener doesn't show duplicate toast
                if (targetUser.friendshipId) {
                    friendshipsRef.current.delete(targetUser.friendshipId);
                }

                const { error } = await supabase
                    .from('friendships')
                    .delete()
                    .eq('id', targetUser.friendshipId);

                if (error) throw error;

                showToast("Request cancelled ❌");

                // Update UI immediately (Revert to no status)
                setSelectedUser({
                    ...targetUser,
                    friendshipStatus: null,
                    friendshipId: null,
                    requesterId: null
                });

            } catch (err) {
                console.error('Cancel poke error:', err);
                showToast("Failed to cancel request");
            }
        }
        else if (action === 'block') {
            try {
                // Insert into blocked_users table
                const { error } = await supabase
                    .from('blocked_users')
                    .insert({
                        blocker_id: currentUser.id,
                        blocked_id: targetUser.id
                    });

                if (error) {
                    // Check if already blocked (unique constraint violation)
                    if (error.code === '23505') {
                        showToast(`${targetUser.name} is already blocked`);
                    } else {
                        throw error;
                    }
                } else {
                    showToast(`Blocked ${targetUser.name}`);
                    
                    // INSTANT MAP UPDATE
                    blockedIdsRef.current.add(targetUser.id);
                    setNearbyUsers(prev => prev.filter(u => u.id !== targetUser.id));
                    
                    setSelectedUser(null);
                    setShowFullProfile(false);
                    // Also delete friendship if it exists, to remove from map (optional but cleaner)
                    if (targetUser.friendshipId) {
                        await supabase.from('friendships').delete().eq('id', targetUser.friendshipId);
                    }
                    
                    // Dispatch to other tabs just in case (same device)
                    if (mapEventChannel && mapEventChannel.postMessage) {
                        mapEventChannel.postMessage({ type: 'USER_BLOCKED', userId: targetUser.id });
                    }
                    
                    // Push Cross-Device Broadcast
                    const broadcastChan = supabase.channel('global_map_events');
                    broadcastChan.subscribe((status) => {
                        if (status === 'SUBSCRIBED') {
                            broadcastChan.send({
                                type: 'broadcast',
                                event: 'USER_BLOCKED_CROSS_DEVICE',
                                payload: { blocker_id: currentUser.id, blocked_id: targetUser.id }
                            });
                        }
                    });
                }
            } catch (err) {
                console.error('Block error:', err);
                showToast('Failed to block user');
            }
        }
        else if (action === 'mute') {
            if (targetUser.isMuted) {
                // UNMUTE IMMEDIATELY
                try {
                    const isRequester = targetUser.requesterId === currentUser.id;
                    const column = isRequester ? 'muted_until_by_requester' : 'muted_until_by_receiver';

                    await supabase
                        .from('friendships')
                        .update({ [column]: null })
                        .eq('id', targetUser.friendshipId);

                    showToast(`Unmuted ${targetUser.name} 🔔`);
                    setSelectedUser(prev => ({ ...prev, isMuted: false }));
                } catch (err) {
                    console.error("Unmute error:", err);
                    showToast("Failed to unmute");
                }
            } else {
                // OPEN MUTE MODAL for duration selection
                setMuteTarget(targetUser);
                setShowMuteModal(true);
            }
        }

        else if (action === 'report') {
            // Show report modal with reason options
            setReportTarget(targetUser);
            setShowReportModal(true);
            setSelectedUser(null);
            setShowFullProfile(false); // Close full profile if open
        }
        else if (action === 'zoom-to-user') {
            // Triggered by avatar click on mobile - force re-trigger zoom
            console.log('🗺️ [MapHome] zoom-to-user triggered for:', targetUser.name);
            // Force selectedUser update to re-trigger UserSelectionController
            setSelectedUser(null); // Clear first
            setTimeout(() => {
                setSelectedUser(targetUser); // Re-set to trigger zoom
            }, 50);
        }
        else if (action === 'view-profile') {
            setFullProfileUser(targetUser);
            setShowFullProfile(true);
            // Keep selectedUser set so map stays zoomed on mobile
        }
        else if (action === 'call-audio' || action === 'call-video') {
            const isVideo = action === 'call-video';
            startCall(targetUser.id, isVideo);
            showToast(`Starting ${isVideo ? 'video' : 'audio'} call... 📞`);
            setSelectedUser(null);
            setShowFullProfile(false);
        }
        else if (action === 'view-story') {
            // Fetch active stories for this user
            const fetchStories = async () => {
                try {
                    const { data, error } = await supabase
                        .from('stories')
                        .select('*')
                        .eq('user_id', targetUser.id)
                        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
                        .order('created_at', { ascending: true });

                    if (error) throw error;

                    if (data && data.length > 0) {
                        setViewingStoryUser({
                            user: targetUser,
                            stories: data
                        });
                    } else {
                        showToast("No active stories");
                    }
                } catch (err) {
                    console.error("Error fetching stories:", err);
                    showToast("Failed to load stories");
                }
            };
            fetchStories();
        }
    };

    const handleReport = async (reason) => {
        try {
            await supabase.from('reports').insert({
                reporter_id: currentUser.id,
                reported_id: reportTarget.id,
                reason: reason
            });
            showToast(`⚠️ Reported ${reportTarget.name}`);
            setShowReportModal(false);
            setReportTarget(null);
        } catch (err) {
            console.error('Report error:', err);
            showToast('Failed to submit report');
        }
    };

    const iconCache = useRef(new Map());

    const createAvatarIcon = React.useCallback((url, isSelf = false, thought = null, name = '', status = null, mood = null, moodUpdatedAt = null, animationDelay = 0) => {
        // Caching the icon object prevents React-Leaflet from destroying the DOM node and allows CSS transitions to run smoothly.
        const isGhost = isSelf && currentUser?.is_ghost_mode;
        // v2 prefix invalidates old cached icons when HTML template changes
        const cacheKey = `v5_${url}_${isSelf}_${thought}_${name}_${status}_${isGhost}_${mood}_${moodUpdatedAt}_${animationDelay}`;
        
        if (iconCache.current.has(cacheKey)) {
            return iconCache.current.get(cacheKey);
        }

        let className = 'avatar-marker';
        // Ensure url is safely wrapped and background is configured
        // Use double quotes for style attribute, single for url
        let style = `background-image: url('${url}'); background-size: cover; background-position: center;`;

        if (isSelf) {
            className += ' self';
            if (isGhost) {
                // Ghost mode: fade to indicate invisible — no grayscale filter (CSS handles protection)
                style += ' opacity: 0.45;';
            }
        }
        
        // Add staggered pop animation if not self and delay is set
        let containerStyle = 'position: relative;';
        if (!isSelf && animationDelay > 0) {
            containerStyle += ` animation: avatarPopIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; animation-delay: ${animationDelay}ms; opacity: 0; transform-origin: center bottom;`;
        }

        // Only show thought if it exists (simplified check)
        const thoughtHTML = thought
            ? `<div class="thought-bubble" style="background: white !important; color: black !important;">
                 <div class="thought-author" style="color: #4285F4 !important; font-weight: 800; font-size: 0.70rem;">${name}</div>
                 <div class="thought-content" style="color: #000000 !important; font-weight: 600; font-size: 0.75rem;">
                    ${thought}
                 </div>
               </div>`
            : '';

        let moodHTML = '';
        if (mood && moodUpdatedAt) {
            const isExpired = new Date(moodUpdatedAt).getTime() < Date.now() - 6 * 60 * 60 * 1000;
            if (!isExpired) {
                moodHTML = `<div class="mood-badge" style="position: absolute; bottom: -8px; right: -8px; font-size: 1.2rem; line-height: 1; z-index: 10;">${mood}</div>`;
            }
        }

        const icon = L.divIcon({
            className: 'custom-avatar-icon',
            html: `
                <div class="avatar-group" style="${containerStyle}">
                    ${thoughtHTML}
                    <div class="${className}" style="${style}"></div>
                    ${moodHTML}
                </div>
            `,
            iconSize: [42, 42],
            iconAnchor: [21, 21],
            popupAnchor: [0, -25]
        });

        iconCache.current.set(cacheKey, icon);
        return icon;
    }, [currentUser]);

    // Memoize the icon separately so location updates don't destroy the DOM node and break CSS transitions
    const currentUserIcon = useMemo(() => {
        if (!currentUser) return null;
        let avatarUrl;
        if (currentUser.avatar_url) {
            avatarUrl = getAvatar2D(currentUser.avatar_url);
        } else {
            if (currentUser.gender === 'Male') avatarUrl = DEFAULT_MALE_AVATAR;
            else if (currentUser.gender === 'Female') avatarUrl = DEFAULT_FEMALE_AVATAR;
            else avatarUrl = DEFAULT_GENERIC_AVATAR;
        }

        let displayThought = currentUser.thought || currentUser.status_message;
        const thoughtTime = currentUser.thoughtTime || currentUser.status_updated_at;
        
        if (displayThought && thoughtTime) {
            const isExpired = new Date(thoughtTime).getTime() < Date.now() - 3 * 60 * 60 * 1000;
            if (isExpired) {
                displayThought = null;
            }
        }

        return createAvatarIcon(avatarUrl, true, displayThought, 'You', null, currentUser.mood, currentUser.mood_updated_at);
    }, [currentUser?.id, currentUser?.avatar_url, currentUser?.gender, currentUser?.thought, currentUser?.status_message, currentUser?.thoughtTime, currentUser?.status_updated_at, currentUser?.mood, currentUser?.mood_updated_at, createAvatarIcon]);

 // 4. Main App (Map & Overlays)
    // visibleUsers filter was redundant with nearbyUsers logic. 
    // We use nearbyUsers directly which is already filtered to 300m and active users.

    // Utility for distance calculation needed by "Nearby" filter
    const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
        const R = 6371; // Radius of the earth in km
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // Distance in km
    };

    const filteredUsers = useMemo(() => {

        if (!nearbyUsers || !currentUser) return [];

        // 🌎 GLOBAL RULE (MOST IMPORTANT)
        // ONLY users with LOCATION ON appear on map
        const visibleUsers = nearbyUsers.filter(u =>
            u.isLocationOn === true &&
            u.lat != null &&
            u.lng != null &&
            u.isLocationShared !== false
        );

        const myLat = userLocationRef.current?.lat ?? currentUser?.latitude;
        const myLng = userLocationRef.current?.lng ?? currentUser?.longitude;

        switch (activeFilter) {

        case "Online":
            return visibleUsers.filter(u => {
                if (!u.lastActive) return false;
                const diff =
                    Date.now() - new Date(u.lastActive).getTime();
                return diff < 5 * 60 * 1000;
            });

        case "Nearby":
            return visibleUsers.filter(u => {
                if (!myLat || !myLng) return false;

                const dist =
                    getDistanceFromLatLonInKm(
                        myLat,
                        myLng,
                        u.lat,
                        u.lng
                    ) * 1000;

                return dist <= 300;
            });

        case "Friends":
            return visibleUsers.filter(
                u => u.friendshipStatus === "accepted"
            );

        case "All":
        default:
            return visibleUsers;
        }

    }, [nearbyUsers, activeFilter, currentUser]);
    // 🔥 Removed `userLocation` from deps — accessed via userLocationRef so GPS updates
    // don't rebuild filteredUsers and restart NativeMarkerSync on every tick.


    // Search Suggestions (derived from ALL users, ignoring current tab filter to find anyone)
    const searchResults = useMemo(() => {
        if (!searchQuery || searchQuery.trim().length === 0) return [];
        const query = searchQuery.toLowerCase().trim();
        // Search against ALL nearby users (or potentially all valid users if we had them)
        // For now, nearbyUsers is our client-side cache of "World" around us.
        return nearbyUsers.filter(u => u.name.toLowerCase().includes(query));
    }, [nearbyUsers, searchQuery]);

    const handleSearchResultClick = (user) => {
        console.log("🔍 Search Result Selected:", user.name);
        setSearchQuery(''); // Clear search on select? Or keep it? Usually clear to show full map again?
        // Requirement: "Do not hide other avatars (unless a filter is active)"
        // So clearing search query restores the view.
        setSelectedUser(user); // Triggers Zoom via UserSelectionController
    };

    // Use a memoized click handler to prevent UserMarker from re-rendering
    const handleMarkerClick = React.useCallback(async (u) => {
        if (!currentUser) {
            setSelectedUser(u);
            return;
        }

        const { data, error } = await supabase
            .from('friendships')
            .select('id, status, requester_id, receiver_id, muted_until_by_requester, muted_until_by_receiver')
            .or(`and(requester_id.eq.${currentUser.id},receiver_id.eq.${u.id}),and(requester_id.eq.${u.id},receiver_id.eq.${currentUser.id})`)
            .maybeSingle();

        if (error) console.error("❌ [MapHome] Error fetching friendship:", error);
        
        let isMuted = false;
        if (data) {
            let mutedUntil = null;
            if (data.requester_id === currentUser.id) mutedUntil = data.muted_until_by_requester;
            else if (data.receiver_id === currentUser.id) mutedUntil = data.muted_until_by_receiver;

            if (mutedUntil && new Date(mutedUntil) > new Date()) {
                isMuted = true;
            }
        }

        setSelectedUser({
            ...u,
            friendshipStatus: data?.status || u.friendshipStatus || null,
            friendshipId: data?.id || u.friendshipId || null,
            requesterId: data?.requester_id || null,
            receiverId: data?.receiver_id || null,
            isMuted: isMuted
        });
    }, [currentUser]);

    // ------------------------------------------------------------------
    // 📍 SORTED USERS FOR NATIVE MARKERS
    // ------------------------------------------------------------------
    const sortedFilteredUsers = useMemo(() => {
        // 1. Sort for stability
        return [...filteredUsers].sort((a, b) => a.id.localeCompare(b.id));
    }, [filteredUsers]);
    // -------------------------------------------------
    // 🔄 SYNC LOCATION STATE
    // -------------------------------------------------
    // 🔄 Sync
    useEffect(() => {
        if (locationEnabled && currentUser) {
            if (currentUser.is_ghost_mode || currentUser.is_location_on === false) {
                setCurrentUser(prev => {
                    if (!prev) return prev;

                    if (
                        prev.is_ghost_mode === false &&
                        prev.is_location_on === true
                    ) {
                        return prev; // prevent unnecessary re-render
                    }

                    return {
                        ...prev,
                        is_ghost_mode: false,
                        is_location_on: true
                    };
                });
            }
        }
    }, [
        locationEnabled,
        currentUser?.is_ghost_mode,
        currentUser?.is_location_on
    ]);


    // 0️⃣ Absolute Priority Overlay: Profile Setup (Must block everything, including GPS loading and permissions)
    if (profileReady && showProfileSetup) {
        return (
            <div className="map-container" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100dvh', zIndex: 10000 }}>
                <style>{`
                    .onboarding-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; z-index: 999999; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                    .onboarding-card { background: #121214; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 28px; padding: 36px 28px; width: 100%; max-width: 400px; box-shadow: 0 32px 64px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.1); color: white; display: flex; flex-direction: column; gap: 24px; }
                    .onboarding-card h2 { margin: 0; font-size: 1.8rem; font-weight: 700; letter-spacing: -0.5px; color: #fff; text-align: left; }
                    .onboarding-card h2 span.wave { color: #0084ff; }
                    .onboarding-card p.subtitle { margin: 0; font-size: 1rem; color: #a1a1aa; text-align: left; margin-top: -16px; }
                    .ob-section { display: flex; flex-direction: column; gap: 10px; text-align: left; position: relative; }
                    .ob-section label { font-size: 0.95rem; font-weight: 600; color: #f4f4f5; letter-spacing: -0.2px; }
                    .ob-input { background: #1f1f22; border: 1.5px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 16px 18px; color: white; font-size: 1.05rem; outline: none; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); width: 100%; box-sizing: border-box; }
                    .ob-input::placeholder { color: #52525b; }
                    .ob-input:focus { border-color: #0084ff; background: #27272a; box-shadow: 0 0 0 4px rgba(0, 132, 255, 0.15); }
                    .ob-input.error { border-color: #ef4444; background: rgba(239, 68, 68, 0.05); }
                    .ob-input.error:focus { box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.15); }
                    
                    .chip-group { display: flex; flex-wrap: wrap; gap: 10px; transition: all 0.2s; padding: 4px; border-radius: 22px; }
                    .chip-group.error { background: rgba(239, 68, 68, 0.1); border: 1px dashed #ef4444; margin: -5px; padding: 4px; }
                    .chip { background: #1f1f22; border: 1.5px solid transparent; border-radius: 20px; padding: 10px 20px; color: #a1a1aa; font-size: 0.95rem; font-weight: 500; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); user-select: none; }
                    .chip:hover { background: #27272a; color: #f4f4f5; }
                    .chip.selected { background: #0084ff; border-color: #0084ff; color: white; box-shadow: 0 4px 12px rgba(0, 132, 255, 0.3); }
                    
                    .complete-btn { background: #0084ff; color: white; border: none; border-radius: 16px; padding: 18px; font-size: 1.1rem; font-weight: 600; cursor: pointer; margin-top: 12px; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 8px 20px rgba(0, 132, 255, 0.25); }
                    .complete-btn:hover { background: #0073e6; transform: translateY(-2px); box-shadow: 0 12px 24px rgba(0, 132, 255, 0.35); }
                    .complete-btn:active { transform: scale(0.97); box-shadow: 0 4px 12px rgba(0, 132, 255, 0.2); }
                    
                    .error-text { color: #ef4444; font-size: 0.85rem; font-weight: 500; margin-top: -4px; animation: slideDown 0.2s ease-out; display: flex; align-items: center; gap: 4px; }
                    @keyframes slideDown { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
                `}</style>
                <div className="onboarding-overlay">
                    <div className="onboarding-card">
                        <h2>Welcome to Nearo! 👋</h2>
                        <p className="subtitle">Complete your profile to join.</p>

                        <div className="ob-section">
                            <label>Username</label>
                            <input
                                type="text"
                                className={`ob-input ${setupErrors.username ? 'error' : ''}`}
                                value={setupData.username}
                                onChange={(e) => {
                                    setSetupData({ ...setupData, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') });
                                    if(setupErrors.username) setSetupErrors({...setupErrors, username: false});
                                }}
                                placeholder="Choose a username"
                            />
                            {setupErrors.username && <span className="error-text">⚠️ Username is required</span>}
                        </div>

                        <div className="ob-section">
                            <label>Gender</label>
                            <div className={`chip-group ${setupErrors.gender ? 'error' : ''}`}>
                                {['Male', 'Female', 'Non-binary', 'Other'].map(g => (
                                    <button
                                        key={g}
                                        className={`chip ${setupData.gender === g ? 'selected' : ''}`}
                                        onClick={() => {
                                            setSetupData({ ...setupData, gender: g });
                                            if(setupErrors.gender) setSetupErrors({...setupErrors, gender: false});
                                        }}
                                    >{g}</button>
                                ))}
                            </div>
                            {setupErrors.gender && <span className="error-text" style={{marginTop: '2px'}}>⚠️ Please select a gender</span>}
                        </div>

                        <div className="ob-section">
                            <label>Relationship Status</label>
                            <div className={`chip-group ${setupErrors.relationshipStatus ? 'error' : ''}`}>
                                {['Single', 'Married', 'Committed', 'Open to Date'].map(s => (
                                    <button
                                        key={s}
                                        className={`chip ${setupData.relationshipStatus === s ? 'selected' : ''}`}
                                        onClick={() => {
                                            setSetupData({ ...setupData, relationshipStatus: s });
                                            if(setupErrors.relationshipStatus) setSetupErrors({...setupErrors, relationshipStatus: false});
                                        }}
                                    >{s}</button>
                                ))}
                            </div>
                            {setupErrors.relationshipStatus && <span className="error-text" style={{marginTop: '2px'}}>⚠️ Please select a relationship status</span>}
                        </div>

                        <div className="ob-section">
                            <label>Your Avatar 👤</label>
                            <div className="avatar-preview-box" style={{ position: 'relative', width: '100px', margin: '0 auto' }}>
                                <div style={{
                                    width: '100px', height: '100px',
                                    borderRadius: '50%', overflow: 'hidden',
                                    border: '3px solid rgba(255,255,255,0.2)',
                                    background: 'rgba(255,255,255,0.05)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <img
                                        src={(() => {
                                            // Priority 1: Uploaded Preview
                                            if (avatarPreview) return avatarPreview;

                                            // Priority 2: Gender Default
                                            const g = setupData.gender;
                                            if (g === 'Male') return DEFAULT_MALE_AVATAR;
                                            if (g === 'Female') return DEFAULT_FEMALE_AVATAR;

                                            // Fallback
                                            return DEFAULT_GENERIC_AVATAR;
                                        })()}
                                        alt="Avatar Preview"
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                </div>

                                {/* Upload Button Overlay */}
                                <label
                                    htmlFor="modal-avatar-upload"
                                    style={{
                                        position: 'absolute', bottom: '0', right: '0',
                                        width: '32px', height: '32px',
                                        background: 'var(--brand-blue, #0084ff)',
                                        borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer',
                                        boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                                        border: '2px solid #1c1c1e',
                                        zIndex: 10
                                    }}
                                >
                                    <span style={{ fontSize: '1.2rem', color: 'white', marginTop: '-2px' }}>+</span>
                                </label>
                                <input
                                    id="modal-avatar-upload"
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => {
                                        const file = e.target.files[0];
                                        if (file) {
                                            const reader = new FileReader();
                                            reader.onload = () => setCropImage(reader.result);
                                            reader.readAsDataURL(file);
                                            e.target.value = '';
                                        }
                                    }}
                                    style={{ display: 'none' }}
                                />
                            </div>
                            <p className="avatar-hint" style={{ marginTop: '12px', textAlign: 'center', color: '#a1a1aa' }}>
                                {avatarFile ? 'Photo selected! Ready to join.' : "We've assigned you a look based on gender. Tap + to upload your own!"}
                            </p>
                        </div>

                        <button className="complete-btn" onClick={handleCompleteSetup}>
                            Complete Setup & Enter Map 🚀
                        </button>
                    </div>
                </div>

                {/* Cropper Modal for Onboarding */}
                {cropImage && (
                    <ImageCropper
                        imageSrc={cropImage}
                        zIndex={10000000}
                        onCancel={() => setCropImage(null)}
                        onCropComplete={(croppedBlob) => {
                            const file = new File([croppedBlob], `avatar_${Date.now()}.jpg`, { type: 'image/jpeg' });
                            setAvatarFile(file);
                            setAvatarPreview(URL.createObjectURL(file));
                            setCropImage(null);
                        }}
                    />
                )}
            </div>
        );
    }

    // 1️⃣ Loading
    if (loadingLocation) {
        return (
            <div style={{
                height:"100dvh", display:"flex", flexDirection:"column",
                justifyContent:"center", alignItems:"center",
                background: isDarkMode ? "#111113" : "#fafafa",
                gap:"18px"
            }}>
                <style>{`
                    @keyframes loc-spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    @keyframes loc-fade { 0%,100%{opacity:.3} 50%{opacity:1} }
                `}</style>
                <div style={{ position:"relative", width:"56px", height:"56px" }}>
                    <div style={{
                        position:"absolute", inset:0, borderRadius:"50%",
                        border: isDarkMode ? "2px solid rgba(255,255,255,.08)" : "2px solid rgba(0,0,0,.06)"
                    }}/>
                    <div style={{
                        position:"absolute", inset:0, borderRadius:"50%",
                        border:"2px solid transparent",
                        borderTopColor: isDarkMode ? "rgba(255,255,255,.6)" : "#6c47ff",
                        animation:"loc-spin 0.9s linear infinite"
                    }}/>
                    <div style={{
                        position:"absolute", inset:"14px", borderRadius:"50%",
                        background: isDarkMode ? "rgba(255,255,255,.06)" : "rgba(108,71,255,.08)",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:"16px"
                    }}>📍</div>
                </div>
                <p style={{
                    color: isDarkMode ? "rgba(255,255,255,.45)" : "rgba(0,0,0,.4)",
                    fontSize:"14px", margin:0, letterSpacing:"0.3px"
                }}>Finding your location…</p>
            </div>
        );
    }

    // 2️⃣ Location disabled — permission screen
    if (!locationEnabled) {
        const dark = isDarkMode;
        return (
            <div style={{
                height:"100dvh", display:"flex", flexDirection:"column",
                justifyContent:"center", alignItems:"center",
                background: dark ? "#111113" : "#fafafa",
                padding:"32px", textAlign:"center"
            }}>
                <style>{`
                    @keyframes loc-float {
                        0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)}
                    }
                `}</style>

                {/* Floating map pin icon */}
                <div style={{
                    width:"88px", height:"88px", borderRadius:"28px",
                    background: dark
                        ? "linear-gradient(145deg,#1e1e24,#2a2a35)"
                        : "linear-gradient(145deg,#ffffff,#f0eeff)",
                    boxShadow: dark
                        ? "0 20px 60px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.06)"
                        : "0 20px 60px rgba(108,71,255,.15), inset 0 1px 0 rgba(255,255,255,.9)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:"40px", marginBottom:"32px",
                    animation:"loc-float 3s ease-in-out infinite"
                }}>📍</div>

                {/* Heading */}
                <h2 style={{
                    margin:"0 0 10px", fontSize:"24px", fontWeight:700,
                    color: dark ? "#f0f0f0" : "#1a1a2e",
                    letterSpacing:"-0.5px"
                }}>Share Your Location</h2>

                {/* Subtext */}
                <p style={{
                    margin:"0 0 32px", fontSize:"14px", lineHeight:1.7,
                    color: dark ? "rgba(255,255,255,.45)" : "rgba(0,0,0,.45)",
                    maxWidth:"270px"
                }}>
                    See who's around you in real time. Your location is only visible while you're active.
                </p>

                {/* Feature pills — compact horizontal */}
                <div style={{ display:"flex", gap:"8px", marginBottom:"32px", flexWrap:"wrap", justifyContent:"center" }}>
                    {[
                        ["👥", "Nearby people"],
                        ["🔒", "Private"],
                        ["⚡", "Real-time"]
                    ].map(([icon, label]) => (
                        <div key={label} style={{
                            display:"flex", alignItems:"center", gap:"5px",
                            padding:"5px 11px", borderRadius:"20px",
                            background: dark ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.05)",
                            border: dark ? "1px solid rgba(255,255,255,.08)" : "1px solid rgba(0,0,0,.07)",
                        }}>
                            <span style={{ fontSize:"13px" }}>{icon}</span>
                            <span style={{ fontSize:"12px", fontWeight:500, color: dark ? "rgba(255,255,255,.6)" : "rgba(0,0,0,.55)" }}>{label}</span>
                        </div>
                    ))}
                </div>

                {/* CTA Button */}
                <button
                    onClick={startLocation}
                    style={{
                        width:"100%", maxWidth:"260px",
                        padding:"15px 0", borderRadius:"16px", border:"none",
                        background: dark
                            ? "linear-gradient(135deg,#7c5cfc,#5b3fd4)"
                            : "linear-gradient(135deg,#6c47ff,#4f2fe8)",
                        color:"white", fontWeight:700, fontSize:"16px",
                        cursor:"pointer", letterSpacing:"0.2px",
                        boxShadow: "0 8px 32px rgba(108,71,255,.35)",
                        transition:"transform 0.15s, box-shadow 0.15s"
                    }}
                    onMouseDown={e => { e.currentTarget.style.transform="scale(0.97)"; e.currentTarget.style.boxShadow="0 4px 16px rgba(108,71,255,.25)"; }}
                    onMouseUp={e => { e.currentTarget.style.transform="scale(1)"; e.currentTarget.style.boxShadow="0 8px 32px rgba(108,71,255,.35)"; }}
                    onTouchStart={e => { e.currentTarget.style.transform="scale(0.97)"; }}
                    onTouchEnd={e => { e.currentTarget.style.transform="scale(1)"; }}
                >
                    Enable Location
                </button>

                <p style={{
                    marginTop:"14px", fontSize:"12px",
                    color: dark ? "rgba(255,255,255,.2)" : "rgba(0,0,0,.25)"
                }}>You can disable this anytime</p>
            </div>
        );
    }



    // 4️⃣ Waiting for GPS fix
    if (!userLocation) {
        return (
            <div style={{
                height:"100dvh", display:"flex", flexDirection:"column",
                justifyContent:"center", alignItems:"center",
                background: isDarkMode ? "#111113" : "#fafafa",
                gap:"18px"
            }}>
                <style>{`
                    @keyframes loc-spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
                `}</style>
                <div style={{ position:"relative", width:"56px", height:"56px" }}>
                    <div style={{
                        position:"absolute", inset:0, borderRadius:"50%",
                        border: isDarkMode ? "2px solid rgba(255,255,255,.08)" : "2px solid rgba(0,0,0,.06)"
                    }}/>
                    <div style={{
                        position:"absolute", inset:0, borderRadius:"50%",
                        border:"2px solid transparent",
                        borderTopColor: isDarkMode ? "rgba(255,255,255,.6)" : "#6c47ff",
                        animation:"loc-spin 0.9s linear infinite"
                    }}/>
                    <div style={{
                        position:"absolute", inset:"14px", borderRadius:"50%",
                        background: isDarkMode ? "rgba(255,255,255,.06)" : "rgba(108,71,255,.08)",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:"16px"
                    }}>📡</div>
                </div>
                <p style={{
                    color: isDarkMode ? "rgba(255,255,255,.45)" : "rgba(0,0,0,.4)",
                    fontSize:"14px", margin:0, letterSpacing:"0.3px"
                }}>Getting your precise location…</p>
            </div>
        );
    }



    // Check if any full-screen overlay is active to "pop" the container above BottomNav (z-index 2000)
    const isOverlayActive = !!viewingStoryUser || showReportModal || showMuteModal || showThoughtInput;

    // 5️⃣ If all good, render map
    return (
        <div className="map-container" style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            width: '100%', 
            height: '100dvh', 
            overflow: 'hidden',
            overscrollBehavior: 'none',
            zIndex: isOverlayActive ? 10000 : 1
        }}>
            <style dangerouslySetInnerHTML={{__html: mapAvatarStyle}} />
            <style>{`
                .onboarding-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.7);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 999999;
                    padding: 20px;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                .onboarding-card {
                    background: #18181b;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 24px;
                    padding: 32px 24px;
                    width: 100%;
                    max-width: 380px;
                    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.6);
                    color: white;
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }
                .onboarding-card h2 {
                    margin: 0;
                    font-size: 1.6rem;
                    color: #fff;
                    text-align: left;
                }
                .onboarding-card h2 span.wave {
                    color: #00a8ff;
                }
                .onboarding-card p {
                    margin: 0;
                    font-size: 0.95rem;
                    color: #a1a1aa;
                    text-align: left;
                    margin-top: -12px;
                }
                .ob-section {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .ob-section label {
                    font-size: 0.9rem;
                    font-weight: 600;
                    color: #fff;
                }
                .ob-input {
                    background: #27272a;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 12px;
                    padding: 14px 16px;
                    color: white;
                    font-size: 1rem;
                    outline: none;
                    transition: all 0.2s;
                }
                .ob-input:focus {
                    border-color: #0084ff;
                    background: #2f2f33;
                }
                .chip-group {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 10px;
                }
                .chip {
                    background: transparent;
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 20px;
                    padding: 8px 18px;
                    color: #a1a1aa;
                    font-size: 0.9rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .chip:hover {
                    background: rgba(255, 255, 255, 0.05);
                }
                .chip.selected {
                    background: transparent;
                    border-color: rgba(255, 255, 255, 0.3);
                    color: white;
                }
                .complete-btn {
                    background: #0084ff;
                    color: white;
                    border: none;
                    border-radius: 14px;
                    padding: 16px;
                    font-size: 1.05rem;
                    font-weight: 600;
                    cursor: pointer;
                    margin-top: 10px;
                    transition: background 0.2s, transform 0.1s;
                }
                .complete-btn:hover {
                    background: #0073e6;
                }
                .complete-btn:active {
                    transform: scale(0.98);
                }
            `}</style>
            {/* PROFILE UPDATE NUDGE */}
            {currentUser && (
                (!currentUser.avatar_url ||
                    currentUser.avatar_url.includes('/defaults/') ||
                    currentUser.avatar_url.includes('dicebear') ||
                    currentUser.avatar_url.includes('googleusercontent'))
            ) && (
                    <div
                        className="update-nudge"
                        onClick={() => navigate('/profile')}
                    >
                        ⚠️ Update profile avatar
                    </div>
                )}



            {/* PROFILE UPDATE NUDGE */}
            {currentUser && (
                (!currentUser.avatar_url ||
                    currentUser.avatar_url.includes('/defaults/') ||
                    currentUser.avatar_url.includes('dicebear') ||
                    currentUser.avatar_url.includes('googleusercontent'))
            ) && (
                    <div
                        className="update-nudge"
                        onClick={() => navigate('/profile')}
                    >
                        ⚠️ Update profile avatar
                    </div>
                )}

            {/* Cropper Modal */}
            {cropImage && (
                <ImageCropper
                    imageSrc={cropImage}
                    zIndex={10000000}
                    onCancel={() => setCropImage(null)}
                    onCropComplete={(croppedBlob) => {
                        const file = new File([croppedBlob], `avatar_${Date.now()}.jpg`, { type: 'image/jpeg' });
                        setAvatarFile(file);
                        setAvatarPreview(URL.createObjectURL(file));
                        setCropImage(null);
                    }}
                />
            )}

            {/* Loading Overlay while fetching GPS */}
            {loadingLocation && !userLocation && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    zIndex: 99999, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    color: 'white'
                }}>
                    <div className="location-spinner" style={{
                        width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.2)',
                        borderTopColor: '#0084ff', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 0 16px'
                    }}></div>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: '0 0 8px' }}>Acquiring Signal...</h2>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', margin: 0 }}>Finding your precise location.</p>
                    <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
                </div>
            )}

            {/* 🚀 Global Map Smoothness Styles */}
            <style>{`
                .leaflet-marker-icon {
                    transition: transform 0.6s cubic-bezier(0.23, 1, 0.32, 1) !important;
                    will-change: transform;
                }
                .leaflet-pane > svg path.leaflet-interactive {
                    transition: stroke-dashoffset 0.6s ease;
                }
            `}</style>

            {/* Map Container */}
            {userLocation ? (
            <MapContainer
                key="map-main-stable"
                center={[userLocation.lat || 0, userLocation.lng || 0]}
                zoom={userLocation.lat ? 17 : 2}
                maxZoom={22}
                style={{ height: '100dvh', width: '100%', outline: 'none' }} 
                zoomControl={false}
                attributionControl={false}
                scrollWheelZoom={true} // 🔥 Re-enabled per user request
                doubleClickZoom={true}
                dragging={true}
                zoomAnimation={true}
            >
                {/* Map Layers based on State */}
                {mapMode === 'street' && (
                    <TileLayer
                        attribution='&copy; Google Maps'
                        url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                        className={isDarkMode ? 'dark-map-tiles' : ''}
                        maxNativeZoom={20}
                        maxZoom={22}
                        keepBuffer={4}
                    />
                )}
                {mapMode === 'hybrid' && (
                    <TileLayer
                        attribution='&copy; Google Maps'
                        url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                        maxNativeZoom={20}
                        maxZoom={22}
                        keepBuffer={4}
                    />
                )}
                {mapMode === 'satellite' && (
                    <TileLayer
                        attribution='&copy; Google Maps'
                        url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
                        maxNativeZoom={20}
                        maxZoom={22}
                        keepBuffer={4}
                    />
                )}
                <RecenterAutomatically lat={userLocation.lat} lng={userLocation.lng} mapMode={mapMode} />
                <RecenterControl 
                    markerRefs={markerRefs}
                    currentUserId={currentUser?.id}
                    fallbackLat={userLocation?.lat}
                    fallbackLng={userLocation?.lng}
                />
                <UserSelectionController selectedUser={selectedUser} />

                <Circle
                    center={[userLocation.lat, userLocation.lng]}
                    radius={300}
                    pathOptions={{
                        color: '#4285F4',
                        fillColor: '#4285F4',
                        fillOpacity: 0.1,
                        weight: 1,
                        dashArray: '5, 10'
                    }}
                />

                {/* 🔥 NATIVE MARKERS SYNC (No React Re-Renders for GPS Motion) */}
                <NativeMarkerSync 
                    users={sortedFilteredUsers} 
                    currentUser={currentUser} 
                    userLocation={userLocation} 
                    currentUserIcon={currentUserIcon}
                    createAvatarIcon={createAvatarIcon}
                    markerRefs={markerRefs}
                    handleMarkerClick={handleMarkerClick}
                    animateNativeMarker={animateNativeMarker}
                    setSelectedUser={setSelectedUser}
                />
            </MapContainer>
            ) : null}


            {/* Top Search Bar & Action Buttons */}
            <div className="map-header-controls">
                <div className="header-top-row">
                    <div className="search-bar-container glass-panel">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity:0.4, flexShrink:0 }}>
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                        <input 
                            type="text" 
                            placeholder="Find people..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {/* Search Dropdown */}
                        {searchQuery && searchResults.length > 0 && (
                            <div className="search-results-dropdown">
                                {searchResults.map(user => (
                                    <div 
                                        key={user.id} 
                                        className="search-result-item"
                                        onClick={() => handleSearchResultClick(user)}
                                    >
                                        <img src={getAvatar2D(user.avatar)} alt={user.name} className="search-result-avatar" />
                                        <span>{user.name}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    {/* Action Buttons - Right Side */}
                    <div className="header-action-buttons">
                        {/* Status / Thoughts */}
                        <button 
                            className="control-btn" 
                            style={{ background: 'var(--bg-primary, #ffffff)', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
                            onClick={() => setShowThoughtInput(true)} 
                            title="Set Status"
                        >
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity:0.65 }}>
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                            </svg>
                        </button>
                        
                        {/* Ghost Mode Toggle */}
                        <button
                            className={`control-btn ${currentUser?.is_ghost_mode ? 'active' : ''}`}
                            style={{ background: 'var(--bg-primary, #ffffff)', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
                            onClick={() => {
                                if (currentUser?.is_ghost_mode) {
                                    // Hidden → Visible
                                    startLocation();
                                    showToast("👁️ Ghost Mode OFF (Visible)");
                                } else {
                                    // Visible → Hidden
                                    stopLocation();
                                    showToast("👻 Ghost Mode ON (Hidden)");
                                }
                            }}

                            title="Toggle Ghost Mode"
                        >
                            {currentUser?.is_ghost_mode ? (
                                /* Ghost/Hidden icon */
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#6c47ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                                    <line x1="1" y1="1" x2="23" y2="23"/>
                                </svg>
                            ) : (
                                /* Eye/Visible icon */
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity:0.65 }}>
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                    <circle cx="12" cy="12" r="3"/>
                                </svg>
                            )}
                        </button>

                        {/* Map View Toggle */}
                        <button 
                            className="control-btn"
                            onClick={() => {
                                const modes = ['street', 'satellite', 'hybrid'];
                                const nextIndex = (modes.indexOf(mapMode) + 1) % modes.length;
                                setMapMode(modes[nextIndex]);
                            }}
                            title="Toggle Map View"
                            style={{ 
                                background: 'var(--bg-primary, #ffffff)',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                marginLeft: '6px', 
                                padding: '0', 
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0, 
                                aspectRatio: '1/1'
                            }}
                        >
                             <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity:0.65 }}>
                                <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                                <polyline points="2 17 12 22 22 17"/>
                                <polyline points="2 12 12 17 22 12"/>
                            </svg>
                        </button>
                    </div>
                </div>
                
                {/* Horizontal Filter Scroll */}
                <div className="filter-scroll">
                    {FILTERS.map(f => (
                        <button 
                            key={f}
                            className={`filter-chip glass-pill ${activeFilter === f ? 'active' : ''}`}
                            onClick={() => setActiveFilter(f)}
                        >
                            {f}
                        </button>
                    ))}
                    
                    {/* Map View Toggle Moved to Header Actions */}
                </div>
            </div>


            {/* Bottom Navigation */}
            <BottomNav 
                friendRequestCount={friendRequests.length} 
                unreadMessageCount={unreadCount} 
            />

            <style>{`
                .map-header-controls {
                    position: absolute;
                    top: 0; /* Use padding for safe area instead of top */
                    padding-top: max(16px, env(safe-area-inset-top));
                    left: 0; right: 0;
                    z-index: 1000;
                    padding-left: 16px; 
                    padding-right: 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    pointer-events: none;
                }

                .header-top-row {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    pointer-events: auto;
                }

                .search-bar-container {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    padding: 6px 12px;
                    border-radius: 16px;
                    gap: 8px;
                    transition: all 0.3s ease;
                    max-width: 400px;
                }

                .header-action-buttons {
                    display: flex;
                    gap: 6px;
                }

                .search-bar-container:focus-within {
                    transform: scale(1.02);
                    box-shadow: 0 8px 30px rgba(0,0,0,0.15);
                }

                .search-icon { font-size: 1.2rem; opacity: 0.6; }

                .search-bar-container input {
                    border: none;
                    background: transparent;
                    font-size: 13px;
                    width: 100%;
                    color: inherit;
                    outline: none;
                }

                .filter-scroll {
                    pointer-events: auto;
                    display: flex;
                    gap: 10px;
                    overflow-x: auto;
                    padding-bottom: 4px;
                    -webkit-overflow-scrolling: touch;
                    scrollbar-width: none; /* Firefox */
                }
                .filter-scroll::-webkit-scrollbar { display: none; }

                .filter-chip {
                    padding: 6px 12px;
                    white-space: nowrap;
                    font-size: 12px;
                    font-weight: 500;
                    color: inherit;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .filter-chip.active {
                    background: #6c47ff;
                    color: white;
                    border-color: #6c47ff;
                }

                .search-results-dropdown {
                    position: absolute;
                    top: 100%;
                    left: 0;
                    right: 0;
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(12px);
                    border-radius: 12px;
                    margin-top: 8px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                    overflow: hidden;
                    max-height: 200px;
                    overflow-y: auto;
                    z-index: 2000;
                }
                .search-result-item {
                    padding: 10px 16px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    cursor: pointer;
                    transition: background 0.2s;
                    color: #000;
                }
                .search-result-item:hover {
                    background: rgba(0,0,0,0.05);
                }
                .search-result-avatar {
                    width: 32px; height: 32px;
                    border-radius: 50%;
                    object-fit: cover;
                }
                
                @media (prefers-color-scheme: dark) {
                    .search-results-dropdown {
                        background: rgba(28, 28, 30, 0.95);
                        color: white !important;
                    }
                    .search-result-item {
                        color: white !important;
                    }
                    .search-result-item:hover {
                        background: rgba(255,255,255,0.1);
                    }
                }



            `}</style>

            <MapProfileCard
                user={selectedUser}
                currentUser={currentUser}
                onClose={() => setSelectedUser(null)}
                onAction={handleUserAction}
            />

            {showFullProfile && fullProfileUser && (
                <FullProfileModal
                    user={fullProfileUser}
                    currentUser={currentUser}
                    onClose={() => setShowFullProfile(false)}
                    onAction={handleUserAction}
                />
            )}


            <PokeNotifications currentUser={currentUser} />
            {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}

            {/* Report Modal */}
            {showReportModal && reportTarget && (
                <div className="report-modal-overlay" onClick={() => setShowReportModal(false)}>
                    <div className="report-modal-card" onClick={e => e.stopPropagation()}>
                        {/* Warning Icon Header */}
                        <div className="report-icon-header">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                <line x1="12" y1="9" x2="12" y2="13"></line>
                                <line x1="12" y1="17" x2="12.01" y2="17"></line>
                            </svg>
                        </div>

                        <h3>Report {reportTarget.name}</h3>
                        <p>Please select a reason for reporting:</p>

                        <div className="report-reasons">
                            <button onClick={() => handleReport('Fake or Misleading Profile')}>
                                <span className="report-emoji">🎭</span>
                                <span>Fake or Misleading Profile</span>
                            </button>
                            <button onClick={() => handleReport('Harassment or Misbehavior')}>
                                <span className="report-emoji">😡</span>
                                <span>Harassment or Misbehavior</span>
                            </button>
                            <button onClick={() => handleReport('Location Misuse')}>
                                <span className="report-emoji">📍</span>
                                <span>Location Misuse</span>
                            </button>
                            <button onClick={() => handleReport('Underage or Safety Concern')}>
                                <span className="report-emoji">🔞</span>
                                <span>Underage or Safety Concern</span>
                            </button>
                            <button onClick={() => handleReport('Other')}>
                                <span className="report-emoji">❓</span>
                                <span>Other</span>
                            </button>
                        </div>

                        <button className="cancel-report-btn" onClick={() => setShowReportModal(false)}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Mute Duration Modal */}
            {showMuteModal && muteTarget && (
                <div className="report-modal-overlay" onClick={() => setShowMuteModal(false)}>
                    <div className="report-modal-card" onClick={e => e.stopPropagation()}>
                        <h3>🔕 Mute {muteTarget.name}</h3>
                        <p>Mute notifications for:</p>
                        <div className="report-reasons">
                            {[
                                { label: '10 Minutes', val: 10 },
                                { label: '30 Minutes', val: 30 },
                                { label: '1 Hour', val: 60 },
                                { label: '24 Hours', val: 1440 }
                            ].map(opt => (
                                <button key={opt.val} onClick={async () => {
                                    try {
                                        const mins = opt.val;
                                        const future = new Date(new Date().getTime() + mins * 60000);
                                        const isRequester = muteTarget.requesterId === currentUser.id;
                                        const column = isRequester ? 'muted_until_by_requester' : 'muted_until_by_receiver';

                                        await supabase
                                            .from('friendships')
                                            .update({ [column]: future.toISOString() })
                                            .eq('id', muteTarget.friendshipId);

                                        showToast(`Muted ${muteTarget.name} for ${opt.label} 🔕`);
                                        setShowMuteModal(false);
                                        // Update local state if this user is still selected
                                        if (selectedUser?.id === muteTarget.id) {
                                            setSelectedUser(prev => ({ ...prev, isMuted: true }));
                                        }
                                        setMuteTarget(null);
                                    } catch (err) {
                                        console.error("Timed mute error", err);
                                        showToast("Failed to mute");
                                    }
                                }}>
                                    ⏳ {opt.label}
                                </button>
                            ))}
                        </div>
                        <button className="cancel-report-btn" onClick={() => setShowMuteModal(false)}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Story Viewer Overlay */}
            {viewingStoryUser && (
                <StoryViewer
                    userStories={viewingStoryUser}
                    currentUser={currentUser}
                    onClose={() => {
                        const viewedUserId = viewingStoryUser.user.id;
                        setViewingStoryUser(null);

                        // Optimistically mark as seen for map ring
                        setNearbyUsers(prev => prev.map(u =>
                            u.id === viewedUserId
                                ? { ...u, hasUnseenStory: false }
                                : u
                        ));

                        // Also update the global set to prevent it from reappearing on next fetch
                        // (Though fetches usually refresh this based on DB)
                    }}
                />
            )}

            <style>{`
                .report-modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.8);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 3000;
                    animation: fadeIn 0.2s ease-out;
                }

                .report-modal-card {
                    background: linear-gradient(135deg, rgba(245, 245, 247, 0.98) 0%, rgba(235, 235, 237, 0.98) 100%);
                    border-radius: 28px;
                    padding: 32px 24px;
                    width: 90%;
                    max-width: 420px;
                    text-align: center;
                    box-shadow: 
                        0 24px 60px rgba(0, 0, 0, 0.4),
                        0 0 0 1px rgba(0, 0, 0, 0.05);
                    color: #1d1d1f;
                    animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    position: relative;
                }

                .report-icon-header {
                    width: 72px;
                    height: 72px;
                    margin: 0 auto 20px;
                    background: rgba(255, 59, 48, 0.1);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 2px solid rgba(255, 59, 48, 0.2);
                }

                .report-icon-header svg {
                    color: #ff3b30;
                    filter: drop-shadow(0 2px 8px rgba(255, 59, 48, 0.2));
                }

                .report-modal-card h3 {
                    margin: 0 0 8px 0;
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: #1d1d1f;
                    letter-spacing: -0.02em;
                }

                .report-modal-card p {
                    color: #6e6e73;
                    margin-bottom: 24px;
                    font-size: 0.95rem;
                    font-weight: 400;
                    line-height: 1.4;
                }

                .report-reasons {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    margin-bottom: 20px;
                }

                .report-reasons button {
                    background: white;
                    border: 1px solid rgba(0, 0, 0, 0.08);
                    color: #ff3b30;
                    padding: 16px 20px;
                    border-radius: 14px;
                    font-size: 1rem;
                    text-align: left;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    font-weight: 600;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
                }

                .report-emoji {
                    font-size: 1.3rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 24px;
                }

                .report-reasons button:hover {
                    background: rgba(255, 59, 48, 0.08);
                    border-color: rgba(255, 59, 48, 0.3);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(255, 59, 48, 0.15);
                }

                .report-reasons button:active {
                    transform: translateY(0) scale(0.98);
                }

                .cancel-report-btn {
                    width: 100%;
                    padding: 14px;
                    background: rgba(0, 0, 0, 0.05);
                    border: none;
                    border-radius: 14px;
                    color: #6e6e73;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-size: 1rem;
                }

                .cancel-report-btn:hover {
                    background: rgba(0, 0, 0, 0.08);
                    color: #1d1d1f;
                }

                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes scaleIn { 
                    from { transform: scale(0.95) translateY(10px); opacity: 0; } 
                    to { transform: scale(1) translateY(0); opacity: 1; } 
                }
            `}</style>

            {/* Thought Input Overlay */}
            {showThoughtInput && (
                <div className="thought-input-overlay" onClick={() => setShowThoughtInput(false)}>
                    <div className="thought-card" onClick={e => e.stopPropagation()}>
                        <h3>💭 Set a Status</h3>
                        <form onSubmit={handlePostThought}>
                            <input
                                type="text"
                                placeholder="What's on your mind? (e.g. Coffee?)"
                                value={myThought}
                                onChange={e => setMyThought(e.target.value)}
                                maxLength={30}
                                autoFocus
                            />
                            <div className="thought-actions">
                                <button type="button" onClick={() => setShowThoughtInput(false)}>Cancel</button>
                                <div className="right-actions">
                                    {currentUser?.thought && (
                                        <button
                                            type="button"
                                            onClick={handleDeleteThought}
                                            style={{
                                                background: 'rgba(255, 59, 48, 0.1)',
                                                color: '#ff3b30',
                                                border: '1px solid rgba(255, 59, 48, 0.2)',
                                                padding: '8px 12px',
                                                fontSize: '1.2rem',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}
                                            title="Delete Thought"
                                        >
                                            🗑️
                                        </button>
                                    )}
                                    <button type="submit" className="primary">Post</button>
                                </div>
                            </div>
                        </form>
                        <p className="hint">Disappears in 3 hours</p>
                    </div>
                </div>
            )}


            <div className="map-ui-overlay">
                <div className="stats-card">
                    <span>All View</span>
                    <div className="stats-divider"></div>
                    <strong>{filteredUsers.length} Visible</strong>
                </div>
            </div>

            <style>{`
                .update-nudge {
                    position: absolute;
                    top: 100px; /* Below Top Nav which might be hidden on map, or just safe top area */
                    /* Actually MapHome usually has no top nav, so maybe top: 20px */
                    top: max(20px, calc(10px + env(safe-area-inset-top))); /* Notch support */
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(255, 69, 58, 0.9);
                    backdrop-filter: blur(10px);
                    color: white;
                    padding: 10px 20px;
                    border-radius: 30px;
                    font-weight: 600;
                    box-shadow: 0 4px 15px rgba(255, 69, 58, 0.3);
                    z-index: 2000;
                    cursor: pointer;
                    animation: bounceIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.9rem;
                    border: 1px solid rgba(255,255,255,0.2);
                }
                .update-nudge:hover {
                    background: rgba(255, 69, 58, 1);
                    transform: translateX(-50%) scale(1.05);
                }
                @keyframes bounceIn {
                    from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
                    to { transform: translateX(-50%) translateY(0); opacity: 1; }
                }

                /* Onboarding Styles - Premium Glassmorphism */
                .onboarding-overlay {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.6);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    z-index: 999999;
                    display: flex; align-items: center; justify-content: center;
                    animation: fadeIn 0.4s ease-out;
                }
                
                .onboarding-card {
                    background: rgba(20, 20, 25, 0.95);
                    backdrop-filter: blur(40px);
                    -webkit-backdrop-filter: blur(40px);
                    padding: 30px 24px; 
                    border-radius: 24px;
                    width: 90%; max-width: 380px; 
                    color: white;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    box-shadow: 
                        0 20px 60px rgba(0, 0, 0, 0.6),
                        0 0 0 1px rgba(255, 255, 255, 0.05) inset;
                    max-height: 90vh; overflow-y: auto;
                    animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1);
                    position: relative;
                }
                
                /* Scrollbar polish */
                .onboarding-card::-webkit-scrollbar { width: 4px; }
                .onboarding-card::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }

                .onboarding-card h2 { 
                    margin-top: 0; 
                    margin-bottom: 4px;
                    font-size: 1.5rem;
                    background: linear-gradient(135deg, #00C6FF 0%, #0072FF 100%); 
                    -webkit-background-clip: text; 
                    -webkit-text-fill-color: transparent; 
                    text-align: center;
                    letter-spacing: -0.5px;
                }
                
                .onboarding-subtitle {
                    text-align: center;
                    color: rgba(255,255,255,0.6);
                    font-size: 0.85rem;
                    margin-bottom: 20px;
                }

                .ob-section { margin-bottom: 16px; }
                .ob-section label { 
                    display: block; 
                    margin-bottom: 6px; 
                    font-weight: 600; 
                    color: rgba(255,255,255,0.9);
                    font-size: 0.85rem;
                    letter-spacing: 0.3px;
                }

                .ob-input {
                    width: 100%; padding: 12px 14px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px; 
                    color: white;
                    font-size: 0.9rem; 
                    outline: none;
                    transition: all 0.2s ease;
                }
                .ob-input:focus { 
                    background: rgba(255, 255, 255, 0.1);
                    border-color: #00C6FF; 
                    box-shadow: 0 0 0 4px rgba(0, 198, 255, 0.15);
                }

                .chip-group { display: flex; flex-wrap: wrap; gap: 8px; }
                .chip {
                    background: rgba(255, 255, 255, 0.05); 
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: rgba(255,255,255,0.7); 
                    padding: 8px 14px; 
                    border-radius: 14px; 
                    cursor: pointer;
                    font-size: 0.8rem;
                    font-weight: 500;
                    transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
                }
                .chip:hover {
                    background: rgba(255, 255, 255, 0.1);
                    transform: translateY(-1px);
                    color: white;
                }
                .chip.selected { 
                    background: linear-gradient(135deg, #00C6FF 0%, #0072FF 100%); 
                    color: white; 
                    border-color: transparent; 
                    font-weight: 600; 
                    box-shadow: 0 4px 12px rgba(0, 114, 255, 0.3);
                    transform: translateY(-1px);
                }
                
                .complete-btn {
                    width: 100%; padding: 14px; 
                    background: linear-gradient(135deg, #00C6FF 0%, #0072FF 100%);
                    color: white; 
                    font-weight: 700; 
                    font-size: 1rem; 
                    border: none; 
                    border-radius: 14px; 
                    cursor: pointer;
                    margin-top: 8px;
                    transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
                    box-shadow: 0 8px 20px rgba(0, 114, 255, 0.3);
                }
                .complete-btn:hover {
                    transform: translateY(-2px) scale(1.01);
                    box-shadow: 0 12px 25px rgba(0, 114, 255, 0.5);
                }
                .complete-btn:active { transform: scale(0.98); }

                .avatar-preview-box {
                    text-align: center; 
                    padding: 16px; 
                    background: rgba(255, 255, 255, 0.03); 
                    border-radius: 18px;
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    margin-top: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-direction: column;
                }
                .avatar-preview-box img {
                    width: 80px; height: 80px; 
                    border-radius: 50%; 
                    border: 3px solid rgba(255, 255, 255, 0.15); 
                    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
                    object-fit: cover;
                    transition: all 0.3s ease;
                }
                .avatar-preview-box img:hover {
                    transform: scale(1.05);
                    border-color: #00C6FF;
                }
                .avatar-hint {
                    margin-top: 10px; 
                    font-size: 0.8rem; 
                    color: rgba(255, 255, 255, 0.5);
                    line-height: 1.4;
                    max-width: 90%;
                }

                .map-container {
                    height: 100vh;
                    width: 100%;
                    position: relative;
                    background: var(--bg-color);
                }
                .map-ui-overlay {
                    position: absolute;
                    bottom: 80px;
                    left: 0; right: 0;
                    display: flex; justify-content: center;
                    z-index: 999;
                    pointer-events: none; 
                }
                
                /* INJECTED AVATAR STYLES (Backup if App.css fails) */
                .avatar-group {
                    position: relative;
                    width: 42px; height: 42px;
                    overflow: visible;
                }
                .avatar-marker {
                    width: 100%; height: 100%;
                    background-size: cover; background-position: center;
                    border-radius: 50%;
                    border: 3px solid #FFFFFF;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.3);
                    background-color: #333;
                }
                .thought-bubble {
                    position: absolute;
                    bottom: 115%; left: 50%;
                    transform: translateX(-50%);
                    background: white; color: black;
                    padding: 3px 6px; border-radius: 10px;
                    font-size: 0.7rem; white-space: nowrap;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                    border: 2px solid #4285F4;
                    z-index: 9999;
                    text-align: center;
                }
                
                /* SMOOTH MARKER ANIMATIONS */
                /* Re-enabled for real-time smooth location gliding */
                .leaflet-marker-icon {
                    transition: transform 0.5s ease-out;
                    opacity: 1; 
                }
                
                /* Class specific for avatars */
                .leaflet-marker-icon.custom-avatar-icon {
                    will-change: transform, opacity;
                }

                .stats-card {
                    pointer-events: auto;
                    background: white;
                    padding: 8px 20px;
                    border-radius: 50px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.15);
                    color: #333;
                    display: flex; align-items: center; gap: 12px;
                    font-size: 0.95rem;
                    font-weight: 500;
                    z-index: 2000;
                }
                
                /* Dark Mode Stats Card - Keep it white with black text */
                /* Increased specificity to override global index.css rules */
                html[data-theme="dark"] #root .stats-card {
                    background: white !important;
                    color: #000000 !important;
                }
                html[data-theme="dark"] #root .stats-card span,
                html[data-theme="dark"] #root .stats-card strong,
                html[data-theme="dark"] #root .stats-card div {
                    color: #000000 !important;
                }
                
                /* System theme block removed */
                .stats-divider { width: 1px; height: 18px; background: #bbb; }
                /* Controls and Thought Input Styles kept minimal here, mostly moved to App.css or generic */
                /* Dark Map Tiles Filter */
                .dark-map-tiles {
                    filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%);
                    -webkit-filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%);
                }

                /* ✅ Always show avatar images in their TRUE colors — never inherit tile layer inversion or any stacking-context filter */
                .custom-avatar-icon,
                .custom-avatar-icon * {
                    filter: none !important;
                    -webkit-filter: none !important;
                    isolation: isolate;
                }

                /* Ghost mode self-marker: use opacity only, not grayscale */
                .avatar-marker.self.ghost-mode {
                    opacity: 0.5;
                    filter: none !important;
                    -webkit-filter: none !important;
                }

                /* Catch-all: ensure Leaflet marker pane never dims avatars */
                .leaflet-marker-pane .custom-avatar-icon {
                    filter: none !important;
                    -webkit-filter: none !important;
                }

                .thought-input-overlay {
                    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
                    display: flex; align-items: center; justify-content: center; z-index: 3000;
                    backdrop-filter: blur(2px);
                }
                .thought-card {
                    background: white; padding: 20px; border-radius: 20px; width: 80%; max-width: 320px;
                    display: flex; flex-direction: column; gap: 10px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                }
                .thought-card h3 { margin: 0; font-size: 1.1rem; color: #333; }
                .thought-card input {
                    width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 10px; font-size: 1rem; outline: none;
                }
                .thought-card input:focus { border-color: #4285F4; }
                .thought-actions { display: flex; gap: 10px; justify-content: space-between; align-items: center; margin-top: 5px; }
                .thought-actions .right-actions { display: flex; gap: 10px; }
                .thought-actions button { padding: 8px 16px; border-radius: 8px; border:none; cursor: pointer; font-weight: 600; }
                .thought-actions button.primary { background: #4285F4; color: white; }
                .hint { font-size: 0.75rem; color: #888; margin: 0; text-align: center; }

                /* Dark Mode for Thought Card */
                html[data-theme="dark"] .thought-card {
                    background: #1e1e24 !important;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
                html[data-theme="dark"] .thought-card h3 {
                    color: white;
                }
                html[data-theme="dark"] .thought-card input {
                    background: rgba(0, 0, 0, 0.3);
                    color: white;
                    border-color: rgba(255, 255, 255, 0.2);
                }
                html[data-theme="dark"] .thought-card input:focus {
                    border-color: #4285F4;
                }
                html[data-theme="dark"] .thought-actions button {
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                }
                html[data-theme="dark"] .thought-actions button.primary {
                    background: #4285F4;
                }

                @media (prefers-color-scheme: dark) {
                    html[data-theme="system"] .thought-card {
                        background: #1e1e24 !important;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                    }
                    html[data-theme="system"] .thought-card h3 {
                        color: white;
                    }
                    html[data-theme="system"] .thought-card input {
                        background: rgba(0, 0, 0, 0.3);
                        color: white;
                        border-color: rgba(255, 255, 255, 0.2);
                    }
                    html[data-theme="system"] .thought-actions button {
                        background: rgba(255, 255, 255, 0.1);
                        color: white;
                    }
                    html[data-theme="system"] .thought-actions button.primary {
                        background: #4285F4;
                    }
                }



                /* Report Modal Styles */
                .report-modal-overlay {
                    position: fixed; inset: 0; background: rgba(0,0,0,0.7);
                    display: flex; align-items: center; justify-content: center; z-index: 5000;
                    backdrop-filter: blur(3px);
                }
                .report-modal-card {
                    background: white; padding: 25px; border-radius: 20px; width: 85%; max-width: 360px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.4);
                }
                .report-modal-card h3 { margin: 0 0 10px 0; font-size: 1.2rem; color: #333; }
                .report-modal-card p { margin: 0 0 15px 0; font-size: 0.9rem; color: #666; }
                .report-reasons {
                    display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px;
                }
                .report-reasons button {
                    padding: 12px 15px; background: rgba(255, 69, 58, 0.1);
                    border: 1px solid rgba(255, 69, 58, 0.3); border-radius: 10px;
                    color: #ff453a; cursor: pointer; font-size: 0.9rem; font-weight: 600;
                    text-align: left; transition: all 0.2s;
                }
                .report-reasons button:hover {
                    background: rgba(255, 69, 58, 0.2); border-color: #ff453a;
                    transform: translateX(5px);
                }
                .cancel-report-btn {
                    width: 100%; padding: 12px; background: rgba(0,0,0,0.05);
                    border: 1px solid rgba(0,0,0,0.1); border-radius: 10px;
                    color: #666; cursor: pointer; font-size: 0.9rem; font-weight: 600;
                }
                .cancel-report-btn:hover { background: rgba(0,0,0,0.1); }
                
                /* Avatar styles moved to App.css for consistency */
            `}</style>
        </div>
    );
}
