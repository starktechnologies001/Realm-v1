import { MapContainer, TileLayer, Marker, Circle, useMap, LayersControl, LayerGroup } from 'react-leaflet';
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

// Helper: Distance
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371;
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
    const STATUSES = ['Available', 'Busy', 'At Work', 'Online'];
    const RELATIONSHIPS = ['Single 🕺', 'Married 💍', 'Committed 💖', 'It\'s Complicated 🌀'];
    const THOUGHTS = ['Let\'s talk 💬', 'Coffee? ☕', 'Anyone here? 👋', 'Gym? 💪', 'Food run! 🍔'];

    for (let i = 0; i < 20; i++) {
        // Fuzzing: Random offset within 500m
        const latOffset = (Math.random() - 0.5) * 0.01;
        const lngOffset = (Math.random() - 0.5) * 0.01;
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
function RecenterControl({ lat, lng }) {
    const map = useMap();

    const handleRecenter = (e) => {
        e.stopPropagation();
        if (lat && lng) {
            // Zoom level 17 provides a closer view while still showing immediate surroundings
            map.flyTo([lat, lng], 17, { animate: true, duration: 1.5 });
        }
    };

    return (
        <div 
            className="leaflet-bottom leaflet-right" 
            style={{ 
                bottom: 'calc(80px + env(safe-area-inset-bottom))', /* Shifted up to clear BottomNav + Safe Area */
                right: '8px',   /* Shifted right again */
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
                        width: '36px',
                        height: '36px',
                        backgroundColor: '#4285F4', /* Primary Blue */
                        border: 'none',
                        borderRadius: '50%',
                        boxShadow: '0 4px 12px rgba(66, 133, 244, 0.4)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white', /* White Icon */
                        transition: 'all 0.2s ease',
                        padding: 0
                    }}
                    onMouseDown={e => { e.stopPropagation(); e.currentTarget.style.transform = 'scale(0.96)'; }}
                    onMouseUp={e => { e.stopPropagation(); e.currentTarget.style.transform = 'scale(1)'; }}
                    onMouseEnter={e => { 
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(66, 133, 244, 0.5)';
                        e.currentTarget.style.transform = 'scale(1.05)';
                    }}
                    onMouseLeave={e => { 
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(66, 133, 244, 0.4)';
                        e.currentTarget.style.transform = 'scale(1)';
                    }}
                    onDoubleClick={e => e.stopPropagation()}
                >
                    {/* Standard Crosshair/Target Icon */}
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 8C9.79 8 8 9.79 8 12C8 14.21 9.79 16 12 16C14.21 16 16 14.21 16 12C16 9.79 14.21 8 12 8ZM12 19C8.13 19 5 15.87 5 12C5 8.13 8.13 5 12 5C15.87 5 19 8.13 19 12C19 15.87 15.87 19 12 19ZM12 3C7.03 3 3 7.03 3 12C3 16.97 7.03 21 12 21C16.97 21 21 16.97 21 12C21 7.03 16.97 3 12 3Z" fill="currentColor" fillOpacity="0.9"/>
                        <path d="M12 3V1M21 12H23M12 21V23M3 12H1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                </button>
            </div>
        </div>
    );
}

// Component to handle automatic recentering
function RecenterAutomatically({ lat, lng, mapMode }) {
    const map = useMap();
    const hasCentered = useRef(false);

    // Initial Center (with delay to ensure map size is correct on tab switch)
    useEffect(() => {
        if (lat && lng && !hasCentered.current) {
            // Calculate Target Center with Mobile Offset (Visual Center)
            // Use setView (Instant) to prevent flying/flickering on load
            const zoomLevel = 17; // Fits ~300m radius circle nicely on mobile
            let targetLat = lat;
            let targetLng = lng;
            const isMobile = window.innerWidth <= 768;

            if (isMobile) {
                // User requested avatar in exact center
                // We previously offset it, but now we revert to geometric center
                targetLat = lat;
                targetLng = lng;
            }

            // Small timeout to allow map sizing, then SNAP.
            // We use setView(..., { animate: false }) for instant, flicker-free positioning
            const timer = setTimeout(() => {
                 map.setView([targetLat, targetLng], zoomLevel, { animate: false });
                 hasCentered.current = true;
            }, 50); // Reduced delay for snappier feel
            
            return () => clearTimeout(timer);
        }
    }, [lat, lng, map]);

    // Re-center ONLY on Map Mode Switch
    // Remove lat/lng from dependency array to prevent map from moving when user moves/updates location
    useEffect(() => {
        if (lat && lng) {
            map.flyTo([lat, lng], map.getZoom(), { animate: true, duration: 1 });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapMode, map]);

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
                map.setView(newCenter, zoomLevel, {
                    animate: true,
                    duration: 1.2
                });
            }, 100);
        } else {
            // Desktop: Center normally
            console.log('🗺️ [UserSelectionController] Flying to (desktop):', [targetLat, targetLng], 'zoom:', zoomLevel);
            
            setTimeout(() => {
                map.setView([targetLat, targetLng], zoomLevel, {
                    animate: true,
                    duration: 1.2
                });
            }, 100);
        }

    }, [selectedUser, map]);

    return null;
}

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
        loadingLocation, // 🔥 Add this
        startLocation,
        stopLocation,
    } = useLocationContext();

    // Notification State
    const [friendRequests, setFriendRequests] = useState([]);

    // Fetch Notifications
    useEffect(() => {
        const fetchNotifications = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Requests
            const { count: requestCount } = await supabase
                .from('friendships')
                .select('id', { count: 'exact', head: true })
                .eq('receiver_id', user.id)
                .eq('status', 'pending');
            
            if (requestCount !== null) {
                // Mock array for length since we only use .length for badge
                setFriendRequests(new Array(requestCount).fill(0));
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

    // Image Preloader for Instant Rendering
    useEffect(() => {
        if (!nearbyUsers || nearbyUsers.length === 0) return;

        nearbyUsers.forEach(user => {
            if (user.avatar) {
                const img = new Image();
                img.src = getAvatar2D(user.avatar);
            }
        });

        // Also preload current user
        if (currentUser?.avatar_url) {
            const img = new Image();
            img.src = getAvatar2D(currentUser.avatar_url);
        }
    }, [nearbyUsers, currentUser?.avatar_url]);


    // Floating Thought State
    const [showThoughtInput, setShowThoughtInput] = useState(false);
    const [myThought, setMyThought] = useState('');

    // --- Onboarding State ---
    const [showProfileSetup, setShowProfileSetup] = useState(false);
    const [setupData, setSetupData] = useState({ gender: '', status: '', username: '' });
    // New state for modal upload
    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(null);
    const [cropImage, setCropImage] = useState(null); // State for cropping
    const [onboardingImage, setOnboardingImage] = useState(null);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const videoRef = React.useRef(null);
    const canvasRef = React.useRef(null);

    // Check Profile Completeness
    useEffect(() => {
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return; // handled by other effect

            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            // Bypass if locally flagged as complete (immediate fix for loop)
            const setupCompleteLocal = localStorage.getItem('setup_complete') === 'true';

            if (profile) {
                // Safety Net: Trigger modal ONLY if critical info is missing (Gender/Status)
                // This covers OAuth users who haven't set up.
                // Manual signup users (who have gender/status) are skipped, even if they have default avatar.
                if (!profile.gender || !profile.status) {
                    console.log("⚠️ Incomplete profile detected (missing gender/status), opening setup modal.");
                    setSetupData({
                        username: profile.username,
                        gender: profile.gender || '',
                        status: profile.status || ''
                    });
                    setShowProfileSetup(true);
                }

                setCurrentUser(profile);
            }

            if (setupCompleteLocal) {
                // Still potentially fix critical data silently, but don't block
            } else if (profile) {
                // 1. Silently fix missing username (common with OAuth)
                if (!profile.username) {
                    const baseName = (profile.full_name || 'user').replace(/\s+/g, '_').toLowerCase().replace(/[^a-z0-9_]/g, '');
                    const newUsername = `${baseName}_${Math.floor(1000 + Math.random() * 9000)}`;

                    await supabase.from('profiles').update({ username: newUsername }).eq('id', profile.id);

                    // Update connection to avoid race condition in next check
                    profile.username = newUsername;

                    if (currentUser?.id === profile.id) {
                        const updated = { ...currentUser, username: newUsername };
                        setCurrentUser(updated);
                        localStorage.setItem('currentUser', JSON.stringify(updated));
                    }
                }

                // 2. Check VISIBLE mandatory fields (Gender, Status)
                if (!profile.gender || !profile.status) {
                    const baseName = (profile.full_name || 'user').replace(/\s+/g, '_').toLowerCase().replace(/[^a-z0-9_]/g, '');
                    const defaultUsername = `${baseName}_${Math.floor(1000 + Math.random() * 9000)}`;

                    setSetupData({
                        gender: profile.gender || '',
                        status: profile.status || '',
                        username: profile.username || defaultUsername
                    });
                    setShowProfileSetup(true);
                    setLoading(false);
                }

                // 2.5 Priority Self-Healing: Restore uploaded avatar if Profile reverted to default
                const metaAvatar = user.user_metadata?.avatar_url;
                const profileAvatar = profile.avatar_url;

                if (metaAvatar && metaAvatar.startsWith('http') && (!profileAvatar || profileAvatar.startsWith('/defaults/') || profileAvatar.includes('dicebear'))) {
                    console.log("🚑 [MapHome] Healing avatar mismatch...", { metaAvatar, profileAvatar });

                    // Update DB
                    await supabase.from('profiles').update({ avatar_url: metaAvatar }).eq('id', profile.id);

                    // Update Local immediately so UI reflects it
                    profile.avatar_url = metaAvatar;
                    if (profile.id === currentUser?.id) {
                        const updated = { ...currentUser, avatar_url: metaAvatar };
                        setCurrentUser(updated);
                        localStorage.setItem('currentUser', JSON.stringify(updated));
                    }
                }

                // Check if user needs a new avatar
                // Assign avatar if:
                // 1. No avatar exists
                // 2. Has Google profile picture (OAuth users)
                // 3. Has old/invalid avatar system
                else if (!profile.avatar_url ||
                    profile.avatar_url.includes('googleusercontent.com') ||
                    profile.avatar_url.includes('lh3.googleusercontent.com')) {

                    // Generate specific default avatar based on gender (User Request)
                    const gender = profile.gender || 'Other';
                    let newAvatar;

                    if (gender === 'Male') {
                        newAvatar = '/defaults/male_avatar.jpg';
                    } else if (gender === 'Female') {
                        newAvatar = '/defaults/female_avatar.jpg';
                    } else {
                        const baseName = (profile.username || profile.full_name || 'user').replace(/\s+/g, '_').toLowerCase();
                        newAvatar = `https://api.dicebear.com/9.x/adventurer/svg?seed=${baseName}_${Math.floor(Math.random() * 1000)}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
                    }

                    // Auto-save immediately
                    await supabase.from('profiles')
                        .update({ avatar_url: newAvatar })
                        .eq('id', profile.id);

                    // Update local state if current user
                    if (profile.id === currentUser?.id) {
                        const updated = { ...currentUser, avatar_url: newAvatar };
                        setCurrentUser(updated);
                        localStorage.setItem('currentUser', JSON.stringify(updated));
                    }

                    // Update profile ref for UI
                    profile.avatar_url = newAvatar;
                }
            }
        };
        checkUser();
    }, []);

    // Global Unread Count Logic
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (!currentUser) return;

        // Fetch initial count
        const fetchUnread = async () => {
            const { count, error } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
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

                // CASE 1: DELETE (Unfriend)
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
                    return;
                }

                // Identify partner for INSERT/UPDATE
                const relevantId = newRec?.requester_id === currentUser.id ? newRec.receiver_id
                    : newRec?.receiver_id === currentUser.id ? newRec.requester_id
                        : null;

                if (!relevantId) return;

                // CASE 2: BLOCKED
                if (newRec?.status === 'blocked') {
                    window.location.reload();
                    return;
                }

                // CASE 3: ACCEPTED
                if (newRec?.status === 'accepted') {
                    friendshipsRef.current.set(newRec.id, relevantId); // Cache it
                    showToast(`Friend request accepted! 🎉`);
                    setSelectedUser(prev => prev && prev.id === relevantId ? { ...prev, friendshipStatus: 'accepted' } : prev);
                    setNearbyUsers(prev => prev.map(u => u.id === relevantId ? { ...u, friendshipStatus: 'accepted' } : u));
                }

                // CASE 4: PENDING (New Poke)
                if (newRec?.status === 'pending') {
                    friendshipsRef.current.set(newRec.id, relevantId); // Cache it

                    const isIncoming = newRec.receiver_id === currentUser.id;
                    if (isIncoming) {
                        showToast(`New Poke received! 👋`);
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

        return () => {
            supabase.removeChannel(channel);
            supabase.removeChannel(friendshipChannel);
        };
    }, [currentUser, userLocation]);

    // Poll for nearby users
    useEffect(() => {
        if (!currentUser) return; // Wait for user, but don't need location to fetch others

        const fetchNearbyUsers = async () => {
            try {
                // Fetch blocked user IDs (both directions - users I blocked and users who blocked me)
                const [blockedByMe, blockedMe] = await Promise.all([
                    getBlockedUserIds(currentUser.id),  // Users I blocked
                    getBlockerIds(currentUser.id)        // Users who blocked me
                ]);

                // Combine both lists for mutual hiding
                const allBlockedIds = new Set([...blockedByMe, ...blockedMe]);
                blockedIdsRef.current = allBlockedIds; // Update Ref for real-time subscriptions

                // Run queries in parallel for faster loading
                const [profilesResult, friendshipResult, storiesResult, viewsResult] = await Promise.all([
                    // Fetch all profiles with only needed fields
                    supabase
                        .from('profiles')
                        .select('id, username, full_name, gender, latitude, longitude, status, status_message, status_updated_at, last_active, avatar_url, hide_status, show_last_seen, is_public, is_location_on')
                        .neq('id', currentUser.id)
                        .eq('is_ghost_mode', false) // 🔥 Hide if ghost mode
                        .eq('is_location_on', true) // 🔥 Strict: Hide if location off or null
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

                // Populate friendships map
                const myFriendships = new Map();

                if (friendshipResult.data) {
                    friendshipResult.data.forEach(f => {
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
                    viewsResult.data ? viewsResult.data.map(v => v.story_id) : []
                );

                if (storiesResult.data) {
                    // Group stories by user
                    const storiesByUser = {};
                    storiesResult.data.forEach(s => {
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

                // Filter and map users (exclude blocked users, those with location off, AND current user)
                const validUsers = profilesResult.data
                    .filter(u => !allBlockedIds.has(u.id) && u.id !== currentUser.id && u.is_location_on !== false)
                    .map(u => {
                        // Use actual avatar if available, otherwise gender-based fallback
                        const safeName = encodeURIComponent(u.username || u.full_name || 'User');
                        // Standardized Fallback Logic (No DiceBear)
                        let fallbackAvatar;
                        if (u.gender === 'Male') fallbackAvatar = DEFAULT_MALE_AVATAR;
                        else if (u.gender === 'Female') fallbackAvatar = DEFAULT_FEMALE_AVATAR;
                        else fallbackAvatar = DEFAULT_GENERIC_AVATAR;

                        // Micro-jitter for initial load
                        const renderLat = u.latitude + (Math.random() - 0.5) * 0.0002;
                        const renderLng = u.longitude + (Math.random() - 0.5) * 0.0002;

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
                            thought: statusMessage,
                            lastActive: u.last_active,
                            isLocationOn: u.is_location_on,
                            isLocationShared: true,
                            friendshipStatus: fData?.status || null,
                            friendshipId: fData?.id || null,
                            is_public: u.is_public,
                            // PRIVACY CHECK: Only show story if public OR friends
                            hasStory: usersWithStories.has(u.id) && (u.is_public !== false || fData?.status === 'accepted'),
                            hasUnseenStory: usersWithUnseenStories.has(u.id) && (u.is_public !== false || fData?.status === 'accepted')
                        };
                    });

                setNearbyUsers(validUsers);
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
                if (updatedUser.id === currentUser.id) return; // Skip self

                // FILTER BLOCKED USERS
                if (blockedIdsRef.current.has(updatedUser.id)) {
                    // Start removing them if they are currently on map
                    setNearbyUsers(prev => prev.filter(u => u.id !== updatedUser.id));
                    return;
                }

                // Check visibility criteria
                const hasLocation = updatedUser.latitude && updatedUser.longitude;
                const isVisible = !updatedUser.is_ghost_mode && hasLocation && updatedUser.is_location_on === true;

                setNearbyUsers(prev => {
                    const existingIndex = prev.findIndex(u => u.id === updatedUser.id);
                    const exists = existingIndex !== -1;

                    if (isVisible) {
                        // Prepare consistent avatar logic
                        let mapAvatar = getAvatar2D(updatedUser.avatar_url);

                        // Use EXACT coordinates for smooth updates (No Jitter on updates)
                        const renderLat = updatedUser.latitude;
                        const renderLng = updatedUser.longitude;

                        const newUserObj = {
                            id: updatedUser.id,
                            name: updatedUser.username || 'User',
                            lat: renderLat,
                            lng: renderLng,
                            avatar: mapAvatar,
                            originalAvatar: updatedUser.avatar_url,
                            status: updatedUser.status,
                            thought: updatedUser.status_message,
                            lastActive: updatedUser.last_active,
                            isLocationShared: true,
                            is_public: updatedUser.is_public,
                            friendshipStatus: exists ? prev[existingIndex].friendshipStatus : null, // Preserve local friendship state
                            // Preserve story state but re-check privacy (e.g. if user went private)
                            hasStory: exists ? (prev[existingIndex].hasStory && (updatedUser.is_public !== false || prev[existingIndex].friendshipStatus === 'accepted')) : false,
                            hasUnseenStory: exists ? (prev[existingIndex].hasUnseenStory && (updatedUser.is_public !== false || prev[existingIndex].friendshipStatus === 'accepted')) : false
                        };

                        if (exists) {
                            // Update existing user
                            const newUsers = [...prev];
                            newUsers[existingIndex] = { ...newUsers[existingIndex], ...newUserObj };
                            return newUsers;
                        } else {
                            // Add new user
                            return [...prev, newUserObj];
                        }
                    } else {
                        // User should not be visible (ghost mode or no location)
                        if (exists) {
                            return prev.filter(u => u.id !== updatedUser.id); // Remove
                        }
                        return prev; // Do nothing
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
                if (!newUser.is_ghost_mode && newUser.is_location_on !== false) {
                    // Preload Image Immediately
                    const mapAvatar = getAvatar2D(newUser.avatar_url);

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
                            lat: newUser.latitude,
                            lng: newUser.longitude,
                            avatar: mapAvatar,
                            originalAvatar: newUser.avatar_url,
                            status: newUser.status,
                            thought: newUser.status_message,
                            lastActive: newUser.last_active,
                            isLocationOn: true,
                            isLocationShared: true,
                            is_public: newUser.is_public,
                            friendshipStatus: null, // Default
                            hasStory: false,
                            hasUnseenStory: false
                        }];
                    });
                }
            })
            // Real-time Story Updates (Ring Indicator)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stories' }, (payload) => {
                const story = payload.new;
                setNearbyUsers(prev => prev.map(u => {
                    if (u.id === story.user_id) {
                        // Check privacy before showing ring
                        const isFriend = u.friendshipStatus === 'accepted';
                        const isPublic = u.is_public !== false;
                        if (isFriend || isPublic) {
                            return { ...u, hasStory: true, hasUnseenStory: true };
                        }
                    }
                    return u;
                }));
            })
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
        const userStr = localStorage.getItem('currentUser');
        if (!userStr) {
            navigate('/login');
            return;
        }
        const parsedUser = JSON.parse(userStr);
        // Optimistically set from cache first
        setCurrentUser(parsedUser);

        // FETCH FRESH PROFILE (Critical for syncing Gender/Avatar updates)
        const refreshProfile = async () => {
            const { data: freshProfile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', parsedUser.id)
                .single();

            if (freshProfile) {
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
                        finalAvatarUrl = parsedUser.avatar_url; // Keep optimistic local version
                    }
                }

                const mergedUser = { ...parsedUser, ...freshProfile, avatar_url: finalAvatarUrl };
                // Ensure we map snake_case DB fields to camelCase if needed, 
                // but looks like we use mixed. Let's standardize on DB structure + local adds

                // Optimistically set location from DB to prevent "Acquiring Location" lag
                // Note: Real-time location is handled by LocationContext
                if (freshProfile.latitude && freshProfile.longitude && !userLocation) {
                    // We could potentially seed the context here if needed, but Context handles its own startup
                    // promoting separation of concerns.
                }

                setCurrentUser(mergedUser);
                localStorage.setItem('currentUser', JSON.stringify(mergedUser));
            }
            setLoading(false); // Fix: dismiss loading screen as soon as profile is handled
        };
        refreshProfile();

        // Listen for local updates from Profile page (optimistic updates)
        const handleLocalUpdate = () => {
            const stored = localStorage.getItem('currentUser');
            if (stored) {
                setCurrentUser(JSON.parse(stored));
            }
        };
        window.addEventListener('local-user-update', handleLocalUpdate);

        // Subscribe to my own profile changes (avatar, status updates)
        const profileSub = supabase
            .channel(`public:profiles:${parsedUser.id}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'profiles',
                filter: `id=eq.${parsedUser.id}`
            }, (payload) => {
                setCurrentUser(prev => {
                    const updated = { ...prev, ...payload.new };
                    localStorage.setItem('currentUser', JSON.stringify(updated));
                    return updated;
                });
            })
            .subscribe();

        return () => {
            if (profileSub) supabase.removeChannel(profileSub);
            window.removeEventListener('local-user-update', handleLocalUpdate);
        };
    }, [navigate]);



    const handlePermissionSelect = (choice) => {
        if (choice === 'while-using' || choice === 'once') {
            requestPermissionFromUser(); // ✅ MUST be called from click
        } else {
            setPermission('denied', true);
        }
    };


    const handleEnableLocation = async () => {
        // Optimistically unblock map
        setCurrentUser(prev => ({ ...prev, is_location_on: true }));
        
        // Request permission (will update DB on success)
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
        if (!setupData.gender || !setupData.status) {
            showToast("Please select Gender and Status!");
            return;
        }

        try {
            showToast("Saving profile... ⏳");

            let userId = currentUser?.id;
            if (!userId) {
                const { data: { user } } = await supabase.auth.getUser();
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
                status: setupData.status,
                username: setupData.username,
                avatar_url: finalAvatarUrl
            };

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

            // Optimistic Update
            setCurrentUser(prev => ({
                ...prev,
                id: userId,
                ...updates
            }));

            // Sync to LocalStorage
            const updatedUser = {
                ...currentUser,
                id: userId,
                ...updates
            };
            localStorage.setItem('currentUser', JSON.stringify(updatedUser));
            localStorage.setItem('setup_complete', 'true');

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

            showToast('Thought posted to map! 🌍');
        } catch (err) {
            console.error("Error posting thought:", err);
            showToast("Failed to post thought");
        }
    };

    // Calculate distance between two coordinates in meters (Haversine formula)
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distance in meters
    };

    const handleUserAction = async (action, targetUser) => {
        if (!currentUser) return;

        if (action === 'message') {
            // Check if friends first
            const { data } = await supabase
                .from('friendships')
                .select('*')
                .or(`and(requester_id.eq.${currentUser.id},receiver_id.eq.${targetUser.id}),and(requester_id.eq.${targetUser.id},receiver_id.eq.${currentUser.id})`)
                .eq('status', 'accepted')
                .single();

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
                    setSelectedUser(null);
                    setShowFullProfile(false);
                    // Also delete friendship if it exists, to remove from map (optional but cleaner)
                    if (targetUser.friendshipId) {
                        await supabase.from('friendships').delete().eq('id', targetUser.friendshipId);
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

    const createAvatarIcon = (url, isSelf = false, thought = null, name = '', status = null) => {
        let className = 'avatar-marker';
        // Ensure url is safely wrapped and background is configured
        // Use double quotes for style attribute, single for url
        let style = `background-image: url('${url}'); background-size: cover; background-position: center;`;

        if (isSelf) {
            className += ' self';
            if (currentUser?.is_ghost_mode) {
                style += ' opacity: 0.5; filter: grayscale(100%);';
            }
        }   
        // Only show thought if it exists (simplified check)
        // Add name display and include status if available
        const thoughtHTML = thought
            ? `<div class="thought-bubble" style="background: white !important; color: black !important;">
                 <div class="thought-author" style="color: #4285F4 !important; font-weight: 800;">${name}</div>
                 <div class="thought-content" style="color: #000000 !important; font-weight: 600;">
                    ${thought}
                 </div>
               </div>`
            : '';

        return L.divIcon({
            className: 'custom-avatar-icon',
            html: `
                <div class="avatar-group">
                    ${thoughtHTML}
                    <div class="${className}" style="${style}"></div>
                </div>
            `,
            iconSize: [50, 50], // Increased to 50
            iconAnchor: [25, 25],
            popupAnchor: [0, -27]
        });
    };

    // Memoize current user marker to avoid hook order issues
    const currentUserMarker = useMemo(() => {
        if (!currentUser || !userLocation) return null;

        let avatarUrl;
        if (currentUser.avatar_url) {
            avatarUrl = getAvatar2D(currentUser.avatar_url);
        } else {
            // Strict Gender Fallback (No DiceBear)
            if (currentUser.gender === 'Male') avatarUrl = DEFAULT_MALE_AVATAR;
            else if (currentUser.gender === 'Female') avatarUrl = DEFAULT_FEMALE_AVATAR;
            else avatarUrl = DEFAULT_GENERIC_AVATAR;
        }

        return (
            <Marker
                position={[userLocation.lat, userLocation.lng]}
                icon={createAvatarIcon(avatarUrl, true, currentUser.thought, 'You')}
                eventHandlers={{ click: () => setSelectedUser(null) }}
            />
        );
    }, [currentUser, userLocation?.lat, userLocation?.lng]);





    // 4. Main App (Map & Overlays)
    // visibleUsers filter was redundant with nearbyUsers logic. 
    // We use nearbyUsers directly which is already filtered to 300m and active users.

    // --- FILTERING & SEARCH LOGIC ---
    const filteredUsers = useMemo(() => {
        if (!nearbyUsers || !currentUser) return [];

        let users = nearbyUsers;

        // 1. Search Filter (High Priority)
        if (searchQuery && searchQuery.trim().length > 0) {
            const query = searchQuery.toLowerCase().trim();
            users = users.filter(u => 
                u.name.toLowerCase().includes(query)
            );
            // Search overrides other filters usually, but let's apply it first
            // If we want search to search *within* filters, we keep this order.
            // Requirement: "Search result overrides filter temporarily" -> implies search searches ALL users
            // So if search is active, we might skip the category filter? 
            // "Search result overrides filter temporarily" usually means: Filter is ignored if searching.
            
            // If I search "John", I want to find John even if he is Offline (unless I specifically want Online Johns?)
            // UX Rule: "Do not hide other avatars (unless a filter is active)"
            // Interpretation: Search highlights/zooms, but if I type, maybe list filters?
            // "When search result is selected... map smooth animate... highlight... do not hide others"
            
            // Actually, usually "Find People" is a separate mode or just filters the list.
            // If I type in search bar, usually the map doesn't filter immediately until I select? OR it filters real-time?
            // "Find People – Search by Name... When search result is selected..."
            // This implies the search bar might be an autocomplete dropdown?
            // Current UI is just a text input.
            // Let's make it filter the visible map markers for now, OR providing a list to select from.
            
            // Let's implement: Active Search = Filter Map View to matches (common pattern) 
            // OR returns list to select.
            // Given "Do not hide other avatars", the search might be a "Highlighter".
            // Implementation: We will use a separate 'searchResults' list for the dropdown, 
            // but 'filteredUsers' for the map will respect the TABS (All/Online/etc).
            // UNLESS user explicitly filters by name.
            
            // Let's stick to simple: Search filters the list.
            // But the requirement says "Do not hide other avatars (unless a filter is active)".
            // This implies search should ZOOM to user, not necessarily hide others.
            // But if I want to "Find" someone, hiding others is helpful.
            // Let's stick to the requester's note: "Search → Focus map on user".
            // So search input shouldn't remove markers?
            // But usually search bars filter the dataset.
            
            // Let's implement Search as a "Selection" mechanism.
            // The search bar will show a set of results (dropdown).
            // When clicked, it sets 'selectedUser'.
            // It does NOT filter `displayedUsers` on the map (unless we want to).
            // So `filteredUsers` below is purely for the TABS.
        }

        switch (activeFilter) {
            case 'Online':
                return users.filter(u => {
                    if (!u.lastActive) return false;
                    const diff = Date.now() - new Date(u.lastActive).getTime();
                    return diff < 2 * 60 * 1000; // < 2 minutes
                });
            case 'Nearby':
                return users.filter(u => {
                    if (!currentUser.lat || !currentUser.lng) return false;
                    const dist = calculateDistance(currentUser.lat, currentUser.lng, u.lat, u.lng);
                    return dist <= 300; // 300 meters
                });
            case 'Friends':
                return users.filter(u => u.friendshipStatus === 'accepted');
            case 'All':
            default:
                return users;
        }
    }, [nearbyUsers, activeFilter, currentUser, searchQuery]);

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

    // ------------------------------------------------------------------
    // 📍 MEMOIZED MARKERS (Clustered & Spiral)
    // ------------------------------------------------------------------
    const userMarkers = useMemo(() => {
        // Process users to handle overlap (Spiderfy / Separation)
        // Density-Based Clustering & Spiral Layout
        
        // 1. Sort for stability
        const sortedUsers = [...filteredUsers].sort((a, b) => a.id.localeCompare(b.id));
        const clusters = [];
        // Threshold: ~330m covers marker size even at Zoom 15. Ensures 1m-apart users get spiraled.
        const CLUSTER_THRESHOLD = 0.003; 

        // 2. Cluster Users
        sortedUsers.forEach(u => {
            let placed = false;
            for (let cluster of clusters) {
                // Check distance to cluster center (using first user as anchor for stability)
                const anchor = cluster[0];
                if (Math.abs(u.lat - anchor.lat) < CLUSTER_THRESHOLD &&
                    Math.abs(u.lng - anchor.lng) < CLUSTER_THRESHOLD) {
                    cluster.push(u);
                    placed = true;
                    break;
                }
            }
            if (!placed) clusters.push([u]);
        });

        // 3. Apply Spiral Layout
        const processedUsers = [];
        const SPIRAL_SPACING = 0.0015; // Increased spacing for clear separation

        clusters.forEach(cluster => {
            if (cluster.length === 1) {
                processedUsers.push(cluster[0]);
            } else {
                // Calculate center of mass for the group
                const avgLat = cluster.reduce((sum, c) => sum + c.lat, 0) / cluster.length;
                const avgLng = cluster.reduce((sum, c) => sum + c.lng, 0) / cluster.length;

                cluster.forEach((u, i) => {
                    // Archimedean Spiral / Golden Angle Packing
                    const angle = i * 2.4; // ~137.5 degrees
                    const radius = SPIRAL_SPACING * Math.sqrt(i);

                    processedUsers.push({
                        ...u,
                        lat: avgLat + (Math.cos(angle) * radius),
                        lng: avgLng + (Math.sin(angle) * radius)
                    });
                });
            }
        });

        return processedUsers.map(u => {
            // Check thought expiration (3 hours)
            let displayThought = u.thought;
            if (u.status_updated_at) {
                const diffHours = (new Date() - new Date(u.status_updated_at)) / (1000 * 60 * 60);
                if (diffHours > 3) displayThought = null;
            }

            return (
                <Marker
                    key={`${u.id}-${u.avatar}`}
                    position={[u.lat, u.lng]}
                    icon={createAvatarIcon(getAvatar2D(u.avatar), false, displayThought, u.name, u.status)}
                    riseOnHover={true}
                    eventHandlers={{
                        click: async () => {

                            // Fetch friendship status synchronously to update UI instantly
                            // Optimistically show card while loading if needed, but fetch runs fast.
                            // We check if there's friendship where (me=req, them=rec) OR (me=rec, them=req)
                            console.log(`🔍 [MapHome] Fetching friendship between Me(${currentUser?.id}) and ${u.name}(${u.id})`);
                            
                            // Prevent check if currentUser is null (edge case)
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
                                // Robust Fallback: Use fetched data OR existing local data
                                friendshipStatus: data?.status || u.friendshipStatus || null,
                                friendshipId: data?.id || u.friendshipId || null,
                                requesterId: data?.requester_id || null,
                                receiverId: data?.receiver_id || null,
                                isMuted: isMuted
                            });
                        }
                    }}
                />
            );
        });
    }, [filteredUsers, currentUser]);

    const ghostMode = currentUser?.is_ghost_mode === true;


    // -------------------------------------------------
    // 🔄 SYNC LOCATION STATE
    // -------------------------------------------------
    useEffect(() => {
        if (locationEnabled && currentUser && (currentUser.is_ghost_mode || !currentUser.is_location_on)) {
            console.log("📍 [MapHome] Location enabled detected. Syncing local user state...");
            setCurrentUser(prev => ({
                ...prev,
                is_ghost_mode: false,
                is_location_on: true
            }));
        }
    }, [locationEnabled, currentUser?.id]);

   // -------------------------------------------------
// 🚀 LOCATION GATES
// -------------------------------------------
    // 🚪 GATEKEEPING: Force Location or Ghost Mode
    // -------------------------------------------
    
    // 1. Loading State (Prevent Flash)
    if (loadingLocation) {
        return (
            <div style={{
                height: "100dvh",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                background: isDarkMode ? "#121212" : "#f5f5f5",
                color: isDarkMode ? "rgba(255,255,255,0.7)" : "#666"
            }}>
                {/* Simple Pulse Loader */}
                <div style={{ 
                    width: '40px', height: '40px', 
                    borderRadius: '50%', 
                    border: '3px solid currentColor', 
                    borderTopColor: 'transparent',
                    animation: 'spin 1s linear infinite',
                    marginBottom: '16px'
                }}></div>
                <p>Finding you...</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    // 2. Permission Gate
    if (!locationEnabled || ghostMode || currentUser?.is_location_on === false) {
    return (
        <div style={{
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            textAlign: "center",
            background: isDarkMode ? "#121212" : "#f5f5f5",
            padding: "20px"
        }}>
            <h2>📍 Location Required</h2>

            <p style={{ maxWidth: "320px", opacity: 0.7 }}>
                Nearo shows people near you.
                Enable location services to continue.
            </p>

            <button
                onClick={startLocation}
                style={{
                    padding: "14px 24px",
                    borderRadius: "25px",
                    border: "none",
                    background: "#4285F4",
                    color: "white",
                    fontWeight: "600",
                    fontSize: "16px",
                    cursor: "pointer",
                    marginTop: "20px"
                }}
            >
                Enable Location
            </button>
        </div>
    );
}

// 2️⃣ If GPS still loading
if (!userLocation) {
    return (
        <div style={{
            height: "100vh",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            background: isDarkMode ? "#121212" : "#f5f5f5"
        }}>
            <h3>Finding you...</h3>
        </div>
    );
}

// 3️⃣ If all good, render map
return (
    <div className="map-container" style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        width: '100%', 
        height: '100dvh', 
        overflow: 'hidden',
        overscrollBehavior: 'none' 
    }}>
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

            {/* BLOCKING ONBOARDING MODAL */}
            {showProfileSetup && (
                <div className="onboarding-overlay">
                    <div className="onboarding-card">
                        <h2>Welcome to SocialMap! 👋</h2>
                        <p>Complete your profile to join.</p>

                        <div className="ob-section">
                            <label>Username</label>
                            <input
                                type="text"
                                className="ob-input"
                                value={setupData.username}
                                onChange={(e) => setSetupData({ ...setupData, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                                placeholder="Choose a username"
                            />
                        </div>

                        <div className="ob-section">
                            <label>Gender</label>
                            <div className="chip-group">
                                {['Male', 'Female', 'Non-binary', 'Other'].map(g => (
                                    <button
                                        key={g}
                                        className={`chip ${setupData.gender === g ? 'selected' : ''}`}
                                        onClick={() => setSetupData({ ...setupData, gender: g })}
                                    >{g}</button>
                                ))}
                            </div>
                        </div>

                        <div className="ob-section">
                            <label>Relationship Status</label>
                            <div className="chip-group">
                                {['Single', 'Married', 'Committed', 'Open to Date'].map(s => (
                                    <button
                                        key={s}
                                        className={`chip ${setupData.status === s ? 'selected' : ''}`}
                                        onClick={() => setSetupData({ ...setupData, status: s })}
                                    >{s}</button>
                                ))}
                            </div>
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
                                            // Read file for cropping
                                            const reader = new FileReader();
                                            reader.onload = () => setCropImage(reader.result);
                                            reader.readAsDataURL(file);

                                            // Clear input so same file can be selected again
                                            e.target.value = '';
                                        }
                                    }}
                                    style={{ display: 'none' }}
                                />
                            </div>
                            <p className="avatar-hint" style={{ marginTop: '12px' }}>
                                {avatarFile ? 'Photo selected! Ready to join.' : "We've assigned you a look based on gender. Tap + to upload your own!"}
                            </p>
                        </div>

                        <button className="complete-btn" onClick={handleCompleteSetup}>
                            Complete Setup & Enter Map 🚀
                        </button>
                    </div>
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

            {/* Map Container */}
            <MapContainer
                key="map-main-stable"
                center={[userLocation.lat, userLocation.lng]}
                zoom={17}
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
              {/* 3️⃣ Controls & Logic */}
            <RecenterAutomatically 
                lat={userLocation.lat} 
                lng={userLocation.lng} 
                mapMode={mapMode} // 🔥 Passing mode to trigger recenter
            />
                <RecenterControl lat={userLocation.lat} lng={userLocation.lng} />
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

                {/* Current User Marker (Memoized above) */}
                {currentUserMarker}

                {/* Memoized User Markers */}
                {userMarkers}
            </MapContainer>


            {/* Top Search Bar & Action Buttons */}
            <div className="map-header-controls">
                <div className="header-top-row">
                    <div className="search-bar-container glass-panel">
                        <span className="search-icon">🔍</span>
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
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00C853" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            </svg>
                        </button>
                        
                        {/* Ghost Mode Toggle */}
                        <button
                            className={`control-btn ${currentUser?.is_ghost_mode ? 'active' : ''}`}
                            style={{ background: 'var(--bg-primary, #ffffff)', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
                            onClick={async () => {
                                if (currentUser?.is_ghost_mode) {
                                    // Currently Hidden -> Become Visible
                                    startLocation();
                                    showToast("👁️ Ghost Mode OFF (Visible)");
                                } else {
                                    // Currently Visible -> Become Hidden
                                    await stopLocation();
                                    showToast("👻 Ghost Mode ON (Hidden)");
                                }
                            }}
                            title="Toggle Ghost Mode"
                        >
                            {currentUser?.is_ghost_mode ? (
                                /* Ghost Icon (Active/Purple) */
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D500F9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 19c-4.286 1.35-4.286-2.55-6-3m12 5v-3.5c0-1 .67-2.3 2-2.3.82-1 1.2-2.1 1.2-3.3 0-2.39-1.31-4.2-3.4-4.2-1.95 0-3.66 1.25-4.62 3.26-1 2.22-.38 4.7 1.8 7.15 2.15 2.5 3.1 3.9 3.12 5.3" />
                                </svg>
                            ) : (
                                /* Eye Icon (Visible/Blue) */
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2962FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
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
                             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF6D00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                                <polyline points="2 17 12 22 22 17"></polyline>
                                <polyline points="2 12 12 17 22 12"></polyline>
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
                    font-size: 1rem;
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
                    padding: 8px 16px;
                    white-space: nowrap;
                    font-size: 0.9rem;
                    font-weight: 500;
                    color: inherit;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .filter-chip.active {
                    background: #4285F4;
                    color: white;
                    border-color: #4285F4;
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
                    top: 20px;
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
                .leaflet-marker-icon {
                    transition: transform 1s linear;
                }
                .map-ui-overlay {
                    position: absolute;
                    bottom: 80px;
                    left: 0; right: 0;
                    display: flex; justify-content: center;
                    z-index: 999;
                    pointer-events: none; 
                }
                
                /* SMOOTH MARKER ANIMATIONS - REVERTED */
                /* User requested "show as previous" - effectively disabling smooth sliding 
                   to prevent spiral chaos or unwanted motion blur. */
                .leaflet-marker-icon {
                    /* transition: transform 0.8s ...; REMOVED */
                    opacity: 1; 
                }
                
                /* Class specific for avatars */
                .leaflet-marker-icon.custom-avatar-icon {
                    /* will-change: transform, opacity; REMOVED */
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
                .thought-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 5px; }
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
