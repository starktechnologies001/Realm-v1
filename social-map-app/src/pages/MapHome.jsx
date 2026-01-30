import { MapContainer, TileLayer, Marker, Circle, useMap, LayersControl, LayerGroup } from 'react-leaflet';
import L from 'leaflet';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import MapProfileCard from '../components/MapProfileCard';
import FullProfileModal from '../components/FullProfileModal';
import PokeNotifications from '../components/PokeNotifications';
import Toast from '../components/Toast';
import { getAvatar2D, generateRandomRPMAvatar } from '../utils/avatarUtils';
import { getBlockedUserIds, getBlockerIds, isUserBlocked, isBlockedMutual } from '../utils/blockUtils';
import { useLocationContext } from '../context/LocationContext';
import LocationPermissionModal from '../components/LocationPermissionModal';
import LimitedModeScreen from '../components/LimitedModeScreen';
import StoryViewer from '../components/StoryViewer';

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

function RecenterAutomatically({ lat, lng }) {
    const map = useMap();
    const hasCentered = useRef(false);

    useEffect(() => {
        if (!hasCentered.current && lat && lng) {
            map.flyTo([lat, lng], 17, { animate: true, duration: 1.5 });
            hasCentered.current = true;
        }
    }, [lat, lng, map]);

    return null;
}



