import { MapContainer, TileLayer, Circle, CircleMarker, useMap, useMapEvents, LayersControl, LayerGroup } from 'react-leaflet';
import L from 'leaflet';
import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import MapProfileCard from '../components/MapProfileCard';
import FullProfileModal from '../components/FullProfileModal';
import ReplyThoughtModal from '../components/ReplyThoughtModal';
import PokeNotifications from '../components/PokeNotifications';
import Toast from '../components/Toast';
import MessageRequestsPage from '../components/MessageRequestsPage';
import { getAvatar2D } from '../utils/avatarUtils';
import { getBlockedUserIds, getBlockerIds, isUserBlocked, isBlockedMutual } from '../utils/blockUtils';
import { useLocationContext } from '../context/LocationContext';
import { useCall } from '../context/CallContext';
import { fuzzyLocation, distanceMetres, fuzzyLocationForDB, parseThought, formatThought } from '../utils/locationPrivacy';
import LimitedModeScreen from '../components/LimitedModeScreen';
import LocationOnboarding from '../components/LocationOnboarding';
import ReportModal from '../components/ReportModal';
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

import { mapEventChannel } from '../utils/mapEvents';
export { mapEventChannel };

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

// Calculate buffered bounds with a 50% outer margin around Leaflet viewport
const getBufferedBounds = (bounds, bufferRatio = 0.5) => {
    if (!bounds || !bounds.getSouthWest || !bounds.getNorthEast) return null;
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    const latSpan = Math.abs(ne.lat - sw.lat);
    const lngSpan = Math.abs(ne.lng - sw.lng);

    const minLat = Math.max(-90, sw.lat - latSpan * bufferRatio);
    const maxLat = Math.min(90, ne.lat + latSpan * bufferRatio);
    const minLng = sw.lng - lngSpan * bufferRatio;
    const maxLng = ne.lng + lngSpan * bufferRatio;

    return { minLat, maxLat, minLng, maxLng };
};

// Check if visible bounds are completely contained within the previously fetched query bounds
const isBoundsContained = (visibleBounds, fetchedBounds) => {
    if (!visibleBounds || !fetchedBounds) return false;
    const vSw = visibleBounds.getSouthWest();
    const vNe = visibleBounds.getNorthEast();

    return (
        vSw.lat >= fetchedBounds.minLat &&
        vNe.lat <= fetchedBounds.maxLat &&
        vSw.lng >= fetchedBounds.minLng &&
        vNe.lng <= fetchedBounds.maxLng
    );
};

// Map Controller: Handle Viewport Bounds Changes for Scalable PostgREST Fetching
function MapBoundsListener({ onBoundsChange }) {
    const map = useMapEvents({
        moveend: () => {
            if (map) onBoundsChange(map.getBounds());
        },
        zoomend: () => {
            if (map) onBoundsChange(map.getBounds());
        }
    });

    React.useEffect(() => {
        if (map) {
            onBoundsChange(map.getBounds());
        }
    }, [map, onBoundsChange]);

    return null;
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
                        backgroundColor: '#7C3AED',
                        border: 'none',
                        borderRadius: '50%',
                        boxShadow: '0 4px 12px rgba(124, 58, 237, 0.4)',
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
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(124, 58, 237, 0.5)';
                        e.currentTarget.style.transform = 'scale(1.05)';
                    }}
                    onMouseLeave={(e) => { 
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.4)';
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


// 🔍 CustomZoomControl — Floating + and - buttons for 1-tap map zooming
function CustomZoomControl() {
    const map = useMap();
    const controlRef = useRef(null);

    useEffect(() => {
        if (controlRef.current) {
            L.DomEvent.disableClickPropagation(controlRef.current);
            L.DomEvent.disableScrollPropagation(controlRef.current);
        }
    }, []);

    return (
        <div 
            ref={controlRef}
            className="leaflet-bottom leaflet-right" 
            style={{ 
                bottom: 'calc(134px + env(safe-area-inset-bottom))',
                right: '10px',
                zIndex: 400,
                pointerEvents: 'auto',
                position: 'absolute',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
            }}
        >
            <button
                onClick={() => map.zoomIn()}
                title="Zoom In"
                style={{
                    width: '40px',
                    height: '40px',
                    backgroundColor: 'rgba(255, 255, 255, 0.92)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(0,0,0,0.08)',
                    borderRadius: '50%',
                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.18)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#1f2937',
                    fontSize: '22px',
                    fontWeight: '600',
                    transition: 'transform 0.15s ease, background 0.15s ease'
                }}
            >
                +
            </button>
            <button
                onClick={() => map.zoomOut()}
                title="Zoom Out"
                style={{
                    width: '40px',
                    height: '40px',
                    backgroundColor: 'rgba(255, 255, 255, 0.92)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(0,0,0,0.08)',
                    borderRadius: '50%',
                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.18)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#1f2937',
                    fontSize: '24px',
                    fontWeight: '600',
                    transition: 'transform 0.15s ease, background 0.15s ease'
                }}
            >
                −
            </button>
        </div>
    );
}

