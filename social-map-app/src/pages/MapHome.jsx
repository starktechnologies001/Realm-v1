import { MapContainer, TileLayer, Marker, Circle, useMap, LayersControl, LayerGroup } from 'react-leaflet';
import L from 'leaflet';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import UserProfileCard from '../components/UserProfileCard';
import FullProfileModal from '../components/FullProfileModal';
import PokeNotifications from '../components/PokeNotifications';
import Toast from '../components/Toast';
import { getAvatar2D } from '../utils/avatarUtils';

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
            // Use 'open-peeps' for standing cartoon look (Snap style)
            avatar: `https://api.dicebear.com/7.x/open-peeps/svg?seed=${i}&size=96`,
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
    useEffect(() => {
        map.flyTo([lat, lng], 17, { animate: true, duration: 1.5 });
    }, [lat, lng, map]);
    return null;
}



export default function MapHome() {
    const { theme } = useTheme();
    
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
    // ... rest of component ...

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

    // Floating Thought State
    const [showThoughtInput, setShowThoughtInput] = useState(false);
    const [myThought, setMyThought] = useState('');

    // --- Onboarding State ---
    const [showProfileSetup, setShowProfileSetup] = useState(false);
    const [setupData, setSetupData] = useState({ gender: '', status: '' });
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

            if (profile) {
                // Check if mandatory fields are missing
                if (!profile.gender || !profile.status || !profile.username) {
                    setSetupData({
                        gender: profile.gender || '',
                        status: profile.status || ''
                    });
                    setShowProfileSetup(true);
                    setLoading(false); 
                }
                // Force Update Avatar if NOT Iran Liara AND NOT Ready Player Me AND NOT DiceBear
                // We allow RPM URLs now
                else if (!profile.avatar_url || (!profile.avatar_url.includes('avatar.iran.liara.run') && !profile.avatar_url.includes('models.readyplayer.me') && !profile.avatar_url.includes('dicebear'))) {
                    const safeName = encodeURIComponent(profile.username || profile.full_name || 'User');
                    let newAvatar;
                    if (profile.gender === 'Male') newAvatar = `https://avatar.iran.liara.run/public/boy?username=${safeName}`;
                    else if (profile.gender === 'Female') newAvatar = `https://avatar.iran.liara.run/public/girl?username=${safeName}`;
                    else newAvatar = `https://avatar.iran.liara.run/public?username=${safeName}`;
                    
                    await supabase.from('profiles')
                        .update({ avatar_url: newAvatar })
                        .eq('id', profile.id);

                    // Update local state if current user
                    if (profile.id === currentUser?.id) {
                         const updated = { ...currentUser, avatar_url: newAvatar };
                         setCurrentUser(updated);
                         localStorage.setItem('currentUser', JSON.stringify(updated));
                    }
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
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${currentUser.id}` }, (payload) => {
                setUnreadCount(prev => prev + 1);
                showToast(`New message from user! 📩`);
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
                // Run both queries in parallel for faster loading
                const [blockedResult, profilesResult, friendshipResult] = await Promise.all([
                    // Fetch blocked users (both directions)
                    supabase
                        .from('friendships')
                        .select('requester_id, receiver_id')
                        .eq('status', 'blocked')
                        .or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`),
                    
                    // Fetch all profiles with only needed fields
                    supabase
                        .from('profiles')
                        .select('id, username, full_name, gender, latitude, longitude, status, status_message, last_active, avatar_url, hide_status, show_last_seen')
                        .neq('id', currentUser.id)
                        .eq('is_ghost_mode', false)
                        .not('latitude', 'is', null)
                        .not('longitude', 'is', null),

                   // Fetch my friendships (to sync map)
                   supabase
                        .from('friendships')
                        .select('id, requester_id, receiver_id, status')
                        .or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
                ]);

                // Create set of blocked user IDs and populate friendships map
                const blockedUserIds = new Set();
                const myFriendships = new Map(); // local helper

                if (friendshipResult.data) {
                    friendshipResult.data.forEach(f => {
                         const partnerId = f.requester_id === currentUser.id ? f.receiver_id : f.requester_id;
                         if (f.status === 'accepted') {
                             friendshipsRef.current.set(f.id, partnerId);
                             myFriendships.set(partnerId, 'accepted');
                         }
                         if (f.status === 'blocked') {
                             if (f.requester_id === currentUser.id) blockedUserIds.add(f.receiver_id);
                             if (f.receiver_id === currentUser.id) blockedUserIds.add(f.requester_id);
                         }
                         if (f.status === 'pending') {
                             myFriendships.set(partnerId, 'pending');
                         }
                    });
                }
                
                // Fallback for blockedResult if needed (though now handled above)
                if (blockedResult.data) {
                     blockedResult.data.forEach(block => {
                        if (block.requester_id === currentUser.id) blockedUserIds.add(block.receiver_id);
                        if (block.receiver_id === currentUser.id) blockedUserIds.add(block.requester_id);
                     });
                }


                if (profilesResult.error) {
                    console.error('Error fetching users:', profilesResult.error);
                    return;
                }

                // Filter and map users
                const validUsers = profilesResult.data
                    .filter(u => !blockedUserIds.has(u.id))
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

                        return {
                            id: u.id,
                            name: u.username || u.full_name || 'User',
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
                            friendshipStatus: myFriendships.get(u.id) || null // <--- ADDED THIS
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
                            name: updatedUser.username || updatedUser.full_name || 'User',
                            lat: renderLat,
                            lng: renderLng,
                            avatar: mapAvatar,
                            originalAvatar: updatedUser.avatar_url,
                            status: updatedUser.status,
                            thought: updatedUser.status_message,
                            lastActive: updatedUser.last_active,
                            isLocationOn: true,
                            isLocationShared: true,
                            friendshipStatus: exists ? prev[existingIndex].friendshipStatus : null // Preserve local friendship state
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

                // Show new user if not in ghost mode
                if (!newUser.is_ghost_mode) {
                    const safeName = encodeURIComponent(newUser.username || newUser.full_name || 'User');
                    let fallbackAvatar = newUser.avatar_url; // Use real avatar if exists
                    if (!fallbackAvatar) {
                        const gender = newUser.gender?.toLowerCase() || 'other';
                        if (gender === 'male') fallbackAvatar = `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&hair=short01,short02,short03,short04,short05,short06,short07,short08&earringsProbability=0`;
                        else if (gender === 'female') fallbackAvatar = `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&glassesProbability=0&mustacheProbability=0&beardProbability=0&hair=long01,long02,long03,long04,long05,long10,long12`;
                        else fallbackAvatar = `https://avatar.iran.liara.run/public?username=${safeName}`;
                    }
                    
                    const renderLat = newUser.latitude + (Math.random() - 0.5) * 0.0002;
                    const renderLng = newUser.longitude + (Math.random() - 0.5) * 0.0002;

                    const newUserObj = {
                        id: newUser.id,
                        name: newUser.username || newUser.full_name || 'User',
                        lat: renderLat,
                        lng: renderLng,
                        avatar: unescape(newUser.avatar_url) || fallbackAvatar, // Use real avatar if exists (defensive unescape just in case)
                        originalAvatar: newUser.avatar_url,
                        status: newUser.status,
                        thought: newUser.status_message,
                        lastActive: newUser.last_active,
                        isLocationOn: true,
                        isLocationShared: true,
                        friendshipStatus: null
                    };

                    setNearbyUsers(prev => {
                        const exists = prev.find(u => u.id === newUser.id);
                        return exists ? prev : [...prev, newUserObj];
                    });
                }
            })
            .subscribe();


        const interval = setInterval(fetchNearbyUsers, 5000); // Poll every 5s (keep for cleanup/timeouts)
        fetchNearbyUsers(); // Initial fetch

        return () => {
            clearInterval(interval);
            supabase.removeChannel(channel);
        };
    }, [location, currentUser]);

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

        if (!navigator.geolocation) {
            setLoading(false);
            return;
        }

        // Get location immediately on mount for instant display
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                setLocation({ lat: latitude, lng: longitude });
                localStorage.setItem('lastLocation', JSON.stringify({ lat: latitude, lng: longitude }));
                setLoading(false);

                // Update DB immediately on login for instant avatar display
                if (parsedUser.id) {
                    await supabase.from('profiles').update({
                        latitude: latitude,
                        longitude: longitude,
                        last_active: new Date().toISOString()
                    }).eq('id', parsedUser.id);
                }
            },
            (error) => {
                console.error('Initial location error:', error);
                setLoading(false);
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );

        // Then start watching for continuous updates
        const watchId = navigator.geolocation.watchPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;

                // Update local state
                setLocation({ lat: latitude, lng: longitude });
                localStorage.setItem('lastLocation', JSON.stringify({ lat: latitude, lng: longitude }));

                // Update DB with throttle to avoid spam
                const now = Date.now();
                const lastUpdate = window.lastLocationUpdate || 0;
                if (parsedUser.id && (now - lastUpdate > 15000)) { // 15s throttle for updates
                    window.lastLocationUpdate = now;
                    await supabase.from('profiles').update({
                        latitude: latitude,
                        longitude: longitude,
                        last_active: new Date().toISOString()
                    }).eq('id', parsedUser.id);
                }
            },
            (error) => {
                console.error(error);
                // Fallback to default if error (same as before)
                if (!location) {
                    const defaultLat = 37.7749;
                    const defaultLng = -122.4194;
                    setLocation({ lat: defaultLat, lng: defaultLng });
                    setLoading(false);
                }
            },
            { enableHighAccuracy: true }
        );

        return () => {
            navigator.geolocation.clearWatch(watchId);
            supabase.removeChannel(profileSub);
            window.removeEventListener('local-user-update', handleLocalUpdate);
        };
    }, [navigate]);

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
        if (!onboardingImage) {
            showToast("A selfie is mandatory! 📸");
            return;
        }

        try {
            showToast("Uploading profile... ⏳");

            let userId = currentUser?.id;
            // Fallback: Check auth if currentUser state is not ready (which shouldn't happen but defensive coding)
            if (!userId) {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) throw new Error("No authenticated user found.");
                userId = user.id;
            }

            // Upload Selfie
            const blob = await (await fetch(onboardingImage)).blob();
            const fileName = `${Date.now()}_${userId}.jpg`;
            const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, blob);

            if (uploadError) {
                console.error("Storage Error:", uploadError);
                throw new Error("Storage Error: " + uploadError.message);
            }

            const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);

            // Update Profile
            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    gender: setupData.gender,
                    status: setupData.status,
                    avatar_url: urlData.publicUrl
                })
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
                ...setupData,
                avatar_url: urlData.publicUrl
            }));

            // Sync to LocalStorage so refresh works
            const updatedUser = {
                ...currentUser,
                id: userId,
                ...setupData,
                avatar_url: urlData.publicUrl
            };
            localStorage.setItem('currentUser', JSON.stringify(updatedUser));

        } catch (error) {
            console.error("Setup Error:", error);
            showToast(`Setup Failed: ${error.message}`);
        }
    };

    const handlePostThought = (e) => {
        e.preventDefault();
        if (!currentUser) return;
        const updatedUser = { ...currentUser, thought: myThought, thoughtTime: Date.now() };
        setCurrentUser(updatedUser);
        localStorage.setItem('currentUser', JSON.stringify(updatedUser));
        setShowThoughtInput(false);
        showToast('Thought posted! It will disappear in 1 hour.');
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
                // Check if already friends or requested
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
                        showToast(`Poke already sent to ${targetUser.name}!`);
                        return;
                    }
                    else if (existing.status === 'declined') {
                        // Allow re-poke: delete old declined request and create new one
                        await supabase
                            .from('friendships')
                            .delete()
                            .eq('id', existing.id);
                    }
                }

                // Send Poke Request
                const { error } = await supabase
                    .from('friendships')
                    .insert({
                        requester_id: currentUser.id,
                        receiver_id: targetUser.id,
                        status: 'pending'
                    });

                if (error) throw error;
                
                showToast(`👋 Poked ${targetUser.name}!`);
                
                // Update UI immediately
                setSelectedUser({ ...targetUser, friendshipStatus: 'pending' });

            } catch (err) {
                console.error(err);
                showToast("Failed to send poke.");
            }
        }
        else if (action === 'block') {
            try {
                // Check if friendship exists
                const { data: existing } = await supabase
                    .from('friendships')
                    .select('*')
                    .or(`and(requester_id.eq.${currentUser.id},receiver_id.eq.${targetUser.id}),and(requester_id.eq.${targetUser.id},receiver_id.eq.${currentUser.id})`)
                    .maybeSingle();

                if (existing) {
                    // Update existing friendship to blocked
                    await supabase
                        .from('friendships')
                        .update({ status: 'blocked' })
                        .eq('id', existing.id);
                } else {
                    // Create new blocked friendship
                    await supabase
                        .from('friendships')
                        .insert({
                            requester_id: currentUser.id,
                            receiver_id: targetUser.id,
                            status: 'blocked'
                        });
                }

                showToast(`🚫 Blocked ${targetUser.name}`);
                setSelectedUser(null);
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

    const createAvatarIcon = (url, isSelf = false, thought = null) => {
        let className = 'avatar-marker';
        // Ensure url is safely wrapped and background is configured
        // Use double quotes for style attribute, single for url
        let style = `background-image: url('${url}'); background-size: cover; background-position: center;`;
        
        if (isSelf) {
            className += ' self';
            if (isGhostMode) style += ' opacity: 0.5; filter: grayscale(100%);';
        }

        // Only show thought if it exists (simplified check)
        const thoughtHTML = thought
            ? `<div class="thought-bubble">${thought}</div>`
            : '';

        return L.divIcon({
            className: 'custom-avatar-icon',
            html: `
                <div class="avatar-group">
                    ${thoughtHTML}
                    <div class="${className}" style="${style}"></div>
                </div>
            `,
            iconSize: [40, 60], // Compact size for map
            iconAnchor: [20, 58], // Adjusted proportionally (feet at location)
            popupAnchor: [0, -55]
        });
    };

    if (loading || !location) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#e0e0e0', color: '#333' }}>
                <h2>Starting Map...</h2>
            </div>
        );
    }

    // visibleUsers filter was redundant with nearbyUsers logic. 
    // We use nearbyUsers directly which is already filtered to 300m and active users.

    return (
        <div className="map-container">
            {/* BLOCKING ONBOARDING MODAL */}
            {showProfileSetup && (
                <div className="onboarding-overlay">
                    <div className="onboarding-card">
                        <h2>Welcome to SocialMap! 👋</h2>
                        <p>Complete your profile to join.</p>

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
                            <label>Mandatory Selfie 📸</label>
                            <div className="camera-box">
                                <canvas ref={canvasRef} style={{ display: 'none' }} />
                                {!isCameraOpen && !onboardingImage && (
                                    <button onClick={startCamera} className="start-cam-btn">Open Camera</button>
                                )}
                                {isCameraOpen && (
                                    <div className="video-wrap">
                                        <video ref={videoRef} autoPlay playsInline muted />
                                        <button onClick={capturePhoto} className="snap-btn"></button>
                                    </div>
                                )}
                                {onboardingImage && !isCameraOpen && (
                                    <div className="preview-wrap">
                                        <img src={onboardingImage} alt="Selfie" />
                                        <button onClick={startCamera} className="retake-sm">Retake</button>
                                    </div>
                                )}
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

                {/* Memoize current user avatar URL to avoid recalculation */}
                {useMemo(() => {
                    if (!currentUser) return null;
                    
                    let avatarUrl;
                    console.log('🟢 [MapHome] Current User Avatar URL:', currentUser.avatar_url);
                    if (currentUser.avatar_url) {
                        avatarUrl = getAvatar2D(currentUser.avatar_url);
                        console.log('🟢 [MapHome] Converted 2D URL:', avatarUrl);
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
                            icon={createAvatarIcon(avatarUrl, true, currentUser.thought)}
                            eventHandlers={{ click: () => setSelectedUser(null) }}
                        />
                    );
                }, [currentUser, location.lat, location.lng])}

                {nearbyUsers.map(u => (
                    <Marker
                        key={`${u.id}-${u.avatar}`}
                        position={[u.lat, u.lng]}
                        icon={createAvatarIcon(getAvatar2D(u.avatar), false, u.thought)}
                        eventHandlers={{
                            click: async () => {

                                // Fetch friendship status synchronously to update UI instantly
                                let status = null;
                                // Optimistically show card while loading if needed, but fetch runs fast.
                                // We check if there's friendship where (me=req, them=rec) OR (me=rec, them=req)
                                const { data } = await supabase
                                    .from('friendships')
                                    .select('id, status, requester_id, receiver_id, muted_until_by_requester, muted_until_by_receiver')
                                    .or(`and(requester_id.eq.${currentUser.id},receiver_id.eq.${u.id}),and(requester_id.eq.${u.id},receiver_id.eq.${currentUser.id})`)
                                    .maybeSingle(); 

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
                                    friendshipStatus: data?.status || null,
                                    isMuted: isMuted,
                                    friendshipId: data?.id,
                                    requesterId: data?.requester_id,
                                    receiverId: data?.receiver_id
                                });


                            }
                        }}
                    />
                ))}
            </MapContainer>

            <UserProfileCard 
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
                        <h3>⚠️ Report {reportTarget.name}</h3>
                        <p>Please select a reason for reporting:</p>
                        <div className="report-reasons">
                            <button onClick={() => handleReport('Fake or Misleading Profile')}>
                                🎭 Fake or Misleading Profile
                            </button>
                            <button onClick={() => handleReport('Harassment or Misbehavior')}>
                                😡 Harassment or Misbehavior
                            </button>
                            <button onClick={() => handleReport('Location Misuse')}>
                                📍 Location Misuse
                            </button>
                            <button onClick={() => handleReport('Underage or Safety Concern')}>
                                🔞 Underage or Safety Concern
                            </button>
                            <button onClick={() => handleReport('Other')}>
                                ❓ Other
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

            <style>{`
                .report-modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.75);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 3000;
                    animation: fadeIn 0.3s ease-out;
                }

                .report-modal-card {
                    background: rgba(20, 20, 20, 0.9);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 24px;
                    padding: 30px;
                    width: 90%;
                    max-width: 380px;
                    text-align: center;
                    box-shadow: 
                        0 20px 60px rgba(0, 0, 0, 0.6),
                        0 0 0 1px rgba(255, 255, 255, 0.05) inset;
                    color: white;
                    animation: scaleIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
                    position: relative;
                    overflow: hidden;
                }
                
                /* Subtle top shimmer */
                .report-modal-card::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0;
                    height: 1px;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
                }

                .report-modal-card h3 {
                    margin: 0 0 10px 0;
                    font-size: 1.4rem;
                    font-weight: 700;
                    background: linear-gradient(to right, #fff, #ccc);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }

                .report-modal-card p {
                    color: #888;
                    margin-bottom: 25px;
                    font-size: 0.95rem;
                    font-weight: 400;
                    line-height: 1.4;
                }

                .report-reasons {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    margin-bottom: 25px;
                }

                .report-reasons button {
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    color: #eee;
                    padding: 16px;
                    border-radius: 16px;
                    font-size: 1rem;
                    text-align: left;
                    cursor: pointer;
                    transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    font-weight: 500;
                }

                .report-reasons button:hover {
                    background: rgba(255, 69, 58, 0.1);
                    border-color: rgba(255, 69, 58, 0.4);
                    color: #ff5e55;
                    transform: translateX(4px) scale(1.01);
                    box-shadow: 0 4px 12px rgba(255, 69, 58, 0.1);
                }

                .report-reasons button:active {
                    transform: scale(0.98);
                }

                .cancel-report-btn {
                    width: 100%;
                    padding: 14px;
                    background: rgba(255, 255, 255, 0.05);
                    border: none;
                    border-radius: 16px;
                    color: #999;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-size: 1rem;
                }

                .cancel-report-btn:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: #fff;
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
                                <button type="submit" className="primary">Post</button>
                            </div>
                        </form>
                        <p className="hint">Disappears in 1 hour</p>
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
                /* Onboarding Styles */
                .onboarding-overlay {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.95); /* Solid dark, no blur */
                    z-index: 999999; /* Super high z-index */
                    display: flex; align-items: center; justify-content: center;
                }
                .onboarding-card {
                    background: #1e1e24; padding: 30px; border-radius: 20px;
                    width: 90%; max-width: 400px; color: white;
                    border: 1px solid rgba(255,255,255,0.1);
                    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                    max-height: 90vh; overflow-y: auto;
                }
                .onboarding-card h2 { margin-top: 0; background: linear-gradient(to right, #00f0ff, #bd00ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
                .ob-section { margin-bottom: 20px; }
                .ob-section label { display: block; margin-bottom: 8px; font-weight: 600; color: #aaa; }
                .chip-group { display: flex; flex-wrap: wrap; gap: 8px; }
                .chip {
                    background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.1);
                    color: white; padding: 6px 12px; border-radius: 15px; cursor: pointer;
                }
                .chip.selected { background: #00f0ff; color: black; border-color: #00f0ff; font-weight: bold; }
                
                .camera-box {
                    width: 100%; height: 200px; background: black; border-radius: 12px;
                    overflow: hidden; position: relative; border: 1px dashed #555;
                    display: flex; align-items: center; justify-content: center;
                }
                .start-cam-btn { background: white; color: black; padding: 10px 20px; border-radius: 20px; border: none; font-weight: bold; cursor: pointer; }
                .video-wrap, .preview-wrap { width: 100%; height: 100%; position: relative; }
                .video-wrap video, .preview-wrap img { width: 100%; height: 100%; object-fit: cover; }
                .snap-btn {
                    position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
                    width: 50px; height: 50px; background: white; border-radius: 50%; border: 4px solid rgba(0,0,0,0.3);
                }
                .retake-sm {
                    position: absolute; bottom: 10px; right: 10px;
                    background: rgba(0,0,0,0.6); color: white; border: none; padding: 5px 10px; border-radius: 5px;
                }
                .complete-btn {
                    width: 100%; padding: 15px; background: linear-gradient(to right, #00f0ff, #bd00ff);
                    color: white; font-weight: bold; font-size: 1.1rem; border: none; border-radius: 12px; cursor: pointer;
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
                
                @media (prefers-color-scheme: dark) {
                    html[data-theme="system"] #root .stats-card {
                        background: white !important;
                        color: #000000 !important;
                    }
                    html[data-theme="system"] #root .stats-card span,
                    html[data-theme="system"] #root .stats-card strong,
                    html[data-theme="system"] #root .stats-card div {
                        color: #000000 !important;
                    }
                }
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
                
                .avatar-marker {
                    width: 100%; height: 100%;
                    background-color: transparent;
                    background-size: contain;
                    background-repeat: no-repeat;
                    background-position: center bottom;
                    transition: all 0.3s ease;
                }
                .avatar-marker.self {
                    filter: drop-shadow(0 0 5px rgba(66, 133, 244, 0.5));
                }

            `}</style>
        </div>
    );
}