export default function MapHome() {
    const { theme } = useTheme();
    // Global Permission Context
    const { permissionStatus, setPermission, resetPermission } = useLocationContext();
    const watchIdRef = useRef(null);
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

    const [location, setLocation] = useState(() => {
        const cached = localStorage.getItem('lastLocation');
        return cached ? JSON.parse(cached) : null;
    });
    const [nearbyUsers, setNearbyUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [loading, setLoading] = useState(!localStorage.getItem('lastLocation')); // Only load if no cache
    const [isGhostMode, setGhostMode] = useState(false);
    const navigate = useNavigate();
    const [currentUser, setCurrentUser] = useState(null);
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
            if (localStorage.getItem('setup_complete') === 'true') {
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
                         const baseName = (profile.full_name || 'user').replace(/\s+/g, '_').toLowerCase();
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
    }, [currentUser, location]);

    // Poll for nearby users
    useEffect(() => {
        if (!location || !currentUser) return;

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
                        .select('id, username, full_name, gender, latitude, longitude, status, status_message, status_updated_at, last_active, avatar_url, hide_status, show_last_seen, is_public')
                        .neq('id', currentUser.id)
                        .eq('is_ghost_mode', false)
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
                
                // Filter and map users (exclude blocked users AND current user)
                const validUsers = profilesResult.data
                    .filter(u => !allBlockedIds.has(u.id) && u.id !== currentUser.id)
                    .map(u => {
                        // Use actual avatar if available, otherwise gender-based fallback
                        const safeName = encodeURIComponent(u.username || u.full_name || 'User');
                        let fallbackAvatar;
                        if (u.gender === 'Male') fallbackAvatar = `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&hair=short01,short02,short03,short04,short05,short06,short07,short08&earringsProbability=0`;
                        else if (u.gender === 'Female') fallbackAvatar = `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&glassesProbability=0&mustacheProbability=0&beardProbability=0&hair=long01,long02,long03,long04,long05,long10,long12`;
                        else fallbackAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeName}`;

                        // Micro-jitter for initial load
                        const renderLat = u.latitude + (Math.random() - 0.5) * 0.0002;
                        const renderLng = u.longitude + (Math.random() - 0.5) * 0.0002;

                        // Get friendship data from map
                        const fData = myFriendships.get(u.id);

                        return {
                            id: u.id,
                            name: u.username || 'User',
                            lat: renderLat,
                            lng: renderLng,
                            avatar: u.avatar_url || fallbackAvatar, // Use real avatar if exists
                            originalAvatar: u.avatar_url,
                            status: u.status,
                            hide_status: u.hide_status,
                            show_last_seen: u.show_last_seen,
                            thought: u.status_message,
                            lastActive: u.last_active,
                            isLocationOn: true,
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
                const isVisible = !updatedUser.is_ghost_mode && hasLocation;

                setNearbyUsers(prev => {
                    const existingIndex = prev.findIndex(u => u.id === updatedUser.id);
                    const exists = existingIndex !== -1;

                    if (isVisible) {
                        // Prepare consistent avatar logic
                        let mapAvatar = updatedUser.avatar_url;
                        if (!mapAvatar) {
                            const safeName = encodeURIComponent(updatedUser.username || updatedUser.full_name || 'User');
                            const gender = updatedUser.gender?.toLowerCase();
                            if (gender === 'male') mapAvatar = `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&hair=short01,short02,short03,short04,short05,short06,short07,short08&earringsProbability=0`;
                            else if (gender === 'female') mapAvatar = `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&glassesProbability=0&mustacheProbability=0&beardProbability=0&hair=long01,long02,long03,long04,long05,long10,long12`;
                            else mapAvatar = `https://avatar.iran.liara.run/public?username=${safeName}`;
                        }

                        // Jitter coordinates slightly
                        const renderLat = updatedUser.latitude + (Math.random() - 0.5) * 0.0002;
                        const renderLng = updatedUser.longitude + (Math.random() - 0.5) * 0.0002;

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
                
                // Show new user if not in ghost mode
                if (!newUser.is_ghost_mode) {
                    const safeName = encodeURIComponent(newUser.username || newUser.full_name || 'User');
                    let fallbackAvatar = newUser.avatar_url; // Use real avatar if exists
                    
                    if (!fallbackAvatar || fallbackAvatar.includes('defaults')) {
                         if (newUser.gender === 'Male') fallbackAvatar = `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&hair=short01,short02,short03,short04,short05,short06,short07,short08&earringsProbability=0`;
                         else if (newUser.gender === 'Female') fallbackAvatar = `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&glassesProbability=0&mustacheProbability=0&beardProbability=0&hair=long01,long02,long03,long04,long05,long10,long12`;
                         else fallbackAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeName}`;
                    }

                    // Preload Image Immediately
                    const img = new Image();
                    img.src = getAvatar2D(fallbackAvatar);

                    const mapAvatar = getAvatar2D(fallbackAvatar);

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


        const interval = setInterval(fetchNearbyUsers, 5000); // Poll every 5s (keep for cleanup/timeouts)
        fetchNearbyUsers(); // Initial fetch

        return () => {
            clearInterval(interval);
            supabase.removeChannel(channel);
        };
    }, [location, currentUser]);

    // --- Real-time Location Tracking & DB Update ---
    useEffect(() => {
        if (!currentUser?.id || permissionStatus !== 'granted') return;

        const updateLocationInDB = async (lat, lng) => {
            try {
                // Update local state first for immediate UI feedbac
                const updatedUser = { ...currentUser, latitude: lat, longitude: lng };
                // Only update local storage/state if significantly moved? 
                // Actually, let's keep local state fresh so the user's own marker moves immediately
                // setCurrentUser(updatedUser); // CAREFUL: This might cause re-renders loop if not memoized dep

                // Update Supabase (Throttled by nature of how often we call this)
                // We'll use a timestamp check to avoid spamming DB
                const lastUpdate = localStorage.getItem('last_loc_update');
                const now = Date.now();
                if (lastUpdate && now - parseInt(lastUpdate) < 5000) {
                     return; // Skip if updated < 5s ago
                }

                await supabase.from('profiles').update({
                    latitude: lat,
                    longitude: lng,
                    last_active: new Date().toISOString()
                }).eq('id', currentUser.id);
                
                localStorage.setItem('last_loc_update', now.toString());
                console.log("📍 Location updated in DB:", lat, lng);

            } catch (err) {
                console.error("Failed to update location in DB", err);
            }
        };

        const success = (pos) => {
            const { latitude, longitude } = pos.coords;
            setLocation({ lat: latitude, lng: longitude });
            localStorage.setItem('lastLocation', JSON.stringify({ lat: latitude, lng: longitude }));
            
            // Push to DB
            updateLocationInDB(latitude, longitude);
        };

        const error = (err) => {
            console.warn('ERROR(' + err.code + '): ' + err.message);
        };

        const options = {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        };

        const id = navigator.geolocation.watchPosition(success, error, options);
        watchIdRef.current = id;

        return () => {
            if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
        };
    }, [currentUser?.id, permissionStatus]); 

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

                setCurrentUser(mergedUser);
                localStorage.setItem('currentUser', JSON.stringify(mergedUser));
            }
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

        // Check Permission Logic
        const initLocation = () => {
            if (!navigator.geolocation) {
                setLoading(false);
                return;
            }

            // We now rely on permissionStatus from Context
            if (permissionStatus === 'granted') {
                startLocationTracking();
            } else if (permissionStatus === 'denied') {
                setLoading(false);
            } else {
                // Prompt - Wait for user action (Modal shown via JSX)
                setLoading(false);
            }
        };

        const startLocationTracking = () => {
            // Immediate fetch
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const { latitude, longitude } = position.coords;
                    setLocation({ lat: latitude, lng: longitude });
                    localStorage.setItem('lastLocation', JSON.stringify({ lat: latitude, lng: longitude }));
                    setLoading(false);
                    // Update DB
                     if (parsedUser.id) {
                         await supabase.from('profiles').update({
                             latitude: latitude,
                             longitude: longitude,
                             last_active: new Date().toISOString()
                         }).eq('id', parsedUser.id);
                     }
                },
                (error) => { console.error(error); setLoading(false); },
                { enableHighAccuracy: true }
            );

            // Watcher
            // Watcher to keep location live
            watchIdRef.current = navigator.geolocation.watchPosition(
                async (position) => {
                    const { latitude, longitude } = position.coords;
                    setLocation({ lat: latitude, lng: longitude });
                    
                    // If we successfully get a location, ensure permission is 'granted'
                    if (permissionStatus !== 'granted') {
                        setPermission('granted', false);
                    }

                     // Throttle DB updates (15s)
                    const now = Date.now();
                    const lastUpdate = window.lastLocationUpdate || 0;
                    if (parsedUser.id && (now - lastUpdate > 15000)) {
                        window.lastLocationUpdate = now;
                        await supabase.from('profiles').update({
                            latitude: latitude,
                            longitude: longitude,
                            last_active: new Date().toISOString()
                        }).eq('id', parsedUser.id);
                    }
                },
                (error) => {
                     console.error('[MapHome] WatchPosition Error:', error);
                     // If permission is denied or position unavailable (e.g. turned off), force Ghost screen
                     if (error.code === error.PERMISSION_DENIED || error.code === error.POSITION_UNAVAILABLE) {
                         setPermission('denied', false); // Don't persist denial if it's just switched off temporarily
                     }

                     // Fallback if no location ever found
                     if (!location) {
                         setLoading(false);
                         // Don't set default SF location if we want to force the denied screen
                     }
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        };

        // Listen for system permission changes (e.g. toggling in browser/settings)
        if (navigator.permissions && navigator.permissions.query) {
            navigator.permissions.query({ name: 'geolocation' }).then((result) => {
                result.onchange = () => {
                    console.log('[MapHome] Permission changed:', result.state);
                    if (result.state === 'granted') {
                        setPermission('granted', true);
                    } else if (result.state === 'denied') {
                        setPermission('denied', true);
                    } else if (result.state === 'prompt') {
                        setPermission('prompt', true);
                    }
                };
            });
        }

        // Run Init
        initLocation();

        return () => {
            if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
            if (profileSub) supabase.removeChannel(profileSub);
            window.removeEventListener('local-user-update', handleLocalUpdate);
        };
    }, [navigate, permissionStatus]); // Depend on permissionStatus

    const handlePermissionSelect = (choice) => {
        if (choice === 'while-using') {
            setPermission('granted', true);
            // Effect will pick up change
        } else if (choice === 'once') {
             setPermission('granted', false);
             // Effect will pick up change
        } else {
            setPermission('denied', true);
        }
    };

    const handleEnableLocation = () => {
        resetPermission();
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
        // Selfie check REMOVED
        
        try {
            showToast("Saving profile... ⏳");

            let userId = currentUser?.id;
            // Fallback: Check auth if currentUser state is not ready (which shouldn't happen but defensive coding)
            if (!userId) {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error("No authenticated user found.");
                userId = user.id;
            }



            // Update Profile
            const updates = {
                gender: setupData.gender,
                status: setupData.status,
                username: setupData.username
            };
            
            // FORCE Avatar Update
            if (setupData.gender === 'Male') updates.avatar_url = '/defaults/male_avatar.jpg';
            else if (setupData.gender === 'Female') updates.avatar_url = '/defaults/female_avatar.jpg';
            
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

            // Sync to LocalStorage so refresh works
            const updatedUser = {
                ...currentUser,
                id: userId,
                ...updates
            };
            localStorage.setItem('currentUser', JSON.stringify(updatedUser));
            
            // FORCE SUPPRESSION: Prevent modal from showing again in this session/browser
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
                navigate('/chat', { state: { targetUser } });
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
                // Insert into blocks table
                const { error } = await supabase
                    .from('blocks')
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
                    // Refresh nearby users to remove blocked user from map
                    // The fetchNearbyUsers will automatically filter them out
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
        else if (action === 'view-profile') {
            setFullProfileUser(targetUser);
            setShowFullProfile(true);
            setSelectedUser(null); // Close small card
        }
        else if (action === 'call-audio' || action === 'call-video') {
            showToast("Calls coming soon! 📞");
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
            if (isGhostMode) style += ' opacity: 0.5; filter: grayscale(100%);';
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
            iconSize: [60, 60], 
            iconAnchor: [30, 30], 
            popupAnchor: [0, -35]
        });
    };

    // Memoize current user marker to avoid hook order issues
    const currentUserMarker = useMemo(() => {
        if (!currentUser || !location) return null;
        
        let avatarUrl;
        if (currentUser.avatar_url) {
            avatarUrl = getAvatar2D(currentUser.avatar_url);
        } else {
            const safeName = encodeURIComponent(currentUser.username || currentUser.full_name || 'User');
            if (currentUser.gender === 'Male') {
                avatarUrl = `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&hair=short01,short02,short03,short04,short05,short06,short07,short08&earringsProbability=0`;
            } else if (currentUser.gender === 'Female') {
                avatarUrl = `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&glassesProbability=0&mustacheProbability=0&beardProbability=0&hair=long01,long02,long03,long04,long05,long10,long12`;
            } else {
                avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeName}`;
            }
        }

        return (
            <Marker
                position={[location.lat, location.lng]}
                icon={createAvatarIcon(avatarUrl, true, currentUser.thought, 'You')}
                eventHandlers={{ click: () => setSelectedUser(null) }}
            />
        );
    }, [currentUser, location?.lat, location?.lng]);

    // 1. Permission Prompt (Highest Priority)
    if (permissionStatus === 'prompt') {
        return <LocationPermissionModal onSelect={handlePermissionSelect} />;
    }

    // 2. Permission Denied
    if (permissionStatus === 'denied') {
        return <LimitedModeScreen onEnableLocation={handleEnableLocation} />;
    }

    // 3. Loading User or Waiting for Location (Permission is Granted at this point)
    if (loading || !location) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#e0e0e0', color: '#333' }}>
                <h2>{loading ? 'Loading Profile...' : 'Acquiring Location...'}</h2>
            </div>
        );
    }

    // 4. Main App (Map & Overlays)
    // visibleUsers filter was redundant with nearbyUsers logic. 
    // We use nearbyUsers directly which is already filtered to 300m and active users.

    return (
        <div className="map-container">
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
                            <div className="avatar-preview-box">
                                <img 
                                    src={(() => {
                                        // Dynamic preview based on selection
                                        if (setupData.gender === 'Male') return '/defaults/male_avatar.jpg';
                                        if (setupData.gender === 'Female') return '/defaults/female_avatar.jpg';
                                        // Fallback to existing or random
                                        return currentUser?.avatar_url || `https://api.dicebear.com/9.x/adventurer/svg?seed=${setupData.username || 'preview'}`;
                                    })()}
                                    alt="Your Avatar" 
                                />
                                <p className="avatar-hint">
                                    We've assigned you separate look based on gender! <br/>
                                    You can customize this later in your profile.
                                </p>
                            </div>
                        </div>

                        <button className="complete-btn" onClick={handleCompleteSetup}>
                            Complete Setup & Enter Map 🚀
                        </button>
                    </div>
                </div>
            )}

            <MapContainer
                center={[location.lat, location.lng]}
                zoom={18}
                maxZoom={22}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
                attributionControl={false}
            >
                <LayersControl position="topright">
                    <LayersControl.BaseLayer checked name="Street View">
                        <TileLayer
                            attribution='&copy; Google Maps'
                            url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                            className={isDarkMode ? 'dark-map-tiles' : ''}
                            maxNativeZoom={20}
                            maxZoom={22}
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="Realistic (Hybrid)">
                        <TileLayer
                            attribution='&copy; Google Maps'
                            url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                            maxNativeZoom={20}
                            maxZoom={22}
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="Satellite Only">
                        <TileLayer
                            attribution='&copy; Google Maps'
                            url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
                            maxNativeZoom={20}
                            maxZoom={22}
                        />
                    </LayersControl.BaseLayer>
                </LayersControl>

                <RecenterAutomatically lat={location.lat} lng={location.lng} />

                <Circle
                    center={[location.lat, location.lng]}
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

                {(() => {
                    // Process users to handle overlap (Spiderfy / Separation)
                    const processedUsers = nearbyUsers.map((u, i, all) => {
                        // Simple Collision Detection
                        // Group users that are within threshold (approx 3-4 meters)
                        const THRESHOLD = 0.00004; 
                        const collidingUsers = all.filter(other => 
                            Math.abs(other.lat - u.lat) < THRESHOLD && 
                            Math.abs(other.lng - u.lng) < THRESHOLD
                        );

                        if (collidingUsers.length <= 1) return u; // No collision

                        // Calculate index in this specific group
                        // Sort by ID to ensure consistent ordering (so they don't jump around)
                        collidingUsers.sort((a,b) => a.id.localeCompare(b.id));
                        const indexInGroup = collidingUsers.findIndex(cu => cu.id === u.id);

                        // Apply Offset (Circle formation)
                        const angle = (indexInGroup / collidingUsers.length) * 2 * Math.PI;
                        const radius = 0.00015; // Separation radius (approx 15-20 meters visually)

                        return {
                            ...u,
                            lat: u.lat + (Math.cos(angle) * radius),
                            lng: u.lng + (Math.sin(angle) * radius)
                        };
                    });

                    return processedUsers.map(u => {
                        // Check thought expiration (2 hours)
                        let displayThought = u.thought;
                        if (u.status_updated_at) {
                            const diffHours = (new Date() - new Date(u.status_updated_at)) / (1000 * 60 * 60);
                            if (diffHours > 2) displayThought = null;
                        }

                        return (
                            <Marker
                                key={`${u.id}-${u.avatar}`}
                                position={[u.lat, u.lng]}
                                icon={createAvatarIcon(getAvatar2D(u.avatar), false, displayThought, u.name, u.status)}
                                eventHandlers={{
                                    click: async () => {

                                // Fetch friendship status synchronously to update UI instantly
                                let status = null;
                                // Optimistically show card while loading if needed, but fetch runs fast.
                                // We check if there's friendship where (me=req, them=rec) OR (me=rec, them=req)
                                console.log(`🔍 [MapHome] Fetching friendship between Me(${currentUser.id}) and ${u.name}(${u.id})`);
                                const { data, error } = await supabase
                                    .from('friendships')
                                    .select('id, status, requester_id, receiver_id, muted_until_by_requester, muted_until_by_receiver')
                                    .or(`and(requester_id.eq.${currentUser.id},receiver_id.eq.${u.id}),and(requester_id.eq.${u.id},receiver_id.eq.${currentUser.id})`)
                                    .maybeSingle(); 

                                if (error) console.error("❌ [MapHome] Error fetching friendship:", error);
                                console.log("✅ [MapHome] Friendship Data:", data);

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
            })()}
            </MapContainer>

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
                                    } catch(err) {
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
                        <p className="hint">Disappears in 2 hours</p>
                    </div>
                </div>
            )}

            <div className="controls-overlay">
                <button className="control-btn" onClick={() => setShowThoughtInput(true)} title="Set Status">
                    💭
                </button>
                <button
                    className={`control-btn ${isGhostMode ? 'active' : ''}`}
                    onClick={async () => {
                        const newMode = !isGhostMode;
                        setGhostMode(newMode);
                        if (currentUser) {
                            await supabase.from('profiles').update({ is_ghost_mode: newMode }).eq('id', currentUser.id);
                            showToast(newMode ? "👻 Ghost Mode ON (Hidden)" : "👁️ Ghost Mode OFF (Visible)");
                        }
                    }}
                    title="Toggle Ghost Mode"
                >
                    {isGhostMode ? '👻' : '👁️'}
                </button>
            </div>

            <div className="map-ui-overlay">
                <div className="stats-card">
                    <span>Checking 300m radius</span>
                    <div className="stats-divider"></div>
                    <strong>{nearbyUsers.length} Active</strong>
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
                .stats-card {
                    pointer-events: auto;
                    background: white;
                    padding: 8px 16px;
                    border-radius: 20px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                    color: #333;
                    display: flex; align-items: center; gap: 12px;
                    font-size: 0.9rem;
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
                .stats-divider { width: 1px; height: 16px; background: #eee; }
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

                .controls-overlay {
                    position: absolute;
                    top: 60px;
                    right: 20px;
                    z-index: 1000;
                    display: flex; flex-direction: column; gap: 10px;
                }
                .control-btn {
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    background: white;
                    color: #555;
                    font-size: 20px;
                    display: flex; align-items: center; justify-content: center;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                    border: none; cursor: pointer;
                    transition: all 0.2s;
                }
                .control-btn:hover { transform: scale(1.05); }
                .control-btn.active {
                    background: #4285F4;
                    color: white;
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
