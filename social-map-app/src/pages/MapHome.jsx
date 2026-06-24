import { MapContainer, TileLayer, Circle, useMap, LayersControl, LayerGroup } from 'react-leaflet';
import L from 'leaflet';
import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import MapProfileCard from '../components/MapProfileCard';
import FullProfileModal from '../components/FullProfileModal';
import ReplyThoughtModal from '../components/ReplyThoughtModal';
import PokeNotifications from '../components/PokeNotifications';
import Toast from '../components/Toast';
import MessageRequestsPage from '../components/MessageRequestsPage';
import { getAvatar2D, generateRandomRPMAvatar } from '../utils/avatarUtils';
import { getBlockedUserIds, getBlockerIds, isUserBlocked, isBlockedMutual } from '../utils/blockUtils';
import { useLocationContext } from '../context/LocationContext';
import { useCall } from '../context/CallContext';
import { fuzzyLocation, distanceMetres, fuzzyLocationForDB, parseThought, formatThought } from '../utils/locationPrivacy';
import LimitedModeScreen from '../components/LimitedModeScreen';
import LocationOnboarding from '../components/LocationOnboarding';
import StoryViewer from '../components/StoryViewer';
import { uploadToStorage } from '../utils/fileUpload';
import { DEFAULT_MALE_AVATAR, DEFAULT_FEMALE_AVATAR, DEFAULT_GENERIC_AVATAR } from '../utils/avatarUtils';
// 🚀 Lazy-loaded: only downloads when user picks a photo to crop
const ImageCropper = React.lazy(() => import('../components/ImageCropper'));
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
function RecenterControl({ markerRefs, currentUserId, fallbackLat, fallbackLng, onRecenter }) {
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

        if (onRecenter) {
            onRecenter(lat, lng);
        }

        const currentCenter = map.getCenter();
        const targetLatLng = L.latLng(lat, lng);
        const distance = currentCenter.distanceTo(targetLatLng);

        // Fly to zoom 17 to match the screenshot view
        map.flyTo(targetLatLng, 17, { 
            animate: true, 
            duration: distance < 50 ? 0.8 : 1.5,
            easeLinearity: 0.25
        });
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
function NativeMarkerSync({ users, currentUser, userLocation, currentUserIcon, createAvatarIcon, markerRefs, handleMarkerClick, animateNativeMarker, setSelectedUser, expandedThoughtId }) {
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

            if (displayThought) {
                const parsed = parseThought(displayThought);
                if (parsed.privacy === 'friends') {
                    const isFriend = u.friendshipStatus === 'accepted';
                    if (!isFriend) {
                        displayThought = null;
                    }
                }
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
                0, // no stagger delay needed natively
                u.activity_status, // PASS ACTIVITY STATUS
                u.id, // PASS ID
                thoughtUpdatedAt, // PASS THOUGHT_UPDATED_AT
                expandedThoughtId === u.id // PASS isExpanded
            );

            const isBoosted = u?.thought_boosted_at && (new Date(u.thought_boosted_at).getTime() > Date.now() - 3 * 60 * 60 * 1000);
            const zIndexOffset = isBoosted ? 2000 : 100;

            if (!marker) {
                // Create native Leaflet marker
                marker = L.marker([u.lat, u.lng], { icon, zIndexOffset }).addTo(map);
                marker.on('click', () => handleMarkerClick(u));
                markerRefs.current.set(u.id, marker);
            } else {
                // 🔥 CRITICAL: Only rebuild the DOM node when the icon HTML actually changed
                // (e.g. avatar image, status, mood). DO NOT rebuild on every GPS update — 
                // that kills the requestAnimationFrame glide mid-flight and causes massive jank.
                if (marker.options.icon.options.html !== icon.options.html) {
                    marker.setIcon(icon);
                }
                marker.setZIndexOffset(zIndexOffset);
                // Sync coordinate drift/movement smoothly
                const currentLatLng = marker.getLatLng();
                const dist = getDistance(currentLatLng.lat, currentLatLng.lng, u.lat, u.lng);
                if (dist > 5) {
                    animateNativeMarker(u.id, u.lat, u.lng);
                }
            }
        });
    }, [users, map, currentUser?.id, createAvatarIcon, handleMarkerClick, markerRefs, animateNativeMarker, expandedThoughtId]);

    // Sync local user marker visually (initial creation and icon changes)
    useEffect(() => {
        if (!map || !currentUser?.id || !userLocation || !currentUserIcon) return;
        
        const selfBoosted = currentUser?.thought_boosted_at && (new Date(currentUser.thought_boosted_at).getTime() > Date.now() - 3 * 60 * 60 * 1000);
        const selfZIndex = selfBoosted ? 3000 : 1000;

        let marker = markerRefs.current.get(currentUser.id);
        if (!marker) {
            // First time spawn
            marker = L.marker([userLocation.lat, userLocation.lng], { icon: currentUserIcon, zIndexOffset: selfZIndex }).addTo(map);
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
            marker.setZIndexOffset(selfZIndex);
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
            return;
        }

        const targetLat = parseFloat(lat);
        const targetLng = parseFloat(lng);
        const zoomLevel = 18; // Close zoom for profile view

        // Check for Mobile (Approximate check using window width)
        const isMobile = window.innerWidth <= 768;

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

// Module-level persistent caches to prevent avatars from jumping or losing stalker protection view counts on unmount
const globalFuzzyLocationCache = new Map();

// Helper: Generates a stable, random 50-100m offset for other users
const getFuzzyLocationForUser = (userId, latVal, lngVal) => {
    if (latVal == null || lngVal == null || isNaN(latVal) || isNaN(lngVal)) {
        return { lat: latVal, lng: lngVal, latitude: latVal, longitude: lngVal };
    }

    let fCache = globalFuzzyLocationCache.get(userId);

    if (!fCache) {
        // Generate a random stable offset between 50 and 100 meters
        const distM = 50 + Math.random() * 50; // Random distance 50-100m
        const bearing = Math.random() * 2 * Math.PI; // Random bearing in radians
        
        const METRES_PER_DEG_LAT = 111000;
        const METRES_PER_DEG_LNG = 111000 * Math.cos((latVal * Math.PI) / 180);

        const deltaLat = (distM * Math.cos(bearing)) / METRES_PER_DEG_LAT;
        const deltaLng = (distM * Math.sin(bearing)) / METRES_PER_DEG_LNG;

        fCache = {
            realLat: latVal,
            realLng: lngVal,
            deltaLat,
            deltaLng,
            fuzzyLat: latVal + deltaLat,
            fuzzyLng: lngVal + deltaLng
        };
        globalFuzzyLocationCache.set(userId, fCache);
    } else if (fCache.realLat !== latVal || fCache.realLng !== lngVal) {
        // Keep the exact same offset (deltaLat, deltaLng) to prevent avatar from jumping/running
        fCache = {
            ...fCache,
            realLat: latVal,
            realLng: lngVal,
            fuzzyLat: latVal + (fCache.deltaLat || 0),
            fuzzyLng: lngVal + (fCache.deltaLng || 0)
        };
        globalFuzzyLocationCache.set(userId, fCache);
    }

    return {
        lat: fCache.fuzzyLat,
        lng: fCache.fuzzyLng,
        latitude: fCache.fuzzyLat,
        longitude: fCache.fuzzyLng
    };
};
const globalViewCounts = {};
let globalNearbyUsersCache = [];

export default function MapHome() {
    // Map UI State
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('All');
    const [showFilters, setShowFilters] = useState(false);
    const [mapMode, setMapMode] = useState('street'); // 'street', 'hybrid', 'satellite'
    const [showMapViewMenu, setShowMapViewMenu] = useState(false);

    // Circle center state initialized to last known location if available
    const [circleCenter, setCircleCenter] = useState(() => {
        try {
            const stored = localStorage.getItem('lastKnownLocation');
            const loc = stored ? JSON.parse(stored) : null;
            return loc ? [loc.lat, loc.lng] : null;
        } catch {
            return null;
        }
    });

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
    const [messageRequestsCount, setMessageRequestsCount] = useState(0);
    const [isMessageRequestsPageOpen, setIsMessageRequestsPageOpen] = useState(false);

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

            // Message Requests Count
            const { count: msgCount } = await supabase
                .from('message_requests')
                .select('id', { count: 'exact', head: true })
                .eq('receiver_id', user.id)
                .eq('status', 'pending');
                
            if (msgCount !== null) {
                setMessageRequestsCount(msgCount);
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
    const friendshipsMapRef = useRef(new Map()); // Map<partner_id, { status, id, requesterId }>
    const blockedIdsRef = useRef(new Set()); // Blocked users cache
    const blockChannelRef = useRef(null);    // 🚀 Reuse subscribed channel for instant broadcasts
    const fuzzyLocationCache = useRef(globalFuzzyLocationCache); // Caches fuzzied lat/lng per user so avatars don't jump around
    const initialLoadComplete = useRef(false);

    const [nearbyUsers, setNearbyUsers] = useState(globalNearbyUsersCache);

    useEffect(() => {
        globalNearbyUsersCache = nearbyUsers;
    }, [nearbyUsers]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showVisibilityMenu, setShowVisibilityMenu] = useState(false);
    const [diamondFilters, setDiamondFilters] = useState({
        gender: 'All',
        ageMin: 18,
        ageMax: 99,
        relationshipStatus: 'All',
        interests: '',
        onlineOnly: false,
        distanceMax: 5,
        enabled: false
    });
    const [showDiamondFilterPanel, setShowDiamondFilterPanel] = useState(false);
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
    const [selectedColor, setSelectedColor] = useState('#f3d9fa'); // Lavender by default
    const [selectedPrivacy, setSelectedPrivacy] = useState('everyone');
    const [isBoostSelected, setIsBoostSelected] = useState(false);

    useEffect(() => {
        if (showThoughtInput) {
            setIsBoostSelected(false);
        }
    }, [showThoughtInput]);

    const [thoughtReactions, setThoughtReactions] = useState({});
    const [expandedThoughtId, setExpandedThoughtId] = useState(null);
    const [showOwnReactorsSheet, setShowOwnReactorsSheet] = useState(false);
    const [thoughtReplies, setThoughtReplies] = useState([]);

    // Fetch initial thought replies (message requests)
    const fetchThoughtReplies = React.useCallback(async () => {
        if (!currentUser) return;
        try {
            const rawThoughtText = currentUser.thought || currentUser.status_message;
            const parsedThought = parseThought(rawThoughtText);
            const displayThought = parsedThought.text;
            
            if (!displayThought) {
                setThoughtReplies([]);
                return;
            }

            const { data, error } = await supabase
                .from('message_requests')
                .select(`
                    id,
                    sender_id,
                    receiver_id,
                    content,
                    thought_text,
                    status,
                    created_at,
                    sender:profiles!sender_id(id, username, full_name, avatar_url, gender)
                `)
                .eq('receiver_id', currentUser.id)
                .eq('status', 'pending')
                .eq('thought_text', displayThought);

            if (!error && data) {
                setThoughtReplies(data);
            } else {
                setThoughtReplies([]);
            }
        } catch (err) {
            console.error('Error fetching thought replies:', err);
            setThoughtReplies([]);
        }
    }, [currentUser?.id, currentUser?.thought, currentUser?.status_message]);

    const fetchThoughtRepliesRef = React.useRef(null);
    fetchThoughtRepliesRef.current = fetchThoughtReplies;

    // Fetch replies when opening own reactors sheet
    useEffect(() => {
        if (selectedUser?.id === currentUser?.id && (showOwnReactorsSheet || selectedUser)) {
            fetchThoughtReplies();
        } else {
            setThoughtReplies([]);
        }
    }, [selectedUser?.id, showOwnReactorsSheet, currentUser?.id, fetchThoughtReplies]);

    // Fetch initial thought reactions
    const fetchReactions = async (userIds) => {
        if (!userIds || userIds.length === 0) return;
        try {
            const { data, error } = await supabase
                .from('thought_reactions')
                .select(`
                    id,
                    thought_id,
                    user_id,
                    reaction_type,
                    created_at,
                    user:profiles!user_id(id, username, full_name, avatar_url, gender)
                `)
                .in('thought_id', userIds);

            if (!error && data) {
                const grouped = {};
                data.forEach(r => {
                    if (!grouped[r.thought_id]) grouped[r.thought_id] = [];
                    grouped[r.thought_id].push(r);
                });
                setThoughtReactions(grouped);
            }
        } catch (err) {
            console.error('Error fetching reactions:', err);
        }
    };

    // Trigger initial reactions fetch when visible user set changes
    useEffect(() => {
        if (!currentUser) return;
        const visibleUserIds = [currentUser.id, ...nearbyUsers.map(u => u.id)];
        fetchReactions(visibleUserIds);
    }, [nearbyUsers.map(u => u.id).join(','), currentUser?.id]);

    // Subscribe to thought reactions realtime changes
    useEffect(() => {
        if (!currentUser) return;

        const channel = supabase
            .channel('public:thought_reactions')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'thought_reactions'
            }, async (payload) => {
                const { eventType, new: newRec, old: oldRec } = payload;
                console.log('Realtime thought reaction event:', eventType, newRec, oldRec);

                if (eventType === 'INSERT') {
                    const reactorId = newRec.user_id;
                    let reactorUser = nearbyUsers.find(u => u.id === reactorId) || (currentUser.id === reactorId ? currentUser : null);
                    if (!reactorUser) {
                        const { data } = await supabase
                            .from('profiles')
                            .select('id, username, full_name, avatar_url, gender')
                            .eq('id', reactorId)
                            .maybeSingle();
                        if (data) reactorUser = data;
                    }

                    const reactionObj = {
                        ...newRec,
                        user: reactorUser ? {
                            id: reactorUser.id,
                            username: reactorUser.username || reactorUser.name,
                            full_name: reactorUser.full_name,
                            avatar_url: reactorUser.avatar || reactorUser.avatar_url
                        } : null
                    };

                    setThoughtReactions(prev => {
                        const currentList = prev[newRec.thought_id] ? [...prev[newRec.thought_id]] : [];
                        if (currentList.some(r => r.user_id === newRec.user_id)) return prev;
                        return {
                            ...prev,
                            [newRec.thought_id]: [...currentList, reactionObj]
                        };
                    });

                    // Toast notification for incoming reactions on our thought
                    if (newRec.thought_id === currentUser.id && newRec.user_id !== currentUser.id) {
                        const reactorName = reactorUser?.username || reactorUser?.name || 'Someone';
                        const emojiMap = { love: '❤️', fire: '🔥', laugh: '😂', clap: '👏' };
                        const emoji = emojiMap[newRec.reaction_type] || '❤️';
                        
                        showToast({
                            text: `🔔 ${reactorName} reacted ${emoji} to your thought`,
                            onClick: () => {
                                const selfUser = {
                                    ...currentUser,
                                    lat: currentUser.latitude || userLocation?.lat,
                                    lng: currentUser.longitude || userLocation?.lng,
                                    thought: currentUser.thought || currentUser.status_message,
                                    friendshipStatus: null // self
                                };
                                setSelectedUser(selfUser);
                            }
                        });
                    }
                } else if (eventType === 'UPDATE') {
                    setThoughtReactions(prev => {
                        const currentList = prev[newRec.thought_id] ? [...prev[newRec.thought_id]] : [];
                        const index = currentList.findIndex(r => r.user_id === newRec.user_id);
                        if (index !== -1) {
                            currentList[index] = {
                                ...currentList[index],
                                ...newRec
                            };
                        }
                        return {
                            ...prev,
                            [newRec.thought_id]: currentList
                        };
                    });
                } else if (eventType === 'DELETE') {
                    const targetId = oldRec.id;
                    setThoughtReactions(prev => {
                        const updated = {};
                        Object.keys(prev).forEach(key => {
                            updated[key] = prev[key].filter(r => r.id !== targetId);
                        });
                        return updated;
                    });
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser?.id, nearbyUsers, currentUser, userLocation]);

    const handleToggleReaction = async (thoughtUserId, reactionType) => {
        if (!currentUser) return;
        const currentUserId = currentUser.id;
        const existingList = thoughtReactions[thoughtUserId] || [];
        const existing = existingList.find(r => r.user_id === currentUserId);

        let updatedList = [];
        let dbPromise = null;
        let tempId = null;

        if (existing) {
            if (existing.reaction_type === reactionType) {
                // Remove reaction
                updatedList = existingList.filter(r => r.user_id !== currentUserId);
                dbPromise = supabase
                    .from('thought_reactions')
                    .delete()
                    .eq('id', existing.id);
            } else {
                // Update reaction
                updatedList = existingList.map(r => {
                    if (r.user_id === currentUserId) {
                        return { ...r, reaction_type: reactionType };
                    }
                    return r;
                });
                dbPromise = supabase
                    .from('thought_reactions')
                    .update({ reaction_type: reactionType })
                    .eq('id', existing.id);
            }
        } else {
            // Add reaction
            tempId = `temp-${Date.now()}`;
            const tempReaction = {
                id: tempId,
                thought_id: thoughtUserId,
                user_id: currentUserId,
                reaction_type: reactionType,
                created_at: new Date().toISOString(),
                user: {
                    id: currentUser.id,
                    username: currentUser.username || currentUser.name,
                    full_name: currentUser.full_name,
                    avatar_url: currentUser.avatar || currentUser.avatar_url
                }
            };
            updatedList = [...existingList, tempReaction];
            dbPromise = supabase
                .from('thought_reactions')
                .insert({
                    thought_id: thoughtUserId,
                    user_id: currentUserId,
                    reaction_type: reactionType
                })
                .select();
        }

        // Apply optimistic update
        setThoughtReactions(prev => ({
            ...prev,
            [thoughtUserId]: updatedList
        }));

        try {
            const { data, error } = await dbPromise;
            if (error) {
                console.error('Failed to sync reaction to db:', error);
                // Rollback optimistic update
                setThoughtReactions(prev => ({
                    ...prev,
                    [thoughtUserId]: existingList
                }));
            } else if (data && data[0]) {
                // Update with actual database record if we just inserted
                if (!existing) {
                    setThoughtReactions(prev => {
                        const current = prev[thoughtUserId] || [];
                        return {
                            ...prev,
                            [thoughtUserId]: current.map(r => r.id === tempId ? { ...r, id: data[0].id } : r)
                        };
                    });
                }
            }
        } catch (err) {
            console.error('Error toggling reaction:', err);
            // Rollback
            setThoughtReactions(prev => ({
                ...prev,
                [thoughtUserId]: existingList
            }));
        }
    };

    useEffect(() => {
        window.handleThoughtClick = (id) => {
            setExpandedThoughtId(prev => prev === id ? null : id);
        };
        window.handleThoughtReact = (id, type) => {
            handleToggleReaction(id, type);
        };
        window.handleThoughtReactionsClick = (userId) => {
            // Open the profile card for this user and show the reactors sheet
            setShowOwnReactorsSheet(true);
            // If we're clicking on our own thought, set selectedUser to currentUser so the card opens
            if (currentUser && currentUser.id === userId) {
                setSelectedUser(prev => {
                    // If card is already open for self, just update sheet flag
                    return prev?.id === userId ? prev : {
                        ...currentUser,
                        lat: currentUser.latitude,
                        lng: currentUser.longitude,
                        thought: currentUser.thought || currentUser.status_message,
                    };
                });
            }
        };
        return () => {
            delete window.handleThoughtClick;
            delete window.handleThoughtReact;
            delete window.handleThoughtReactionsClick;
        };
    }, [handleToggleReaction, currentUser]);

    const handleOpenThoughtInput = () => {
        if (currentUser) {
            const raw = currentUser.thought || currentUser.status_message;
            const parsed = parseThought(raw);
            setMyThought(parsed.text || '');
            setSelectedColor(parsed.color || '#f3d9fa');
            setSelectedPrivacy(parsed.privacy || 'everyone');
        } else {
            setMyThought('');
            setSelectedColor('#f3d9fa');
            setSelectedPrivacy('everyone');
        }
        setShowThoughtInput(true);
    };

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
    const viewCountsRef = React.useRef(globalViewCounts);
    // 🔥 Ref-based location for non-reactive reads (prevents GPS updates causing full re-renders)
    const userLocationRef = React.useRef(userLocation);

    // 🔥 NATIVE HARDWARE ACCELERATED ANIMATION MANAGER
    const animateNativeMarker = React.useCallback((id, newLat, newLng) => {
        const marker = markerRefs.current.get(id);
        if (!marker) return;

        const currentLatLng = marker.getLatLng();
        const startLat = currentLatLng.lat;
        const startLng = currentLatLng.lng;

        // Ignore micro GPS jitter (do not animate if movement < 15 meters)
        const dist = getDistance(startLat, startLng, newLat, newLng);
        if (dist < 15) return;

        // Cancel previous animation to prevent stacking/flickering
        if (animationRefs.current.has(id)) {
            cancelAnimationFrame(animationRefs.current.get(id));
        }

        let startTime = null;
        const duration = 1500; // 1.5 seconds smooth glide lag-follow

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

    const handleRecenterCallback = React.useCallback((lat, lng) => {
        setCircleCenter([lat, lng]);
    }, []);

    const [replyingToThought, setReplyingToThought] = useState(null); // { userId, thoughtText }

    // Global handler for replying to a thought directly from the map bubble
    useEffect(() => {
        window.handleThoughtReplyClick = (userId, thoughtText) => {
            setReplyingToThought({ userId, thoughtText });
        };
        return () => {
            delete window.handleThoughtReplyClick;
        };
    }, []);

    // 🔥 Keep userLocationRef in sync with context without causing downstream re-renders
    useEffect(() => {
        userLocationRef.current = userLocation;
    }, [userLocation]);

    // 🚀 LOCAL USER HIGH-FREQUENCY GPS TRACKING (Overrides Context internally for map smoothness)
    useEffect(() => {
        if (!locationEnabled || !currentUser?.id) {
            // If location turned OFF, visually remove marker & update DB
            if (currentUser?.id) {
                const marker = markerRefs.current.get(currentUser.id);
                if (marker) {
                    marker.remove();
                    markerRefs.current.delete(currentUser.id);
                }
            }
            return;
        }

        let watchId = null;
        let lastAnimatedLat = null;
        let lastAnimatedLng = null;
        
        try {
            watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    const newLat = pos.coords.latitude;
                    const newLng = pos.coords.longitude;

                    // Update circle center state when new position is received
                    setCircleCenter([newLat, newLng]);

                    // Only animate local marker if the user actually moved > 30 meters
                    const movedEnough = !lastAnimatedLat || getDistance(lastAnimatedLat, lastAnimatedLng, newLat, newLng) >= 30;
                    if (movedEnough) {
                        lastAnimatedLat = newLat;
                        lastAnimatedLng = newLng;
                        animateNativeMarker(currentUser.id, newLat, newLng);
                    }
                },
                (err) => { if (err.code !== 3) console.log('Map watch error:', err); },
                { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
            );
        } catch (e) {
            console.warn("Geolocation hardware locked during background wake", e);
        }

        return () => {
             if (watchId !== null) {
                 try {
                     navigator.geolocation.clearWatch(watchId);
                 } catch (e) {
                     console.warn("Geolocation clearWatch failed during suspend", e);
                 }
             }
        };
    }, [locationEnabled, currentUser, animateNativeMarker]);

    // Sync circle center when userLocation updates from context
    useEffect(() => {
        if (userLocation?.lat && userLocation?.lng) {
            setCircleCenter([userLocation.lat, userLocation.lng]);
        }
    }, [userLocation]);

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

            // 🔥 Fallback: manual signup stores gender/relationship_status in user_metadata.
            // The Supabase trigger may not have copied them to profiles yet (race condition on first login).
            // We use metadata as a source of truth and self-heal the profile row if needed.
            const meta = user.user_metadata || {};
            const gender = profile.gender || meta.gender || null;
            const relationshipStatus = profile.relationship_status || meta.relationship_status || null;

            // If metadata has data that the profile is missing, heal the DB row silently
            if ((!profile.gender && meta.gender) || (!profile.relationship_status && meta.relationship_status)) {
                supabase.from('profiles').update({
                    gender: gender,
                    relationship_status: relationshipStatus,
                    onboarding_completed: true
                }).eq('id', user.id).then();
            }

            // Show popup ONLY if gender or relationship_status is truly missing from both sources
            const needsSetup = !gender || !relationshipStatus;

            if (needsSetup) {
                setSetupData({
                    username: profile.username || meta.username || '',
                    gender: gender || '',
                    relationshipStatus: relationshipStatus || '',
                });
                setShowProfileSetup(true);
            } else {
                // Self-heal: ensure onboarding_completed flag is set in DB
                if (profile.onboarding_completed !== true) {
                    supabase.from('profiles').update({ onboarding_completed: true }).eq('id', profile.id).then();
                }
                setShowProfileSetup(false);
            }

            setProfileReady(true);
        };

        checkUser();
    }, []);


    // Global Unread Count Logic
    const [unreadCount, setUnreadCount] = [0, () => {}];

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
                    let partnerId = friendshipsRef.current.get(deletedId);

                    if (!partnerId && friendshipsMapRef.current) {
                        for (const [pId, fData] of friendshipsMapRef.current.entries()) {
                            if (fData.id === deletedId) {
                                partnerId = pId;
                                break;
                            }
                        }
                    }

                    if (partnerId) {
                        friendshipsRef.current.delete(deletedId);
                        friendshipsMapRef.current.delete(partnerId);
                        // Reset status in UI and filter out if they have visibility_mode = 'friends' / 'friend'
                        setSelectedUser(prev => prev && prev.id === partnerId ? { ...prev, friendshipStatus: null, friendshipId: null, requesterId: null } : prev);
                        setFullProfileUser(prev => prev && prev.id === partnerId ? { ...prev, friendshipStatus: null, friendshipId: null, requesterId: null } : prev);
                        setNearbyUsers(prev => prev
                            .map(u => u.id === partnerId ? { ...u, friendshipStatus: null, friendshipId: null, requesterId: null } : u)
                            .filter(u => {
                                if (u.id === partnerId && (u.visibility_mode === 'friends' || u.visibility_mode === 'friend')) {
                                    return false; // Remove if they are no longer friends
                                }
                                return true;
                            })
                        );
                        showToast("Status changed to Poke");
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
                    friendshipsMapRef.current.delete(relevantId);
                    
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
                    friendshipsMapRef.current.set(relevantId, { status: 'accepted', id: newRec.id });
                    showToast(`Friend request accepted! 🎉`);
                    setSelectedUser(prev => prev && prev.id === relevantId ? { ...prev, friendshipStatus: 'accepted' } : prev);
                    setNearbyUsers(prev => prev.map(u => u.id === relevantId ? { ...u, friendshipStatus: 'accepted' } : u));
                    // Remove from pending requests badge (I accepted their poke)
                    setFriendRequests(prev => prev.filter(id => id !== newRec.id));

                    // Fetch friend's profile to immediately show their avatar on map if visible under friends mode
                    supabase.from('profiles').select('*').eq('id', relevantId).maybeSingle().then(({ data: friendProfile }) => {
                        if (friendProfile) {
                            let isVisible = true;
                            if (friendProfile.activity_status === 'offline') isVisible = false;
                            if (friendProfile.visibility_mode === 'ghost') isVisible = false;
                            if (friendProfile.is_location_on === false) isVisible = false;
                            if (friendProfile.last_seen) {
                                const lastSeenDate = new Date(friendProfile.last_seen);
                                const now = new Date();
                                const diffMinutes = (now - lastSeenDate) / (1000 * 60);
                                if (diffMinutes > 60) isVisible = false;
                            }
                            if (isVisible) {
                                setNearbyUsers(prev => {
                                    if (prev.some(u => u.id === relevantId)) return prev;

                                    const latVal = parseFloat(friendProfile.latitude);
                                    const lngVal = parseFloat(friendProfile.longitude);
                                    
                                    const fuzzyLoc = getFuzzyLocationForUser(relevantId, latVal, lngVal);

                                    let fallbackAvatar;
                                    if (friendProfile.gender === 'Male') fallbackAvatar = DEFAULT_MALE_AVATAR;
                                    else if (friendProfile.gender === 'Female') fallbackAvatar = DEFAULT_FEMALE_AVATAR;
                                    else fallbackAvatar = DEFAULT_GENERIC_AVATAR;

                                    let statusMessage = friendProfile.status_message;
                                    let statusEmoji = friendProfile.status;
                                    if (friendProfile.status_updated_at) {
                                        const statusDate = new Date(friendProfile.status_updated_at);
                                        const now = new Date();
                                        const diffHours = (now - statusDate) / (1000 * 60 * 60);
                                        if (diffHours > 3) {
                                            statusMessage = null;
                                            statusEmoji = null;
                                        }
                                    }

                                    const newUserObj = {
                                        id: friendProfile.id,
                                        name: friendProfile.username || 'User',
                                        lat: fuzzyLoc.lat,
                                        lng: fuzzyLoc.lng,
                                        avatar: friendProfile.avatar_url || fallbackAvatar,
                                        originalAvatar: friendProfile.avatar_url,
                                        status: statusEmoji,
                                        thought: statusMessage,
                                        lastActive: friendProfile.last_active || friendProfile.last_seen,
                                        isLocationShared: true,
                                        isLocationOn: friendProfile.is_location_on,
                                        relationshipStatus: friendProfile.relationship_status,
                                        mood: friendProfile.mood,
                                        moodUpdatedAt: friendProfile.mood_updated_at,
                                        status_updated_at: friendProfile.status_updated_at,
                                        is_public: friendProfile.is_public,
                                        hide_status: friendProfile.hide_status,
                                        show_last_seen: friendProfile.show_last_seen,
                                        activity_status: friendProfile.activity_status,
                                        visibility_mode: friendProfile.visibility_mode,
                                        friendshipStatus: 'accepted',
                                        friendshipId: newRec.id,
                                        hasStory: false,
                                        hasUnseenStory: false
                                    };
                                    return [...prev, newUserObj];
                                });
                            }
                        }
                    });
                }

                // CASE 4: PENDING (New Poke)
                if (newRec?.status === 'pending') {
                    friendshipsRef.current.set(newRec.id, relevantId); // Cache it
                    friendshipsMapRef.current.set(relevantId, { status: 'pending', id: newRec.id, requesterId: newRec.requester_id });

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

        // Listen for message requests
        const messageRequestsChannel = supabase
            .channel('message_requests_map')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'message_requests',
                filter: `receiver_id=eq.${currentUser.id}`
            }, (payload) => {
                const { eventType, new: newRec, old: oldRec } = payload;
                if (eventType === 'INSERT' && newRec.status === 'pending') {
                    setMessageRequestsCount(prev => prev + 1);
                    showToast('You have a new message request! 📬');
                    fetchThoughtRepliesRef.current?.();
                } else if (eventType === 'DELETE' || (eventType === 'UPDATE' && newRec.status !== 'pending' && oldRec.status === 'pending')) {
                    setMessageRequestsCount(prev => Math.max(0, prev - 1));
                    fetchThoughtRepliesRef.current?.();
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
                if (status === 'SUBSCRIBED') {
                    // Store reference so handleUserAction can broadcast directly without
                    // creating a new throwaway channel that never fires in time
                    blockChannelRef.current = blockChannel;
                }
            });

        return () => {
            supabase.removeChannel(channel);
            supabase.removeChannel(friendshipChannel);
            supabase.removeChannel(blockChannel);
            supabase.removeChannel(messageRequestsChannel);
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
                        .select('id, username, full_name, gender, latitude, longitude, status, relationship_status, status_message, status_updated_at, last_active, avatar_url, hide_status, show_last_seen, is_public, is_location_on, mood, mood_updated_at, visibility_mode, activity_status, last_seen, is_stationary, stationary_since, subscription_tier, avatar_effect, interests, birth_date')
                        .neq('id', currentUser.id)
                        .or('is_ghost_mode.eq.false,is_ghost_mode.is.null,visibility_mode.neq.ghost') 
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
                friendshipsMapRef.current = myFriendships;

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

                // Filter and map users (exclude blocked users, offline users, AND current user)
                const validUsers = (profilesData.data || [])
                    .filter(u => {
                        const isBlocked = allBlockedIds.has(u.id);
                        const isMe = u.id === currentUser.id;
                        
                        if (isBlocked || isMe) return false;

                        // Step 9: Offline system
                        if (u.activity_status === 'offline') return false;

                        if (u.last_seen) {
                            const lastSeenDate = new Date(u.last_seen);
                            const now = new Date();
                            const diffMinutes = (now - lastSeenDate) / (1000 * 60);
                            if (diffMinutes > 60) return false;
                        }

                        // Filter if they have visibility_mode = 'ghost'
                        if (u.visibility_mode === 'ghost') return false;

                        // Filter if visibility_mode is 'friends' (or 'friend') and they are not our friend
                        if (u.visibility_mode === 'friends' || u.visibility_mode === 'friend') {
                            const fData = myFriendships.get(u.id);
                            if (!fData || fData.status !== 'accepted') {
                                return false;
                            }
                        }

                        // Check location enabled explicitly
                        if (u.is_location_on === false) return false;

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

                        const lat = parseFloat(u.latitude);
                                const lng = parseFloat(u.longitude);

                        const fuzzyLoc = getFuzzyLocationForUser(u.id, lat, lng);
                        const renderLat = fuzzyLoc.lat;
                        const renderLng = fuzzyLoc.lng;

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
                            activity_status: u.activity_status,
                            is_stationary: u.is_stationary,
                            stationary_since: u.stationary_since,
                            lastActive: u.last_active || u.last_seen,
                            isLocationOn: u.is_location_on,
                            isLocationShared: true,
                            friendshipStatus: fData?.status || null,
                            friendshipId: fData?.id || null,
                            is_public: u.is_public,
                            status_updated_at: u.status_updated_at, // 🔥 Critical for expiration check
                            visibility_mode: u.visibility_mode,
                            subscription_tier: u.subscription_tier || 'free',
                            avatar_effect: u.avatar_effect || 'none',
                            interests: u.interests || [],
                            birth_date: u.birth_date || null,
                            // PRIVACY CHECK: Only show story if public OR friends
                            hasStory: usersWithStories.has(u.id) && (u.is_public !== false || fData?.status === 'accepted'),
                            hasUnseenStory: usersWithUnseenStories.has(u.id) && (u.is_public !== false || fData?.status === 'accepted')
                        };
                    });

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

                // Proximity check for Crossing Paths (safely log distance <= 50m)
                if (currentUser && validUsers.length > 0) {
                    const myLat = userLocationRef.current?.lat ?? currentUser?.latitude;
                    const myLng = userLocationRef.current?.lng ?? currentUser?.longitude;
                    if (myLat && myLng) {
                        validUsers.forEach(u => {
                            if (u.lat && u.lng) {
                                const dist = getDistanceFromLatLonInKm(myLat, myLng, u.lat, u.lng) * 1000;
                                if (dist <= 50) {
                                    import('../utils/premiumUtils').then(({ recordCrossingPath }) => {
                                        recordCrossingPath(currentUser.id, u.id);
                                    });
                                }
                            }
                        });
                    }
                }

                initialLoadComplete.current = true;
            } catch (err) {
                console.error(err);
            }
        };

        // Real-time Subscription for Instant Updates (both UPDATE and INSERT)
        const channel = supabase
            .channel('public:profiles')
            // Unified UPDATE listener for Location + Profile changes
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
                if (!initialLoadComplete.current) return;
                const updatedUser = payload.new;

                // 🔥 Self-update: only update our own profile data (mood, avatar, status).
                // Do NOT update nearbyUsers (we're not in that list) and do NOT animate our own marker here.
                if (updatedUser.id === currentUser.id) {
                    setCurrentUser(prev => {
                        if (!prev) return prev;
                        // Only update profile display fields — NOT lat/lng (handled by watchPosition natively)
                        return {
                            ...prev,
                            mood: updatedUser.mood,
                            mood_updated_at: updatedUser.mood_updated_at,
                            status: updatedUser.status,
                            status_message: updatedUser.status_message,
                            status_updated_at: updatedUser.status_updated_at,
                            avatar_url: updatedUser.avatar_url || prev.avatar_url,
                            username: updatedUser.username || prev.username,
                            // 🔥 Sync visibility changes triggered from other tabs/devices
                            visibility_mode: updatedUser.visibility_mode ?? prev.visibility_mode,
                            is_ghost_mode: updatedUser.visibility_mode === 'ghost' || updatedUser.is_ghost_mode,
                        };
                    });
                    return; // Skip nearbyUsers update for self
                }

                // FILTER BLOCKED USERS
                if (blockedIdsRef.current.has(updatedUser.id)) {
                    // Start removing them if they are currently on map
                    setNearbyUsers(prev => prev.filter(u => u.id !== updatedUser.id));
                    return;
                }

                // Check visibility criteria
                let isVisible = true;
                if (updatedUser.activity_status === 'offline') isVisible = false;
                if (updatedUser.visibility_mode === 'ghost') isVisible = false;
                if (updatedUser.is_location_on === false) isVisible = false;

                if (updatedUser.visibility_mode === 'friends' || updatedUser.visibility_mode === 'friend') {
                    const fData = friendshipsMapRef.current.get(updatedUser.id);
                    if (!fData || fData.status !== 'accepted') {
                        isVisible = false;
                    }
                }

                if (updatedUser.last_seen) {
                    const lastSeenDate = new Date(updatedUser.last_seen);
                    const now = new Date();
                    const diffMinutes = (now - lastSeenDate) / (1000 * 60);
                    if (diffMinutes > 60) isVisible = false;
                }

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

                    let renderLat = parseFloat(updatedUser.latitude);
                    let renderLng = parseFloat(updatedUser.longitude);

                    // Fallback to parsed last_location if raw columns are lagging but visibility is toggled ON
                    if (isNaN(renderLat) || isNaN(renderLng)) {
                         if (updatedUser.last_location) {
                             const match = updatedUser.last_location.match(/POINT\(([^ ]+) ([^ ]+)\)/);
                             if (match) {
                                  renderLng = parseFloat(match[1]);
                                  renderLat = parseFloat(match[2]);
                             }
                         }
                    }

                    // If still no valid coordinates exist, quietly skip rendering without deleting them
                    if (isNaN(renderLat) || isNaN(renderLng)) {
                         return prev;
                    }

                    // Apply fuzzy location caching so coordinates remain stable/consistent
                    const latVal = renderLat;
                    const lngVal = renderLng;
                    const fuzzyLoc = getFuzzyLocationForUser(updatedUser.id, latVal, lngVal);
                    renderLat = fuzzyLoc.lat;
                    renderLng = fuzzyLoc.lng;

                    let statusMessage = updatedUser.status_message;
                    let statusEmoji = updatedUser.status;
                    if (updatedUser.status_updated_at) {
                        const statusDate = new Date(updatedUser.status_updated_at);
                        const now = new Date();
                        const diffHours = (now - statusDate) / (1000 * 60 * 60);
                        if (diffHours > 3) {
                            statusMessage = null;
                            statusEmoji = null;
                        }
                    }

                    const newUserObj = {
                        id: updatedUser.id,
                        name: updatedUser.username || 'User',
                        lat: renderLat,
                        lng: renderLng,
                        avatar: updatedUser.avatar_url || DEFAULT_GENERIC_AVATAR,
                        originalAvatar: updatedUser.avatar_url,
                        status: statusEmoji,
                        thought: statusMessage,
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
                        activity_status: updatedUser.activity_status,
                        visibility_mode: updatedUser.visibility_mode,
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
                            existingUser.show_last_seen !== newUserObj.show_last_seen ||
                            existingUser.activity_status !== newUserObj.activity_status ||
                            existingUser.visibility_mode !== newUserObj.visibility_mode;

                        if (didDataChange) {
                            // Data changed (avatar, status, mood etc.) → Update React state.
                            // Also sync selected card if this is the focused user.
                            setSelectedUser(prevSelected => prevSelected?.id === updatedUser.id ? { ...prevSelected, ...newUserObj } : prevSelected);
                            return prev.map(u => u.id === updatedUser.id ? { ...u, ...newUserObj } : u);
                        } else {
                            // 🔥 COORD-ONLY UPDATE — only animate natively if real coords actually changed
                            const prevFCache = fuzzyLocationCache.current.get(updatedUser.id);
                            const prevRealLat = prevFCache?.realLat;
                            const prevRealLng = prevFCache?.realLng;
                            const realCoordMoved = !prevRealLat || distanceMetres(prevRealLat, prevRealLng, latVal, lngVal) > 15;
                            
                            if (realCoordMoved) {
                                animateNativeMarker(updatedUser.id, renderLat, renderLng);
                                existingUser.lat = renderLat;
                                existingUser.lng = renderLng;
                            }
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
                if (!initialLoadComplete.current) return;
                const newUser = payload.new;
                if (!newUser.latitude || !newUser.longitude) return;
                if (newUser.id === currentUser.id) return; // Skip self

                // FILTER BLOCKED USERS
                if (blockedIdsRef.current.has(newUser.id)) return;

                // Check visibility criteria
                let isVisible = true;
                if (newUser.activity_status === 'offline') isVisible = false;
                if (newUser.visibility_mode === 'ghost') isVisible = false;
                if (newUser.is_location_on === false) isVisible = false;

                if (newUser.visibility_mode === 'friends' || newUser.visibility_mode === 'friend') {
                    const fData = friendshipsMapRef.current.get(newUser.id);
                    if (!fData || fData.status !== 'accepted') {
                        isVisible = false;
                    }
                }

                if (newUser.last_seen) {
                    const lastSeenDate = new Date(newUser.last_seen);
                    const now = new Date();
                    const diffMinutes = (now - lastSeenDate) / (1000 * 60);
                    if (diffMinutes > 60) isVisible = false;
                }

                if (isVisible) {

                    // Preload Image Immediately
                    const mapAvatar = newUser.avatar_url;

                    // Preload Image Immediately
                    const img = new Image();
                    img.src = mapAvatar;

                   setNearbyUsers(prev => {
                        // Avoid duplicates
                        if (prev.some(u => u.id === newUser.id)) return prev;

                        let statusMessage = newUser.status_message;
                        let statusEmoji = newUser.status;
                        if (newUser.status_updated_at) {
                            const statusDate = new Date(newUser.status_updated_at);
                            const now = new Date();
                            const diffHours = (now - statusDate) / (1000 * 60 * 60);
                            if (diffHours > 3) {
                                statusMessage = null;
                                statusEmoji = null;
                            }
                        }

                        const rawLat = parseFloat(newUser.latitude);
                        const rawLng = parseFloat(newUser.longitude);

                        // Apply fuzzy location caching so coordinates remain stable/consistent
                        const fuzzyLoc = getFuzzyLocationForUser(newUser.id, rawLat, rawLng);

                        // Add new user locally
                        return [...prev, {
                            id: newUser.id,
                            name: newUser.username || 'User',
                            lat: fuzzyLoc.lat,
                            lng: fuzzyLoc.lng,
                            avatar: mapAvatar,
                            originalAvatar: newUser.avatar_url,
                            status: statusEmoji,
                            thought: statusMessage,
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
                            activity_status: newUser.activity_status,

                            friendshipStatus: friendshipsMapRef.current.get(newUser.id)?.status || null,
                            friendshipId: friendshipsMapRef.current.get(newUser.id)?.id || null,
                            visibility_mode: newUser.visibility_mode,
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
            try {
                const stored = localStorage.getItem('currentUser');
                if (stored) setCurrentUser(JSON.parse(stored));
            } catch { /* corrupted localStorage — silently skip */ }
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
            setSelectedColor('#f3d9fa'); // Reset selection
            setSelectedPrivacy('everyone');
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

        const formattedThought = formatThought(myThought, selectedColor, selectedPrivacy);
        const now = new Date().toISOString();

        try {
            const updates = {
                status_message: formattedThought,
                last_active: now,
                status_updated_at: now
            };

            let updatedUser = { 
                ...currentUser, 
                thought: formattedThought, 
                thoughtTime: Date.now() 
            };

            if (isBoostSelected) {
                const lastBoostDay = currentUser.last_thought_boost_at ? new Date(currentUser.last_thought_boost_at).toDateString() : '';
                const currentDay = new Date().toDateString();
                const newBoostCount = (lastBoostDay === currentDay) ? (currentUser.daily_thought_boost_count || 0) + 1 : 1;

                if (newBoostCount > 1) {
                    showToast("⚠️ Daily thought boost limit reached.");
                    return;
                }

                updates.thought_boosted_at = now;
                updates.daily_thought_boost_count = newBoostCount;
                updates.last_thought_boost_at = now;

                updatedUser = {
                    ...updatedUser,
                    thought_boosted_at: now,
                    daily_thought_boost_count: newBoostCount,
                    last_thought_boost_at: now
                };
            }

            // Optimistic update
            setCurrentUser(updatedUser);
            localStorage.setItem('currentUser', JSON.stringify(updatedUser));
            setShowThoughtInput(false);

            // DB Update for global visibility
            const { error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', currentUser.id);

            if (error) throw error;
            
            setNearbyUsers(prev =>
                prev.map(u =>
                    u.id === currentUser.id
                        ? {
                            ...u,
                            thought: formattedThought,
                            status_updated_at: now,
                            lastActive: now,
                            ...(isBoostSelected ? {
                                thought_boosted_at: now,
                                daily_thought_boost_count: updatedUser.daily_thought_boost_count,
                                last_thought_boost_at: now
                            } : {})
                          }
                        : u
                )
            );

            showToast(isBoostSelected ? '🚀 Thought Boosted successfully!' : 'Thought posted to map! 🌍');
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
                            setSelectedUser((prev) => prev && prev.id === targetUser.id ? { ...prev, friendshipStatus: 'accepted' } : prev);
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
                        setSelectedUser(prev => prev && prev.id === targetUser.id ? { ...targetUser, friendshipStatus: 'pending' } : prev);
                        return;
                    }
                }

                // OPTIMISTIC UPDATE: Show "Requested" immediately
                showToast(`Poke Request Sent 📨`);

                // Track previous state for rollback
                const prevSelectedUser = { ...selectedUser };

                setSelectedUser(prev => prev && prev.id === targetUser.id ? {
                    ...targetUser,
                    friendshipStatus: 'pending',
                    requesterId: currentUser.id,
                    // Temporary ID or null, will update after DB
                    friendshipId: 'temp-' + Date.now()
                } : prev);

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

                    setSelectedUser(prev => prev && prev.id === targetUser.id ? {
                        ...prev,
                        friendshipId: newFriendship.id
                    } : prev);
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
                setSelectedUser(prev => prev && prev.id === targetUser.id ? {
                    ...prev,
                    friendshipStatus: null,
                    friendshipId: null,
                    requesterId: null
                } : prev);
                
                setNearbyUsers(prev => prev.map(u => 
                    u.id === targetUser.id ? { ...u, friendshipStatus: null, friendshipId: null, requesterId: null } : u
                ));

            } catch (err) {
                console.error('Cancel poke error:', err);
                showToast("Failed to cancel request");
            }
        }
        else if (action === 'unfriend') {
            try {
                if (window.confirm(`Are you sure you want to unfriend ${targetUser.name || targetUser.username}?`)) {
                    let friendshipId = targetUser.friendshipId;
                    if (!friendshipId && friendshipsMapRef.current) {
                        const fData = friendshipsMapRef.current.get(targetUser.id);
                        if (fData) {
                            friendshipId = fData.id;
                        }
                    }
                    if (!friendshipId) {
                        const { data } = await supabase
                            .from('friendships')
                            .select('id')
                            .or(`and(requester_id.eq.${currentUser.id},receiver_id.eq.${targetUser.id}),and(requester_id.eq.${targetUser.id},receiver_id.eq.${currentUser.id})`)
                            .eq('status', 'accepted')
                            .maybeSingle();
                        if (data) {
                            friendshipId = data.id;
                        }
                    }

                    if (friendshipId) {
                        if (friendshipsRef.current) {
                            friendshipsRef.current.delete(friendshipId);
                        }
                        if (friendshipsMapRef.current) {
                            friendshipsMapRef.current.delete(targetUser.id);
                        }
                        const { error } = await supabase
                            .from('friendships')
                            .delete()
                            .eq('id', friendshipId);
                        if (error) throw error;
                    } else {
                        const { error } = await supabase
                            .from('friendships')
                            .delete()
                            .or(`and(requester_id.eq.${currentUser.id},receiver_id.eq.${targetUser.id}),and(requester_id.eq.${targetUser.id},receiver_id.eq.${currentUser.id})`);
                        if (error) throw error;
                    }

                    // Also clear message requests
                    await supabase
                        .from('message_requests')
                        .delete()
                        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetUser.id}),and(sender_id.eq.${targetUser.id},receiver_id.eq.${currentUser.id})`);

                    showToast(`💔 Unfriended ${targetUser.name || targetUser.username}`);

                    // Update UI immediately (change status to Poke/null)
                    setSelectedUser(prev => prev && prev.id === targetUser.id ? {
                        ...prev,
                        friendshipStatus: null,
                        friendshipId: null,
                        requesterId: null
                    } : prev);

                    setFullProfileUser(prev => prev && prev.id === targetUser.id ? {
                        ...prev,
                        friendshipStatus: null,
                        friendshipId: null,
                        requesterId: null
                    } : prev);

                    setNearbyUsers(prev => prev
                        .map(u => u.id === targetUser.id ? { ...u, friendshipStatus: null, friendshipId: null, requesterId: null } : u)
                        .filter(u => {
                            if (u.id === targetUser.id && (u.visibility_mode === 'friends' || u.visibility_mode === 'friend')) {
                                    return false; // Remove if they are no longer friends
                            }
                            return true;
                        })
                    );
                }
            } catch (err) {
                console.error('Unfriend error:', err);
                showToast("Failed to unfriend");
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
                    
                    // Dispatch to other tabs on same device via BroadcastChannel
                    if (mapEventChannel?.postMessage) {
                        mapEventChannel.postMessage({ type: 'USER_BLOCKED', userId: targetUser.id });
                    }

                    // 🚀 Push cross-device broadcast using the ALREADY-SUBSCRIBED channel (instant!)
                    // Do NOT create a new channel here — it takes too long to establish
                    if (blockChannelRef.current) {
                        blockChannelRef.current.send({
                            type: 'broadcast',
                            event: 'USER_BLOCKED_CROSS_DEVICE',
                            payload: { blocker_id: currentUser.id, blocked_id: targetUser.id }
                        });
                    }
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

    const createAvatarIcon = React.useCallback((url, isSelf = false, thought = null, name = '', status = null, mood = null, moodUpdatedAt = null, animationDelay = 0, activityStatus = 'live', id = null, thoughtUpdatedAt = null, isExpanded = false) => {
        // Caching the icon object prevents React-Leaflet from destroying the DOM node and allows CSS transitions to run smoothly.
        const isGhost = isSelf && (currentUser?.visibility_mode === 'ghost' || currentUser?.is_ghost_mode);
        
        const reactionsList = (id && thoughtReactions[id]) || [];
        const reactionsKey = reactionsList.map(r => `${r.user_id}:${r.reaction_type}`).sort().join(',');
        const repliesKey = isSelf ? thoughtReplies.length : 0;
        // Prefix invalidates old cached icons when HTML template changes
        const cacheKey = `v8_${url}_${isSelf}_${thought}_${name}_${status}_${isGhost}_${mood}_${moodUpdatedAt}_${animationDelay}_${activityStatus}_${id}_${thoughtUpdatedAt}_${reactionsKey}_${isExpanded}_${repliesKey}`;
        
        if (iconCache.current.has(cacheKey)) {
            return iconCache.current.get(cacheKey);
        }

        let className = 'avatar-marker';
        let style = `background-image: url('${url}'); background-size: cover; background-position: center; border-radius: 50%;`;

        // Retrieve user tier and effect dynamically
        const u = isSelf ? currentUser : nearbyUsers.find(usr => usr.id === id);
        const tier = u?.subscription_tier || 'free';
        const effect = u?.avatar_effect || 'none';

        if (tier === 'silver') {
            className += ' avatar-ring-silver';
        } else if (tier === 'gold') {
            className += ' avatar-ring-gold';
        } else if (tier === 'diamond') {
            className += ' avatar-ring-diamond';
        } else if (tier === 'legend') {
            className += ' avatar-ring-legend';
        } else {
            style += ' border: 3.5px solid #FFFFFF; box-shadow: 0 4px 12px rgba(0,0,0,0.55), 0 2px 4px rgba(0,0,0,0.35);';
        }

        // Diamond Avatar Effects
        if (tier === 'diamond' && effect && effect !== 'none') {
            if (effect === 'neon_glow') className += ' effect-neon-glow';
            else if (effect === 'diamond_ring') className += ' effect-diamond-ring';
            else if (effect === 'diamond_aura') className += ' effect-diamond-aura';
            else if (effect === 'galaxy') className += ' effect-galaxy-effect';
        }

        if (isSelf) {
            className += ' self';
            if (isGhost) {
                // Ghost mode: fade to indicate invisible — no grayscale filter (CSS handles protection)
                style += ' opacity: 0.45;';
            }
        } else if (activityStatus === 'recently_active') {
            style += ' opacity: 0.6;'; // Fade recently active users
        }
        
        // Add staggered pop animation if not self and delay is set
        let containerStyle = 'position: relative;';
        if (!isSelf && animationDelay > 0) {
            containerStyle += ` animation: avatarPopIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; animation-delay: ${animationDelay}ms; opacity: 0; transform-origin: center bottom;`;
        }

        // Only show thought if it exists (simplified check)
        const parsed = parseThought(thought);
        const thoughtText = parsed.text;
        const bubbleColor = parsed.color || '#ffffff';
        
        // Darker border helper
        const getDarkerBorderColor = (c) => {
            switch (c?.toLowerCase()) {
                case '#ffffff': return '#d1d1d6';
                case '#fef5d1': return '#ecc844';
                case '#d4ebfc': return '#9ac8eb';
                case '#f3d9fa': return '#d1aced';
                case '#d2f8e3': return '#9be6ba';
                case '#fde2e4': return '#e8b7bd';
                default: return 'rgba(0,0,0,0.15)';
            }
        };
        const bubbleBorderColor = getDarkerBorderColor(bubbleColor);

        let expiryHTML = '';
        if (thoughtText && thoughtUpdatedAt) {
            const diffMs = Date.now() - new Date(thoughtUpdatedAt).getTime();
            const diffHours = diffMs / (1000 * 60 * 60);
            const remainingHours = Math.max(0, 3 - diffHours);
            if (remainingHours > 0) {
                let timeStr = '';
                if (remainingHours < 1) {
                    const mins = Math.round(remainingHours * 60);
                    timeStr = `${mins}m`;
                } else {
                    timeStr = `${Math.round(remainingHours)}h`;
                }
                expiryHTML = `<span class="thought-expiry" style="font-size: 0.65rem; color: #8e8e93; margin-left: 6px; display: inline-flex; align-items: center; gap: 2px;">⏱️ ${timeStr}</span>`;
            }
        }

        const emojiMap = { love: '❤️', fire: '🔥', laugh: '😂', clap: '👏' };
        const reactionCounts = {};
        reactionsList.forEach(r => {
            const type = r.reaction_type;
            reactionCounts[type] = (reactionCounts[type] || 0) + 1;
        });

        let countsStr = Object.keys(reactionCounts)
            .map(type => {
                const emoji = emojiMap[type] || '❤️';
                return `<span style="margin-right: 6px;">${emoji} ${reactionCounts[type]}</span>`;
            })
            .join('');

        if (isSelf && thoughtReplies?.length > 0) {
            countsStr += `<span style="margin-right: 6px;">💬 ${thoughtReplies.length}</span>`;
        }

        const reactionsHTML = countsStr
            ? `<div class="thought-reactions-compact" onclick="event.stopPropagation(); if(window.handleThoughtReactionsClick) window.handleThoughtReactionsClick('${id}');" style="margin-top: 4px; display: flex; align-items: center; flex-wrap: wrap; font-size: 0.7rem; gap: 2px; cursor: pointer; pointer-events: auto !important;">
                 ${countsStr}
               </div>`
            : '';

        const expandedBarHTML = isExpanded && !isSelf ? `
            <div class="thought-reaction-bar-map" style="display: flex; gap: 12px; margin-top: 8px; justify-content: center; border-top: 1px solid rgba(0,0,0,0.1); padding-top: 8px;">
                <button onclick="event.stopPropagation(); window.handleThoughtReact('${id}', 'love')" style="background: none; border: none; font-size: 1.4rem; cursor: pointer; padding: 4px; transition: transform 0.2s;">❤️</button>
                <button onclick="event.stopPropagation(); window.handleThoughtReact('${id}', 'fire')" style="background: none; border: none; font-size: 1.4rem; cursor: pointer; padding: 4px; transition: transform 0.2s;">🔥</button>
                <button onclick="event.stopPropagation(); window.handleThoughtReact('${id}', 'laugh')" style="background: none; border: none; font-size: 1.4rem; cursor: pointer; padding: 4px; transition: transform 0.2s;">😂</button>
                <button onclick="event.stopPropagation(); window.handleThoughtReact('${id}', 'clap')" style="background: none; border: none; font-size: 1.4rem; cursor: pointer; padding: 4px; transition: transform 0.2s;">👏</button>
            </div>
        ` : '';

        const isBoosted = u?.thought_boosted_at && (new Date(u.thought_boosted_at).getTime() > Date.now() - 3 * 60 * 60 * 1000);
        const bubbleClasses = `thought-bubble ${isBoosted ? 'thought-boosted' : ''}`;

        const thoughtHTML = thoughtText
            ? `<div class="${bubbleClasses}" onclick="event.stopPropagation(); if(window.handleThoughtClick) window.handleThoughtClick('${id}');" style="--bubble-bg: ${bubbleColor}; --bubble-border: ${isBoosted ? '#facc15' : bubbleBorderColor}; background: ${bubbleColor} !important; border: 1.5px solid ${isBoosted ? '#facc15' : bubbleBorderColor} !important; color: black !important; padding-right: 28px; pointer-events: auto !important; cursor: pointer;">
                 <div class="thought-author" style="color: #4285F4 !important; font-weight: 800; font-size: 0.70rem; display: flex; align-items: center; justify-content: space-between;">
                     <span>${isBoosted ? '🚀 Boosted' : name}</span>
                     ${expiryHTML}
                 </div>
                 <div class="thought-content" style="color: #000000 !important; font-weight: 600; font-size: 0.75rem;">
                    ${thoughtText}
                 </div>
                 ${reactionsHTML}
                 ${expandedBarHTML}
                 ${!isSelf ? `<button class="thought-reply-dots" onclick="event.stopPropagation(); if(window.handleThoughtReplyClick) window.handleThoughtReplyClick('${id}', \`${thoughtText.replace(/`/g, '\\`').replace(/"/g, '&quot;')}\`);" style="position: absolute; right: 4px; top: 8px; background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #666; padding: 4px; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; pointer-events: auto;" title="Reply to thought">⋮</button>` : ''}
               </div>`
            : '';

        let moodHTML = '';
        if (mood && moodUpdatedAt && !u?.hide_mood) {
            const isExpired = new Date(moodUpdatedAt).getTime() < Date.now() - 6 * 60 * 60 * 1000;
            if (!isExpired) {
                moodHTML = `<div class="mood-badge" style="
                    position: absolute;
                    top: -10px;
                    right: -10px;
                    font-size: 1.05rem;
                    line-height: 1;
                    z-index: 20;
                    background: rgba(28,28,30,0.82);
                    border: 1.5px solid rgba(255,255,255,0.18);
                    border-radius: 50%;
                    width: 22px;
                    height: 22px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.55), 0 0 0 1.5px rgba(255,255,255,0.08);
                    pointer-events: none;
                ">${mood}</div>`;
            }
        }

        let statusDotHTML = '';
        if (activityStatus === 'live') {
            statusDotHTML = `<div style="position: absolute; bottom: 0; right: 0; width: 14px; height: 14px; background: #34C759; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 21;"></div>`;
        } else if (activityStatus === 'recently_active') {
            statusDotHTML = `<div style="position: absolute; bottom: 0; right: 0; width: 14px; height: 14px; background: #FFCC00; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3); z-index: 21;"></div>`;
        }

        const icon = L.divIcon({
            className: 'custom-avatar-icon',
            html: `
                <div class="avatar-group" style="${containerStyle}">
                    ${thoughtHTML}
                    <div class="${className}" style="${style}"></div>
                    ${moodHTML}
                    ${statusDotHTML}
                </div>
            `,
            iconSize: [45, 45],
            iconAnchor: [22, 22],
            popupAnchor: [0, -28]
        });

        iconCache.current.set(cacheKey, icon);
        return icon;
    }, [currentUser, thoughtReactions, nearbyUsers]);

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

        return createAvatarIcon(avatarUrl, true, displayThought, 'You', null, currentUser.mood, currentUser.mood_updated_at, 0, currentUser.activity_status || 'live', currentUser.id, thoughtTime, false);
    }, [currentUser?.id, currentUser?.avatar_url, currentUser?.gender, currentUser?.thought, currentUser?.status_message, currentUser?.thoughtTime, currentUser?.status_updated_at, currentUser?.mood, currentUser?.mood_updated_at, currentUser?.activity_status, currentUser?.visibility_mode, currentUser?.is_ghost_mode, createAvatarIcon, thoughtReactions, thoughtReplies]);

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

        // 🌎 GLOBAL RULE: Only show users whose location is explicitly ON
        // Use !== false to match the realtime UPDATE handler's isVisible check.
        // This ensures users appear instantly when they turn location on without
        // waiting for the next 30s poll.
        let visibleUsers = nearbyUsers.filter(u =>
            u.isLocationOn !== false &&
            u.lat != null &&
            u.lng != null &&
            u.isLocationShared !== false
        );

        const myLat = userLocationRef.current?.lat ?? currentUser?.latitude;
        const myLng = userLocationRef.current?.lng ?? currentUser?.longitude;

        if (currentUser.subscription_tier === 'diamond' && diamondFilters.enabled) {
            visibleUsers = visibleUsers.filter(u => {
                // 1. Gender filter
                if (diamondFilters.gender && diamondFilters.gender !== 'All') {
                    if (u.gender !== diamondFilters.gender) return false;
                }
                
                // 2. Age Range filter (calculate age from birth_date or birthDate)
                const bdate = u.birth_date || u.birthDate;
                if (bdate) {
                    const dob = new Date(bdate);
                    const age = new Date().getFullYear() - dob.getFullYear();
                    if (age < diamondFilters.ageMin || age > diamondFilters.ageMax) return false;
                } else {
                    // Skip if age ranges are set but user age is unknown
                    if (diamondFilters.ageMin > 18 || diamondFilters.ageMax < 99) return false;
                }

                // 3. Relationship Status filter
                if (diamondFilters.relationshipStatus && diamondFilters.relationshipStatus !== 'All') {
                    const rel = u.relationship_status || u.relationshipStatus;
                    if (rel !== diamondFilters.relationshipStatus) return false;
                }

                // 4. Interests keyword filter
                if (diamondFilters.interests && diamondFilters.interests.trim()) {
                    const tags = diamondFilters.interests.toLowerCase().split(',').map(t => t.trim()).filter(Boolean);
                    const uInterests = (u.interests || []).map(i => i.toLowerCase());
                    const matched = tags.some(t => uInterests.some(ui => ui.includes(t)));
                    if (!matched) return false;
                }

                // 5. Online Status filter
                if (diamondFilters.onlineOnly) {
                    if (!u.lastActive) return false;
                    const diff = Date.now() - new Date(u.lastActive).getTime();
                    if (diff >= 5 * 60 * 1000) return false;
                }

                // 6. Distance Range filter
                if (diamondFilters.distanceMax && myLat && myLng) {
                    const distKm = getDistanceFromLatLonInKm(myLat, myLng, u.lat, u.lng);
                    if (distKm > diamondFilters.distanceMax) return false;
                }

                return true;
            });
            return visibleUsers;
        }

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

    }, [nearbyUsers, activeFilter, currentUser, diamondFilters]);
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
        if (u && u.id) {
            viewCountsRef.current[u.id] = (viewCountsRef.current[u.id] || 0) + 1;
            console.log(`👁️ [MapHome] Click count for ${u.name}:`, viewCountsRef.current[u.id]);
            // Force coordinates shift or hide update immediately if count crosses 5 or 10
            if (viewCountsRef.current[u.id] === 5 || viewCountsRef.current[u.id] === 11) {
                setNearbyUsers(prev => [...prev]);
            }
        }

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

        let displayThought = u.thought || u.status_message;
        const thoughtUpdatedAt = u.status_updated_at || u.statusUpdatedAt;
        if (thoughtUpdatedAt) {
            const diffHours = (new Date() - new Date(thoughtUpdatedAt)) / (1000 * 60 * 60);
            if (diffHours > 3) displayThought = null;
        }

        setSelectedUser({
            ...u,
            thought: displayThought,
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

    // -------------------------------------------------------
    // 🔥 SPREAD OFFSET: Fan out co-located avatars so all are visible
    // Users within ~10m of each other get a small spiral offset applied
    // to their display lat/lng. The original lat/lng is preserved for clicks.
    // -------------------------------------------------------
    const displayUsers = useMemo(() => {
        if (!sortedFilteredUsers.length) return sortedFilteredUsers;

        // ~0.0001 degrees ≈ 11m at equator — treat as "same spot"
        const CLUSTER_EPSILON = 0.0001;
        // How far apart to spread avatars (in degrees). ~0.00004 ≈ 4m per step
        const SPREAD_RADIUS = 0.00005;

        const processed = new Set();
        const result = sortedFilteredUsers.map(u => ({ ...u })); // shallow copy

        for (let i = 0; i < result.length; i++) {
            if (processed.has(result[i].id)) continue;

            const group = [i];
            for (let j = i + 1; j < result.length; j++) {
                if (processed.has(result[j].id)) continue;
                const dlat = Math.abs((result[i].lat ?? 0) - (result[j].lat ?? 0));
                const dlng = Math.abs((result[i].lng ?? 0) - (result[j].lng ?? 0));
                if (dlat < CLUSTER_EPSILON && dlng < CLUSTER_EPSILON) {
                    group.push(j);
                }
            }

            if (group.length > 1) {
                // Fan group out in a circle around their shared position
                const centerLat = result[i].lat ?? 0;
                const centerLng = result[i].lng ?? 0;
                const radius = SPREAD_RADIUS * (1 + (group.length - 2) * 0.3);

                group.forEach((idx, k) => {
                    const angle = (2 * Math.PI / group.length) * k - Math.PI / 2;
                    result[idx].lat = centerLat + radius * Math.cos(angle);
                    result[idx].lng = centerLng + radius * Math.sin(angle);
                    processed.add(result[idx].id);
                });
            } else {
                processed.add(result[i].id);
            }
        }

        return result;
    }, [sortedFilteredUsers]);
    // -------------------------------------------------
    // 🔄 SYNC LOCATION STATE
    // -------------------------------------------------
    // 🔄 Sync
    useEffect(() => {
        if (locationEnabled && currentUser) {
            const isGhost = currentUser.visibility_mode === 'ghost' || currentUser.is_ghost_mode;
            if (isGhost) {
                // Keep ghost state intact
                return;
            }
            if (currentUser.is_location_on === false) {
                setCurrentUser(prev => {
                    if (!prev) return prev;
                    if (prev.is_location_on === true) return prev;
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
        currentUser?.visibility_mode,
        currentUser?.is_ghost_mode,
        currentUser?.is_location_on
    ]);


    // 0️⃣ Absolute Priority Overlay: Profile Setup (Must block everything, including GPS loading and permissions)
    if (profileReady && showProfileSetup) {
        return (
            <div className="map-container" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100dvh', zIndex: 10000 }}>
                <style>{`
                    .onboarding-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); display: flex; align-items: flex-start; justify-content: center; overflow-y: auto; z-index: 999999; padding: max(20px, env(safe-area-inset-top)) 20px max(20px, env(safe-area-inset-bottom)); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                    .onboarding-card { background: linear-gradient(135deg, #141416 0%, #08080a 100%); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 28px; padding: 24px 20px; width: 100%; max-width: 400px; box-shadow: 0 32px 64px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.05); color: white; display: flex; flex-direction: column; gap: 16px; margin: auto; flex-shrink: 0; }
                    .onboarding-card h2 { margin: 0; font-size: 1.5rem; font-weight: 700; letter-spacing: -0.5px; color: #fff; text-align: center; }
                    .onboarding-card h2 span.wave { color: #8B5CF6; }
                    .onboarding-card p.subtitle { margin: 0; font-size: 0.9rem; color: #a1a1aa; text-align: center; margin-top: -10px; }
                    .ob-section { display: flex; flex-direction: column; gap: 6px; text-align: left; position: relative; }
                    .ob-section label { font-size: 0.85rem; font-weight: 600; color: #f4f4f5; letter-spacing: -0.2px; }
                    .ob-input { background: rgba(255, 255, 255, 0.02); border: 1.5px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 11px 14px; color: white; font-size: 0.95rem; outline: none; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); width: 100%; box-sizing: border-box; }
                    .ob-input::placeholder { color: #52525b; }
                    .ob-input:focus { border-color: #8B5CF6; background: rgba(255, 255, 255, 0.05); box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.15); }
                    .ob-input.error { border-color: #ef4444; background: rgba(239, 68, 68, 0.05); }
                    .ob-input.error:focus { box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.15); }
                    
                    .chip-group { display: flex; flex-wrap: wrap; gap: 8px; transition: all 0.2s; padding: 4px; border-radius: 22px; }
                    .chip-group.error { background: rgba(239, 68, 68, 0.1); border: 1px dashed #ef4444; margin: -5px; padding: 4px; }
                    .chip { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 7px 14px; color: #a1a1aa; font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); user-select: none; }
                    .chip:hover { background: rgba(255, 255, 255, 0.08); color: #f4f4f5; }
                    .chip.selected { background: #8B5CF6; border-color: #8B5CF6; color: white; box-shadow: 0 6px 16px rgba(139, 92, 246, 0.35); }
                    
                    .complete-btn { background: #8B5CF6; color: white; border: none; border-radius: 12px; padding: 12px 16px; font-size: 1rem; font-weight: 600; cursor: pointer; margin-top: 4px; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 8px 24px rgba(139, 92, 246, 0.3); }
                    .complete-btn:hover { background: #7C3AED; transform: translateY(-2px); box-shadow: 0 12px 28px rgba(139, 92, 246, 0.4); }
                    .complete-btn:active { transform: scale(0.97); box-shadow: 0 4px 12px rgba(139, 92, 246, 0.2); }
                    
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
                                    setSetupData({ ...setupData, username: e.target.value });
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

                        <div className="ob-section" style={{ alignItems: 'center' }}>
                            <label style={{ alignSelf: 'flex-start' }}>Your Avatar 👤</label>
                            <div className="avatar-preview-box" style={{ position: 'relative', width: '80px', margin: '0 auto' }}>
                                <div style={{
                                    width: '80px', height: '80px',
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
                                        position: 'absolute', bottom: '-2px', right: '-2px',
                                        width: '26px', height: '26px',
                                        background: '#8B5CF6',
                                        borderRadius: '50%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer',
                                        boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                                        border: '2px solid #1c1c1e',
                                        zIndex: 10
                                    }}
                                >
                                    <span style={{ fontSize: '1rem', color: 'white', marginTop: '-2px' }}>+</span>
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
                    <Suspense fallback={null}>
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
                    </Suspense>
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

    // Removed: Location disabled onboarding screen is now handled by Route Guard and dedicated EnableLocation page.



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
    const isOverlayActive = !!selectedUser || showFullProfile || !!viewingStoryUser || showReportModal || showMuteModal || showThoughtInput;

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
                    align-items: flex-start;
                    justify-content: center;
                    overflow-y: auto;
                    z-index: 999999;
                    padding: max(20px, env(safe-area-inset-top)) 20px max(20px, env(safe-area-inset-bottom));
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
                    margin: auto;
                    flex-shrink: 0;
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



            {/* Cropper Modal */}
            {cropImage && (
                <Suspense fallback={null}>
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
                </Suspense>
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
                scrollWheelZoom={true}
                doubleClickZoom={true}
                dragging={true}
                zoomAnimation={true}
                preferCanvas={true}
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
                        updateWhenIdle={true}
                        updateWhenZooming={false}
                        tileSize={256}
                    />
                )}
                {mapMode === 'hybrid' && (
                    <TileLayer
                        attribution='&copy; Google Maps'
                        url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                        maxNativeZoom={20}
                        maxZoom={22}
                        keepBuffer={4}
                        updateWhenIdle={true}
                        updateWhenZooming={false}
                        tileSize={256}
                    />
                )}
                {mapMode === 'satellite' && (
                    <TileLayer
                        attribution='&copy; Google Maps'
                        url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
                        maxNativeZoom={20}
                        maxZoom={22}
                        keepBuffer={4}
                        updateWhenIdle={true}
                        updateWhenZooming={false}
                        tileSize={256}
                    />
                )}
                <RecenterAutomatically lat={userLocation.lat} lng={userLocation.lng} mapMode={mapMode} />
                <RecenterControl 
                    markerRefs={markerRefs}
                    currentUserId={currentUser?.id}
                    fallbackLat={userLocation?.lat}
                    fallbackLng={userLocation?.lng}
                    onRecenter={handleRecenterCallback}
                />
                <UserSelectionController selectedUser={selectedUser} />

                {(circleCenter || (userLocation?.lat && userLocation?.lng)) && (
                    <Circle
                        center={circleCenter || [userLocation.lat, userLocation.lng]}
                        radius={300}
                        pathOptions={{
                            color: '#3b82f6',
                            fillColor: '#3b82f6',
                            fillOpacity: 0.08,
                            weight: 1.5,
                            dashArray: '6, 6'
                        }}
                    />
                )}

                {/* 🔥 NATIVE MARKERS SYNC (No React Re-Renders for GPS Motion) */}
                <NativeMarkerSync 
                    users={displayUsers} 
                    currentUser={currentUser} 
                    userLocation={userLocation} 
                    currentUserIcon={currentUserIcon}
                    createAvatarIcon={createAvatarIcon}
                    markerRefs={markerRefs}
                    handleMarkerClick={handleMarkerClick}
                    animateNativeMarker={animateNativeMarker}
                    setSelectedUser={setSelectedUser}
                    expandedThoughtId={expandedThoughtId}
                />
            </MapContainer>
            ) : null}

            {/* ── Floating Top-Right Quick Actions (horizontal pill row) ── */}
            {userLocation?.lat && (
                <div style={{
                    position: 'fixed',
                    top: 'max(14px, calc(env(safe-area-inset-top) + 10px))',
                    right: 14,
                    zIndex: 1200,
                    display: 'flex',
                    flexDirection: 'row',
                    gap: 6,
                    pointerEvents: 'auto',
                    background: isDarkMode ? 'rgba(22,22,30,0.82)' : 'rgba(255,255,255,0.82)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    borderRadius: 14,
                    padding: '5px 6px',
                    boxShadow: isDarkMode
                        ? '0 4px 18px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)'
                        : '0 4px 18px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.9)',
                    border: isDarkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.05)',
                }}>
                    {/* ── Floating Thought Button ── */}
                    <button
                        onClick={() => handleOpenThoughtInput()}
                        title="Set Floating Thought"
                        style={{
                            width: 32, height: 32,
                            borderRadius: 9,
                            border: 'none',
                            background: 'rgba(139, 92, 246, 0.12)',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'transform 0.15s cubic-bezier(0.34,1.56,0.64,1), background 0.15s ease',
                            color: '#8b5cf6',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.background = 'rgba(139,92,246,0.22)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'rgba(139,92,246,0.12)'; }}
                        onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.92)'; }}
                        onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                            <path d="M8 10h.01M12 10h.01M16 10h.01"/>
                        </svg>
                    </button>

                    {/* Divider */}
                    <div style={{
                        width: 1,
                        height: 20,
                        alignSelf: 'center',
                        background: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                    }} />

                    {/* ── Map View Picker Button ── */}
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => setShowMapViewMenu(prev => !prev)}
                            title="Change Map View"
                            style={{
                                width: 32, height: 32,
                                borderRadius: 9,
                                border: 'none',
                                background: showMapViewMenu ? 'rgba(255,106,0,0.22)' : 'rgba(255,106,0,0.12)',
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'transform 0.15s cubic-bezier(0.34,1.56,0.64,1), background 0.15s ease',
                                color: '#FF6A00',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.background = 'rgba(255,106,0,0.22)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = showMapViewMenu ? 'rgba(255,106,0,0.22)' : 'rgba(255,106,0,0.12)'; }}
                            onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.92)'; }}
                            onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FF6A00" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                                <polyline points="2 17 12 22 22 17"/>
                                <polyline points="2 12 12 17 22 12"/>
                            </svg>
                        </button>

                        {/* Map View Dropdown */}
                        {showMapViewMenu && (
                            <div style={{
                                position: 'absolute',
                                top: 'calc(100% + 8px)',
                                right: 0,
                                background: isDarkMode ? 'rgba(22,22,30,0.96)' : 'rgba(255,255,255,0.96)',
                                backdropFilter: 'blur(20px)',
                                WebkitBackdropFilter: 'blur(20px)',
                                borderRadius: 14,
                                border: isDarkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)',
                                boxShadow: isDarkMode ? '0 8px 32px rgba(0,0,0,0.5)' : '0 8px 32px rgba(0,0,0,0.12)',
                                padding: '5px',
                                display: 'flex', flexDirection: 'column', gap: 2,
                                minWidth: 145,
                            }}>
                                {[
                                    { key: 'street',    label: 'Street',    icon: '🗺️', color: '#3b82f6' },
                                    { key: 'satellite', label: 'Satellite', icon: '🛰️', color: '#10b981' },
                                    { key: 'hybrid',    label: 'Hybrid',    icon: '🌍', color: '#f59e0b' },
                                ].map(({ key, label, icon, color }) => (
                                    <button
                                        key={key}
                                        onClick={() => { setMapMode(key); setShowMapViewMenu(false); }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '9px 12px',
                                            borderRadius: 10,
                                            border: 'none',
                                            background: mapMode === key
                                                ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)')
                                                : 'transparent',
                                            color: mapMode === key ? color : (isDarkMode ? '#aaa' : '#555'),
                                            cursor: 'pointer',
                                            fontSize: 13,
                                            fontWeight: mapMode === key ? 700 : 500,
                                            fontFamily: 'inherit',
                                            textAlign: 'left',
                                            transition: 'background 0.15s ease',
                                            width: '100%',
                                        }}
                                    >
                                        <span style={{ fontSize: 16 }}>{icon}</span>
                                        {label}
                                        {mapMode === key && (
                                            <svg style={{ marginLeft: 'auto', color }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12"/>
                                            </svg>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Top Search Bar & Action Buttons */}
            <div className="map-header-controls" style={{ position: 'relative' }}>
                <div className="privacy-trust-badge" style={{
                    position: 'absolute',
                    top: '-18px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(28, 28, 30, 0.85)',
                    backdropFilter: 'blur(10px)',
                    color: '#00d4ff',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '3px 10px',
                    borderRadius: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    border: '1px solid rgba(0, 212, 255, 0.2)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    pointerEvents: 'none',
                    animation: 'fadeInDown 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
                    whiteSpace: 'nowrap',
                    zIndex: 100
                }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    Your exact location is never shared
                </div>
                <div className="header-top-row">
                    {/* Profile Button - Left Side */}
                    <button 
                        className="top-profile-btn glass-panel"
                        onClick={() => navigate('/profile')}
                        title="View Profile"
                    >
                        <img 
                            src={currentUser ? (getAvatar2D(currentUser.avatar_url) || (currentUser.gender === 'Male' ? DEFAULT_MALE_AVATAR : currentUser.gender === 'Female' ? DEFAULT_FEMALE_AVATAR : DEFAULT_GENERIC_AVATAR)) : DEFAULT_GENERIC_AVATAR} 
                            alt="Profile" 
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        />
                    </button>

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
                        {/* Message Requests Lock */}
                        <button 
                            className="control-btn" 
                            onClick={() => setIsMessageRequestsPageOpen(true)} 
                            title="Message Requests"
                            style={{ position: 'relative' }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                            {messageRequestsCount > 0 && (
                                <span className="notification-badge" style={{ 
                                    position: 'absolute', top: -5, right: -5, 
                                    background: '#ff3b30', color: 'white', 
                                    fontSize: '10px', fontWeight: 'bold', 
                                    padding: '2px 6px', borderRadius: '10px', border: '2px solid var(--bg-color)' 
                                }}>
                                    {messageRequestsCount > 99 ? '99+' : messageRequestsCount}
                                </span>
                            )}
                        </button>

                        {/* Status / Thoughts */}
                        <button 
                            className="control-btn status-trigger-btn" 
                            onClick={() => handleOpenThoughtInput()} 
                            title="Set Status"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                <path d="M8 10h.01M12 10h.01M16 10h.01"/>
                            </svg>
                        </button>
                        
                        {/* Visibility Mode Toggle */}
                        <div style={{ position: 'relative' }}>
                            <button
                                className={`control-btn visibility-toggle-btn ${currentUser?.visibility_mode === 'ghost' ? 'ghost-active' : ''}`}
                                onClick={() => setShowVisibilityMenu(!showVisibilityMenu)}
                                title="Visibility Settings"
                            >
                                {currentUser?.visibility_mode === 'ghost' ? (
                                    /* Ghost Mode */
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                                        <line x1="1" y1="1" x2="23" y2="23"/>
                                    </svg>
                                ) : currentUser?.visibility_mode === 'friends' ? (
                                    /* Friends Mode */
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                                    </svg>
                                ) : (
                                    /* Public Mode */
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                                    </svg>
                                )}
                            </button>

                            {/* Visibility Dropdown Menu */}
                            {showVisibilityMenu && (
                                <div style={{
                                    position: 'absolute',
                                    top: '46px',
                                    right: 0,
                                    background: 'rgba(28, 28, 30, 0.95)',
                                    backdropFilter: 'blur(16px)',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '16px',
                                    padding: '8px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px',
                                    minWidth: '140px',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                                    zIndex: 1000
                                }}>
                                    <button 
                                        onClick={async () => {
                                            setShowVisibilityMenu(false);
                                            setCurrentUser(prev => ({ ...prev, visibility_mode: 'public', is_ghost_mode: false }));
                                            await supabase.from('profiles').update({ visibility_mode: 'public', is_ghost_mode: false }).eq('id', currentUser.id);
                                            showToast("🌍 Public Mode On");
                                            startLocation();
                                        }}
                                        style={{
                                            background: currentUser?.visibility_mode === 'public' ? 'rgba(255,255,255,0.1)' : 'transparent',
                                            border: 'none', color: 'white', padding: '8px 12px', borderRadius: '8px',
                                            textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px'
                                        }}
                                    >
                                        <span style={{ fontSize: '1rem' }}>🌍</span> Public
                                    </button>
                                    <button 
                                        onClick={async () => {
                                            setShowVisibilityMenu(false);
                                            setCurrentUser(prev => ({ ...prev, visibility_mode: 'friends', is_ghost_mode: false }));
                                            await supabase.from('profiles').update({ visibility_mode: 'friends', is_ghost_mode: false }).eq('id', currentUser.id);
                                            showToast("👥 Friends Only");
                                            startLocation();
                                        }}
                                        style={{
                                            background: currentUser?.visibility_mode === 'friends' ? 'rgba(255,255,255,0.1)' : 'transparent',
                                            border: 'none', color: 'white', padding: '8px 12px', borderRadius: '8px',
                                            textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px'
                                        }}
                                    >
                                        <span style={{ fontSize: '1rem' }}>👥</span> Friends
                                    </button>
                                    <button 
                                        onClick={async () => {
                                            setShowVisibilityMenu(false);
                                            setCurrentUser(prev => ({ ...prev, visibility_mode: 'ghost', is_ghost_mode: true }));
                                            await supabase.from('profiles').update({ visibility_mode: 'ghost', is_ghost_mode: true }).eq('id', currentUser.id);
                                            showToast("👻 Ghost Mode On");
                                            startLocation();
                                        }}
                                        style={{
                                            background: currentUser?.visibility_mode === 'ghost' ? 'rgba(255,255,255,0.1)' : 'transparent',
                                            border: 'none', color: 'white', padding: '8px 12px', borderRadius: '8px',
                                            textAlign: 'left', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px'
                                        }}
                                    >
                                        <span style={{ fontSize: '1rem' }}>👻</span> Ghost
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Map View Toggle */}
                        <button 
                            className="control-btn map-mode-btn"
                            onClick={() => {
                                const modes = ['street', 'satellite', 'hybrid'];
                                const nextIndex = (modes.indexOf(mapMode) + 1) % modes.length;
                                setMapMode(modes[nextIndex]);
                            }}
                            title="Toggle Map View"
                        >
                             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
                             </svg>
                        </button>
                    </div>
                </div>
                
                <div className="filter-scroll">
                    {FILTERS.map(f => (
                        <button 
                            key={f}
                            className={`filter-chip glass-pill ${activeFilter === f ? 'active' : ''}`}
                            onClick={() => {
                                // Disable advanced filters if switching to standard tabs
                                setDiamondFilters(prev => ({ ...prev, enabled: false }));
                                setActiveFilter(f);
                            }}
                        >
                            {f}
                        </button>
                    ))}
                    
                    <button 
                        className={`filter-chip glass-pill discovery-filter-btn ${diamondFilters.enabled ? 'active-diamond' : ''}`}
                        onClick={() => {
                            if (currentUser?.subscription_tier !== 'diamond') {
                                showToast("Upgrade to Diamond Elite to filter nearby people by gender, age, interests, and more! 💎");
                                navigate('/subscription');
                                return;
                            }
                            setShowDiamondFilterPanel(true);
                        }}
                        style={{
                            background: diamondFilters.enabled 
                                ? 'linear-gradient(135deg, #00d4ff, #a855f7)' 
                                : 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(168, 85, 247, 0.4)',
                            color: '#fff',
                            fontWeight: 'bold',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                    >
                        <span>💎 Discovery</span>
                        {diamondFilters.enabled && (
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
                        )}
                    </button>
                </div>
            </div>


            <style>{`
                .map-header-controls {
                    position: absolute;
                    top: 0;
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
                    width: 100%;
                }

                .top-profile-btn {
                    width: 38px;
                    height: 38px;
                    border-radius: 50%;
                    overflow: hidden;
                    border: 1.5px solid var(--glass-border);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
                    background: var(--glass-bg);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    padding: 0;
                    flex-shrink: 0;
                }
                .top-profile-btn:hover {
                    transform: scale(1.08);
                    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
                }
                .top-profile-btn:active {
                    transform: scale(0.95);
                }

                .search-bar-container {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    padding: 8px 14px;
                    border-radius: 24px;
                    gap: 8px;
                    transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
                    border: 1px solid var(--glass-border);
                    background: var(--glass-bg);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    box-shadow: 0 4px 16px rgba(0,0,0,0.06);
                    position: relative;
                    min-width: 120px;
                }

                .search-bar-container:focus-within {
                    transform: translateY(-1px);
                    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
                    border-color: rgba(0, 132, 255, 0.35);
                }

                .search-bar-container input {
                    border: none;
                    background: transparent;
                    font-size: 13px;
                    font-weight: 500;
                    width: 100%;
                    color: var(--text-primary);
                    outline: none;
                }
                .search-bar-container input::placeholder {
                    color: var(--text-secondary);
                    opacity: 0.75;
                }

                .header-action-buttons {
                    display: flex;
                    gap: 6px;
                    flex-shrink: 0;
                }

                .header-action-buttons .control-btn {
                    width: 38px;
                    height: 38px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
                    border: 1px solid var(--glass-border);
                    background: var(--glass-bg);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    color: var(--text-primary);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
                    padding: 0;
                }

                .header-action-buttons .control-btn:hover {
                    transform: scale(1.08);
                    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
                }

                .header-action-buttons .control-btn:active {
                    transform: scale(0.95);
                }

                /* Accent borders for specific buttons to look neat */
                .status-trigger-btn {
                    color: #0084ff !important;
                    border-color: rgba(0, 132, 255, 0.2) !important;
                }
                .visibility-toggle-btn.ghost-active {
                    background: #111113 !important;
                    color: #ffffff !important;
                    border-color: rgba(255,255,255,0.1) !important;
                    box-shadow: 0 4px 16px rgba(0,0,0,0.3) !important;
                }
                .map-mode-btn {
                    color: #34C759 !important;
                    border-color: rgba(52, 199, 89, 0.2) !important;
                }

                .filter-scroll {
                    pointer-events: auto;
                    display: flex;
                    gap: 8px;
                    overflow-x: auto;
                    padding-bottom: 4px;
                    margin-top: 2px;
                    -webkit-overflow-scrolling: touch;
                    scrollbar-width: none;
                }
                .filter-scroll::-webkit-scrollbar { display: none; }

                .filter-chip {
                    padding: 6px 14px;
                    white-space: nowrap;
                    font-size: 11px;
                    font-weight: 600;
                    color: var(--text-secondary);
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
                    border: 1px solid var(--glass-border);
                    background: var(--glass-bg);
                    backdrop-filter: blur(15px);
                    -webkit-backdrop-filter: blur(15px);
                    border-radius: 20px;
                }

                .filter-chip.active {
                    background: #0084ff;
                    color: white;
                    border-color: #0084ff;
                    box-shadow: 0 4px 12px rgba(0, 132, 255, 0.3);
                }

                .search-results-dropdown {
                    position: absolute;
                    top: calc(100% + 8px);
                    left: 0;
                    right: 0;
                    background: var(--glass-bg);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid var(--glass-border);
                    border-radius: 16px;
                    box-shadow: 0 12px 32px rgba(0,0,0,0.12);
                    overflow: hidden;
                    max-height: 220px;
                    overflow-y: auto;
                    z-index: 2000;
                }

                .search-result-item {
                    padding: 10px 14px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    cursor: pointer;
                    transition: background 0.18s ease;
                    color: var(--text-primary);
                    font-weight: 500;
                    font-size: 13px;
                }

                .search-result-item:hover {
                    background: rgba(0, 0, 0, 0.04);
                }
                html[data-theme="dark"] .search-result-item:hover {
                    background: rgba(255, 255, 255, 0.08);
                }

                .search-result-avatar {
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    object-fit: cover;
                    border: 1px solid var(--glass-border);
                }
            `}</style>

            {/* Reply Thought Modal directly from map bubble click */}
            {replyingToThought && (
                <ReplyThoughtModal
                    isOpen={!!replyingToThought}
                    onClose={() => setReplyingToThought(null)}
                    currentUser={currentUser}
                    targetUserId={replyingToThought.userId}
                    thoughtText={replyingToThought.thoughtText}
                    friendshipsMapRef={friendshipsMapRef}
                    showToast={showToast}
                />
            )}

            <MapProfileCard
                user={selectedUser}
                currentUser={currentUser}
                userLocation={userLocation}
                onClose={() => { setSelectedUser(null); setShowOwnReactorsSheet(false); }}
                onAction={handleUserAction}
                showToast={showToast}
                reactions={selectedUser ? (thoughtReactions[selectedUser.id] || []) : []}
                onToggleReaction={handleToggleReaction}
                initialShowReactors={showOwnReactorsSheet}
                friendshipsMapRef={friendshipsMapRef}
                replies={selectedUser?.id === currentUser?.id ? thoughtReplies : []}
            />

            <PokeNotifications currentUser={currentUser} />

            {isMessageRequestsPageOpen && (
                <MessageRequestsPage
                    onClose={() => setIsMessageRequestsPageOpen(false)}
                    currentUser={currentUser}
                />
            )}

            {showFullProfile && fullProfileUser && (
                <FullProfileModal
                    user={fullProfileUser}
                    currentUser={currentUser}
                    onClose={() => setShowFullProfile(false)}
                    onAction={handleUserAction}
                />
            )}

            {toastMsg && (
                <Toast
                    message={typeof toastMsg === 'object' ? toastMsg.text : toastMsg}
                    onClick={typeof toastMsg === 'object' ? toastMsg.onClick : undefined}
                    onClose={() => setToastMsg(null)}
                />
            )}

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

            {/* Diamond Discovery Filter Panel */}
            {showDiamondFilterPanel && (
                <div className="thought-input-overlay" onClick={() => setShowDiamondFilterPanel(false)}>
                    <div className="new-thought-card" style={{ position: 'relative', background: 'var(--bg-secondary, #1a1a1a)', color: 'var(--text-primary, #fff)', border: '1px solid var(--glass-border, rgba(255,255,255,0.15))', maxWidth: '360px', width: '90%', maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', borderRadius: '24px', padding: '20px' }} onClick={e => e.stopPropagation()}>
                        <button type="button" className="thought-close-btn" onClick={() => setShowDiamondFilterPanel(false)} style={{ color: '#aaa' }}>&times;</button>
                        
                        <div className="thought-emoji-header">
                            <span className="thought-emoji-bubble" style={{ background: 'linear-gradient(135deg, #00d4ff, #a855f7)', boxShadow: '0 4px 15px rgba(168, 85, 247, 0.4)' }}>💎</span>
                        </div>
                        
                        <h3 className="thought-card-title" style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 'bold', margin: '0 0 10px 0' }}>Discovery Filters</h3>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {/* Enable Switch */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Enable Filters</span>
                                <label className="toggle-switch">
                                    <input 
                                        type="checkbox"
                                        checked={diamondFilters.enabled}
                                        onChange={e => setDiamondFilters(prev => ({ ...prev, enabled: e.target.checked }))}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>

                            {/* Gender Select */}
                            <div className="setting-section" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label className="setting-label" style={{ color: '#aaa', fontSize: '0.8rem', fontWeight: 600 }}>Gender</label>
                                <select 
                                    value={diamondFilters.gender}
                                    onChange={e => setDiamondFilters(prev => ({ ...prev, gender: e.target.value }))}
                                    style={{ width: '100%', padding: '10px', borderRadius: '10px', background: '#2c2c2e', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', outline: 'none' }}
                                >
                                    <option value="All">All</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>

                            {/* Age Range Select */}
                            <div className="setting-section" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label className="setting-label" style={{ color: '#aaa', fontSize: '0.8rem', fontWeight: 600 }}>Age Range ({diamondFilters.ageMin} - {diamondFilters.ageMax})</label>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'center' }}>
                                    <input 
                                        type="number"
                                        min={18} max={99}
                                        value={diamondFilters.ageMin}
                                        onChange={e => setDiamondFilters(prev => ({ ...prev, ageMin: Math.max(18, parseInt(e.target.value) || 18) }))}
                                        style={{ width: '80px', padding: '8px', borderRadius: '10px', background: '#2c2c2e', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', outline: 'none' }}
                                    />
                                    <span style={{ color: '#aaa' }}>to</span>
                                    <input 
                                        type="number"
                                        min={18} max={99}
                                        value={diamondFilters.ageMax}
                                        onChange={e => setDiamondFilters(prev => ({ ...prev, ageMax: Math.min(99, parseInt(e.target.value) || 99) }))}
                                        style={{ width: '80px', padding: '8px', borderRadius: '10px', background: '#2c2c2e', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', outline: 'none' }}
                                    />
                                </div>
                            </div>

                            {/* Relationship Status Select */}
                            <div className="setting-section" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label className="setting-label" style={{ color: '#aaa', fontSize: '0.8rem', fontWeight: 600 }}>Relationship Status</label>
                                <select 
                                    value={diamondFilters.relationshipStatus}
                                    onChange={e => setDiamondFilters(prev => ({ ...prev, relationshipStatus: e.target.value }))}
                                    style={{ width: '100%', padding: '10px', borderRadius: '10px', background: '#2c2c2e', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', outline: 'none' }}
                                >
                                    <option value="All">All</option>
                                    <option value="Single">Single</option>
                                    <option value="In a relationship">In a relationship</option>
                                    <option value="Married">Married</option>
                                    <option value="It's complicated">It's complicated</option>
                                    <option value="Open relationship">Open relationship</option>
                                </select>
                            </div>

                            {/* Interests search */}
                            <div className="setting-section" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label className="setting-label" style={{ color: '#aaa', fontSize: '0.8rem', fontWeight: 600 }}>Interests (comma separated)</label>
                                <input 
                                    type="text"
                                    placeholder="Gym, Coffee, Travel..."
                                    value={diamondFilters.interests}
                                    onChange={e => setDiamondFilters(prev => ({ ...prev, interests: e.target.value }))}
                                    style={{ width: '100%', padding: '10px', borderRadius: '10px', background: '#2c2c2e', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', outline: 'none' }}
                                />
                            </div>

                            {/* Online Switch */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Online Now Only</span>
                                <label className="toggle-switch">
                                    <input 
                                        type="checkbox"
                                        checked={diamondFilters.onlineOnly}
                                        onChange={e => setDiamondFilters(prev => ({ ...prev, onlineOnly: e.target.checked }))}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>

                            {/* Distance range */}
                            <div className="setting-section" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label className="setting-label" style={{ color: '#aaa', fontSize: '0.8rem', fontWeight: 600 }}>Distance Limit: {diamondFilters.distanceMax} km</label>
                                <input 
                                    type="range"
                                    min={0.5} max={10} step={0.5}
                                    value={diamondFilters.distanceMax}
                                    onChange={e => setDiamondFilters(prev => ({ ...prev, distanceMax: parseFloat(e.target.value) }))}
                                    style={{ width: '100%', accentColor: '#00d4ff' }}
                                />
                            </div>
                        </div>

                        <div className="modal-footer" style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                            <button 
                                className="btn-pri" 
                                onClick={() => {
                                    setDiamondFilters(prev => ({ ...prev, enabled: true }));
                                    setShowDiamondFilterPanel(false);
                                    showToast("Discovery filters applied! 🎯");
                                }}
                                style={{ flex: 1, background: 'linear-gradient(135deg, #00d4ff, #a855f7)', color: '#fff', padding: '10px', borderRadius: '10px', fontWeight: 'bold' }}
                            >
                                Apply
                            </button>
                            <button 
                                className="btn-sec" 
                                onClick={() => {
                                    setDiamondFilters({
                                        gender: 'All',
                                        ageMin: 18,
                                        ageMax: 99,
                                        relationshipStatus: 'All',
                                        interests: '',
                                        onlineOnly: false,
                                        distanceMax: 5,
                                        enabled: false
                                    });
                                    setShowDiamondFilterPanel(false);
                                    showToast("Filters reset! 🔓");
                                }}
                                style={{ flex: 1, background: 'rgba(255,255,255,0.08)', color: '#fff', padding: '10px', borderRadius: '10px', fontWeight: 'bold' }}
                            >
                                Reset
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Thought Input Overlay */}
            {showThoughtInput && (
                <div className="thought-input-overlay" onClick={() => setShowThoughtInput(false)}>
                    <div className="thought-card new-thought-card" style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                        {/* Close button (✕) in the top-right corner */}
                        <button type="button" className="thought-close-btn" onClick={() => setShowThoughtInput(false)}>&times;</button>
                        
                        {/* Circular purple container with a 💭 emoji at the top */}
                        <div className="thought-emoji-header">
                            <span className="thought-emoji-bubble">💭</span>
                        </div>
                        
                        {/* Centered "Set a Thought" header */}
                        <h3 className="thought-card-title">Set a Thought</h3>
                        
                        <form onSubmit={handlePostThought}>
                            {/* "What's on your mind?" textarea with a characters counter and 80-char limit */}
                            <div className="textarea-container">
                                <textarea
                                    placeholder="What's on your mind?"
                                    value={myThought}
                                    onChange={e => {
                                        if (e.target.value.length <= 80) {
                                            setMyThought(e.target.value);
                                        }
                                    }}
                                    maxLength={80}
                                    autoFocus
                                    rows={3}
                                    className="thought-textarea"
                                    id="thought-textarea-input"
                                />
                                <div className="character-counter">
                                    {myThought.length}/80
                                </div>
                            </div>
                            
                            {/* Bubble Color selection row */}
                            <div className="setting-section">
                                <label className="setting-label">Bubble Color</label>
                                <div className="color-circles-row">
                                    {[
                                        { name: 'White', value: '#ffffff' },
                                        { name: 'Golden Yellow', value: '#fef5d1' },
                                        { name: 'Soft Blue', value: '#d4ebfc' },
                                        { name: 'Lavender', value: '#f3d9fa' },
                                        { name: 'Mint Green', value: '#d2f8e3' },
                                        { name: 'Soft Peach', value: '#fde2e4' }
                                    ].map(colorObj => (
                                        <button
                                            key={colorObj.value}
                                            type="button"
                                            className={`color-circle-btn ${selectedColor === colorObj.value ? 'selected' : ''}`}
                                            style={{ backgroundColor: colorObj.value }}
                                            onClick={() => setSelectedColor(colorObj.value)}
                                            title={colorObj.name}
                                        />
                                    ))}
                                </div>
                            </div>
                            
                            {/* Privacy selector */}
                            <div className="setting-section">
                                <label className="setting-label" htmlFor="thought-privacy">Who can see this?</label>
                                <div className="privacy-select-wrapper">
                                    <span className="privacy-select-icon">
                                        {selectedPrivacy === 'friends' ? '👥' : '🌐'}
                                    </span>
                                    <select
                                        id="thought-privacy"
                                        value={selectedPrivacy}
                                        onChange={e => setSelectedPrivacy(e.target.value)}
                                        className="privacy-select"
                                    >
                                        <option value="everyone">Everyone Nearby</option>
                                        <option value="friends">Friends Only</option>
                                    </select>
                                </div>
                            </div>

                            {/* 🚀 Boost Thought Selection */}
                            {(() => {
                                const isGoldOrAbove = currentUser?.subscription_tier === 'gold' || currentUser?.subscription_tier === 'diamond';
                                const lastBoostDay = currentUser?.last_thought_boost_at ? new Date(currentUser.last_thought_boost_at).toDateString() : '';
                                const hasBoostedToday = (lastBoostDay === new Date().toDateString()) && (currentUser?.daily_thought_boost_count >= 1);
                                
                                if (!isGoldOrAbove) return null;
                                
                                return (
                                    <div className="setting-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                            <label className="setting-label" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, color: '#facc15' }}>
                                                🚀 Boost Thought
                                            </label>
                                            <span style={{ fontSize: '0.7rem', color: '#a1a1aa' }}>
                                                {hasBoostedToday 
                                                    ? "Limit reached: 1 Boost daily" 
                                                    : "Prominent gold glow for 3 hours"}
                                            </span>
                                        </div>
                                        <label className="toggle-switch" style={{ pointerEvents: hasBoostedToday ? 'none' : 'auto' }}>
                                            <input 
                                                type="checkbox"
                                                disabled={hasBoostedToday}
                                                checked={isBoostSelected}
                                                onChange={e => setIsBoostSelected(e.target.checked)}
                                            />
                                            <span className="toggle-slider"></span>
                                        </label>
                                    </div>
                                );
                            })()}
                            
                            {/* Buttons at the bottom */}
                            <div className="thought-actions new-actions">
                                <button type="button" className="btn-cancel" onClick={() => setShowThoughtInput(false)}>Cancel</button>
                                <div className="right-actions">
                                    {currentUser?.thought && (
                                        <button
                                            type="button"
                                            onClick={handleDeleteThought}
                                            className="btn-remove"
                                            title="Remove Thought"
                                        >
                                            Remove
                                        </button>
                                    )}
                                    <button type="submit" className="btn-post primary" disabled={!myThought.trim()}>Post</button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}


            <div className="map-ui-overlay">
                <div className="stats-card">
                    <span>{activeFilter === 'All' ? 'All View' : `${activeFilter} View`}</span>
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
                    display: flex; align-items: flex-start; justify-content: center;
                    overflow-y: auto;
                    padding: max(20px, env(safe-area-inset-top)) 20px max(20px, env(safe-area-inset-bottom));
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
                    margin: auto;
                    flex-shrink: 0;
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
                
                .avatar-group {
                    position: relative;
                    width: 48px; height: 48px;
                    overflow: visible;
                }
                .avatar-marker {
                    width: 100%; height: 100%;
                    background-size: cover; background-position: center;
                    border-radius: 50%;
                    border: 3.5px solid #FFFFFF;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.55), 0 2px 4px rgba(0,0,0,0.35);
                    background-color: #555;
                    transform: translateZ(0);  /* Force GPU compositing */
                    backface-visibility: hidden;
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
                    will-change: transform;   /* GPU layer — prevents repaint on every GPS tick */
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

                /* Self marker styling with a beautiful double border/outer ring */
                .avatar-marker.self {
                    border: 3.5px solid #FFFFFF !important;
                    box-shadow: 0 0 0 3px #3b82f6, 0 4px 12px rgba(0,0,0,0.35) !important;
                }

                /* Catch-all: ensure Leaflet marker pane never dims avatars */
                .leaflet-marker-pane .custom-avatar-icon {
                    filter: none !important;
                    -webkit-filter: none !important;
                }

                .thought-input-overlay {
                    position: fixed; inset: 0; background: rgba(0,0,0,0.5);
                    display: flex; align-items: center; justify-content: center; z-index: 3000;
                    backdrop-filter: blur(8px);
                }
                .new-thought-card {
                    background: white; padding: 24px; border-radius: 24px; width: 90%; max-width: 340px;
                    display: flex; flex-direction: column; gap: 10px;
                    box-shadow: 0 15px 45px rgba(0,0,0,0.25);
                    border: 1px solid rgba(0,0,0,0.08);
                }
                .thought-close-btn {
                    position: absolute; top: 16px; right: 16px; background: none; border: none;
                    font-size: 24px; line-height: 1; color: #8e8e93; cursor: pointer; padding: 4px;
                    transition: color 0.15s ease;
                }
                .thought-close-btn:hover { color: #3a3a3c; }
                .thought-emoji-header { display: flex; justify-content: center; margin-top: -8px; margin-bottom: 8px; }
                .thought-emoji-bubble {
                    width: 56px; height: 56px; background: #8b5cf6; border-radius: 50%;
                    display: flex; align-items: center; justify-content: center; font-size: 24px;
                    box-shadow: 0 4px 15px rgba(139, 92, 246, 0.4);
                }
                .thought-card-title { text-align: center; font-size: 1.25rem; font-weight: 700; color: #1c1c1e; margin: 0 0 16px 0; }
                .textarea-container { position: relative; margin-bottom: 16px; }
                .thought-textarea {
                    width: 100%; padding: 12px 12px 28px 12px; border: 1.5px solid #e5e5ea; border-radius: 12px;
                    font-size: 0.95rem; font-family: inherit; outline: none; resize: none; box-sizing: border-box;
                    transition: border-color 0.2s, box-shadow 0.2s;
                }
                .thought-textarea:focus { border-color: #8b5cf6; box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15); }
                .character-counter { position: absolute; bottom: 8px; right: 12px; font-size: 0.75rem; color: #8e8e93; }
                .setting-section { margin-bottom: 16px; display: flex; flex-direction: column; gap: 6px; }
                .setting-label { font-size: 0.85rem; font-weight: 600; color: #636366; text-align: left; }
                .color-circles-row { display: flex; gap: 10px; justify-content: space-between; align-items: center; padding: 4px 2px; }
                .color-circle-btn {
                    width: 32px; height: 32px; border-radius: 50%; border: 1.5px solid #d1d1d6; cursor: pointer;
                    transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s; padding: 0;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.06);
                }
                .color-circle-btn:hover { transform: scale(1.15); }
                .color-circle-btn.selected { border: 2.5px solid #8b5cf6; transform: scale(1.15); box-shadow: 0 4px 10px rgba(139, 92, 246, 0.3); }
                .privacy-select-wrapper { position: relative; display: flex; align-items: center; }
                .privacy-select-icon { position: absolute; left: 12px; font-size: 1.1rem; pointer-events: none; color: #8e8e93; }
                .privacy-select {
                    width: 100%; padding: 12px 12px 12px 38px; border: 1.5px solid #e5e5ea; border-radius: 12px;
                    font-size: 0.95rem; font-family: inherit; outline: none; appearance: none; cursor: pointer;
                    background: white; transition: border-color 0.2s, box-shadow 0.2s;
                }
                .privacy-select:focus { border-color: #8b5cf6; box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15); }
                .thought-actions.new-actions { margin-top: 24px; display: flex; justify-content: space-between; gap: 12px; }
                .new-actions button { padding: 12px 20px; border-radius: 12px; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: all 0.2s; border: none; }
                .new-actions .btn-cancel { background: #f2f2f7; color: #48484a; }
                .new-actions .btn-cancel:hover { background: #e5e5ea; }
                .new-actions .btn-remove { background: rgba(255, 59, 48, 0.1); color: #ff3b30; border: 1px solid rgba(255, 59, 48, 0.2); }
                .new-actions .btn-remove:hover { background: rgba(255, 59, 48, 0.15); }
                .new-actions .btn-post { background: #8b5cf6; color: white; box-shadow: 0 4px 12px rgba(139, 92, 246, 0.25); }
                .new-actions .btn-post:hover { background: #7c3aed; transform: translateY(-1px); }
                .new-actions .btn-post:disabled { background: #aeaeb2; color: #e5e5ea; cursor: not-allowed; box-shadow: none; transform: none; }

                /* Dark Mode for New Thought Card */
                html[data-theme="dark"] .new-thought-card { background: #1e1e24 !important; border: 1px solid rgba(255, 255, 255, 0.1); }
                html[data-theme="dark"] .thought-close-btn:hover { color: #f2f2f7; }
                html[data-theme="dark"] .thought-card-title { color: white; }
                html[data-theme="dark"] .thought-textarea { background: rgba(0, 0, 0, 0.25); border-color: rgba(255, 255, 255, 0.15); color: #ffffff; }
                html[data-theme="dark"] .thought-textarea:focus { border-color: #8b5cf6; box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.3); }
                html[data-theme="dark"] .setting-label { color: #aeaeb2; }
                html[data-theme="dark"] .privacy-select { background: rgba(0, 0, 0, 0.25); border-color: rgba(255, 255, 255, 0.15); color: #ffffff; }
                html[data-theme="dark"] .privacy-select:focus { border-color: #8b5cf6; box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.3); }
                html[data-theme="dark"] .new-actions .btn-cancel { background: rgba(255, 255, 255, 0.1); color: #f2f2f7; }
                html[data-theme="dark"] .new-actions .btn-cancel:hover { background: rgba(255, 255, 255, 0.15); }
                html[data-theme="dark"] .new-actions .btn-post:disabled { background: #48484a; color: #8e8e93; }

                @media (prefers-color-scheme: dark) {
                    html[data-theme="system"] .new-thought-card { background: #1e1e24 !important; border: 1px solid rgba(255, 255, 255, 0.1); }
                    html[data-theme="system"] .thought-close-btn:hover { color: #f2f2f7; }
                    html[data-theme="system"] .thought-card-title { color: white; }
                    html[data-theme="system"] .thought-textarea { background: rgba(0, 0, 0, 0.25); border-color: rgba(255, 255, 255, 0.15); color: #ffffff; }
                    html[data-theme="system"] .setting-label { color: #aeaeb2; }
                    html[data-theme="system"] .privacy-select { background: rgba(0, 0, 0, 0.25); border-color: rgba(255, 255, 255, 0.15); color: #ffffff; }
                    html[data-theme="system"] .new-actions .btn-cancel { background: rgba(255, 255, 255, 0.1); color: #f2f2f7; }
                    html[data-theme="system"] .new-actions .btn-post:disabled { background: #48484a; color: #8e8e93; }
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