// 📍 MyLocationPin — pulsing "You Are Here" dot rendered at user's real GPS location
// Must be rendered inside a MapContainer so useMap() works at the top level.
function MyLocationPin({ lat, lng }) {
    const map = useMap();

    useEffect(() => {
        // Inject pulse keyframe animation if not already present
        const styleId = 'my-location-pin-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                @keyframes myLocationPulse {
                    0%   { transform: scale(1);   opacity: 0.6; }
                    50%  { transform: scale(2.4); opacity: 0; }
                    100% { transform: scale(1);   opacity: 0.6; }
                }
                .my-location-dot-icon {
                    background: transparent !important;
                    border: none !important;
                }
                .my-location-dot-icon .pulse-ring {
                    position: absolute;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    background: rgba(29, 155, 240, 0.35);
                    top: 50%; left: 50%;
                    transform: translate(-50%, -50%);
                    animation: myLocationPulse 2s ease-out infinite;
                }
                .my-location-dot-icon .core-dot {
                    position: absolute;
                    width: 14px;
                    height: 14px;
                    border-radius: 50%;
                    background: #1D9BF0;
                    border: 2.5px solid #fff;
                    box-shadow: 0 0 6px rgba(29,155,240,0.7);
                    top: 50%; left: 50%;
                    transform: translate(-50%, -50%);
                }
            `;
            document.head.appendChild(style);
        }
    }, []);

    useEffect(() => {
        if (!map || !lat || !lng) return;

        const icon = L.divIcon({
            className: 'my-location-dot-icon',
            html: '<div class="pulse-ring"></div><div class="core-dot"></div>',
            iconSize: [28, 28],
            iconAnchor: [14, 14],
        });

        const marker = L.marker([lat, lng], { icon, zIndexOffset: 500, interactive: false }).addTo(map);
        return () => { marker.remove(); };
    }, [map, lat, lng]);

    return null;
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

            const isDiamond = u?.subscription_tier === 'diamond';
            const isBoosted = u?.thought_boosted_at && (new Date(u.thought_boosted_at).getTime() > Date.now() - 3 * 60 * 60 * 1000);
            const zIndexOffset = isDiamond ? 5000 : isBoosted ? 2000 : 100;

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
    const [activeFilter, setActiveFilter] = useState('Nearby');
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

    const [locationName, setLocationName] = useState('Your Location');

    // Reverse geocode user's real lat/lng to get location name
    useEffect(() => {
        if (!userLocation?.lat || !userLocation?.lng) return;
        const lat = userLocation.lat;
        const lng = userLocation.lng;
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=en`)
            .then(r => r.json())
            .then(data => {
                const a = data?.address || {};
                const name =
                    (a.neighbourhood || a.suburb || a.village || a.town || a.city_district) &&
                    (a.city || a.town || a.county || a.state)
                        ? `${a.neighbourhood || a.suburb || a.village || a.town || a.city_district}, ${a.city || a.town || a.county}`
                        : a.city || a.town || a.county || a.state || 'Your Location';
                setLocationName(name);
            })
            .catch(() => setLocationName('Your Location'));
    }, [userLocation?.lat, userLocation?.lng]);

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
    const FILTERS = [
        { key: 'Nearby',  label: 'Nearby',  icon: '👥' },
        { key: 'Friends', label: 'Friends', icon: '🤝' },
        { key: 'Events',  label: 'Events',  icon: '📅' },
        { key: 'Places',  label: 'Places',  icon: '📍' },
    ];

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
    const [diamondFilters, setDiamondFilters] = useState(() => {
        try {
            const saved = localStorage.getItem('diamond_discovery_filters');
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return {
            gender: 'Everyone',
            ageMin: 18,
            ageMax: 99,
            movement: 'Everyone',
            enabled: false
        };
    });
    const [showDiamondFilterPanel, setShowDiamondFilterPanel] = useState(false);
    const [showDiamondUpgradeModal, setShowDiamondUpgradeModal] = useState(false);
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

    useEffect(() => {
        if (currentUser && currentUser.subscription_tier !== 'diamond') {
            setDiamondFilters({
                gender: 'All',
                ageMin: 18,
                ageMax: 99,
                relationshipStatus: 'All',
                interests: '',
                onlineOnly: false,
                distanceMax: 5,
                premiumOnly: false,
                verifiedOnly: false,
                recentlyActiveOnly: false,
            });
        }
    }, [currentUser?.subscription_tier]);

    // Auto-open Discovery Filters when navigated from Profile or URL with ?openFilters=true
    useEffect(() => {
        const searchParams = new URLSearchParams(routeLocation.search);
        if (searchParams.get('openFilters') === 'true' || routeLocation.state?.openFilters) {
            if (currentUser?.subscription_tier === 'diamond') {
                setShowDiamondFilterPanel(true);
            } else if (currentUser) {
                setShowDiamondUpgradeModal(true);
            }
        }
    }, [routeLocation.search, routeLocation.state, currentUser]);

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
    const [selectedThoughtStyle, setSelectedThoughtStyle] = useState('default');
    const [selectedPrivacy, setSelectedPrivacy] = useState('everyone');
    const [isBoostSelected, setIsBoostSelected] = useState(false);

    useEffect(() => {
        if (showThoughtInput) {
            setIsBoostSelected(false);
            setSelectedThoughtStyle(currentUser?.thought_bubble_style || 'default');
        }
    }, [showThoughtInput, currentUser?.thought_bubble_style]);

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

    const nearbyUserIdsKey = useMemo(() => {
        return nearbyUsers.map(u => u.id).join(',');
    }, [nearbyUsers]);

    // Trigger initial reactions fetch when visible user set changes
    useEffect(() => {
        if (!currentUser) return;
        const visibleUserIds = [currentUser.id, ...nearbyUsers.map(u => u.id)];
        fetchReactions(visibleUserIds);
    }, [nearbyUserIdsKey, currentUser?.id]);

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
                    let reactorUser = nearbyUsersRef.current.find(u => u.id === reactorId) || (currentUserRef.current?.id === reactorId ? currentUserRef.current : null);
                    if (!reactorUser) {
                        const { data } = await supabase
                            .from('profiles')
                            .select('id, username, full_name, avatar_url, gender, is_verified, verified_at')
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
                    if (newRec.thought_id === currentUserRef.current?.id && newRec.user_id !== currentUserRef.current?.id) {
                        const reactorName = reactorUser?.username || reactorUser?.name || 'Someone';
                        const emojiMap = { love: '❤️', fire: '🔥', laugh: '😂', clap: '👏' };
                        const emoji = emojiMap[newRec.reaction_type] || '❤️';
                        
                        showToast({
                            text: `🔔 ${reactorName} reacted ${emoji} to your thought`,
                            onClick: () => {
                                const selfUser = {
                                    ...currentUserRef.current,
                                    lat: currentUserRef.current.latitude || userLocationRef.current?.lat,
                                    lng: currentUserRef.current.longitude || userLocationRef.current?.lng,
                                    thought: currentUserRef.current.thought || currentUserRef.current.status_message,
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
    }, [currentUser?.id]);

    const handleToggleReaction = React.useCallback(async (thoughtUserId, reactionType) => {
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
    }, [currentUser, thoughtReactions]);

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
            setMyThought(''); // Always open with blank text
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

    // Refs and effects to stabilize realtime subscription dependencies
    const currentUserRef = useRef(currentUser);
    const nearbyUsersRef = useRef(nearbyUsers);

    useEffect(() => {
        currentUserRef.current = currentUser;
    }, [currentUser]);

    useEffect(() => {
        nearbyUsersRef.current = nearbyUsers;
    }, [nearbyUsers]);

    // Viewport-based map query refs
    const latestBoundsRef = useRef(null);
    const lastFetchedBoundsRef = useRef(null);
    const fetchAbortControllerRef = useRef(null);
    const boundsTimeoutRef = useRef(null);

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

    // Sync circle center and animate/remove native marker when locationEnabled or userLocation updates
    useEffect(() => {
        if (!locationEnabled || !currentUser?.id) {
            // If location turned OFF, visually remove marker
            if (currentUser?.id) {
                const marker = markerRefs.current.get(currentUser.id);
                if (marker) {
                    marker.remove();
                    markerRefs.current.delete(currentUser.id);
                }
            }
            return;
        }

        if (userLocation?.lat && userLocation?.lng) {
            setCircleCenter([userLocation.lat, userLocation.lng]);
            animateNativeMarker(currentUser.id, userLocation.lat, userLocation.lng);
        }
    }, [locationEnabled, userLocation, currentUser?.id, animateNativeMarker]);

    // Check Profile Completeness
    useEffect(() => {
        const checkUser = async () => {

            const { data: { session } } = await supabase.auth.getSession();
            const user = session?.user;
            if (!user) return;

            const { data: profile } = await supabase
                .from('profiles')
                .select('id, username, full_name, gender, relationship_status, avatar_url, onboarding_completed, is_location_on, is_ghost_mode, latitude, longitude, status, status_message, status_updated_at, last_active, is_verified, verified_at, visibility_mode, subscription_tier, thought_bubble_style, thought_bubble_color')
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
                    is_ghost_mode: false
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


    // Foreground New Message Toast Listener
    useEffect(() => {
        if (!currentUser?.id) return;

        // Subscribe to new messages for toast notifications
        const channel = supabase
            .channel('global_unread')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${currentUser.id}` }, async (payload) => {
                const newMessage = payload.new;

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
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser?.id]);

    // Listen for all friendship and block changes
    useEffect(() => {
        if (!currentUser) return;

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

    const fetchNearbyUsers = React.useCallback(async (boundsOverride = null, isPeriodicRefresh = false) => {
        if (!currentUser?.id) return;

        const bounds = boundsOverride || latestBoundsRef.current;
        const buffered = bounds ? getBufferedBounds(bounds, 0.5) : null;

        // Skip fetch if current visible bounds are already inside our fetched query buffer (unless periodic refresh)
        if (!isPeriodicRefresh && bounds && lastFetchedBoundsRef.current && isBoundsContained(bounds, lastFetchedBoundsRef.current)) {
            return;
        }

        // Cancel previous pending fetch if user is panning rapidly
        if (fetchAbortControllerRef.current) {
            fetchAbortControllerRef.current.abort();
        }
        const abortController = new AbortController();
        fetchAbortControllerRef.current = abortController;

        try {
            // Fetch blocked user IDs (both directions - users I blocked and users who blocked me)
            const [blockedByMe, blockedMe] = await Promise.all([
                getBlockedUserIds(currentUser.id),  // Users I blocked
                getBlockerIds(currentUser.id)        // Users who blocked me
            ]);

            // Combine both lists for mutual hiding
            const allBlockedIds = new Set([...blockedByMe, ...blockedMe]);
            blockedIdsRef.current = allBlockedIds; // Update Ref for real-time subscriptions

            // Build PostgREST profiles query
            let profilesQuery = supabase
                .from('profiles')
                .select('id, username, full_name, gender, latitude, longitude, status, relationship_status, status_message, status_updated_at, last_active, avatar_url, hide_status, show_last_seen, is_public, is_location_on, mood, mood_updated_at, visibility_mode, activity_status, last_seen, is_stationary, stationary_since, subscription_tier, avatar_effect, interests, birth_date, thought_bubble_style, thought_bubble_color, hide_distance, hide_active_status, profile_view_policy, is_verified, verified_at')
                .neq('id', currentUser.id)
                .or('is_ghost_mode.eq.false,is_ghost_mode.is.null,visibility_mode.neq.ghost') 
                .not('latitude', 'is', null)
                .not('longitude', 'is', null);

            // Apply bounding-box range filter if viewport bounds are present
            if (buffered && buffered.minLng <= buffered.maxLng) {
                profilesQuery = profilesQuery
                    .gte('latitude', buffered.minLat)
                    .lte('latitude', buffered.maxLat)
                    .gte('longitude', buffered.minLng)
                    .lte('longitude', buffered.maxLng);
            }

            profilesQuery = profilesQuery.limit(300).abortSignal(abortController.signal);

            // Run queries in parallel for faster loading.
            // Use allSettled so a failed sub-query (e.g. 525 SSL) doesn't cancel the rest.
            const [profilesResult, friendshipResult, storiesResult, viewsResult] = await Promise.allSettled([
                profilesQuery,
                supabase.from('friendships').select('id, requester_id, receiver_id, status').or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`).abortSignal(abortController.signal),
                supabase.from('stories').select('id, user_id').gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).abortSignal(abortController.signal),
                supabase.from('story_views').select('story_id').eq('viewer_id', currentUser.id).abortSignal(abortController.signal)
            ]);

            if (abortController.signal.aborted) return;

            // Unwrap allSettled results safely — a rejected promise won't crash the rest
            const safeValue = (settled) => settled?.status === 'fulfilled' ? settled.value : { data: null, error: settled?.reason };
            const profilesData = safeValue(profilesResult);
            const friendshipData = safeValue(friendshipResult);
            const storiesData = safeValue(storiesResult);
            const viewsData = safeValue(viewsResult);

            // Silently warn on non-critical failures (stories/views can gracefully degrade)
            if (storiesData.error) console.warn('⚠️ Stories fetch failed (non-fatal):', storiesData.error?.message || storiesData.error);
            if (viewsData.error) console.warn('⚠️ Views fetch failed (non-fatal):', viewsData.error?.message || viewsData.error);

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
                    let fallbackAvatar;
                    if (u.gender === 'Male') fallbackAvatar = DEFAULT_MALE_AVATAR;
                    else if (u.gender === 'Female') fallbackAvatar = DEFAULT_FEMALE_AVATAR;
                    else fallbackAvatar = DEFAULT_GENERIC_AVATAR;

                    const lat = parseFloat(u.latitude);
                    const lng = parseFloat(u.longitude);

                    const fuzzyLoc = getFuzzyLocationForUser(u.id, lat, lng);
                    const renderLat = fuzzyLoc.lat;
                    const renderLng = fuzzyLoc.lng;

                    const fData = myFriendships.get(u.id);

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
                        avatar: u.avatar_url || fallbackAvatar,
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
                        status_updated_at: u.status_updated_at,
                        visibility_mode: u.visibility_mode,
                        subscription_tier: u.subscription_tier || 'free',
                        avatar_effect: u.avatar_effect || 'none',
                        thought_bubble_style: u.thought_bubble_style || 'default',
                        thought_bubble_color: u.thought_bubble_color || null,
                        interests: u.interests || [],
                        birth_date: u.birth_date || null,
                        is_verified: u.is_verified,
                        verified_at: u.verified_at,
                        hasStory: usersWithStories.has(u.id) && (u.is_public !== false || fData?.status === 'accepted'),
                        hasUnseenStory: usersWithUnseenStories.has(u.id) && (u.is_public !== false || fData?.status === 'accepted')
                    };
                });

            setNearbyUsers(validUsers);

            if (buffered) {
                lastFetchedBoundsRef.current = buffered;
            }

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
            if (err?.name !== 'AbortError') {
                console.error('❌ [MapHome] Fetch Error:', err);
            }
        }
    }, [currentUser]);

    const handleBoundsChange = React.useCallback((bounds) => {
        latestBoundsRef.current = bounds;
        fetchNearbyUsers(bounds);
    }, [fetchNearbyUsers]);

    // Real-time Subscription for Instant Updates (both UPDATE and INSERT)
    useEffect(() => {
        if (!currentUser) return;

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
                        // Synchronize latitude and longitude as well so that laptop fallback properties sync cleanly
                        return {
                            ...prev,
                            mood: updatedUser.mood,
                            mood_updated_at: updatedUser.mood_updated_at,
                            status: updatedUser.status,
                            status_message: updatedUser.status_message,
                            status_updated_at: updatedUser.status_updated_at,
                            avatar_url: updatedUser.avatar_url || prev.avatar_url,
                            username: updatedUser.username || prev.username,
                            is_verified: updatedUser.is_verified ?? prev.is_verified,
                            verified_at: updatedUser.verified_at ?? prev.verified_at,
                            // 🔥 Sync visibility changes triggered from other tabs/devices
                            visibility_mode: updatedUser.visibility_mode ?? prev.visibility_mode,
                            is_ghost_mode: updatedUser.visibility_mode === 'ghost' || updatedUser.is_ghost_mode,
                            latitude: updatedUser.latitude ?? prev.latitude,
                            longitude: updatedUser.longitude ?? prev.longitude,
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
                        is_verified: updatedUser.is_verified,
                        verified_at: updatedUser.verified_at,
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
                                return prev.map(u => u.id === updatedUser.id ? {
                                    ...u,
                                    lat: renderLat,
                                    lng: renderLng,
                                    lastActive: newUserObj.lastActive
                                } : u);
                            }
                            return prev.map(u => u.id === updatedUser.id ? {
                                ...u,
                                lastActive: newUserObj.lastActive
                            } : u);
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


        return () => {
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
            startLocation(true); 
        }
    };


    const handleEnableLocation = async () => {
        setCurrentUser(prev => ({ ...prev, is_location_on: true }));
        
        startLocation(true);

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

            // Clear local reactions
            setThoughtReactions(prev => {
                const next = { ...prev };
                delete next[currentUser.id];
                return next;
            });

            // DB Update
            const { error } = await supabase
                .from('profiles')
                .update({
                    status_message: null,
                    status_updated_at: null
                })
                .eq('id', currentUser.id);

            if (error) throw error;

            // Delete reactions from DB (ignore RLS error if policy not yet updated)
            supabase
                .from('thought_reactions')
                .delete()
                .eq('thought_id', currentUser.id)
                .then(({ error: delError }) => {
                    if (delError) console.error("Could not delete thought reactions from DB:", delError);
                });

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
                thought_bubble_style: currentUser.subscription_tier !== 'free' ? selectedThoughtStyle : 'default',
                last_active: now,
                status_updated_at: now
            };

            let updatedUser = { 
                ...currentUser, 
                thought: formattedThought, 
                thoughtTime: Date.now(),
                thought_bubble_style: currentUser.subscription_tier !== 'free' ? selectedThoughtStyle : 'default'
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

            // Clear local reactions
            setThoughtReactions(prev => {
                const next = { ...prev };
                delete next[currentUser.id];
                return next;
            });

            // DB Update for global visibility
            const { error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', currentUser.id);

            if (error) throw error;

            // Delete reactions from DB (ignore RLS error if policy not yet updated)
            supabase
                .from('thought_reactions')
                .delete()
                .eq('thought_id', currentUser.id)
                .then(({ error: delError }) => {
                    if (delError) console.error("Could not delete thought reactions from DB:", delError);
                });
            
            setNearbyUsers(prev =>
                prev.map(u =>
                    u.id === currentUser.id
                        ? {
                            ...u,
                            thought: formattedThought,
                            status_updated_at: now,
                            lastActive: now,
                            thought_bubble_style: currentUser.subscription_tier !== 'free' ? selectedThoughtStyle : 'default',
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
                    } else if (error.message?.includes('RATE_LIMIT_EXCEEDED')) {
                        showToast(error.message.replace('RATE_LIMIT_EXCEEDED: ', ''));
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
        
        // Retrieve user tier, effect and bubble style dynamically
        const u = isSelf ? currentUser : nearbyUsers.find(usr => usr.id === id);
        const tier = u?.subscription_tier || 'free';
        const effect = u?.avatar_effect || 'none';
        const styleTheme = u?.thought_bubble_style || 'default';

        const reactionsList = (id && thoughtReactions[id]) || [];
        const reactionsKey = reactionsList.map(r => `${r.user_id}:${r.reaction_type}`).sort().join(',');
        const repliesKey = isSelf ? thoughtReplies.length : 0;
        // Prefix invalidates old cached icons when HTML template changes
        const cacheKey = `v9_${url}_${isSelf}_${thought}_${name}_${status}_${isGhost}_${mood}_${moodUpdatedAt}_${animationDelay}_${activityStatus}_${id}_${thoughtUpdatedAt}_${reactionsKey}_${isExpanded}_${repliesKey}_${tier}_${effect}_${styleTheme}`;
        
        if (iconCache.current.has(cacheKey)) {
            return iconCache.current.get(cacheKey);
        }

        let className = 'avatar-marker';
        let style = `background-image: url('${url}'); background-size: cover; background-position: center; border-radius: 50%;`;

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

        const expiryHTML = ''; // Disabling remaining time display on map thought bubbles per user request

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
        const bubbleStyle = u?.thought_bubble_style || 'default';
        const styleClass = bubbleStyle !== 'default' ? `style-${bubbleStyle}` : '';
        const bubbleClasses = `thought-bubble ${isBoosted ? 'thought-boosted' : ''} ${styleClass}`;
        const isDefaultStyle = bubbleStyle === 'default';

        const inlineBackgroundStyle = isDefaultStyle ? `background: ${bubbleColor} !important;` : '';
        const inlineBorderStyle = isDefaultStyle ? `border: 1.2px solid ${isBoosted ? '#facc15' : bubbleBorderColor} !important;` : '';
        const inlineColorStyle = isDefaultStyle ? 'color: #111827 !important;' : '';

        const thoughtHTML = thoughtText
            ? `<div class="${bubbleClasses}" onclick="event.stopPropagation(); if(window.handleThoughtClick) window.handleThoughtClick('${id}');" style="--bubble-bg: ${bubbleColor}; --bubble-border: ${isBoosted ? '#facc15' : bubbleBorderColor}; ${inlineBackgroundStyle} ${inlineBorderStyle} ${inlineColorStyle} padding: 5px 24px 5px 8px !important; border-radius: 12px !important; pointer-events: auto !important; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
                 <div class="thought-author" style="${isDefaultStyle ? `color: ${isSelf ? '#3b82f6' : '#64748b'} !important;` : ''} font-weight: 800; font-size: 0.55rem; display: flex; align-items: center; justify-content: center; letter-spacing: 0.6px; text-transform: uppercase; text-align: center; width: 100%;">
                     <span>${isBoosted ? '🚀 Boosted' : name}</span>
                     ${expiryHTML}
                 </div>
                 <div class="thought-content" style="${inlineColorStyle} font-weight: 700; font-size: 0.72rem; letter-spacing: -0.015em; line-height: 1.25; margin-top: 0px; text-align: center; width: 100%;">
                    ${thoughtText}
                 </div>
                 ${reactionsHTML}
                 ${expandedBarHTML}
                 ${!isSelf ? `<button class="thought-reply-dots" onclick="event.stopPropagation(); if(window.handleThoughtReplyClick) window.handleThoughtReplyClick('${id}', \`${thoughtText.replace(/`/g, '\\`').replace(/"/g, '&quot;')}\`);" style="position: absolute; right: 2px; top: 4px; background: none; border: none; font-size: 1rem; cursor: pointer; color: #666; padding: 2px; display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; pointer-events: auto;" title="Reply to thought">⋮</button>` : ''}
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

        let momentHTML = '';
        const momentVal = u?.nearby_moment;
        const momentExpiry = u?.nearby_moment_expires_at;
        const hasMoment = momentVal && momentExpiry && (new Date(momentExpiry).getTime() > Date.now());

        if (hasMoment) {
            const emojiMatch = momentVal.match(/^([\p{Emoji}\u200d\u200d\ufe0f]+)/u);
            const emoji = emojiMatch ? emojiMatch[1] : '📍';
            momentHTML = `<div class="moment-badge" style="
                position: absolute;
                bottom: -4px;
                left: -4px;
                font-size: 1.05rem;
                line-height: 1;
                z-index: 22;
                background: #00d4ff;
                border: 1.5px solid #ffffff;
                border-radius: 50%;
                width: 22px;
                height: 22px;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 0 10px #00d4ff, 0 2px 5px rgba(0,0,0,0.3);
                pointer-events: none;
                animation: markerPulseSlow 2s infinite alternate;
            ">${emoji}</div>`;
        }

        const icon = L.divIcon({
            className: 'custom-avatar-icon',
            html: `
                <div class="avatar-group" style="${containerStyle}">
                    ${thoughtHTML}
                    <div class="${className}" style="${style}"></div>
                    ${moodHTML}
                    ${statusDotHTML}
                    ${momentHTML}
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

        if (diamondFilters.enabled) {
            visibleUsers = visibleUsers.filter(u => {
                // 1. Case-insensitive Gender filter
                if (diamondFilters.gender && diamondFilters.gender !== 'Everyone' && diamondFilters.gender !== 'All') {
                    const rawGen = String(u.gender || u.fullProfile?.gender || '').toLowerCase().trim();
                    if (diamondFilters.gender === 'Men') {
                        if (rawGen !== 'male' && rawGen !== 'men' && rawGen !== 'man') return false;
                    } else if (diamondFilters.gender === 'Women') {
                        if (rawGen !== 'female' && rawGen !== 'women' && rawGen !== 'woman') return false;
                    } else if (diamondFilters.gender === 'Other') {
                        if (['male', 'men', 'man', 'female', 'women', 'woman'].includes(rawGen)) return false;
                    }
                }

                // 2. Age Range filter
                const isAgeFiltered = (diamondFilters.ageMin && diamondFilters.ageMin > 18) || (diamondFilters.ageMax && diamondFilters.ageMax < 99);
                const bdate = u.birth_date || u.birthDate || u.fullProfile?.birth_date;
                if (bdate) {
                    const dob = new Date(bdate);
                    if (!isNaN(dob.getTime())) {
                        const age = new Date().getFullYear() - dob.getFullYear();
                        if (diamondFilters.ageMin && age < diamondFilters.ageMin) return false;
                        if (diamondFilters.ageMax && age > diamondFilters.ageMax) return false;
                    }
                } else if (isAgeFiltered) {
                    return false;
                }

                // 3. Movement filter
                if (diamondFilters.movement && diamondFilters.movement !== 'Everyone') {
                    if (diamondFilters.movement === 'Moving' && u.is_stationary === true) return false;
                    if (diamondFilters.movement === 'Stationary' && u.is_stationary !== true) return false;
                }

                return true;
            });
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

    }, [nearbyUsers, activeFilter, currentUser, diamondFilters, userLocation?.lat, userLocation?.lng]);
    // 🔥 Removed `userLocation` from deps — accessed via userLocationRef so GPS updates
    // don't rebuild filteredUsers and restart NativeMarkerSync on every tick.


    // Search Suggestions (derived from ALL users, ignoring current tab filter to find anyone)
    const searchResults = useMemo(() => {
        if (!searchQuery || searchQuery.trim().length === 0) return [];
        const query = searchQuery.toLowerCase().trim();
        return nearbyUsers
            .filter(u => u.name && u.name.toLowerCase().includes(query))
            .sort((a, b) => {
                // Priority Discovery for Diamond Elite
                const aDiamond = a.subscription_tier === 'diamond';
                const bDiamond = b.subscription_tier === 'diamond';
                if (aDiamond && !bDiamond) return -1;
                if (!aDiamond && bDiamond) return 1;

                // Boosted status (Gold)
                const aBoosted = a.thought_boosted_at && (new Date(a.thought_boosted_at).getTime() > Date.now() - 3 * 60 * 60 * 1000);
                const bBoosted = b.thought_boosted_at && (new Date(b.thought_boosted_at).getTime() > Date.now() - 3 * 60 * 60 * 1000);
                if (aBoosted && !bBoosted) return -1;
                if (!aBoosted && bBoosted) return 1;

                // Premium status (Gold/Silver)
                const aPremium = a.subscription_tier === 'gold' || a.subscription_tier === 'silver';
                const bPremium = b.subscription_tier === 'gold' || b.subscription_tier === 'silver';
                if (aPremium && !bPremium) return -1;
                if (!aPremium && bPremium) return 1;

                return 0;
            });
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
            
            // Record real-time metrics safely
            if (currentUser && u.id !== currentUser.id) {
                import('../utils/premiumUtils').then(({ recordProfileView, recordThoughtView }) => {
                    recordProfileView(u.id, currentUser.id);
                    
                    let displayThought = u.thought || u.status_message;
                    const thoughtUpdatedAt = u.status_updated_at || u.statusUpdatedAt;
                    if (thoughtUpdatedAt) {
                        const diffHours = (new Date() - new Date(thoughtUpdatedAt)) / (1000 * 60 * 60);
                        if (diffHours <= 3 && displayThought) {
                            recordThoughtView(u.id, currentUser.id);
                        }
                    }
                }).catch(err => console.warn("Metrics logging warning:", err));
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
                touchZoom={true}
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
                {/* 🔍 Floating Zoom In / Zoom Out Controls */}
                <CustomZoomControl />
                {/* 📍 Pulsing "You Are Here" pin at real GPS location */}
                {locationEnabled && userLocation?.lat && userLocation?.lng && (
                    <MyLocationPin lat={userLocation.lat} lng={userLocation.lng} />
                )}
                <RecenterControl 
                    markerRefs={markerRefs}
                    currentUserId={currentUser?.id}
                    fallbackLat={userLocation?.lat}
                    fallbackLng={userLocation?.lng}
                    onRecenter={handleRecenterCallback}
                />
                <UserSelectionController selectedUser={selectedUser} />
                <MapBoundsListener onBoundsChange={handleBoundsChange} />

                {(circleCenter || (userLocation?.lat && userLocation?.lng)) && (
                    <Circle
                        center={circleCenter || [userLocation.lat, userLocation.lng]}
                        radius={300}
                        pathOptions={{
                            color: '#7C3AED',
                            fillColor: '#7C3AED',
                            fillOpacity: 0.05,
                            weight: 1.5,
                            dashArray: '5, 5'
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

            {/* ── Floating Top-Right Quick Actions - HIDDEN (moved to map-header-controls) ── */}
            {userLocation?.lat && (
                <div style={{
                    position: 'fixed',
                    top: 'max(14px, calc(env(safe-area-inset-top) + 10px))',
                    right: 14,
                    zIndex: 1200,
                    display: 'none',
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
            <div className="map-header-controls">
                <div className="map-header-top-nav">
                    {/* Left: Map View Picker */}
                    <div style={{ position: 'relative' }}>
                        <button className="map-action-btn" onClick={() => setShowMapViewMenu(prev => !prev)} title="Change Map View">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                                <polyline points="2 17 12 22 22 17"/>
                                <polyline points="2 12 12 17 22 12"/>
                            </svg>
                        </button>
                        {showMapViewMenu && (
                            <div style={{
                                position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                                background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(20px)',
                                WebkitBackdropFilter: 'blur(20px)', borderRadius: 12,
                                border: '1px solid rgba(0,0,0,0.06)',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                                padding: '4px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 130, zIndex: 100
                            }}>
                                {[{key:'street',label:'Street',icon:'🗺️'},{key:'satellite',label:'Satellite',icon:'🛰️'},{key:'hybrid',label:'Hybrid',icon:'🌍'}].map(({key,label,icon}) => (
                                    <button key={key} onClick={() => { setMapMode(key); setShowMapViewMenu(false); }}
                                        style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', borderRadius:8, border:'none',
                                            background: mapMode===key ? (isDarkMode ? 'rgba(10,132,255,0.15)' : 'rgba(0,132,255,0.1)') : 'transparent',
                                            color: mapMode===key ? 'var(--brand-primary)' : (isDarkMode ? '#aaa' : '#444'), cursor:'pointer', fontSize:12, fontWeight: mapMode===key?700:500, fontFamily:'inherit', width:'100%' }}>
                                        <span style={{fontSize:14}}>{icon}</span>{label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    <div className="location-info-wrapper">

                        <h2 className="location-title">
                            {locationName}
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 3 }}>
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </h2>
                        <div className="secure-badge">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#30d158" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                <polyline points="9 11 11 13 15 9"></polyline>
                            </svg>
                            <span>Your location is private &amp; secure</span>
                        </div>
                    </div>

                    {/* Right Action Buttons */}
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {/* 💎 Discovery Filters Button */}
                        <button 
                            className="map-action-btn" 
                            onClick={() => {
                                if (currentUser?.subscription_tier === 'diamond') {
                                    setShowDiamondFilterPanel(true);
                                } else {
                                    setShowDiamondUpgradeModal(true);
                                }
                            }} 
                            title="Discovery Filters"
                            style={{
                                position: 'relative',
                                background: diamondFilters.enabled ? 'rgba(0, 212, 255, 0.18)' : undefined,
                                borderColor: diamondFilters.enabled ? '#00d4ff' : undefined
                            }}
                        >
                            <span style={{ fontSize: '15px' }}>💎</span>
                            {diamondFilters.enabled && (
                                <span style={{
                                    position: 'absolute', top: '2px', right: '2px',
                                    width: '7px', height: '7px', borderRadius: '50%',
                                    background: '#00d4ff', boxShadow: '0 0 8px #00d4ff'
                                }} />
                            )}
                        </button>

                        {/* Floating Thought Button */}
                        <button className="map-action-btn" onClick={() => handleOpenThoughtInput()} title="Set Floating Thought">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF2D55" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                <path d="M8 10h.01M12 10h.01M16 10h.01"/>
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="search-bar-wrapper">
                    <div className="search-bar-container">
                        <svg className="search-icon" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <input 
                            type="text" 
                            placeholder="Search people or places..." 
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
                                        <div className={`search-result-avatar-container ${
                                            user.subscription_tier === 'silver' ? 'avatar-ring-silver' :
                                            user.subscription_tier === 'gold' ? 'avatar-ring-gold' :
                                            user.subscription_tier === 'diamond' ? 'avatar-ring-diamond' : ''
                                        }`} style={{ 
                                            width: '28px', 
                                            height: '28px', 
                                            padding: user.subscription_tier && user.subscription_tier !== 'free' ? '1.5px' : '0px', 
                                            borderRadius: '50%', 
                                            marginRight: '10px', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center',
                                            flexShrink: 0
                                        }}>
                                            <img 
                                                src={getAvatar2D(user.avatar)} 
                                                alt={user.name} 
                                                style={{ 
                                                    width: '100%', 
                                                    height: '100%', 
                                                    borderRadius: '50%', 
                                                    objectFit: 'cover' 
                                                }} 
                                            />
                                        </div>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                            {user.name}
                                            {user.subscription_tier === 'silver' && <span style={{ fontSize: '0.8rem' }} title="Silver Member">🥈</span>}
                                            {user.subscription_tier === 'gold' && <span style={{ fontSize: '0.8rem' }} title="Gold Member">🥇</span>}
                                            {user.subscription_tier === 'diamond' && <span style={{ fontSize: '0.8rem' }} title="Diamond Member">💎</span>}
                                        </span>
                                    </div>
                                )) }
                            </div>
                        )}
                    </div>
                </div>
            </div>


            <style>{`
                .map-header-controls {
                    position: fixed;
                    top: 0;
                    padding-top: max(4px, env(safe-area-inset-top));
                    left: 0; right: 0;
                    z-index: 9000;
                    padding-left: 12px; 
                    padding-right: 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    pointer-events: none;
                    padding-bottom: 4px;
                    background: rgba(248, 247, 255, 0.94);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border-bottom: 1px solid rgba(124, 58, 237, 0.08);
                }

                .map-header-top-nav {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    width: 100%;
                    pointer-events: auto;
                    margin-bottom: 1px;
                }
                .map-action-btn {
                    width: 34px;
                    height: 34px;
                    background: #ffffff;
                    border: none;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.07);
                    transition: transform 0.18s;
                    flex-shrink: 0;
                }
                .map-action-btn:active {
                    transform: scale(0.93);
                }
                .location-info-wrapper {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                }
                .location-subtitle {
                    font-size: 0.6rem;
                    color: #888888;
                    font-weight: 500;
                    letter-spacing: -0.1px;
                }
                .location-title {
                    font-size: 0.84rem;
                    font-weight: 700;
                    color: #000000;
                    margin: 0px;
                    display: flex;
                    align-items: center;
                    cursor: default;
                    line-height: 1.2;
                }
                .secure-badge {
                    display: flex;
                    align-items: center;
                    gap: 2px;
                    font-size: 0.58rem;
                    color: #888888;
                    font-weight: 500;
                }
                .high-five-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    background: #ffffff;
                    border: none;
                    border-radius: 14px;
                    padding: 8px 12px;
                    cursor: pointer;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
                    transition: transform 0.2s;
                }
                .high-five-btn:active {
                    transform: scale(0.95);
                }
                .high-five-btn .emoji {
                    font-size: 1rem;
                }
                .high-five-btn .count {
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: #7C3AED;
                }

                /* Search Bar Wrapper & Overrides */
                .search-bar-wrapper {
                    width: 100%;
                    pointer-events: auto;
                    margin-top: 0px;
                }
                .search-bar-wrapper .search-bar-container {
                    display: flex;
                    align-items: center;
                    padding: 0 10px;
                    border-radius: 100px;
                    height: 34px;
                    background: #ffffff;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
                    border: 1px solid rgba(0, 0, 0, 0.04);
                    gap: 8px;
                    width: 100%;
                    box-sizing: border-box;
                }
                .search-bar-wrapper .search-bar-container input {
                    flex: 1;
                    border: none;
                    background: transparent;
                    outline: none;
                    font-size: 0.82rem;
                    color: #000000;
                    font-weight: 500;
                }
                .search-bar-wrapper .search-bar-container input::placeholder {
                    color: #999999;
                }
                .search-bar-wrapper .search-icon {
                    color: #777777;
                    display: flex;
                    align-items: center;
                    flex-shrink: 0;
                }
                .search-filter-btn {
                    background: none;
                    border: none;
                    color: var(--brand-primary);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    padding: 6px;
                    flex-shrink: 0;
                }
                
                /* Dark Mode Adaptations for Header */
                html[data-theme="dark"] .menu-burger-btn,
                html[data-theme="dark"] .high-five-btn,
                html[data-theme="dark"] .search-bar-wrapper .search-bar-container {
                    background: rgba(28, 28, 30, 0.9) !important;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2) !important;
                    border-color: rgba(255, 255, 255, 0.08) !important;
                }
                html[data-theme="dark"] .location-title {
                    color: #ffffff !important;
                }
                html[data-theme="dark"] .location-subtitle,
                html[data-theme="dark"] .secure-badge {
                    color: #a0a0a5 !important;
                }
                html[data-theme="dark"] .search-bar-wrapper .search-bar-container input {
                    color: #ffffff !important;
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
                    background: #7C3AED;
                    color: white;
                    border-color: #7C3AED;
                    box-shadow: 0 4px 12px rgba(124, 58, 237, 0.35);
                }

                /* New premium capsule filter chips matching mockup */
                .filter-chip-new {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 16px;
                    white-space: nowrap;
                    font-size: 13px;
                    font-weight: 600;
                    color: #333333;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
                    border: 1.5px solid rgba(0, 0, 0, 0.07);
                    background: #ffffff;
                    border-radius: 100px;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
                    flex-shrink: 0;
                }
                .filter-chip-new:active {
                    transform: scale(0.96);
                }
                .filter-chip-icon {
                    font-size: 15px;
                    line-height: 1;
                }
                .filter-chip-label {
                    font-size: 13px;
                    font-weight: 600;
                }
                .filter-chip-active {
                    background: #7C3AED !important;
                    color: #ffffff !important;
                    border-color: #7C3AED !important;
                    box-shadow: 0 4px 14px rgba(124, 58, 237, 0.4) !important;
                }

                /* Dark mode filter chips */
                html[data-theme="dark"] .filter-chip-new {
                    background: rgba(28, 28, 30, 0.9) !important;
                    color: #e0e0e0 !important;
                    border-color: rgba(255, 255, 255, 0.1) !important;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2) !important;
                }
                html[data-theme="dark"] .filter-chip-active {
                    background: #7C3AED !important;
                    color: #ffffff !important;
                    border-color: #7C3AED !important;
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
                <ReportModal 
                    targetUser={reportTarget} 
                    onClose={() => {
                        setShowReportModal(false);
                        setReportTarget(null);
                    }}
                    onSuccess={(name) => {
                        showToast(`⚠️ Reported ${name}`);
                        setShowReportModal(false);
                        setReportTarget(null);
                    }}
                    onError={(msg) => showToast(msg)}
                />
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
                    <div 
                        className="new-thought-card" 
                        style={{ 
                            position: 'relative', 
                            background: isDarkMode ? 'rgba(24, 24, 32, 0.96)' : 'rgba(255, 255, 255, 0.98)', 
                            color: isDarkMode ? '#fff' : '#1c1c1e', 
                            border: isDarkMode ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.08)', 
                            maxWidth: '390px', 
                            width: '92%', 
                            maxHeight: '85vh', 
                            overflowY: 'auto', 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '18px', 
                            borderRadius: '28px', 
                            padding: '24px',
                            backdropFilter: 'blur(24px) saturate(180%)',
                            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                            boxShadow: isDarkMode 
                                ? '0 24px 60px rgba(0,0,0,0.7), 0 0 40px rgba(0, 212, 255, 0.12)' 
                                : '0 24px 60px rgba(0,0,0,0.14), 0 10px 30px rgba(0, 114, 255, 0.08)'
                        }} 
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Close button */}
                        <button 
                            type="button" 
                            onClick={() => setShowDiamondFilterPanel(false)} 
                            style={{ 
                                position: 'absolute', top: '18px', right: '18px',
                                width: '32px', height: '32px', borderRadius: '50%',
                                border: 'none',
                                background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                                color: isDarkMode ? '#aaa' : '#666',
                                fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', transition: 'all 0.15s ease'
                            }}
                        >
                            &times;
                        </button>
                        
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{ 
                                width: '46px', height: '46px', borderRadius: '16px', 
                                background: 'linear-gradient(135deg, #00C6FF 0%, #0072FF 50%, #7F00FF 100%)', 
                                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                fontSize: '1.5rem', boxShadow: '0 6px 18px rgba(0, 114, 255, 0.4)',
                                flexShrink: 0
                            }}>
                                💎
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <h3 style={{ color: isDarkMode ? '#fff' : '#1c1c1e', fontSize: '1.3rem', fontWeight: '800', margin: 0, letterSpacing: '-0.02em' }}>Discovery Filters</h3>
                                <div>
                                    <span style={{ 
                                        display: 'inline-block',
                                        background: isDarkMode ? 'rgba(0, 212, 255, 0.12)' : 'rgba(0, 114, 255, 0.08)', 
                                        color: isDarkMode ? '#00d4ff' : '#0066FF', 
                                        padding: '2px 10px', 
                                        borderRadius: '12px', 
                                        fontSize: '0.76rem', 
                                        fontWeight: '700' 
                                    }}>
                                        Showing {filteredUsers.length} users
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            {/* 1. Gender Filter */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: '800', color: isDarkMode ? 'rgba(255,255,255,0.5)' : '#6e6e73', textTransform: 'uppercase', letterSpacing: '0.08em' }}>🚻 Gender</label>
                                <div style={{ 
                                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px',
                                    background: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                                    padding: '4px', borderRadius: '16px',
                                    border: isDarkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.04)'
                                }}>
                                    {['Everyone', 'Men', 'Women', 'Other'].map(opt => {
                                        const isSelected = (diamondFilters.gender || 'Everyone') === opt;
                                        return (
                                            <button
                                                key={opt}
                                                type="button"
                                                onClick={() => setDiamondFilters(prev => ({ ...prev, gender: opt }))}
                                                style={{
                                                    padding: '9px 4px',
                                                    borderRadius: '12px',
                                                    border: 'none',
                                                    background: isSelected 
                                                        ? (isDarkMode ? 'linear-gradient(135deg, #00C6FF, #0072FF)' : 'linear-gradient(135deg, #0072FF, #00C6FF)')
                                                        : 'transparent',
                                                    color: isSelected ? '#fff' : (isDarkMode ? '#ccc' : '#444'),
                                                    fontWeight: isSelected ? '700' : '600',
                                                    fontSize: '0.8rem',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                                                    boxShadow: isSelected ? '0 4px 12px rgba(0, 114, 255, 0.35)' : 'none'
                                                }}
                                            >
                                                {opt}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 2. Age Range Filter */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: '800', color: isDarkMode ? 'rgba(255,255,255,0.5)' : '#6e6e73', textTransform: 'uppercase', letterSpacing: '0.08em' }}>🎂 Age Range</label>
                                    <span style={{ fontSize: '0.82rem', color: isDarkMode ? '#00d4ff' : '#0066FF', fontWeight: '700' }}>{diamondFilters.ageMin || 18} – {diamondFilters.ageMax || 99} yrs</span>
                                </div>
                                {/* Preset Range Pills */}
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {[
                                        { label: 'All', min: 18, max: 99 },
                                        { label: '18–22', min: 18, max: 22 },
                                        { label: '23–27', min: 23, max: 27 },
                                        { label: '28–35', min: 28, max: 35 },
                                        { label: '35+', min: 35, max: 99 },
                                    ].map(preset => {
                                        const isSelected = diamondFilters.ageMin === preset.min && diamondFilters.ageMax === preset.max;
                                        return (
                                            <button
                                                key={preset.label}
                                                type="button"
                                                onClick={() => setDiamondFilters(prev => ({ ...prev, ageMin: preset.min, ageMax: preset.max }))}
                                                style={{
                                                    padding: '7px 13px',
                                                    borderRadius: '20px',
                                                    border: isSelected 
                                                        ? (isDarkMode ? '1.5px solid #00d4ff' : '1.5px solid #0066FF')
                                                        : (isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)'),
                                                    background: isSelected 
                                                        ? (isDarkMode ? 'rgba(0, 212, 255, 0.18)' : 'rgba(0, 114, 255, 0.12)')
                                                        : (isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'),
                                                    color: isSelected 
                                                        ? (isDarkMode ? '#00d4ff' : '#0066FF')
                                                        : (isDarkMode ? '#ccc' : '#555'),
                                                    fontWeight: isSelected ? '700' : '600',
                                                    fontSize: '0.78rem',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                {preset.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                {/* Custom Range Inputs */}
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '2px' }}>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span style={{ fontSize: '0.7rem', color: isDarkMode ? '#888' : '#777', fontWeight: '600' }}>Min Age</span>
                                        <input 
                                            type="number" 
                                            min={18} max={99}
                                            value={diamondFilters.ageMin || 18}
                                            onChange={e => setDiamondFilters(prev => ({ ...prev, ageMin: Math.max(18, parseInt(e.target.value) || 18) }))}
                                            style={{ 
                                                width: '100%', padding: '10px', borderRadius: '14px', 
                                                background: isDarkMode ? 'rgba(255,255,255,0.06)' : '#ffffff', 
                                                color: isDarkMode ? '#fff' : '#1c1c1e', 
                                                border: isDarkMode ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.12)', 
                                                boxShadow: isDarkMode ? 'none' : '0 2px 6px rgba(0,0,0,0.04)',
                                                textAlign: 'center', outline: 'none', fontWeight: '700', fontSize: '0.95rem' 
                                            }}
                                        />
                                    </div>
                                    <span style={{ color: isDarkMode ? '#666' : '#999', marginTop: '16px', fontWeight: '700' }}>–</span>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span style={{ fontSize: '0.7rem', color: isDarkMode ? '#888' : '#777', fontWeight: '600' }}>Max Age</span>
                                        <input 
                                            type="number" 
                                            min={18} max={99}
                                            value={diamondFilters.ageMax || 99}
                                            onChange={e => setDiamondFilters(prev => ({ ...prev, ageMax: Math.min(99, parseInt(e.target.value) || 99) }))}
                                            style={{ 
                                                width: '100%', padding: '10px', borderRadius: '14px', 
                                                background: isDarkMode ? 'rgba(255,255,255,0.06)' : '#ffffff', 
                                                color: isDarkMode ? '#fff' : '#1c1c1e', 
                                                border: isDarkMode ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.12)', 
                                                boxShadow: isDarkMode ? 'none' : '0 2px 6px rgba(0,0,0,0.04)',
                                                textAlign: 'center', outline: 'none', fontWeight: '700', fontSize: '0.95rem' 
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* 3. Movement Filter */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: '800', color: isDarkMode ? 'rgba(255,255,255,0.5)' : '#6e6e73', textTransform: 'uppercase', letterSpacing: '0.08em' }}>🚶 Movement</label>
                                <div style={{ 
                                    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px',
                                    background: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                                    padding: '4px', borderRadius: '16px',
                                    border: isDarkMode ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.04)'
                                }}>
                                    {[
                                        { label: 'Everyone', value: 'Everyone' },
                                        { label: 'Moving 🏃', value: 'Moving' },
                                        { label: 'Stationary 📍', value: 'Stationary' }
                                    ].map(m => {
                                        const isSelected = (diamondFilters.movement || 'Everyone') === m.value;
                                        return (
                                            <button
                                                key={m.value}
                                                type="button"
                                                onClick={() => setDiamondFilters(prev => ({ ...prev, movement: m.value }))}
                                                style={{
                                                    padding: '10px 4px',
                                                    borderRadius: '12px',
                                                    border: 'none',
                                                    background: isSelected 
                                                        ? (isDarkMode ? 'linear-gradient(135deg, #00C6FF, #0072FF)' : 'linear-gradient(135deg, #0072FF, #00C6FF)')
                                                        : 'transparent',
                                                    color: isSelected ? '#fff' : (isDarkMode ? '#ccc' : '#444'),
                                                    fontWeight: isSelected ? '700' : '600',
                                                    fontSize: '0.78rem',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                                                    boxShadow: isSelected ? '0 4px 12px rgba(0, 114, 255, 0.35)' : 'none'
                                                }}
                                            >
                                                {m.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Footer Buttons */}
                        <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
                            <button 
                                type="button"
                                onClick={() => {
                                    const resetState = {
                                        gender: 'Everyone',
                                        ageMin: 18,
                                        ageMax: 99,
                                        movement: 'Everyone',
                                        enabled: false
                                    };
                                    setDiamondFilters(resetState);
                                    try { localStorage.setItem('diamond_discovery_filters', JSON.stringify(resetState)); } catch (e) {}
                                    setShowDiamondFilterPanel(false);
                                    showToast("Filters reset! 🔓");
                                }}
                                style={{ 
                                    flex: 1, padding: '14px', borderRadius: '16px', 
                                    background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', 
                                    color: isDarkMode ? '#ccc' : '#444', 
                                    border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.08)', 
                                    fontWeight: '700', cursor: 'pointer', fontSize: '0.9rem',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                Reset
                            </button>
                            <button 
                                type="button"
                                onClick={() => {
                                    const nextState = { ...diamondFilters, enabled: true };
                                    setDiamondFilters(nextState);
                                    try { localStorage.setItem('diamond_discovery_filters', JSON.stringify(nextState)); } catch (e) {}
                                    setShowDiamondFilterPanel(false);
                                    showToast("Discovery filters applied! 🎯");
                                }}
                                style={{ 
                                    flex: 1.5, padding: '14px', borderRadius: '16px', 
                                    background: 'linear-gradient(135deg, #00C6FF 0%, #0072FF 50%, #7F00FF 100%)', 
                                    color: '#fff', border: 'none', fontWeight: '800', 
                                    cursor: 'pointer', fontSize: '0.92rem', 
                                    boxShadow: '0 6px 20px rgba(0, 114, 255, 0.4)',
                                    transition: 'transform 0.15s ease, boxShadow 0.15s ease'
                                }}
                            >
                                Apply Filters
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Premium Upgrade Modal for Non-Diamond Users */}
            {showDiamondUpgradeModal && (
                <div className="thought-input-overlay" onClick={() => setShowDiamondUpgradeModal(false)}>
                    <div 
                        className="new-thought-card" 
                        style={{ 
                            position: 'relative', 
                            background: isDarkMode ? 'rgba(24, 24, 32, 0.96)' : 'rgba(255, 255, 255, 0.98)', 
                            color: isDarkMode ? '#fff' : '#1c1c1e', 
                            border: isDarkMode ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.08)', 
                            maxWidth: '360px', 
                            width: '90%', 
                            textAlign: 'center', 
                            display: 'flex', 
                            flexDirection: 'column', 
                            alignItems: 'center', 
                            gap: '18px', 
                            borderRadius: '28px', 
                            padding: '28px 24px',
                            backdropFilter: 'blur(24px) saturate(180%)',
                            WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                            boxShadow: isDarkMode 
                                ? '0 24px 60px rgba(0,0,0,0.7), 0 0 40px rgba(0, 212, 255, 0.15)' 
                                : '0 24px 60px rgba(0,0,0,0.14), 0 10px 30px rgba(0, 114, 255, 0.08)'
                        }} 
                        onClick={e => e.stopPropagation()}
                    >
                        <button 
                            type="button" 
                            onClick={() => setShowDiamondUpgradeModal(false)} 
                            style={{ 
                                position: 'absolute', top: '18px', right: '18px',
                                width: '32px', height: '32px', borderRadius: '50%',
                                border: 'none',
                                background: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                                color: isDarkMode ? '#aaa' : '#666',
                                fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer'
                            }}
                        >
                            &times;
                        </button>
                        
                        <div style={{ 
                            width: '64px', height: '64px', borderRadius: '22px', 
                            background: 'linear-gradient(135deg, #00C6FF 0%, #0072FF 50%, #7F00FF 100%)', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', 
                            fontSize: '2rem', boxShadow: '0 8px 25px rgba(0, 114, 255, 0.45)' 
                        }}>
                            💎
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <h3 style={{ fontSize: '1.35rem', fontWeight: '800', margin: 0, color: isDarkMode ? '#fff' : '#1c1c1e', letterSpacing: '-0.02em' }}>Diamond Feature</h3>
                            <p style={{ fontSize: '0.92rem', color: isDarkMode ? '#aaa' : '#6e6e73', margin: 0, lineHeight: 1.4, fontWeight: '500' }}>
                                Upgrade to Diamond to unlock Advanced Discovery Filters.
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                setShowDiamondUpgradeModal(false);
                                navigate('/subscription');
                            }}
                            style={{ 
                                width: '100%', padding: '14px', borderRadius: '16px', 
                                background: 'linear-gradient(135deg, #00C6FF 0%, #0072FF 50%, #7F00FF 100%)', 
                                color: '#fff', border: 'none', fontWeight: '800', 
                                cursor: 'pointer', fontSize: '0.95rem', 
                                boxShadow: '0 6px 20px rgba(0, 114, 255, 0.45)' 
                            }}
                        >
                            Unlock Diamond Filters
                        </button>
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

                            {/* Premium Thought Style selection (Silver and above) */}
                            {currentUser?.subscription_tier && currentUser?.subscription_tier !== 'free' ? (
                                <div className="setting-section">
                                    <label className="setting-label">Premium Theme</label>
                                    <div className="theme-circles-row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                                        {[
                                            { name: 'Default', value: 'default' },
                                            { name: 'Purple Glow', value: 'purple' },
                                            { name: 'Neon Blue', value: 'blue' },
                                            { name: 'Glassmorphism', value: 'glass' },
                                            { name: 'Sunset Gradient', value: 'gradient' }
                                        ].map(themeObj => (
                                            <button
                                                key={themeObj.value}
                                                type="button"
                                                className={`theme-chip-btn ${selectedThoughtStyle === themeObj.value ? 'selected' : ''}`}
                                                onClick={() => setSelectedThoughtStyle(themeObj.value)}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '20px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: '600',
                                                    cursor: 'pointer',
                                                    background: selectedThoughtStyle === themeObj.value ? 'rgba(0,132,255,0.15)' : 'rgba(255,255,255,0.05)',
                                                    border: selectedThoughtStyle === themeObj.value ? '1.5px solid #0084ff' : '1.5px solid rgba(255,255,255,0.1)',
                                                    color: selectedThoughtStyle === themeObj.value ? '#0084ff' : '#ccc',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                {themeObj.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="setting-section" style={{ opacity: 0.7, cursor: 'pointer' }} onClick={() => { setShowThoughtInput(false); navigate('/subscription'); }}>
                                    <label className="setting-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        Premium Theme <span style={{ fontSize: '0.8rem' }}>🔒</span>
                                    </label>
                                    <div style={{ fontSize: '0.75rem', color: '#a1a1aa', marginTop: '4px' }}>
                                        Unlock Purple Glow, Glassmorphism, and Gradients with Silver Premium!
                                    </div>
                                </div>
                            )}
                            
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
                    max-height: 92vh;
                    overflow-y: auto;
                    box-sizing: border-box;
                }

                @media (max-width: 480px), (max-height: 720px) {
                    .new-thought-card {
                        padding: 16px;
                        gap: 8px;
                    }
                    .thought-emoji-header {
                        display: none;
                    }
                    .thought-card-title {
                        margin-bottom: 8px;
                        font-size: 1.1rem;
                    }
                    .textarea-container {
                        margin-bottom: 4px;
                    }
                    .thought-textarea {
                        padding: 8px 8px 24px 8px;
                        font-size: 0.9rem;
                    }
                    .setting-section {
                        margin-bottom: 8px;
                        gap: 4px;
                    }
                    .color-circles-row {
                        gap: 6px;
                    }
                    .color-circle-btn {
                        width: 28px;
                        height: 28px;
                    }
                    .privacy-select {
                        padding: 8px 8px 8px 32px;
                        font-size: 0.9rem;
                    }
                    .privacy-select-icon {
                        left: 10px;
                    }
                    .thought-actions.new-actions {
                        margin-top: 12px;
                    }
                    .new-actions button {
                        padding: 10px 16px;
                        font-size: 0.9rem;
                    }
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
