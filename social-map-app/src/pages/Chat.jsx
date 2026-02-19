import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import AgoraRTC from "agora-rtc-sdk-ng";
import Toast from '../components/Toast';
import Badge from '../components/Badge';
import { getAvatarHeadshot, DEFAULT_MALE_AVATAR, DEFAULT_FEMALE_AVATAR, DEFAULT_GENERIC_AVATAR } from '../utils/avatarUtils';
import { getBlockedUserIds, blockUser, unblockUser, isUserBlocked } from '../utils/blockUtils';
import AttachmentPicker from '../components/AttachmentPicker';
import AttachmentPreview from '../components/AttachmentPreview';
import MessageAttachment from '../components/MessageAttachment';
import MessageBubble from '../components/MessageBubble';
import { uploadToStorage, validateFile } from '../utils/fileUpload';
import EmojiPicker from 'emoji-picker-react';
import { usePresence } from '../hooks/usePresence';
import { initializePresence, cleanupPresence } from '../services/presenceService';
import { useIncomingCall } from '../hooks/useIncomingCall';
import IncomingCallPopup from '../components/IncomingCallPopup';
import { initiateCall } from '../services/callSignalingService';
import StatusView from '../components/StatusView';
import StoryViewer from '../components/StoryViewer';
import { useCall } from '../context/CallContext';
import { useLocationContext } from '../context/LocationContext';

const APP_ID = import.meta.env.VITE_AGORA_APP_ID; // Moved to environment variable for security

// Chat Theme Configuration
const CHAT_THEMES = {
    // 🏆 RECOMMENDED DEFAULT SET
    clean_slate: { name: 'Clean Slate', emoji: '✨', fontColor: '#212121', backgroundColor: '#ffffff', backgroundPattern: 'none', bubbleSent: '#f5f5f5', bubbleReceived: '#ffffff', accentColor: '#212121', iconColor: '#212121', textColor: '#212121', type: 'light' },
    love_bloom: { name: 'Love Bloom', emoji: '💕', fontColor: '#e91e63', backgroundColor: '#fff0f5', backgroundPattern: 'hearts', bubbleSent: '#f8bbd0', bubbleReceived: '#ffebee', accentColor: '#e91e63', iconColor: '#e91e63', textColor: '#880e4f', type: 'light' },
    leaf_drift: { name: 'Leaf Drift', emoji: '🍃', fontColor: '#2e7d32', backgroundColor: '#e8f5e9', backgroundPattern: 'leaves', bubbleSent: '#a5d6a7', bubbleReceived: '#c8e6c9', accentColor: '#2e7d32', iconColor: '#2e7d32', textColor: '#1b5e20', type: 'light' },
    midnight_noir: { name: 'Midnight Noir', emoji: '🌙', fontColor: '#e0e0e0', backgroundColor: '#121212', backgroundPattern: 'geometric', bubbleSent: '#212121', bubbleReceived: '#000000', accentColor: '#ffffff', iconColor: '#ffffff', textColor: '#e0e0e0', type: 'dark' },
    pastel_dream: { name: 'Pastel Dream', emoji: '🦄', fontColor: '#9c27b0', backgroundColor: '#f3e5f5', backgroundPattern: 'none', bubbleSent: '#e1bee7', bubbleReceived: '#f8bbd0', accentColor: '#ab47bc', iconColor: '#ab47bc', textColor: '#4a148c', type: 'light' },
    neon_pop: { name: 'Neon Pop', emoji: '⚡', fontColor: '#00e676', backgroundColor: '#000000', backgroundPattern: 'geometric', bubbleSent: '#263238', bubbleReceived: '#212121', accentColor: '#00e676', iconColor: '#00e676', textColor: '#00e676', type: 'dark' },

    // ❤️ Love / Emotion Themes
    crimson_heart: { name: 'Crimson Heart', emoji: '🌹', fontColor: '#d50000', backgroundColor: '#ffebee', backgroundPattern: 'hearts', bubbleSent: '#ffcdd2', bubbleReceived: '#ff8a80', accentColor: '#d50000', iconColor: '#d50000', textColor: '#b71c1c', type: 'light' },
    rose_whisper: { name: 'Rose Whisper', emoji: '🌷', fontColor: '#ad1457', backgroundColor: '#fce4ec', backgroundPattern: 'hearts', bubbleSent: '#f48fb1', bubbleReceived: '#f8bbd0', accentColor: '#ad1457', iconColor: '#ad1457', textColor: '#880e4f', type: 'light' },
    cupid_glow: { name: 'Cupid Glow', emoji: '💘', fontColor: '#c2185b', backgroundColor: '#f8bbd0', backgroundPattern: 'hearts', bubbleSent: '#f06292', bubbleReceived: '#f48fb1', accentColor: '#c2185b', iconColor: '#c2185b', textColor: '#880e4f', type: 'light' },
    scarlet_vibe: { name: 'Scarlet Vibe', emoji: '💋', fontColor: '#b71c1c', backgroundColor: '#ffcdd2', backgroundPattern: 'hearts', bubbleSent: '#ef5350', bubbleReceived: '#e57373', accentColor: '#b71c1c', iconColor: '#b71c1c', textColor: '#b71c1c', type: 'light' },

    // 🌿 Nature Themes
    green_haven: { name: 'Green Haven', emoji: '🏡', fontColor: '#1b5e20', backgroundColor: '#c8e6c9', backgroundPattern: 'leaves', bubbleSent: '#66bb6a', bubbleReceived: '#81c784', accentColor: '#1b5e20', iconColor: '#1b5e20', textColor: '#1b5e20', type: 'light' },
    forest_calm: { name: 'Forest Calm', emoji: '🌲', fontColor: '#33691e', backgroundColor: '#dcedc8', backgroundPattern: 'leaves', bubbleSent: '#aed581', bubbleReceived: '#c5e1a5', accentColor: '#33691e', iconColor: '#33691e', textColor: '#33691e', type: 'light' },
    mint_breeze: { name: 'Mint Breeze', emoji: '🍃', fontColor: '#00695c', backgroundColor: '#e0f2f1', backgroundPattern: 'leaves', bubbleSent: '#80cbc4', bubbleReceived: '#b2dfdb', accentColor: '#00695c', iconColor: '#00695c', textColor: '#004d40', type: 'light' },
    earth_touch: { name: 'Earth Touch', emoji: '🌍', fontColor: '#3e2723', backgroundColor: '#d7ccc8', backgroundPattern: 'leaves', bubbleSent: '#a1887f', bubbleReceived: '#bcaaa4', accentColor: '#3e2723', iconColor: '#3e2723', textColor: '#3e2723', type: 'light' },

    // 🌙 Dark / Night Themes
    dark_pulse: { name: 'Dark Pulse', emoji: '🌌', fontColor: '#7c4dff', backgroundColor: '#121212', backgroundPattern: 'geometric', bubbleSent: '#311b92', bubbleReceived: '#1a1a1a', accentColor: '#7c4dff', iconColor: '#7c4dff', textColor: '#ede7f6', type: 'dark' },
    moon_shadow: { name: 'Moon Shadow', emoji: '🌑', fontColor: '#b0bec5', backgroundColor: '#263238', backgroundPattern: 'geometric', bubbleSent: '#37474f', bubbleReceived: '#455a64', accentColor: '#cfd8dc', iconColor: '#cfd8dc', textColor: '#eceff1', type: 'dark' },
    obsidian: { name: 'Obsidian', emoji: '🖤', fontColor: '#9e9e9e', backgroundColor: '#000000', backgroundPattern: 'none', bubbleSent: '#212121', bubbleReceived: '#424242', accentColor: '#ffffff', iconColor: '#ffffff', textColor: '#f5f5f5', type: 'dark' },
    night_wave: { name: 'Night Wave', emoji: '🌊', fontColor: '#4fc3f7', backgroundColor: '#0d47a1', backgroundPattern: 'geometric', bubbleSent: '#1565c0', bubbleReceived: '#1976d2', accentColor: '#4fc3f7', iconColor: '#4fc3f7', textColor: '#e1f5fe', type: 'dark' },

    // ☀️ Light / Clean Themes
    pure_white: { name: 'Pure White', emoji: '🏳️', fontColor: '#212121', backgroundColor: '#ffffff', backgroundPattern: 'none', bubbleSent: '#f5f5f5', bubbleReceived: '#ffffff', accentColor: '#9e9e9e', iconColor: '#9e9e9e', textColor: '#212121', type: 'light' },
    soft_cloud: { name: 'Soft Cloud', emoji: '☁️', fontColor: '#546e7a', backgroundColor: '#eceff1', backgroundPattern: 'none', bubbleSent: '#cfd8dc', bubbleReceived: '#b0bec5', accentColor: '#607d8b', iconColor: '#607d8b', textColor: '#37474f', type: 'light' },
    ivory_mist: { name: 'Ivory Mist', emoji: '🌫️', fontColor: '#5d4037', backgroundColor: '#efebe9', backgroundPattern: 'none', bubbleSent: '#d7ccc8', bubbleReceived: '#bcaaa4', accentColor: '#5d4037', iconColor: '#5d4037', textColor: '#3e2723', type: 'light' },
    minimal_day: { name: 'Minimal Day', emoji: '☀️', fontColor: '#37474f', backgroundColor: '#ffffff', backgroundPattern: 'none', bubbleSent: '#f5f5f5', bubbleReceived: '#ffffff', accentColor: '#ff9800', iconColor: '#ff9800', textColor: '#263238', type: 'light' },

    // ✨ Fun / Stylish Themes
    velvet_glow: { name: 'Velvet Glow', emoji: '🔮', fontColor: '#e040fb', backgroundColor: '#4a148c', backgroundPattern: 'geometric', bubbleSent: '#7b1fa2', bubbleReceived: '#6a1b9a', accentColor: '#e040fb', iconColor: '#e040fb', textColor: '#f3e5f5', type: 'dark' },
    aura_spark: { name: 'Aura Spark', emoji: '✨', fontColor: '#ffd740', backgroundColor: '#311b92', backgroundPattern: 'geometric', bubbleSent: '#5e35b1', bubbleReceived: '#4527a0', accentColor: '#ffd740', iconColor: '#ffd740', textColor: '#fff8e1', type: 'dark' },
    bubble_joy: { name: 'Bubble Joy', emoji: '🛁', fontColor: '#00bcd4', backgroundColor: '#e0f7fa', backgroundPattern: 'confetti', bubbleSent: '#b2ebf2', bubbleReceived: '#80deea', accentColor: '#00bcd4', iconColor: '#00bcd4', textColor: '#006064', type: 'light' },

    // 🎉 Festival / Special Themes
    diwali_glow: { name: 'Diwali Glow', emoji: '🪔', fontColor: '#ff6f00', backgroundColor: '#210a00', backgroundPattern: 'confetti', bubbleSent: '#ff8f00', bubbleReceived: '#ffb300', accentColor: '#ffca28', iconColor: '#ffca28', textColor: '#fff8e1', type: 'dark' },
    spring_fest: { name: 'Spring Fest', emoji: '🌸', fontColor: '#f06292', backgroundColor: '#fce4ec', backgroundPattern: 'leaves', bubbleSent: '#f8bbd0', bubbleReceived: '#f48fb1', accentColor: '#ec407a', iconColor: '#ec407a', textColor: '#880e4f', type: 'light' },
    autumn_gold: { name: 'Autumn Gold', emoji: '🍂', fontColor: '#e65100', backgroundColor: '#fff3e0', backgroundPattern: 'leaves', bubbleSent: '#ffcc80', bubbleReceived: '#ffe0b2', accentColor: '#ef6c00', iconColor: '#ef6c00', textColor: '#e65100', type: 'light' },
    winter_snow: { name: 'Winter Snow', emoji: '❄️', fontColor: '#0288d1', backgroundColor: '#e1f5fe', backgroundPattern: 'geometric', bubbleSent: '#b3e5fc', bubbleReceived: '#81d4fa', accentColor: '#0288d1', iconColor: '#0288d1', textColor: '#01579b', type: 'light' },
    celebration_mode: { name: 'Celebration', emoji: '🎊', fontColor: '#6200ea', backgroundColor: '#f3e5f5', backgroundPattern: 'confetti', bubbleSent: '#d1c4e9', bubbleReceived: '#b39ddb', accentColor: '#651fff', iconColor: '#651fff', textColor: '#311b92', type: 'light' }
};

export default function Chat() {
    const [activeChatUser, setActiveChatUser] = useState(null);
    const [selectedStoryUser, setSelectedStoryUser] = useState(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0); // For StoryViewer
    const [chats, setChats] = useState(() => {
        const cached = localStorage.getItem('cached_chats_list');
        return cached ? JSON.parse(cached) : [];
    });
    const [totalUnreadCount, setTotalUnreadCount] = useState(0);
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(() => {
        return !localStorage.getItem('cached_chats_list');
    });
    
    // Selection mode for chat deletion
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedChats, setSelectedChats] = useState(new Set());
    const longPressTimerRef = useRef(null);
    
    const navigate = useNavigate();
    const location = useLocation();
    const { incomingCall, startCall: startGlobalCall, answerCall, rejectCall, sendQuickReply } = useCall();
    const { isLocationEnabled } = useLocationContext();

    // ------------------------------------------------------------------
    // 🔗 URL PERSISTENCE LOGIC (Re-open chat on refresh)
    // ------------------------------------------------------------------
    
    // 1. Sync URL with activeChatUser — push a history entry so back button can return to chat list
    useEffect(() => {
        if (activeChatUser) {
            // Push a new history entry so the browser back gesture can be intercepted
            const newUrl = `${window.location.pathname}?chatId=${activeChatUser.id}`;
            window.history.pushState({ chatId: activeChatUser.id }, '', newUrl);
        } else {
            // Clear param
            window.history.replaceState(null, '', window.location.pathname);
        }
    }, [activeChatUser]);

    // Intercept browser/device back button while in a chat room
    useEffect(() => {
        const handlePopState = (e) => {
            // If we have an active chat, intercept back and go to chat list
            if (activeChatUser) {
                setActiveChatUser(null);
                // Do NOT call navigate(-1) — staying on /chat page
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [activeChatUser]);

    // 2. Restore chat from URL on Load
    useEffect(() => {
        // Only run if we have chats loaded and no active user yet
        if (!activeChatUser && chats.length > 0) {
            const params = new URLSearchParams(location.search);
            const chatId = params.get('chatId');

            if (chatId) {
                // Find user in cached chats
                const savedChat = chats.find(c => c.id === chatId);
                if (savedChat) {
                    // Construct full profile object from cached chat data
                    const userProfile = {
                        id: savedChat.id,
                        username: savedChat.name, // Fallback if username missing
                        full_name: savedChat.name, 
                        avatar_url: savedChat.avatar,
                        status: 'Online', // Optimistic, will update via presence
                        last_seen: savedChat.time
                    };
                    console.log("🔄 Restoring chat session for:", userProfile.username);
                    setActiveChatUser(userProfile);
                }
            }
        }
    }, [location.search, chats, activeChatUser]);

    // Refactored fetchChats to be a pure function that returns the chat data
    const fetchChats = async (userId) => {
        // 1. Fetch all accepted friendships (for "Friend" status, if needed later)
        const { data: friendships, error: friendError } = await supabase
            .from('friendships')
            .select(`
                id,
                requester:profiles!requester_id(id, full_name, username, avatar_url, status, gender, show_last_seen),
                receiver:profiles!receiver_id(id, full_name, username, avatar_url, status, gender, show_last_seen)
            `)
            .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
            .eq('status', 'accepted');

        if (friendError) {
            console.error("Error fetching chats:", friendError);
            return [];
        }

        // 2. Fetch all unique users I have exchanged messages with (to include non-friends)
        // We fetch distinct sender/receiver IDs from messages involving me.
        const { data: sentMessages } = await supabase
            .from('messages')
            .select('receiver_id')
            .eq('sender_id', userId);
            
        const { data: receivedMessages } = await supabase
            .from('messages')
            .select('sender_id')
            .eq('receiver_id', userId);

        // Collect all unique Partner IDs
        const partnerIds = new Set();
        
        // Add friends first
        friendships.forEach(f => {
            const isRequester = f.requester.id === userId;
            partnerIds.add(isRequester ? f.receiver.id : f.requester.id);
        });

        // Add message partners
        if (sentMessages) sentMessages.forEach(m => partnerIds.add(m.receiver_id));
        if (receivedMessages) receivedMessages.forEach(m => partnerIds.add(m.sender_id));

        // Remove self if somehow present
        partnerIds.delete(userId);

        if (partnerIds.size === 0) {
            return [];
        }

        // 3. Fetch Profiles for ALL these partners
        const validPartnerIds = Array.from(partnerIds).filter(id => id); // Filter out null/undefined/empty string
        
        if (validPartnerIds.length === 0) return [];

        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, username, avatar_url, status, gender, hide_status, show_last_seen')
            .in('id', validPartnerIds);

        if (!profiles) {
            return [];
        }

        // 4. Fetch last message and unread count for each partner
        const chatsWithDetails = await Promise.all(profiles.map(async partner => {
            // Fetch last message (fetch more to handle deleted ones)
            const { data: recentMessages } = await supabase
                .from('messages')
                .select('content, created_at, sender_id, message_type, deleted_for')
                .or(`and(sender_id.eq.${userId},receiver_id.eq.${partner.id}),and(sender_id.eq.${partner.id},receiver_id.eq.${userId})`)
                .order('created_at', { ascending: false })
                .limit(50); // Fetch top 50 to find first non-deleted (increased from 10)

            // Find first message NOT deleted for me
            const lastMessage = recentMessages?.find(msg => {
                const deletedFor = msg.deleted_for || [];
                return !deletedFor.includes(userId);
            });

            let lastMsgContent = 'Tap to chat';
            let lastMsgTime = '';
            let rawTime = 0;

            if (lastMessage) {
                if (lastMessage.message_type === 'system') {
                    // Handle system messages (like theme changes)
                    if (lastMessage.content.includes('changed the theme')) {
                        // Determine sender name by checking who sent it
                        let senderName;
                        const isSenderCurrentUser = String(lastMessage.sender_id) === String(userId);
                        
                        if (isSenderCurrentUser) {
                            senderName = 'You';
                        } else {
                            // The sender is the partner (the other person in this chat)
                            senderName = partner.username || partner.full_name || 'Friend';
                        }
                        lastMsgContent = `${senderName} ${lastMessage.content}`;
                    } else {
                        lastMsgContent = lastMessage.content;
                    }
                } else if (lastMessage.message_type === 'call_log' || (typeof lastMessage.content === 'string' && lastMessage.content.trim().startsWith('{') && lastMessage.content.includes('"status"'))) {
                    try {
                        const callData = typeof lastMessage.content === 'string' ? JSON.parse(lastMessage.content) : lastMessage.content;
                        const status = callData.status;
                        const callType = (callData.call_type === 'video' || callData.call_type === 'video_call') ? 'Video' : 'Audio';
                        const typeStr = `${callType} call`;

                        if (status === 'missed' || status === 'busy') {
                            lastMsgContent = `📞 Missed ${typeStr.toLowerCase()}`;
                        } else if (status === 'declined' || status === 'rejected') {
                            lastMsgContent = `${typeStr} • Declined`;
                        } else if (status === 'calling' || status === 'ringing') {
                             const isMyCall = lastMessage.sender_id === userId;
                             lastMsgContent = isMyCall ? `📞 Calling...` : `📞 Incoming ${typeStr}...`;
                        } else {
                            // Accepted/Ended
                            const direction = lastMessage.sender_id === userId ? 'Outgoing' : 'Incoming';
                            lastMsgContent = `${direction} ${typeStr}`;
                        }
                    } catch (e) {
                         lastMsgContent = '📞 Call log';
                    }
                } else if (lastMessage.message_type === 'image') {
                    lastMsgContent = lastMessage.sender_id === userId ? 'You: 📷 Photo' : '📷 Photo';
                } else if (lastMessage.message_type === 'attachment') {
                    lastMsgContent = lastMessage.sender_id === userId ? 'You: 📎 Attachment' : '📎 Attachment';
                } else {
                    lastMsgContent = lastMessage.sender_id === userId ? `You: ${lastMessage.content}` : lastMessage.content;
                }
                
                const date = new Date(lastMessage.created_at);
                lastMsgTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                rawTime = date.getTime();
            }

            // Fetch unread count (excluding system messages and deleted messages)
            const { data: unreadMessages } = await supabase
                .from('messages')
                .select('id, deleted_for')
                .eq('sender_id', partner.id)
                .eq('receiver_id', userId)
                .eq('is_read', false)
                .neq('message_type', 'system'); // Exclude system messages from unread count
            
            // Filter out deleted messages client-side
            const count = unreadMessages ? unreadMessages.filter(msg => {
                const deletedFor = msg.deleted_for || [];
                return !deletedFor.includes(userId);
            }).length : 0;

            // Fetch mute settings
            const { data: muteData } = await supabase
                .from('chat_settings')
                .select('muted_until')
                .eq('user_id', userId)
                .eq('partner_id', partner.id)
                .maybeSingle();

            const muteSettings = currentUser?.mute_settings;
            const isGlobalMuted = muteSettings?.mute_all && (!muteSettings.muted_until || new Date(muteSettings.muted_until) > new Date());
            const isMuted = isGlobalMuted || (muteData && muteData.muted_until && new Date(muteData.muted_until) > new Date());

            // Avatar Logic: Prefer stored avatar, else generate consistent one
            // similar to MapHome logic
            // Avatar Logic: Prefer stored avatar, else strict constant based on gender
            let rawAvatar = partner.avatar_url;
            if (!rawAvatar) {
                 if (partner.gender === 'Male') rawAvatar = DEFAULT_MALE_AVATAR;
                 else if (partner.gender === 'Female') rawAvatar = DEFAULT_FEMALE_AVATAR;
                 else rawAvatar = DEFAULT_GENERIC_AVATAR;
            }
            const genderAvatar = getAvatarHeadshot(rawAvatar);

            return {
                id: partner.id,
                name: partner.username,
                avatar: genderAvatar,
                lastMsg: lastMsgContent,
                time: lastMsgTime,
                rawTime: rawTime,
                unread: count || 0,
                isMuted: isMuted,
                fullProfile: partner
            };
        }));
        return chatsWithDetails.sort((a, b) => {
            // Sort by time (newest first)
            const timeA = new Date(a.rawTime || 0);
            const timeB = new Date(b.rawTime || 0);
            return timeB - timeA;
        });
    };

    // Sub-function to actually run the fetch
    const loadChats = async (userId) => {
        // Only set loading if we don't have data
        if (chats.length === 0) setLoading(true);
        
        const results = await fetchChats(userId);
        setChats(results);
        
        // Cache the results
        localStorage.setItem('cached_chats_list', JSON.stringify(results));
        
        // Calculate total unread count
        const total = results.reduce((sum, chat) => sum + (chat.unread || 0), 0);
        setTotalUnreadCount(total);
        
        setLoading(false);
    };

    const [connectionStatus, setConnectionStatus] = useState('connecting');

    // Helper to fetch profile for new chats
    const fetchProfileAndAddChat = async (userId, lastMsg, time, rawTime) => {
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
            
        if (profile) {
            setChats(prev => {
                // Double check it wasn't added in the meantime
                if (prev.find(c => String(c.id) === String(userId))) return prev;
                
                const newChat = {
                    id: profile.id,
                    name: profile.username || 'User',
                    avatar: getAvatarHeadshot(profile.avatar_url || (profile.gender === 'Male' ? DEFAULT_MALE_AVATAR : profile.gender === 'Female' ? DEFAULT_FEMALE_AVATAR : DEFAULT_GENERIC_AVATAR)),
                    lastMsg: lastMsg,
                    time: time,
                    rawTime: rawTime,
                    unread: 1,
                    isMuted: false, // Default
                    fullProfile: profile
                };
                return [newChat, ...prev];
            });
        }
    };

    // Real-time Chat List Updates
    useEffect(() => {
        if (!currentUser) return;

        const channelName = `chat_list_updates_${currentUser.id}`;
        console.log('🔌 [ChatList] Subscribing to channel:', channelName);

        const channel = supabase.channel(channelName)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
                // Client-side filter: Only care about messages sent TO me
                if (String(payload.new.receiver_id) !== String(currentUser.id)) return;

                console.log('🔔 [ChatList] NEW MESSAGE:', payload.new);

                const senderId = payload.new.sender_id;


                
                // Format message content based on type
                let newContent;
                if (payload.new.message_type === 'system') {
                    // Handle system messages (like theme changes)
                    if (payload.new.content.includes('changed the theme')) {
                        const senderName = String(payload.new.sender_id) === String(currentUser.id) ? 'You' : null;
                        // If sender is current user, show "You", otherwise we'll fetch the sender's name below
                        newContent = senderName ? `${senderName} ${payload.new.content}` : payload.new.content;
                    } else {
                        newContent = payload.new.content;
                    }
                } else if (payload.new.message_type === 'call_log' || (typeof payload.new.content === 'string' && payload.new.content.trim().startsWith('{') && payload.new.content.includes('"status"'))) {
                    try {
                        const callData = typeof payload.new.content === 'string' ? JSON.parse(payload.new.content) : payload.new.content;
                        const status = callData.status;
                        const callType = (callData.call_type === 'video' || callData.call_type === 'video_call') ? 'Video' : 'Audio';
                        const typeStr = `${callType} call`;

                        if (status === 'missed' || status === 'busy') {
                            newContent = `📞 Missed ${typeStr.toLowerCase()}`;
                        } else if (status === 'declined' || status === 'rejected') {
                            newContent = `${typeStr} • Declined`;
                        } else if (status === 'calling' || status === 'ringing') {
                             const isMyCall = payload.new.sender_id === currentUser.id;
                             newContent = isMyCall ? `📞 Calling...` : `📞 Incoming ${typeStr}...`;
                        } else {
                            // Accepted/Ended
                            const direction = payload.new.sender_id === currentUser.id ? 'Outgoing' : 'Incoming';
                            newContent = `${direction} ${typeStr}`;
                        }
                    } catch (e) {
                         newContent = '📞 Call log';
                    }
                } else if (payload.new.message_type === 'image') {
                    newContent = '📷 Photo';
                } else if (payload.new.message_type === 'attachment') {
                    newContent = '📎 Attachment';
                } else {
                    // Fallback: Check if it's a raw JSON string (Call Log) that slipped through
                    if (typeof payload.new.content === 'string' && payload.new.content.trim().startsWith('{') && payload.new.content.includes('"status"')) {
                         try {
                            const callData = JSON.parse(payload.new.content);
                            const status = callData.status;
                            const callType = (callData.call_type === 'video' || callData.call_type === 'video_call') ? 'Video' : 'Audio';
                            
                            if (status === 'calling' || status === 'ringing') {
                                const isMyCall = payload.new.sender_id === currentUser.id;
                                newContent = isMyCall ? `📞 Calling...` : `📞 Incoming ${callType} call...`;
                            } else if (status === 'missed') {
                                newContent = `📞 Missed ${callType.toLowerCase()} call`;
                            } else {
                                newContent = `📞 ${callType} call`;
                            }
                         } catch (e) {
                            newContent = payload.new.content;
                         }
                    } else {
                        newContent = payload.new.content;
                    }
                }
                
                // Format time string
                const date = new Date(payload.new.created_at);
                const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                setChats(prev => {
                    const existingChatIndex = prev.findIndex(chat => String(chat.id) === String(senderId));
                    
                    // For system messages from others, prepend their name
                    if (payload.new.message_type === 'system' && 
                        payload.new.content.includes('changed the theme') &&
                        String(payload.new.sender_id) !== String(currentUser.id)) {
                        if (existingChatIndex !== -1) {
                            const chatName = prev[existingChatIndex].name;
                            const senderName = chatName || 'Friend';
                            newContent = `${senderName} ${payload.new.content}`;
                        }
                    }
                    
                    if (existingChatIndex !== -1) {
                        // Update existing chat
                        const updatedChats = [...prev];
                        const chat = updatedChats[existingChatIndex];
                        
                        updatedChats[existingChatIndex] = {
                            ...chat,
                            lastMsg: newContent,
                            time: timeString,
                            rawTime: payload.new.created_at,
                            unread: chat.unread + 1
                        };
                        
                        // Move to top
                        const movedChat = updatedChats.splice(existingChatIndex, 1)[0];
                        updatedChats.unshift(movedChat);
                        return updatedChats;
                    } else {
                        // New conversation - fetch profile
                        fetchProfileAndAddChat(senderId, newContent, timeString, payload.new.created_at);
                        return prev;
                    }
                });
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
                 // Check if it's a read status update for a message sent TO me
                 if (String(payload.new.receiver_id) === String(currentUser.id)) {
                     if (payload.new.is_read && !payload.old.is_read) {
                         setChats(prev => prev.map(chat => {
                             if (String(chat.id) === String(payload.new.sender_id)) {
                                 return { ...chat, unread: Math.max(0, chat.unread - 1) };
                             }
                             return chat;
                         }));
                     }
                 }
            })
            .subscribe((status) => {
                console.log(`🔌 [ChatList] Subscription status: ${status}`);
                if (status === 'SUBSCRIBED') setConnectionStatus('connected');
                else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') setConnectionStatus('disconnected');
                else setConnectionStatus('connecting');
            });

        return () => {
            console.log('🔌 [ChatList] Cleaning up subscription');
            supabase.removeChannel(channel);
        };
    }, [currentUser]);

    // Offline -> Online Sync: Mark pending messages as delivered
    useEffect(() => {
        const markAllAsDelivered = async () => {
            if (currentUser && connectionStatus === 'connected') {
                await supabase
                    .from('messages')
                    .update({ 
                        delivery_status: 'delivered', 
                        delivered_at: new Date().toISOString() 
                    })
                    .eq('receiver_id', currentUser.id)
                    .eq('delivery_status', 'sent');
            }
        };
        
        markAllAsDelivered();
    }, [currentUser, connectionStatus]);



    const initChat = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            navigate('/login');
            return;
        }
        
        // Fetch full profile to get avatar and username
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
            
        setCurrentUser(profile || user);
        
        // Initialize presence tracking
        initializePresence(user.id);
        
        // If navigated with a target user (from Map or Friends), open that chat immediately
        const passedUser = location.state?.targetUser || location.state?.selectedUser;
        if (passedUser) {
            setActiveChatUser(passedUser);
        }

        loadChats(user.id);
    };

    useEffect(() => {
        initChat();
        
        // Cleanup presence on unmount
        return () => {
            if (currentUser?.id) {
                cleanupPresence(currentUser.id);
            }
        };
    }, [location.state]);

    // Real-time Friendship Updates for Chat List removal/addition
    useEffect(() => {
        if (!currentUser) return;

        const channel = supabase.channel(`friendship_updates_chat_${currentUser.id}`)
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'friendships' 
            }, async (payload) => {
                const { eventType, old: oldRec, new: newRec } = payload;
                
                // HANDLE UNFRIEND (DELETE)
                if (eventType === 'DELETE') {
                     // We don't have the partner ID easily in DELETE payload (only row ID).
                     // But we can filter our 'chats' list to see if any match the friendship_id?
                     // Wait, we don't store friendship_id in 'chats' state currently.
                     // Alternative: Refresh the entire list? Or just rely on activeChatUser check?
                     
                     // If we are in active chat, checking is critical.
                     if (activeChatUser) {
                        // Optimistic check: if we can't verify, we might fetch to be sure.
                        const { data } = await supabase
                            .from('friendships')
                            .select('id')
                            .or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
                            .or(`requester_id.eq.${activeChatUser.id},receiver_id.eq.${activeChatUser.id}`)
                            .eq('status', 'accepted')
                            .maybeSingle();

                        if (!data) {
                            setActiveChatUser(null);
                            Toast.show("Friendship ended.");
                             loadChats(currentUser.id); // Refresh list
                            return;
                        }
                     }
                     // Always refresh list on delete to be safe
                     loadChats(currentUser.id); 
                }

                // HANDLE NEW FRIEND (INSERT/UPDATE)
                if (eventType === 'INSERT' || eventType === 'UPDATE') {
                    const rec = newRec;
                    if (rec.status === 'accepted') {
                        // Check if it involves me
                        if (rec.requester_id === currentUser.id || rec.receiver_id === currentUser.id) {
                            loadChats(currentUser.id); // Refresh list to show new friend
                        }
                    }
                    // Handle Block logic if needed (handled by refresh)
                    if (rec.status === 'blocked') {
                        if (rec.requester_id === currentUser.id || rec.receiver_id === currentUser.id) {
                             if (activeChatUser) {
                                 const partnerId = rec.requester_id === currentUser.id ? rec.receiver_id : rec.requester_id;
                                 if (activeChatUser.id === partnerId) {
                                     setActiveChatUser(null);
                                 }
                             }
                             loadChats(currentUser.id);
                        }
                    }
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser, activeChatUser]);

    // Global Incoming Call State
    const [showQuickReplyMenu, setShowQuickReplyMenu] = useState(false);

    // --- Render Logic ---

    // 1. Missed Call Popup - Handled globally by CallContext now.


    // If incoming call is answered, show overlay
    // CallOverlay is now handled by the global CallUI component in CallContext

    if (activeChatUser && currentUser) {
        return (
            <ChatRoom
                currentUser={currentUser}
                targetUser={activeChatUser}
                allChats={chats} // Pass chats for forwarding
                replyToMessage={location.state?.replyToMessage} // Pass reply context from navigation
                quickReplyText={location.state?.quickReplyText} // Pass quick reply text from navigation
                onBack={() => {
                    setActiveChatUser(null);
                    // Go back in history to keep browser history in sync
                    window.history.back();
                    // Refresh chat list to show latent changes if any
                    loadChats(currentUser.id);
                }}
            />
        );
    }

    // Mark messages as read when opening a chat
    // Mark messages as read when opening a chat
    const markMessagesAsRead = async (senderId, receiverId) => {
        // Optimistic Update: Update local UI immediately
        setChats(prev => prev.map(chat => 
            chat.id === senderId ? { ...chat, unread: 0 } : chat
        ));

        // Update Database in background
        const now = new Date().toISOString();
        await supabase
            .from('messages')
            .update({ 
                is_read: true,
                delivery_status: 'seen',
                seen_at: now
            })
            .eq('sender_id', senderId)
            .eq('receiver_id', receiverId)
            .eq('is_read', false)
            .neq('message_type', 'system');
    };

    const handleSelectChat = async (chat) => {
        setActiveChatUser(chat.fullProfile);
        // Mark all messages from this user as read
        if (currentUser?.id && chat.id) {
            await markMessagesAsRead(chat.id, currentUser.id);
        }
    };



    return (
        <>
            <ChatList 
                chats={chats}
                setChats={setChats}
                onSelectChat={handleSelectChat} 
                onSelectStory={setSelectedStoryUser}
                loading={loading} 
                currentUser={currentUser} 
                connectionStatus={connectionStatus} 
                refreshTrigger={refreshTrigger}
            />
            
            {/* Story Viewer Overlay */}
            {selectedStoryUser && (
                <StoryViewer 
                    userStories={selectedStoryUser} 
                    currentUser={currentUser}
                    onClose={() => {
                        setSelectedStoryUser(null);
                        setRefreshTrigger(prev => prev + 1); // Refresh status view
                    }}
                />
            )}
        </>
    );
}

function ChatList({ chats, setChats, onSelectChat, onSelectStory, loading, currentUser, connectionStatus, refreshTrigger }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('messages');
    
    // Selection mode for chat deletion
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedChats, setSelectedChats] = useState(new Set());
    const longPressTimerRef = useRef(null);
    
    // Long-press handlers
    const handleTouchStart = (chatId) => {
        if (selectionMode) return; // Already in selection mode
        
        longPressTimerRef.current = setTimeout(() => {
            // Vibrate if supported
            if (navigator.vibrate) navigator.vibrate(50);
            
            setSelectionMode(true);
            setSelectedChats(new Set([chatId]));
        }, 1000); // 1 second
    };
    
    const handleTouchEnd = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };
    
    const handleChatItemClick = (chat) => {
        if (selectionMode) {
            // Toggle selection
            const newSelected = new Set(selectedChats);
            if (newSelected.has(chat.id)) {
                newSelected.delete(chat.id);
            } else {
                newSelected.add(chat.id);
            }
            setSelectedChats(newSelected);
        } else {
            // Normal chat open
            onSelectChat(chat);
        }
    };
    
    const handleDeleteChats = async () => {
        if (!currentUser || selectedChats.size === 0) return;
        
        const confirmed = window.confirm(`Delete ${selectedChats.size} chat${selectedChats.size > 1 ? 's' : ''}? All messages will be permanently deleted.`);
        if (!confirmed) return;
        
        try {
            // Delete all messages for selected chats
            for (const chatId of selectedChats) {
                await supabase
                    .from('messages')
                    .delete()
                    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${chatId}),and(sender_id.eq.${chatId},receiver_id.eq.${currentUser.id})`);
            }
            
            // Immediately update UI by filtering out deleted chats
            setChats(prevChats => prevChats.filter(chat => !selectedChats.has(chat.id)));
            
            // Exit selection mode
            setSelectionMode(false);
            setSelectedChats(new Set());
            
        } catch (error) {
            console.error('Error deleting chats:', error);
            alert('Failed to delete chats. Please try again.');
        }
    };
    
    const handleCancelSelection = () => {
        setSelectionMode(false);
        setSelectedChats(new Set());
    };
    
    // Filter chats
    const filteredChats = chats?.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    return (
        <div className="chat-page-container">
            {/* Header */}
            <header className="glass-header">
                <div className="header-top">
                    {selectionMode ? (
                        <>
                            <button className="cancel-selection-btn" onClick={handleCancelSelection}>
                                Cancel
                            </button>
                            <h1>{selectedChats.size} selected</h1>
                            <button 
                                className="delete-selection-btn" 
                                onClick={handleDeleteChats}
                                disabled={selectedChats.size === 0}
                            >
                                🗑️ Delete
                            </button>
                        </>
                    ) : (
                        <>
                            <h1 className="page-title">Chats</h1>
                            <div className="header-actions">
                                {/* Status and Settings removed as per user request */}
                            </div>
                        </>
                    )}
            </div>
                
                {/* Tabs */}
                <div className="chat-tabs">
                    <button 
                        className={`tab-btn ${activeTab === 'messages' ? 'active' : ''}`}
                        onClick={() => setActiveTab('messages')}
                    >
                        Chats
                    </button>
                    <button 
                         className={`tab-btn ${activeTab === 'status' ? 'active' : ''}`}
                         onClick={() => setActiveTab('status')}
                    >
                        Status
                    </button>
                </div>

                {activeTab === 'messages' && (
                    <div className="search-bar">
                        <svg className="search-icon" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <input 
                            type="text" 
                            placeholder="Search chats..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                )}
            </header>

            <div className="chat-list-scroll">
                {activeTab === 'status' ? (
                    <StatusView currentUser={currentUser} friends={chats} onSelectFriend={onSelectStory} refreshTrigger={refreshTrigger} />
                ) : loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Syncing conversations...</p>
                    </div>
                ) : filteredChats.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">💬</div>
                        <h3>No messages yet</h3>
                        <p>Start a conversation from your Friends list!</p>
                    </div>
                ) : (
                    filteredChats.map(chat => (
                        <div 
                            key={chat.id} 
                            className={`chat-item ${chat.unread > 0 ? 'unread' : ''} ${selectionMode && selectedChats.has(chat.id) ? 'selected' : ''}`}
                            onClick={() => handleChatItemClick(chat)}
                            onTouchStart={() => handleTouchStart(chat.id)}
                            onTouchEnd={handleTouchEnd}
                            onMouseDown={() => handleTouchStart(chat.id)}
                            onMouseUp={handleTouchEnd}
                            onMouseLeave={handleTouchEnd}
                        >
                            {selectionMode && (
                                <div className="selection-checkbox">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedChats.has(chat.id)}
                                        onChange={() => {}} // Handled by parent click
                                    />
                                </div>
                            )}
                            
                            <div className="avatar-wrapper">
                                <img 
                                    src={chat.avatar} 
                                    alt={chat.name} 
                                    className="chat-avatar" 
                                    loading="eager"
                                    decoding="sync"
                                />
                                {/* We can verify online status if needed, assuming true for demo or passed in */}
                                <div className="online-badge"></div>
                            </div>
                            
                            <div className="chat-info">
                                <div className="chat-header-row">
                                    <span className="chat-name">{chat.name}</span>
                                    <div className="meta-info">
                                        {chat.isMuted && <span className="mute-icon">🔇</span>}
                                        <span className="chat-time">{chat.time}</span>
                                    </div>
                                </div>
                                <div className="chat-msg-row">
                                    <p className="chat-preview">
                                        {chat.lastMsg}
                                    </p>
                                    {chat.unread > 0 && (
                                        <span className="unread-badge">
                                            {chat.unread > 99 ? '99+' : chat.unread}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <style>{`
                :root {
                    --bg-dark: #faf8f5;
                    --bg-card: #ffffff;
                    --bg-card-hover: #f5f3f0;
                    --text-primary: #1d1d1f;
                    --text-secondary: #6e6e73;
                    --accent-blue: #0084ff;
                    --separator: rgba(0, 0, 0, 0.1);
                }

                .chat-page-container {
                    background-color: var(--bg-color);
                    min-height: 100vh;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    color: var(--text-primary);
                    padding-bottom: 80px; /* Space for bottom nav */
                }

                .glass-header {
                    position: sticky;
                    top: 0;
                    z-index: 100;
                    background: rgba(250, 248, 245, 0.85);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    padding: 16px 20px 10px 20px;
                    padding-top: max(16px, env(safe-area-inset-top)); /* Safe area top */
                    border-bottom: 0.5px solid var(--separator);
                }

                .header-top {
                    display: flex;
                    justify-content: center; /* Center the title */
                    align-items: center;
                    position: relative; /* For absolute positioning of settings if needed */
                    margin-bottom: 12px;
                    min-height: 44px;
                }

                .page-title {
                    margin: 0;
                    font-size: 17px;
                    font-weight: 600;
                    letter-spacing: -0.3px;
                    color: var(--text-primary);
                }

                .settings-btn {
                    position: absolute; /* Position absolute to not affect centering */
                    left: 0;
                    background: transparent;
                    border: none;
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    color: var(--accent-blue);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: opacity 0.2s;
                    font-size: 17px; /* Matches text size if text button */
                }
                .settings-btn:active {
                    opacity: 0.5;
                    background: transparent;
                }
                
                /* Selection mode title override */
                .selection-header-title {
                    font-size: 17px;
                    font-weight: 600;
                }

                .search-bar {
                    background: rgba(118, 118, 128, 0.10);
                    border-radius: 12px;
                    padding: 7px 12px;
                    display: flex;
                    align-items: center;
                    gap: 7px;
                    margin-bottom: 2px;
                    height: 36px;
                }

                .search-icon {
                    color: var(--text-secondary);
                    opacity: 0.7;
                }

                .search-bar input {
                    background: transparent;
                    border: none;
                    outline: none;
                    color: var(--text-primary);
                    font-size: 14px;
                    width: 100%;
                }
                .search-bar input::placeholder {
                    color: var(--text-secondary);
                }

                /* Dark mode search bar */
                html[data-theme="dark"] .search-bar {
                    background: rgba(255, 255, 255, 0.1) !important;
                }

                html[data-theme="dark"] .glass-header {
                    background: rgba(0, 0, 0, 0.95) !important;
                    border-bottom-color: rgba(255, 255, 255, 0.1) !important;
                }

                @media (prefers-color-scheme: dark) {
                    html[data-theme="system"] .search-bar {
                        background: rgba(255, 255, 255, 0.1) !important;
                    }
                    
                    html[data-theme="system"] .glass-header {
                        background: rgba(0, 0, 0, 0.95) !important;
                        border-bottom-color: rgba(255, 255, 255, 0.1) !important;
                    }
                }

                /* Tab Styles */
                .chat-tabs {
                    display: flex;
                    background-color: rgba(118,118,128,0.12);
                    border-radius: 10px;
                    padding: 2px;
                    margin-bottom: 10px;
                    height: 34px;
                    width: 100%;
                    box-sizing: border-box;
                }
                
                .tab-btn {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 13px;
                    font-weight: 600;
                    color: var(--text-secondary);
                    background: transparent;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.18s ease;
                    letter-spacing: -0.1px;
                }
                
                .tab-btn.active {
                    background-color: var(--bg-primary, #fff);
                    color: var(--text-primary);
                    box-shadow: 0 1px 4px rgba(0,0,0,0.12);
                }
                
                .tab-btn.active::after {
                    content: none;
                }

                /* Dark mode adjustments */
                @media (prefers-color-scheme: dark) {
                     .chat-tabs {
                         background-color: #1c1c1e; /* Darker container */
                     }
                     .tab-btn.active {
                         background-color: #3a3a3c; /* Lighter active state */
                         color: white;
                     }
                }
                html[data-theme="dark"] .chat-tabs {
                    background-color: rgba(255,255,255,0.07);
                }
                html[data-theme="dark"] .tab-btn {
                    color: rgba(255,255,255,0.5);
                }
                html[data-theme="dark"] .tab-btn.active {
                    background-color: rgba(255,255,255,0.12);
                    color: rgba(255,255,255,0.95);
                    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
                }

                .chat-list-scroll {
                    padding: 0;
                }

                .chat-item {
                    display: flex;
                    align-items: center;
                    padding: 10px 20px;
                    gap: 12px;
                    cursor: pointer;
                    transition: background 0.15s;
                }
                
                .chat-item:active {
                    background-color: var(--bg-card-hover);
                }
                .chat-item:last-child {
                    border-bottom: none;
                }
                
                .chat-item.selected {
                    background-color: rgba(0, 132, 255, 0.1);
                }
                
                .selection-checkbox {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                .selection-checkbox input[type="checkbox"] {
                    width: 22px;
                    height: 22px;
                    cursor: pointer;
                    accent-color: var(--accent-blue);
                }
                
                .cancel-selection-btn,
                .delete-selection-btn {
                    background: none;
                    border: none;
                    color: var(--accent-blue);
                    font-size: 16px;
                    font-weight: 500;
                    cursor: pointer;
                    padding: 8px 12px;
                }
                
                .delete-selection-btn:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
                
                .delete-selection-btn {
                    color: #ff3b30;
                }

                .avatar-wrapper {
                    position: relative;
                    overflow: visible; /* 🔥 Ensure badges aren't cut */
                    flex-shrink: 0;
                }

                .chat-avatar {
                    width: 46px;
                    height: 46px;
                    border-radius: 50%;
                    object-fit: cover;
                    background-color: #e5e5ea;
                    display: block;
                    flex-shrink: 0;
                    border: 1.5px solid rgba(0,0,0,0.06);
                }

                .online-badge {
                    position: absolute;
                    bottom: 0px;
                    right: 0;
                    width: 11px;
                    height: 11px;
                    background-color: #30d158; /* iOS Green */
                    border: 2px solid var(--bg-dark);
                    border-radius: 50%;
                }

                .chat-info {
                    flex: 1;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    justify-content: center; /* Ensure vertical centering */
                    gap: 2px; /* Slight gap for visual balance */
                }

                .chat-header-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: baseline;
                }

                .chat-name {
                    font-size: 15px;
                    font-weight: 600;
                    color: var(--text-primary);
                    margin-bottom: 0;
                    letter-spacing: -0.1px;
                }

                .chat-time {
                    font-size: 12px;
                    color: var(--text-secondary);
                    opacity: 0.7;
                    letter-spacing: 0;
                }

                .chat-msg-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .chat-preview {
                    margin: 0;
                    font-size: 13px;
                    color: var(--text-secondary);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 85%;
                    line-height: 1.3;
                    opacity: 0.75;
                }

                .chat-item.unread {
                    background: transparent;
                }

                .chat-item.unread .chat-name {
                    font-weight: 700;
                    color: var(--text-primary);
                }
                .chat-item.unread .chat-preview {
                    color: var(--text-primary) !important;
                    font-weight: 500;
                    opacity: 0.85;
                }

                /* Dark mode unread */
                html[data-theme="dark"] .chat-item.unread {
                    background: transparent;
                }
                @media (prefers-color-scheme: dark) {
                    html[data-theme="system"] .chat-item.unread {
                        background: transparent;
                    }
                }

                /* Fix for dark mode global overrides killing the grey text */
                html[data-theme="dark"] .chat-preview {
                    color: var(--text-secondary) !important;
                }
                html[data-theme="dark"] .chat-item.unread .chat-preview {
                    color: #ffffff !important;
                    font-weight: 600;
                }

                @media (prefers-color-scheme: dark) {
                    html[data-theme="system"] .chat-preview {
                        color: var(--text-secondary) !important;
                    }
                    html[data-theme="system"] .chat-item.unread .chat-preview {
                        color: #ffffff !important;
                        font-weight: 600;
                    }
                }

                .unread-badge {
                    background: linear-gradient(135deg, #ff453a 0%, #ff3b30 100%);
                    color: white;
                    font-size: 0.75rem;
                    font-weight: 700;
                    min-width: 22px;
                    height: 22px;
                    border-radius: 11px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0 6px;
                    margin-left: 8px; /* Spacing from preview text */
                    box-shadow: 0 2px 6px rgba(255, 59, 48, 0.4);
                    flex-shrink: 0;
                }

                .mute-icon {
                    font-size: 12px;
                    margin-right: 4px;
                    color: var(--text-secondary);
                }
                
                /* Loading / Empty States */
                .loading-state, .empty-state {
                    padding-top: 100px;
                    text-align: center;
                    color: var(--text-secondary);
                }
                .spinner {
                    margin: 0 auto 20px;
                    width: 32px; height: 32px;
                    border: 3px solid rgba(255,255,255,0.1);
                    border-top-color: var(--accent-blue);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin { 100% { transform: rotate(360deg); } }
                
                .empty-icon { font-size: 48px; margin-bottom: 16px; display: block;}

                @media (max-width: 768px) {
                    .chat-item {
                        padding: 12px 16px;
                    }
                    .chat-avatar {
                        width: 44px;
                        height: 44px;
                    }
                    .online-badge {
                        width: 12px; 
                        height: 12px;
                        border-width: 2px;
                    }
                    .chat-info {
                        gap: 0px;
                    }
                    .chat-name {
                        font-size: 1.05rem;
                        font-weight: 600;
                    }
                    .chat-preview {
                        font-size: 0.95rem;
                        line-height: 1.3;
                    }
                    .chat-time {
                        font-size: 0.85rem;
                    }
                }

            `}</style>
        </div>
    );
}



function ChatRoom({ currentUser, targetUser, onBack, allChats, replyToMessage: initialReplyToMessage, quickReplyText: initialQuickReplyText }) {
    // Local state for partner to handle real-time updates (e.g. online status)
    const [partner, setPartner] = useState(targetUser);
    const { startCall } = useCall();

    // Blocking State
    // Blocking State
    const [blockStatus, setBlockStatus] = useState({ blockedByMe: false, blockedByThem: false, blockedAt: null });

    useEffect(() => {
        const checkBlockStatus = async () => {
             if (!currentUser?.id || !targetUser?.id) return;
             if (!currentUser?.id || !targetUser?.id) return;
             const status = await isUserBlocked(currentUser.id, targetUser.id);
             setBlockStatus(prev => ({ 
                 ...prev, 
                 blockedByMe: !!status && status.blocked,
                 blockedAt: status ? status.created_at : null 
             }));
             
             // We generally don't check "blockedByThem" for UI purposes (Requirement 3), 
             // but if we wanted to stop sending requests, we could. 
             // Requirement 3 says "Single Tick" (handled by RLS). 
             // We strictly only need "blockedByMe" to disable input.
        };
        checkBlockStatus();
    }, [currentUser?.id, targetUser?.id]);

    const handleBlockAction = async () => {
        if (blockStatus.blockedByMe) {
            // Unblock
            await unblockUser(currentUser.id, targetUser.id);
            setBlockStatus(prev => ({ ...prev, blockedByMe: false }));
            Toast.show(`Unblocked ${targetUser.username || targetUser.full_name}`);
        } else {
            // Block
            await blockUser(currentUser.id, targetUser.id);
            setBlockStatus(prev => ({ ...prev, blockedByMe: true, blockedAt: new Date().toISOString() }));
            Toast.show(`Blocked ${targetUser.username || targetUser.full_name}`);
            
            // Note: We do NOT clear chat history (Requirement 6)
        }
    };
    
    // Track partner's presence status
    const presence = usePresence(targetUser.id, currentUser.id);
    
    // Subscribe to partner profile changes
    useEffect(() => {
        setPartner(targetUser); // Reset on change
        
        const channel = supabase.channel(`profile_${targetUser.id}`)
            .on('postgres_changes', { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'profiles', 
                filter: `id=eq.${targetUser.id}` 
            }, (payload) => {
                setPartner(prev => ({ ...prev, ...payload.new }));
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [targetUser.id]);

    const [messages, setMessages] = useState([]);
    const messagesActionRef = useRef(messages); // Renamed to avoid collision if messagesRef is used for DOM elements loops (though here it was used for scroll-to map)
    // Actually, looking at code, 'messageRefs' is used for DOM. 'messagesEndRef' is for scroll. 
    // I will use 'messagesStateRef' to be safe.
    const messagesStateRef = useRef(messages);
    useEffect(() => { messagesStateRef.current = messages; }, [messages]);

    const [input, setInput] = useState('');
    const [showMenu, setShowMenu] = useState(false);
    const [uploading, setUploading] = useState(false);
    const messagesEndRef = useRef(null);
    const isInitialLoad = useRef(true);
    const fileInputRef = useRef(null);
    const [toastMsg, setToastMsg] = useState(null);

    // Image Viewer State
    const [viewingImage, setViewingImage] = useState(null);

    // Mute Settings State
    const [showMuteMenu, setShowMuteMenu] = useState(false);
    const [muteSettings, setMuteSettings] = useState(null);

    // Attachment System State
    const [showAttachmentPicker, setShowAttachmentPicker] = useState(false);
    const [showAttachmentPreview, setShowAttachmentPreview] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [uploadProgress, setUploadProgress] = useState(null);
    const cameraInputRef = useRef(null);
    const galleryInputRef = useRef(null);
    const documentInputRef = useRef(null);

    // Emoji Picker State
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const emojiPickerRef = useRef(null);
    const emojiBtnRef = useRef(null);

    // Close emoji picker when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                showEmojiPicker &&
                emojiPickerRef.current &&
                !emojiPickerRef.current.contains(event.target) &&
                emojiBtnRef.current &&
                !emojiBtnRef.current.contains(event.target)
            ) {
                setShowEmojiPicker(false);
            }
        };

        if (showEmojiPicker) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showEmojiPicker]);
    
    // Reply-to message state
    const [replyToMessage, setReplyToMessage] = useState(null);
    
    // Handle reply context from props (passed from parent Chat component via navigation state)
    useEffect(() => {
        if (initialReplyToMessage) {
            console.log('📞 Setting reply context from props:', initialReplyToMessage);
            setReplyToMessage(initialReplyToMessage);
        }
        if (initialQuickReplyText) {
            console.log('📞 Setting quick reply text from props:', initialQuickReplyText);
            setInput(initialQuickReplyText);
            // Focus the input field
            setTimeout(() => {
                messageInputRef.current?.focus();
            }, 300);
        }
    }, [initialReplyToMessage, initialQuickReplyText]);
    
    // Message context menu state (long-press)
    // Message context menu state (long-press) REPLACED by Selection Mode
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedMessages, setSelectedMessages] = useState(new Set());
    const [showMessageMenu, setShowMessageMenu] = useState(false); // Kept for backward compat if needed, but will likely remove
    const [selectedMessage, setSelectedMessage] = useState(null); // Kept for backward compat

    // Message refs for scroll-to functionality
    const messageRefs = useRef({});
    const messageInputRef = useRef(null);
    // Swipe gesture state persistence
    const swipeRefs = useRef({});
    const [highlightedMessageId, setHighlightedMessageId] = useState(null);

    // Scroll to message function
    const scrollToMessage = (messageId) => {
        const messageElement = messageRefs.current[messageId];
        if (messageElement) {
            messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedMessageId(messageId);
            setTimeout(() => setHighlightedMessageId(null), 2000);
        }
    };

    // Selection Mode Handlers
    const toggleSelection = (msgId, forceState = null) => {
        setSelectedMessages(prev => {
            const newSet = new Set(prev);
            
            let shouldAdd = !newSet.has(msgId);
            if (forceState !== null) shouldAdd = forceState;
            
            if (shouldAdd) {
                newSet.add(msgId);
                // Vibrate on long press start if this is the first selection
                if (!isSelectionMode && navigator.vibrate) navigator.vibrate(50);
                setIsSelectionMode(true); 
            } else {
                newSet.delete(msgId);
            }
            
            if (newSet.size === 0) {
                setIsSelectionMode(false);
            }
            return newSet;
        });
    };

    const clearSelection = () => {
        setSelectedMessages(new Set());
        setIsSelectionMode(false);
    };

    // Background Click Handler to dismiss Selection Mode
    const handleBackgroundClick = (e) => {
        if (isSelectionMode) {
            clearSelection();
        }
    };

    // Delete Message Modal State
    const [showDeleteMessageModal, setShowDeleteMessageModal] = useState(false);

    const executeDeleteForMe = async () => {
        const selectedIds = Array.from(selectedMessages);
        if (selectedIds.length === 0) return;
        
        // Optimistic update
        setMessages(prev => prev.filter(m => !selectedMessages.has(m.id)));
        setShowDeleteMessageModal(false);
        clearSelection();

        // DB Update
        for (const id of selectedIds) {
            const msg = messages.find(m => m.id === id);
            if (msg) {
                const updatedDeletedFor = [...(msg.deleted_for || []), currentUser.id];
                await supabase.from('messages').update({ deleted_for: updatedDeletedFor }).eq('id', id);
            }
        }
        showToast('Messages deleted for you');
    };

    const executeDeleteForEveryone = async () => {
        const selectedIds = Array.from(selectedMessages);
        if (selectedIds.length === 0) return;
        
        // Optimistic Update
        setMessages(prev => prev.map(m => {
            if (selectedMessages.has(m.id)) {
                return { 
                    ...m, 
                    content: '🚫 This message was deleted', 
                    message_type: 'text',
                    image_url: null, 
                    media_url: null 
                };
            }
            return m;
        }));
        
        setShowDeleteMessageModal(false);
        clearSelection();

        // DB Update
        // Note: We only update content/type. 'image_url'/'media_url' seem to be not directly on messages 
        // or are legacy. Attachments are in 'message_attachments' table usually.
        // We set has_attachment to false to ensure UI doesn't try to load them.
        const updates = {
            content: '🚫 This message was deleted',
            message_type: 'text',
            has_attachment: false
        };
        
        // We can do this in one query for all IDs
        const { data, error } = await supabase
            .from('messages')
            .update(updates)
            .in('id', selectedIds)
            .select('id');
            
        if (error) {
            console.error('❌ Delete for everyone failed (SQL Error):', error);
            showToast('Failed to delete for everyone ❌');
        } else if (data.length === 0) {
            console.error('❌ Delete for everyone failed (RLS blocked): No rows updated. Check RLS policies.');
            console.log('Attempted IDs:', selectedIds);
            console.log('Current User:', currentUser.id);
            showToast('Failed: Permission denied (RLS) 🔒');
        } else {
            console.log(`✅ Successfully deleted ${data.length} messages for everyone.`);
            showToast('Messages deleted for everyone');
        }
    };

    const handleMessageAction = async (action) => {
        const selectedIds = Array.from(selectedMessages);
        if (selectedIds.length === 0) return;

        if (action === 'delete') {
            setShowDeleteMessageModal(true);
        } else if (action === 'reply') {
            if (selectedIds.length !== 1) return;
            const msg = messages.find(m => m.id === selectedIds[0]);
            if (msg) {
                setReplyToMessage(msg);
                clearSelection();
            }
        } else if (action === 'forward') {
            setShowForwardMenu(true);
            // Don't clear selection yet
        } else if (action === 'copy') {
             const texts = selectedIds.map(id => messages.find(m => m.id === id)?.content).filter(Boolean).join('\n');
             if (texts) {
                 navigator.clipboard.writeText(texts);
                 showToast('Copied to clipboard');
             }
             clearSelection();
        }
    };


    // Fetch mute settings
    useEffect(() => {
        const fetchMuteSettings = async () => {
            const { data } = await supabase
                .from('chat_settings')
                .select('*')
                .eq('user_id', currentUser.id)
                .eq('partner_id', targetUser.id)
                .eq('partner_id', targetUser.id)
                .maybeSingle();
            
            if (data) setMuteSettings(data);
        };
        fetchMuteSettings();
    }, [currentUser.id, targetUser.id]);

    // Theme State (Mode: dark/light/auto)
    const [showThemeMenu, setShowThemeMenu] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [theme, setTheme] = useState(localStorage.getItem('chat_theme') || 'dark');

    // Chat Theme State (Visual themes)
    // Chat Theme State (Visual themes) - Initialize from partner-specific cache if available
    const [chatTheme, setChatTheme] = useState(() => {
        const partnerCache = localStorage.getItem(`chat_theme_partner_${targetUser?.id}`);
        return partnerCache && CHAT_THEMES[partnerCache] ? partnerCache : (localStorage.getItem('visual_chat_theme') || 'clean_slate');
    });
    
    // Ref to track active theme inside closures (subscriptions)
    const activeThemeRef = useRef(chatTheme);
    useEffect(() => { activeThemeRef.current = chatTheme; }, [chatTheme]);

    const [showChatThemeSelector, setShowChatThemeSelector] = useState(false);

    // WallPaper State (Restored)
    const [chatBackground, setChatBackground] = useState(null);
    const [showWallpaperMenu, setShowWallpaperMenu] = useState(false);

    // Forward Message State
    const [showForwardMenu, setShowForwardMenu] = useState(false);
    const [forwarding, setForwarding] = useState(false);

    // Delete chat for current user only (Delete for Me)
    const handleDeleteChat = async () => {
        console.log('🗑️ Delete Chat - Starting...');
        console.log('Current User ID:', currentUser.id);
        console.log('Target User ID:', targetUser.id);
        
        try {
        console.log('🗑️ Delete Chat - Calling RPC...');
        
        const { error } = await supabase.rpc('delete_chat_for_user', {
            p_user_id: currentUser.id,
            p_partner_id: targetUser.id
        });

        if (error) throw error;
        
        console.log('✅ Chat deleted via RPC');
        
        // Clear local messages state
        setMessages([]);
        showToast('Deleted successfully ✅');
        
        // Return to chat list
        // setTimeout(() => {
        //     onBack(); // Navigate back to chat list
        // }, 300); // Reduce delay for snappier feel
    } catch (error) {
            console.error('❌ Error deleting chat:', error);
            console.error('Error details:', JSON.stringify(error, null, 2));
            showToast('Failed to delete chat ❌');
        }
    };

    // Handle Forwarding
    const handleForwardMessage = async (selectedChatIds) => {
        if (!selectedChatIds.length) return;
        setForwarding(true);
        
        const selectedIds = Array.from(selectedMessages);
        const messagesToForward = selectedIds.map(id => messages.find(m => m.id === id)).filter(Boolean);
        
        try {
            const promises = [];
            
            for (const chatId of selectedChatIds) {
                const partnerId = chatId; // In our list, chat.id IS the partner ID
                
                for (const msg of messagesToForward) {
                    // Create new message object
                    const newMessage = {
                        sender_id: currentUser.id,
                        receiver_id: partnerId,
                        content: msg.content,
                        message_type: msg.message_type,
                        image_url: msg.image_url, // or media_url
                        media_url: msg.media_url,
                        is_read: false,
                        created_at: new Date().toISOString()
                    };
                    
                    promises.push(supabase.from('messages').insert(newMessage));
                }
            }
            
            await Promise.all(promises);
            
            showToast(`Forwarded to ${selectedChatIds.length} chat(s) ✅`);
            setShowForwardMenu(false);
            clearSelection();
        } catch (error) {
            console.error('Forward error:', error);
            showToast('Failed to forward ❌');
        } finally {
            setForwarding(false);
        }
    };
    useEffect(() => {
        if (!currentUser?.id || !targetUser?.id) return;

        const channel = supabase
            .channel(`theme_sync_${currentUser.id}_${targetUser.id}`)
            .on('postgres_changes', { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'shared_themes' 
            }, (payload) => {
                console.log('📡 Received theme update:', payload);
                
                const newData = payload.new;
                // Check if this update involves the current user pair
                // The table uses user_1 and user_2 (sorted), so checking containment is enough
                const ids = [newData.user_1, newData.user_2];
                const isRelevant = ids.includes(currentUser.id) && ids.includes(targetUser.id);
                
                if (isRelevant && newData.theme) {
                    console.log('✅ Applying shared theme:', newData.theme);
                    setChatTheme(newData.theme);
                    setChatBackground(null); // Clear custom background
                    localStorage.setItem(`chat_theme_partner_${targetUser.id}`, newData.theme);
                    
                    if (CHAT_THEMES[newData.theme]) {
                         showToast(`Theme updated to ${CHAT_THEMES[newData.theme].name}`);
                    }
                }
            })
            // ALSO Listen to INSERTs (first time theme is set)
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'shared_themes' 
            }, (payload) => {
                 const newData = payload.new;
                 const ids = [newData.user_1, newData.user_2];
                 const isRelevant = ids.includes(currentUser.id) && ids.includes(targetUser.id);
                 if (isRelevant && newData.theme) {
                    setChatTheme(newData.theme);
                    setChatBackground(null);
                    localStorage.setItem(`chat_theme_partner_${targetUser.id}`, newData.theme);
                 }
            })
            .subscribe();

        return () => {
             supabase.removeChannel(channel);
        };
    }, [currentUser?.id, targetUser?.id]);

    // Handle Chat Theme Change (Shared)
    const handleChatThemeChange = async (newTheme) => {
        setChatTheme(newTheme);
        setChatBackground(null); 
        setShowChatThemeSelector(false);
        const themeName = CHAT_THEMES[newTheme].name;
        

        
        // Optimistic UI Update: Apply immediately
        setChatTheme(newTheme);
        setChatBackground(null); // Clear custom wallpaper so theme shows
        
        try {

            
            const { data, error } = await supabase.rpc('update_chat_theme', {
                p_partner_id: targetUser.id,
                p_theme: newTheme
            });

            if (error) {
                console.error('❌ Error updating theme via RPC:', error);
                throw error;
            }



            // 3. Send System Message
            const { error: messageError } = await supabase.from('messages').insert([{
                sender_id: currentUser.id,
                receiver_id: targetUser.id,
                content: `changed the theme to ${themeName}`,
                message_type: 'system',
                created_at: new Date().toISOString()
            }]);
            
            if (messageError) {
                console.error('❌ Error inserting system message:', messageError);
            } else {
                console.log('✅ System message inserted');
            }
        } catch (error) {
            console.error('❌ Error updating theme:', error);
            showToast('Failed to update theme');
            return;
        }

        showToast(`Theme changed to ${themeName} ${CHAT_THEMES[newTheme].emoji}`);
    };

    // Fetch Wallpaper & Subscribe to Real-time Profile Updates
    useEffect(() => {
        if (!currentUser?.id) return;

        // 1. Initial Fetch
        const fetchInitialState = async () => {
            // 1. Fetch Shared Theme first (Priority)
            let activeTheme = chatTheme;
            const { data: rpcResult, error: themeError } = await supabase.rpc('get_chat_theme_v3', {
                p_partner_id: targetUser.id
            });

            if (themeError) {
                console.error("❌ [Chat] Error fetching theme via RPC:", themeError);
            } else {
                const themeData = rpcResult?.theme;
                if (themeData && CHAT_THEMES[themeData]) {

                     setChatTheme(themeData);
                     activeTheme = themeData;
                     localStorage.setItem(`chat_theme_partner_${targetUser.id}`, themeData);
                }
            }

            // 2. Fetch Profile Wallpaper
            const { data: profile } = await supabase.from('profiles').select('chat_background').eq('id', currentUser.id).single();
            
            // Logic: Only apply global wallpaper if the current theme is Default ('clean_slate')
            // This ensures specific themes override the global wallpaper
            if (activeTheme === 'clean_slate' && profile?.chat_background) {
                setChatBackground(profile.chat_background);
            } else if (activeTheme !== 'clean_slate') {
                // If using a specific theme, ensure wallpaper is cleared
                setChatBackground(null);
            }
        };
        fetchInitialState();

        // 2. Real-time Subscription
        const profileChannel = supabase.channel(`profile_changes_${currentUser.id}`)
            .on(
                'postgres_changes', 
                { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${currentUser.id}` },
                (payload) => {

                    if (payload.new.chat_background !== undefined) {
                        // Priority Check: Only apply global wallpaper if current theme is default ('clean_slate')
                        if (activeThemeRef.current === 'clean_slate') {
                            setChatBackground(payload.new.chat_background);
                        } else {

                        }
                    }
                }
            )
            .subscribe();

        // 3. Real-time Subscription for Shared Theme (Friendships)
        // We rely on RLS to only send us updates for friendships we are part of.
        // We filter client-side to ensure we only react to the meaningful update.
        const friendshipChannel = supabase.channel(`friendship_theme_${currentUser.id}_${targetUser.id}`)
            .on(
                'postgres_changes',
                { 
                    event: 'UPDATE', 
                    schema: 'public', 
                    table: 'friendships'
                },
                (payload) => {
                    const newData = payload.new;
                    // Check if this update involves the current user and valid theme
                    const isRelevant = (newData.requester_id === currentUser.id || newData.receiver_id === currentUser.id) && 
                                     (newData.requester_id === targetUser.id || newData.receiver_id === targetUser.id);
                    
                    if (isRelevant && newData.chat_theme) {

                        setChatTheme(newData.chat_theme);
                        localStorage.setItem(`chat_theme_partner_${targetUser.id}`, newData.chat_theme);
                        setChatBackground(null);
                    }
                }
            )
            .subscribe((status) => {
                 console.log(`Friendship theme subscription status: ${status}`);
            });

        return () => {
            supabase.removeChannel(profileChannel);
            supabase.removeChannel(friendshipChannel);
        };
    }, [currentUser?.id, targetUser?.id]);

    const handleWallpaperChange = async (bg) => {
        setChatBackground(bg);
        setShowWallpaperMenu(false);
        await supabase.from('profiles').update({ chat_background: bg }).eq('id', currentUser.id);
        showToast("Wallpaper updated 🖼️");
    };

    const [uploadingWallpaper, setUploadingWallpaper] = useState(false);
    const wallpaperInputRef = useRef(null);

    const WALLPAPERS = [
        // Gradients
        { name: 'Midnight', value: 'linear-gradient(to bottom, #0f0c29, #302b63, #24243e)' },
        { name: 'Synthwave', value: 'linear-gradient(to bottom, #2b0c29, #302b63)' },
        { name: 'Forest', value: 'linear-gradient(to bottom, #134e5e, #71b280)' },
        { name: 'Ocean', value: 'linear-gradient(to bottom, #00c6ff, #0072ff)' },
        { name: 'Sunset', value: 'linear-gradient(to bottom, #ff512f, #dd2476)' },
        { name: 'Northern Lights', value: 'linear-gradient(to bottom, #43cea2, #185a9d)' },
        { name: 'Royal', value: 'linear-gradient(to bottom, #536976, #292e49)' },
        
        // Solid Colors
        { name: 'Minimal Dark', value: '#1a1a1a' },
        { name: 'Pure Black', value: '#000000' },
        { name: 'Deep Blue', value: '#141E30' },
        { name: 'Charcoal', value: '#2C3E50' },
        { name: 'Warm Dark', value: '#232526' },
        
        // Patterns (using CSS gradients)
        { name: 'Stripes', value: 'repeating-linear-gradient(45deg, #1b1b1b, #1b1b1b 10px, #222 10px, #222 20px)' },
        { name: 'Grid', value: 'radial-gradient(#333 1px, transparent 1px) 0 0 / 20px 20px, radial-gradient(#333 1px, transparent 1px) 10px 10px / 20px 20px, #1a1a1a' }
    ];

    const handleWallpaperUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
             showToast("Image too large (Max 5MB) ⚠️");
             return;
        }

        setUploadingWallpaper(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `wallpapers/${currentUser.id}_${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('chat-images') // Reuse bucket
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('chat-images').getPublicUrl(fileName);
            
            // Apply as URL
            await handleWallpaperChange(`url('${data.publicUrl}')`);
            
        } catch (error) {
            console.error('Wallpaper upload failed:', error);
            showToast("Upload failed ❌");
        } finally {
            setUploadingWallpaper(false);
        }
    };

    const handleThemeChange = async (newTheme) => {
        // Update correct visual theme state
        setChatTheme(newTheme);
        // Update partner-specific cache to match initialization logic
        localStorage.setItem(`chat_theme_partner_${targetUser.id}`, newTheme);
        setShowThemeMenu(false);

        // Persist to database (Shared Theme)
        try {


            if (!targetUser.id) {
                 throw new Error("Partner ID is missing!");
            }

            const { data, error } = await supabase.rpc('update_chat_theme', {
                p_partner_id: targetUser.id,
                p_theme: newTheme
            });
            


            if (error) throw error;
            
            // Check for logical error from RPC
            if (data && !data.success) {
                console.error('RPC Logical Error:', data.error);
                throw new Error(data.error || 'Failed to update theme');
            }

            // System message is handled by RPC, so we just show a local toast
            showToast(`Theme changed to ${newTheme} 🎨`);
        } catch (err) {
            console.error('Failed to update shared theme:', err);
            showToast(`Failed: ${err.message || "Sync error"} ❌`);
        }
    };

    // Mute Calls State
    const [muteCalls, setMuteCalls] = useState(() => {
        return localStorage.getItem(`mute_calls_${currentUser.id}_${targetUser.id}`) === 'true';
    });

    const toggleMuteCalls = () => {
        const newState = !muteCalls;
        setMuteCalls(newState);
        localStorage.setItem(`mute_calls_${currentUser.id}_${targetUser.id}`, newState);
        showToast(newState ? "Calls muted for this user 🔇" : "Calls unmuted 📞");
        setShowMenu(false);
    };

    // Apply Theme Class
    const getThemeClass = () => {
        if (theme === 'auto') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? '' : 'light-theme';
        }
        return theme === 'light' ? 'light-theme' : '';
    };

    // Subscribe to real-time messages
    useEffect(() => {
        const fetchMessages = async () => {
            const { data, error } = await supabase
                .from('messages')
                .select(`
                    *,
                    attachments:message_attachments(*),
                    reply_to:reply_to_message_id(
                        id,
                        sender_id,
                        content,
                        message_type,
                        image_url
                    ),
                    reply_to_story:reply_to_story_id(
                        id,
                        media_url,
                        caption
                    )
                `)
                .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetUser.id}),and(sender_id.eq.${targetUser.id},receiver_id.eq.${currentUser.id})`)
                .order('created_at', { ascending: false }) // Get most recent first
                .limit(100); // Limit to 100 most recent messages for performance

            if (!error && data) {
                // Reverse to show oldest first (chronological order)
                const reversedData = [...data].reverse();
                
                // Filter out messages deleted by current user
                const filteredMessages = reversedData.filter(msg => {
                    const deletedFor = msg.deleted_for || [];
                    return !deletedFor.includes(currentUser.id);
                });
                setMessages(filteredMessages);

                // Mark UNREAD messages from this user as READ (excluding system messages)
                const unreadIds = data.filter(m => m.receiver_id === currentUser.id && !m.is_read && m.message_type !== 'system').map(m => m.id);
                if (unreadIds.length > 0) {
                    const now = new Date().toISOString();
                    await supabase.from('messages').update({ 
                        is_read: true,
                        delivery_status: 'seen',
                        seen_at: now
                    }).in('id', unreadIds);
                }
            }
        };

        fetchMessages();

        const channel = supabase
            .channel(`chat_room_${currentUser.id}_${targetUser.id}_${Date.now()}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages'
            }, async (payload) => {
                // Client-side Filter:
                // 1. Check if blocked
                if (blockStatus.blockedByMe && String(payload.new.sender_id) === String(targetUser.id)) {
                    // Only ignore if created AFTER block
                    const msgTime = new Date(payload.new.created_at).getTime();
                    const blockTime = blockStatus.blockedAt ? new Date(blockStatus.blockedAt).getTime() : 0;
                    
                    if (msgTime > blockTime) {
                        console.log('🚫 [Chat] Ignoring message from blocked user (time check)');
                        return;
                    }
                }

                // Check if message belongs to this conversation
                // 1. Incoming: From Target -> Me
                // 2. Outgoing (sent from elsewhere): From Me -> Target
                const isIncoming = String(payload.new.receiver_id) === String(currentUser.id) && String(payload.new.sender_id) === String(targetUser.id);
                const isOutgoingProxy = String(payload.new.sender_id) === String(currentUser.id) && String(payload.new.receiver_id) === String(targetUser.id);

                if (isIncoming || isOutgoingProxy) {
                    
                    // Supabase realtime doesn't return joined data, so we must manually fetch or find reply_to context
                    let replyToData = null;
                    
                    if (payload.new.reply_to_message_id) {
                         // 1. Try finding in local state ref (fastest & synchronous)
                         const found = messagesStateRef.current.find(m => m.id === payload.new.reply_to_message_id);
                         if (found) {
                             replyToData = {
                                 id: found.id,
                                 sender_id: found.sender_id,
                                 content: found.content,
                                 message_type: found.message_type,
                                 image_url: found.image_url
                             };
                         }

                         // 2. If not found locally, fetch single
                         if (!replyToData) {
                             const { data: fetchedReply } = await supabase
                                 .from('messages')
                                 .select('id, sender_id, content, message_type, image_url')
                                 .eq('id', payload.new.reply_to_message_id)
                                 .single();
                             if (fetchedReply) replyToData = fetchedReply;
                         }
                    }

                    const newMessage = { ...payload.new, reply_to: replyToData };

                    setMessages(prev => {
                        // Replace optimistic message if exists
                        const withoutOptimistic = prev.filter(m => !m.tempId);
                        // Check if already applied (duplicate event protection)
                        if (withoutOptimistic.some(m => m.id === newMessage.id)) return prev;
                        
                        return [...withoutOptimistic, newMessage];
                    });
                    
                    // Don't mark as read here - let the polling mechanism handle it
                    // This avoids 400 errors from RLS policies
                    
                    // Set delivered_at for sender (skip system messages)
                    // Set delivered_at for sender (skip system messages)
                    if (payload.new.message_type !== 'system') {
                        // If I am the receiver and I'm currently looking at this chat, mark as SEEN
                        if (String(payload.new.receiver_id) === String(currentUser.id)) {
                             const now = new Date().toISOString();
                             await supabase
                                .from('messages')
                                .update({ 
                                    is_read: true, 
                                    delivery_status: 'seen', 
                                    seen_at: now,
                                    delivered_at: now 
                                })
                                .eq('id', payload.new.id);
                        } else {
                            // Just mark as delivered
                            await supabase
                                .from('messages')
                                .update({ 
                                    delivery_status: 'delivered', 
                                    delivered_at: new Date().toISOString() 
                                })
                                .eq('id', payload.new.id);
                        }
                    }
                }
            })
            // Listen for message updates (read/delivered status)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'messages'
            }, (payload) => {
                console.log('💬 [Chat] UPDATE event received:', payload.new.id, payload.new.message_type);
                
                // Filter: check if it concerns this chat
                const senderId = String(payload.new.sender_id);
                const receiverId = String(payload.new.receiver_id);
                const currentId = String(currentUser.id);
                const partnerId = String(targetUser.id);

                const isRelevantMessage = 
                    (senderId === currentId && receiverId === partnerId) || 
                    (senderId === partnerId && receiverId === currentId);

                if (!isRelevantMessage) {
                    console.log('💬 [Chat] UPDATE ignored - not relevant to this chat');
                    return;
                }

                console.log('💬 [Chat] Processing UPDATE for message:', payload.new.id);
                console.log('💬 [Chat] Updated content:', payload.new.content);

                // Update message status in UI
                const updatedMessage = payload.new;
                const deletedFor = updatedMessage.deleted_for || [];
                const isDeletedForMe = deletedFor.includes(currentUser.id);

                setMessages(prev => {
                    if (isDeletedForMe) {
                        console.log('💬 [Chat] Removing deleted message:', updatedMessage.id);
                        // Remove message if it's now deleted for me
                        return prev.filter(m => m.id !== updatedMessage.id);
                    }
                    // Otherwise update it, but merge to preserve joined data (attachments, reply_to)
                    console.log('💬 [Chat] Updating message in state:', updatedMessage.id);
                    return prev.map(m => m.id === updatedMessage.id ? { ...m, ...updatedMessage } : m);
                });
            })
            .subscribe((status) => {
                console.log(`Chat room subscription status: ${status}`);
            });

        return () => { supabase.removeChannel(channel); };
    }, [currentUser.id, targetUser.id, blockStatus]);

    // Polling Fallback: Fetch messages every 3 seconds to ensure delivery if realtime fails
    useEffect(() => {
        const interval = setInterval(() => {
            const fetchLatest = async () => {
                 const { data, error } = await supabase
                    .from('messages')
                    .select(`
                        *,
                        attachments:message_attachments(*),
                        reply_to:reply_to_message_id(
                            id,
                            sender_id,
                            content,
                            message_type,
                            image_url
                        ),
                        reply_to_story:reply_to_story_id(
                            id,
                            media_url,
                            caption
                        )
                    `)
                    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetUser.id}),and(sender_id.eq.${targetUser.id},receiver_id.eq.${currentUser.id})`)
                    .order('created_at', { ascending: true });

                if (data) {
                    // Debug: Log the most recent call_log message
                    const callLogs = data.filter(m => m.message_type === 'call_log');
                    if (callLogs.length > 0) {
                        const mostRecent = callLogs[callLogs.length - 1];
                        console.log('🔄 [Polling] Most recent call log:', {
                            id: mostRecent.id,
                            content: mostRecent.content,
                            content_parsed: typeof mostRecent.content === 'string' ? JSON.parse(mostRecent.content) : mostRecent.content,
                            created_at: mostRecent.created_at
                        });
                    }
                    
                    // Filter out messages deleted by current user AND blocked user messages
                    const filteredData = data.filter(msg => {
                        const deletedFor = msg.deleted_for || [];
                        const isDeleted = deletedFor.includes(currentUser.id);
                        // Check if message is from blocked user AND created after block
                        let isBlocked = false;
                        if (blockStatus.blockedByMe && msg.sender_id === targetUser.id) {
                             const msgTime = new Date(msg.created_at).getTime();
                             const blockTime = blockStatus.blockedAt ? new Date(blockStatus.blockedAt).getTime() : 0;
                             isBlocked = msgTime > blockTime;
                        }
                        
                        return !isDeleted && !isBlocked;
                    });

                    setMessages(prev => {
                        const optimisticMessages = prev.filter(m => m.tempId);
                        
                        // Deduplicate: Don't show optimistic message if it's already in fetched data
                        const safeOptimistic = optimisticMessages.filter(oMsg => {
                            const match = filteredData.find(fMsg => 
                                fMsg.sender_id === oMsg.sender_id &&
                                fMsg.content === oMsg.content &&
                                // Check if created within last 10 seconds to ensure it's the same message
                                Math.abs(new Date(fMsg.created_at).getTime() - new Date(oMsg.created_at).getTime()) < 10000
                            );
                            return !match;
                        });

                        const combined = [...filteredData, ...safeOptimistic];

                        // Debug: Check if call logs are in the combined data
                        const callLogsInCombined = combined.filter(m => m.message_type === 'call_log');
                        if (callLogsInCombined.length > 0) {
                            const mostRecentInState = callLogsInCombined[callLogsInCombined.length - 1];
                            console.log('🔄 [Polling] Setting state with call log:', {
                                id: mostRecentInState.id,
                                content: mostRecentInState.content
                            });
                        }

                        // Improved check: Also compare content to detect updates to existing messages
                        if (prev.length === combined.length && 
                            prev.every((p, i) => {
                                const c = combined[i];
                                return p.id === c.id && 
                                       p.tempId === c.tempId && 
                                       p.content === c.content &&
                                       p.is_read === c.is_read;
                            })) {
                            console.log('🔄 [Polling] State unchanged, skipping update');
                            return prev;
                        }
                        
                        console.log('🔄 [Polling] Updating state with', combined.length, 'messages');
                        return combined;
                    });
                     // Mark UNREAD messages from this user as READ (excluding system messages)
                     // Mark UNREAD messages from this user as READ (excluding system messages AND blocked user messages)
                    const unreadIds = data.filter(m => {
                        const isSystem = m.message_type === 'system';
                        const isReceiver = m.receiver_id === currentUser.id;
                        const isUnread = !m.is_read;
                        
                        let isBlocked = false;
                        if (blockStatus.blockedByMe && m.sender_id === targetUser.id) {
                             const msgTime = new Date(m.created_at).getTime();
                             const blockTime = blockStatus.blockedAt ? new Date(blockStatus.blockedAt).getTime() : 0;
                             isBlocked = msgTime > blockTime;
                        }
                        
                        return isReceiver && isUnread && !isSystem && !isBlocked;
                    }).map(m => m.id);

                    if (unreadIds.length > 0) {
                        const now = new Date().toISOString();
                        await supabase.from('messages').update({ 
                            is_read: true,
                            delivery_status: 'seen',
                            seen_at: now
                        }).in('id', unreadIds);
                    }
                }
            };
            fetchLatest();
        }, 3000); // Poll every 3 seconds

        return () => clearInterval(interval);
    }, [currentUser.id, targetUser.id, blockStatus]);

    useEffect(() => {
        if (messages.length > 0) {
            const behavior = isInitialLoad.current ? "auto" : "smooth";
            messagesEndRef.current?.scrollIntoView({ behavior });
            
            if (isInitialLoad.current) {
                isInitialLoad.current = false;
            }
        }
    }, [messages]);

    const sendMessage = async (type = 'text', content = null, imageUrl = null) => {
        // Prevent sending if blocked
        if (blockStatus.blockedByMe) {
            showToast("You must unblock this user to send messages.");
            return;
        }

        const textToSend = content || input;
        if (!textToSend.trim() && type === 'text' && !imageUrl) return;

        const tempId = `temp_${Date.now()}_${Math.random()}`;
        
        // Check if receiver is online (last_active within 1 minute)
        const { data: receiverProfile } = await supabase
            .from('profiles')
            .select('last_active')
            .eq('id', targetUser.id)
            .single();
        
        const isReceiverOnline = receiverProfile?.last_active && 
            (new Date() - new Date(receiverProfile.last_active)) < 60000;
        
        const initialStatus = isReceiverOnline ? 'delivered' : 'sent';
        
        const optimisticMessage = {
            tempId,
            sender_id: currentUser.id,
            receiver_id: targetUser.id,
            content: type === 'text' ? textToSend : '📷 Photo',
            message_type: type,
            image_url: imageUrl,
            created_at: new Date().toISOString(),
            is_read: false,
            delivery_status: initialStatus,
            delivered_at: isReceiverOnline ? new Date().toISOString() : null,
            sending: true, // Flag for UI
            reply_to_message_id: replyToMessage?.id || null,
            reply_to: replyToMessage ? {
                id: replyToMessage.id,
                sender_id: replyToMessage.sender_id,
                content: replyToMessage.content,
                message_type: replyToMessage.message_type,
                image_url: replyToMessage.image_url
            } : null
        };

        // Optimistic Update - show immediately
        setMessages(prev => [...prev, optimisticMessage]);
        if (type === 'text') setInput('');
        
        // Clear reply state after adding to messages
        const replyId = replyToMessage?.id || null;
        setReplyToMessage(null);

        // DB Insert
        const { data, error } = await supabase.from('messages').insert({
            sender_id: currentUser.id,
            receiver_id: targetUser.id,
            content: optimisticMessage.content,
            message_type: type,
            image_url: imageUrl,
            is_read: false,
            delivery_status: initialStatus,
            delivered_at: isReceiverOnline ? new Date().toISOString() : null,
            reply_to_message_id: replyId
        }).select();

        if (error) {
            console.error("Send error:", error);
            showToast("Failed to send message ❌");
            // Remove optimistic message on error
            setMessages(prev => prev.filter(m => m.tempId !== tempId));
        } else if (data && data[0]) {
            // Replace optimistic with real message
            setMessages(prev => prev.map(m => 
                m.tempId === tempId ? { ...data[0], reply_to: optimisticMessage.reply_to } : m
            ));
        }
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file size (10MB limit)
        if (file.size > 10 * 1024 * 1024) {
            showToast("Image too large. Max 10MB");
            return;
        }

        setUploading(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${currentUser.id}/${Date.now()}.${fileExt}`;

            // Upload to storage
            const { error: uploadError } = await supabase.storage
                .from('chat-images')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            // Get public URL
            const { data } = supabase.storage.from('chat-images').getPublicUrl(fileName);

            // Send message with image
            await sendMessage('image', '📷 Photo', data.publicUrl);
        } catch (error) {
            console.error("Upload error:", error);
            showToast("Upload failed. Try again.");
        } finally {
            setUploading(false);
        }
    };

    // Attachment System Handlers
    const handleSelectCamera = () => {
        setShowAttachmentPicker(false);
        cameraInputRef.current?.click();
    };

    const handleSelectGallery = () => {
        setShowAttachmentPicker(false);
        galleryInputRef.current?.click();
    };

    const handleSelectDocument = () => {
        setShowAttachmentPicker(false);
        documentInputRef.current?.click();
    };

    const handleFileSelect = (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        // Validate all files
        const validFiles = [];
        for (const file of files) {
            const validation = validateFile(file);
            if (!validation.valid) {
                showToast(validation.error);
                continue;
            }
            validFiles.push(file);
        }

        if (validFiles.length > 0) {
            setSelectedFiles(validFiles);
            setShowAttachmentPreview(true);
        }

        // Reset input
        e.target.value = '';
    };

    const handleRemoveFile = (index) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleSendAttachments = async () => {
        if (selectedFiles.length === 0) return;

        setUploadProgress(0);

        try {
            for (let i = 0; i < selectedFiles.length; i++) {
                const file = selectedFiles[i];
                
                // Upload file
                const result = await uploadToStorage(file, currentUser.id, (progress) => {
                    const totalProgress = ((i / selectedFiles.length) + (progress / 100 / selectedFiles.length)) * 100;
                    setUploadProgress(totalProgress);
                });

                if (!result.success) {
                    throw new Error(result.error);
                }

                // Insert message with attachment
                const { data: messageData, error: messageError } = await supabase
                    .from('messages')
                    .insert({
                        sender_id: currentUser.id,
                        receiver_id: targetUser.id,
                        content: `📎 ${result.fileName}`,
                        message_type: 'attachment',
                        has_attachment: true,
                        is_read: true
                    })
                    .select()
                    .single();

                if (messageError) throw messageError;

                // Insert attachment record
                const { error: attachmentError } = await supabase
                    .from('message_attachments')
                    .insert({
                        message_id: messageData.id,
                        file_url: result.fileUrl,
                        file_name: result.fileName,
                        file_type: result.fileType,
                        file_size: result.fileSize,
                        mime_type: result.mimeType
                    });

                if (attachmentError) throw attachmentError;
            }

            showToast(`Sent ${selectedFiles.length} file(s) ✅`);
            setSelectedFiles([]);
            setShowAttachmentPreview(false);
            setUploadProgress(null);
        } catch (error) {
            console.error('Attachment send error:', error);
            showToast('Failed to send attachments ❌');
            setUploadProgress(null);
        }
    };

    const handleCancelAttachments = () => {
        setSelectedFiles([]);
        setShowAttachmentPreview(false);
        setUploadProgress(null);
    };

    // Emoji Picker Handler
    const handleEmojiSelect = (emojiObject) => {
        setInput(prev => prev + emojiObject.emoji);
        // Don't close picker automatically for better UX when adding multiple emojis
        // setShowEmojiPicker(false); 
    };


    const startVoiceCall = () => {
        if (blockStatus.blockedByMe) {
            showToast("Unblock user to call");
            return;
        }
        startCall(targetUser, 'audio');
    };

    const startVideoCall = () => {
        if (blockStatus.blockedByMe) {
            showToast("Unblock user to call");
            return;
        }
        startCall(targetUser, 'video');
    };

    const handleMuteChat = async (duration) => {
        setShowMuteMenu(false);
        let mutedUntil = null;

        if (duration === '8h') {
            mutedUntil = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
        } else if (duration === '1w') {
            mutedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        } else if (duration === 'always') {
            mutedUntil = new Date('2099-12-31').toISOString();
        } else if (duration === 'unmute') {
            mutedUntil = null;
        }

        const { data, error } = await supabase
            .from('chat_settings')
            .upsert({
                user_id: currentUser.id,
                partner_id: targetUser.id,
                muted_until: mutedUntil
            }, { onConflict: 'user_id,partner_id' })
            .select();

        if (!error && data) {
            setMuteSettings(data[0]);
            if (duration === 'unmute') {
                showToast(`🔔 Notifications enabled`);
            } else {
                showToast(`🔇 Muted ${duration === '8h' ? 'for 8 hours' : duration === '1w' ? 'for 1 week' : 'forever'}`);
            }
        }
    };

    const isChatMuted = () => {
        if (!muteSettings || !muteSettings.muted_until) return false;
        return new Date(muteSettings.muted_until) > new Date();
    };

    const handleMenuAction = async (action) => {
        setShowMenu(false);
        if (action === 'mute') {
            setShowMuteMenu(true);
            return;
        }
        if (action === 'block') {
            try {
                // Determine if friendship exists (bidirectional check)
                const { data: existingFriendship, error: fetchError } = await supabase
                    .from('friendships')
                    .select('id')
                    .or(`and(requester_id.eq.${currentUser.id},receiver_id.eq.${targetUser.id}),and(requester_id.eq.${targetUser.id},receiver_id.eq.${currentUser.id})`)
                    .maybeSingle();

                if (fetchError) throw fetchError;

                if (existingFriendship) {
                    // Update existing to blocked
                    const { error: updateError } = await supabase
                        .from('friendships')
                        .update({ status: 'blocked', requester_id: currentUser.id, receiver_id: targetUser.id }) // Ensure blocker becomes requester? Or just status. Let's just update status.
                        // Actually, for blocking, usually the one who blocks becomes the 'requester' of the block theoretically, 
                        // but sticking to simple status update first. 
                        // If we want to strictly enforce "who blocked who", we might need a separate 'blocked_by' column or rely on requester_id.
                        // For now, let's just set status='blocked'.
                         .eq('id', existingFriendship.id);

                    if (updateError) throw updateError;
                } else {
                    // Create new blocked record
                    const { error: insertError } = await supabase
                        .from('friendships')
                        .insert({
                            requester_id: currentUser.id,
                            receiver_id: targetUser.id,
                            status: 'blocked'
                        });

                    if (insertError) throw insertError;
                }

                showToast(`🚫 Blocked ${targetUser.name || targetUser.username || 'User'}`);
                setTimeout(onBack, 1000);
            } catch (err) {
                console.error('Error blocking user:', err);
                showToast(`❌ Failed to block user`);
            }
        }
        else if (action === 'unfriend') {
            await supabase.from('friendships')
                .delete()
                .or(`and(requester_id.eq.${currentUser.id},receiver_id.eq.${targetUser.id}),and(requester_id.eq.${targetUser.id},receiver_id.eq.${currentUser.id})`);

            showToast(`💔 Unfriended ${targetUser.name}`);
            setTimeout(onBack, 1000);
        }
    };

    // Helper for time
    const formatTime = (isoString) => {
        if (!isoString) return '';
        const date = new Date(isoString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const showToast = (msg) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(null), 3000);
    };

    // Format last seen status
    const getLastSeenStatus = (lastActive, partnerShowLastSeen = true, myShowLastSeen = true) => {
        // Privacy Check: If either party hides status, show nothing/offline (Empty string renders as standard 'Offline' in UI)
        if (partnerShowLastSeen === false || myShowLastSeen === false) return '';
        
        if (!lastActive) return 'Offline';
        
        const now = new Date();
        const lastActiveDate = new Date(lastActive);
        const diffMs = now - lastActiveDate;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        // Online if active within last 2 minutes
        if (diffMins < 2) return 'Active now';
        
        // Minutes ago
        if (diffMins < 60) return `active ${diffMins}m ago`;
        
        // Hours ago
        if (diffHours < 24) {
            return `active ${diffHours}h ago`;
        }
        
        // Yesterday
        if (diffDays === 1) return 'active yesterday';
        
        // Days ago
        if (diffDays < 7) return `active ${diffDays}d ago`;
        
        // More than a week
        return 'active a while ago';
    };

    // Date Header Helpers
    const isSameDay = (d1, d2) => {
        return d1.getFullYear() === d2.getFullYear() &&
               d1.getMonth() === d2.getMonth() &&
               d1.getDate() === d2.getDate();
    };

    const formatDateHeader = (dateStr) => {
        const date = new Date(dateStr);
        const now = new Date();
        
        if (isSameDay(date, now)) return 'Today';
        
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (isSameDay(date, yesterday)) return 'Yesterday';
        
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric' });
    };

    const currentTheme = CHAT_THEMES[chatTheme] || CHAT_THEMES['clean_slate'];

    return (
        <div 
            className="chat-room-container" 
            data-theme-type={currentTheme.type}
            style={{
                // Direct application for reliability
                background: chatBackground || currentTheme.backgroundColor,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                
                // CSS Variables for children
                '--theme-bg': chatBackground || currentTheme.backgroundColor,
                '--theme-bubble-sent': currentTheme.bubbleSent,
                '--theme-bubble-received': currentTheme.bubbleReceived,
                '--theme-text-color': currentTheme.textColor,
                '--theme-accent': currentTheme.accentColor,
                '--theme-font-color': currentTheme.fontColor,
                '--theme-icon-color': currentTheme.iconColor
            }}
            onClick={handleBackgroundClick}
        >
            <style>{`
                /* Selection Mode Styles */
                .chat-room-header.selection-mode { 
                    background: rgba(30, 30, 35, 0.95) !important; 
                    border-bottom: 1px solid rgba(255,255,255,0.15); 
                }
                .selection-header-left { 
                    display: flex; align-items: center; gap: 15px; 
                    flex: 1;
                }
                .selection-count {
                    font-size: 1.2rem; font-weight: 600; color: white;
                }
                .selection-actions {
                    display: flex; gap: 8px;
                }
                .msg-bubble.selected {
                    background: rgba(0, 240, 255, 0.15) !important;
                    border: 1px solid rgba(0, 240, 255, 0.3);
                    box-shadow: 0 0 15px rgba(0, 240, 255, 0.1);
                }
                .selection-overlay {
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    z-index: 5;
                    pointer-events: none;
                }
                .selection-checkbox {
                    position: absolute;
                    bottom: -8px;
                    right: -8px;
                    width: 22px; height: 22px;
                    border-radius: 50%;
                    border: 2px solid rgba(255,255,255,0.4);
                    background: #2a2a2a;
                    display: flex; align-items: center; justify-content: center;
                    color: white;
                    transition: all 0.2s;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                }
                .selection-checkbox.checked {
                    background: #00f0ff;
                    border-color: #00f0ff;
                    color: black;
                    transform: scale(1.1);
                }

                /* Quoted Message (Reply Preview) Styles */
                .quoted-message {
                    background: rgba(0, 0, 0, 0.1);
                    border-left: 3px solid var(--theme-accent, #00f0ff);
                    padding: 8px 10px;
                    margin-bottom: 8px;
                    border-radius: 6px;
                    font-size: 0.85rem;
                }
                .quoted-message.clickable {
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .quoted-message.clickable:hover {
                    background: rgba(0, 0, 0, 0.15);
                }
                .quoted-message-header {
                    font-weight: 600;
                    color: var(--theme-accent, #00f0ff);
                    margin-bottom: 4px;
                    font-size: 0.8rem;
                }
                .quoted-message-content {
                    color: var(--theme-text-color, #e0e0e0);
                    opacity: 0.8;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                /* Message Highlight Animation */
                .message-highlight {
                    animation: highlightPulse 2s ease-in-out;
                }
                @keyframes highlightPulse {
                    0%, 100% { 
                        box-shadow: 0 0 0 rgba(0, 240, 255, 0);
                    }
                    50% { 
                        box-shadow: 0 0 20px rgba(0, 240, 255, 0.6);
                        background: rgba(0, 240, 255, 0.1) !important;
                    }
                }
                /* Blocked Banner Styles */
                .blocked-message-banner {
                    /* position: absolute; REMOVED to allow flex layout */
                    /* bottom: 0; left: 0; right: 0; REMOVED */
                    position: relative;
                    padding: 24px;
                    background: rgba(30, 30, 35, 0.95);
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                    z-index: 100;
                    text-align: center;
                    width: 100%;
                }
                .blocked-message-banner p {
                    color: #e0e0e0;
                    font-size: 0.95rem;
                    margin: 0;
                    font-weight: 500;
                }
                .unblock-btn {
                    background: #FF3B30;
                    color: white;
                    border: none;
                    padding: 8px 32px;
                    border-radius: 20px;
                    font-weight: 600;
                    font-size: 0.9rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    box-shadow: 0 4px 12px rgba(255, 59, 48, 0.3);
                }
                .unblock-btn:hover {
                    transform: scale(1.02);
                    box-shadow: 0 6px 16px rgba(255, 59, 48, 0.4);
                }
                .unblock-btn:active {
                    transform: scale(0.95);
                }
            `}</style>
            {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
            


            
            <div className="ambient-glow-chat"></div>

            <div className={`chat-room-header glass-header ${isSelectionMode ? 'selection-mode' : ''}`} onClick={(e) => e.stopPropagation()}>
                {isSelectionMode ? (
                    <>
                        <div className="selection-header-left">
                            <button onClick={clearSelection} className="icon-btn">
                                <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                            <span className="selection-count">{selectedMessages.size}</span>
                        </div>
                        <div className="selection-actions">
                            {selectedMessages.size === 1 && (
                                <button className="icon-btn" onClick={() => handleMessageAction('reply')} title="Reply">
                                    <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"></path></svg>
                                </button>
                            )}
                            <button className="icon-btn" onClick={() => handleMessageAction('delete')} title="Delete">
                                <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            </button>
                            <button className="icon-btn" onClick={() => handleMessageAction('copy')} title="Copy">
                                <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            </button>
                            <button className="icon-btn" onClick={() => handleMessageAction('forward')} title="Forward">
                                <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M15 10l5 5-5 5"></path><path d="M4 4v7a4 4 0 0 0 4 4h12"></path></svg>
                            </button>
                            {selectedMessages.size === 1 && messages.find(m => m.id === Array.from(selectedMessages)[0])?.sender_id === currentUser.id && (
                                <button className="icon-btn" onClick={() => showToast('Edit coming soon!')} title="Edit">
                                    <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </button>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                    <button onClick={onBack} className="back-btn">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
                    </button>
                    <div className="header-user">
                        <img src={getAvatarHeadshot(partner.avatar_url || partner.avatar)} className="header-avatar" alt="avatar" />
                        <div className="header-text">
                            <h3>{partner.username || partner.full_name || partner.name}</h3>
                            {presence.displayStatus && (
                                <span className={`user-status ${presence.isOnline ? 'online' : 'offline'}`}>
                                    {presence.isOnline && <span className="online-dot">●</span>}
                                    {presence.displayStatus}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="header-actions">
                        <button title="Audio Call" className="icon-btn" onClick={startVoiceCall}>
                            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                        </button>
                        <button title="Video Call" className="icon-btn" onClick={startVideoCall}>
                            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                        </button>
                        <div style={{ position: 'relative' }}>
                            <button className="icon-btn" onClick={() => setShowMenu(!showMenu)}>⋮</button>
                            {showMenu && (
                                <>
                                    <div 
                                        style={{ position: 'fixed', inset: 0, zIndex: 99 }} 
                                        onClick={() => setShowMenu(false)}
                                    />
                                    <div className="dropdown-menu" style={{ zIndex: 100 }}>
                                        
                                        <button onClick={() => handleMenuAction('mute')}>
                                            <span className="icon">
                                                {isChatMuted() ? (
                                                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg> 
                                                ) : (
                                                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                                                )}
                                            </span>
                                            {isChatMuted() ? 'Unmute' : 'Mute'}
                                        </button>

                                        <button onClick={() => {
                                            setShowChatThemeSelector(true);
                                            setShowMenu(false);
                                        }}>
                                            <span className="icon">
                                                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                                            </span>
                                            Theme
                                        </button>

                                        <div className="divider"></div>

                                        <button onClick={() => {
                                            setShowDeleteConfirm(true);
                                            setShowMenu(false);
                                        }} className="danger">
                                            <span className="icon">
                                                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                            </span>
                                            Delete Chat
                                        </button>

                                        <button onClick={() => {
                                            const reason = prompt("Reason for reporting:");
                                            if (reason) showToast("Report submitted successfully ✅");
                                            setShowMenu(false);
                                        }} className="danger">
                                            <span className="icon">
                                                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                            </span>
                                            Report
                                        </button>

                                        <button onClick={() => { setShowMenu(false); handleBlockAction(); }} className="danger">
                                            <span className="icon">
                                                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                                            </span>
                                            {blockStatus.blockedByMe ? 'Unblock' : 'Block'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                    </>
                )}
            </div>

            {/* Theme Menu Modal */}
            {showThemeMenu && (
                <div className="mute-menu-modal" onClick={() => setShowThemeMenu(false)}>
                    <div className="mute-menu-content glass-panel" onClick={(e) => e.stopPropagation()}>
                        <h3>Choose Mode 🎨</h3>
                        <div className="mute-options">
                            <button onClick={() => handleThemeChange('auto')} className={`mute-option ${theme === 'auto' ? 'active' : ''}`}>
                                🌓 Auto (System)
                            </button>
                            <button onClick={() => handleThemeChange('dark')} className={`mute-option ${theme === 'dark' ? 'active' : ''}`}>
                                🌑 Dark
                            </button>
                            <button onClick={() => handleThemeChange('light')} className={`mute-option ${theme === 'light' ? 'active' : ''}`}>
                                ☀️ Light
                            </button>
                        </div>
                        <button onClick={() => setShowThemeMenu(false)} className="cancel-btn">Cancel</button>
                    </div>
                </div>
            )}

            {/* Delete Chat Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="delete-confirm-overlay" onClick={() => setShowDeleteConfirm(false)}>
                    <div className="delete-confirm-modal" onClick={(e) => e.stopPropagation()}>
                        {/* Warning Icon */}
                        <div className="delete-icon-wrapper">
                            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18"/>
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                                <line x1="10" x2="10" y1="11" y2="17"/>
                                <line x1="14" x2="14" y1="11" y2="17"/>
                            </svg>
                        </div>

                        {/* Title and Description */}
                        <h3 className="delete-title">Delete for Me?</h3>
                        <p className="delete-description">
                            This will clear the chat history <strong>for you only</strong>. The other user will still see the messages.
                        </p>

                        {/* Action Buttons */}
                        <div className="delete-actions">
                            <button 
                                onClick={() => setShowDeleteConfirm(false)} 
                                className="delete-btn-cancel"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={() => {
                                    handleDeleteChat();
                                    setShowDeleteConfirm(false);
                                }} 
                                className="delete-btn-confirm"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 6h18"/>
                                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                                </svg>
                                Delete Chat
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Forward Message Modal */}
            {showForwardMenu && (
                <ForwardModal 
                    chats={allChats} 
                    onClose={() => setShowForwardMenu(false)}
                    onSend={handleForwardMessage}
                    loading={forwarding}
                />
            )}

            {/* Chat Theme Selector Modal */}
            {showChatThemeSelector && (
                <div className="theme-selector-modal" onClick={() => setShowChatThemeSelector(false)}>
                    <div className="theme-selector-content" onClick={(e) => e.stopPropagation()}>
                        <h3>Choose Chat Theme</h3>
                        <div className="theme-grid">
                            {Object.keys(CHAT_THEMES).map((themeKey) => {
                                const themeData = CHAT_THEMES[themeKey];
                                return (
                                    <div
                                        key={themeKey}
                                        className={`theme-card ${chatTheme === themeKey ? 'active' : ''}`}
                                        onClick={() => handleChatThemeChange(themeKey)}
                                        style={{
                                            background: themeData.backgroundColor,
                                            borderColor: chatTheme === themeKey ? themeData.accentColor : 'transparent'
                                        }}
                                    >
                                        <div className="theme-emoji">{themeData.emoji}</div>
                                        <div className="theme-name" style={{ color: themeData.fontColor }}>
                                            {themeData.name}
                                        </div>
                                        <div className="theme-preview">
                                            <div className="preview-bubble sent" style={{ background: themeData.bubbleSent }}>
                                                <span style={{ color: themeData.textColor }}>Hi!</span>
                                            </div>
                                            <div className="preview-bubble received" style={{ background: themeData.bubbleReceived }}>
                                                <span style={{ color: themeData.textColor }}>Hello</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <button onClick={() => setShowChatThemeSelector(false)} className="cancel-btn">Cancel</button>
                    </div>
                </div>
            )}

            {/* Wallpaper Menu Modal */}
            {showWallpaperMenu && (
                <div className="mute-menu-modal" onClick={() => setShowWallpaperMenu(false)}>
                    <div className="mute-menu-content glass-panel" onClick={(e) => e.stopPropagation()}>
                        <h3>Choose Wallpaper 🖼️</h3>
                        
                        {/* Hidden Input for Custom Wallpaper */}
                        <input 
                            type="file" 
                            ref={wallpaperInputRef}
                            style={{ display: 'none' }}
                            accept="image/*"
                            onChange={handleWallpaperUpload}
                        />

                        <div className="wallpaper-grid">
                            {/* Upload Button */}
                             <button 
                                className="wallpaper-option upload-btn"
                                onClick={() => wallpaperInputRef.current.click()}
                                disabled={uploadingWallpaper}
                            >
                                {uploadingWallpaper ? '⏳' : '📤 Upload'}
                            </button>

                            {/* Presets */}
                            {WALLPAPERS.map((wp) => (
                                <button 
                                    key={wp.name} 
                                    className={`wallpaper-option ${chatBackground === wp.value ? 'active' : ''}`}
                                    style={{ background: wp.value }}
                                    onClick={() => handleWallpaperChange(wp.value)}
                                >
                                    {wp.name}
                                </button>
                            ))}
                            <button 
                                className="wallpaper-option default"
                                onClick={() => handleWallpaperChange(null)}
                            >
                                Default
                            </button>
                        </div>
                        <button onClick={() => setShowWallpaperMenu(false)} className="cancel-btn">Cancel</button>
                    </div>
                    <style>{`
                        .wallpaper-grid {
                            display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
                            margin: 20px 0;
                            max-height: 400px; overflow-y: auto; padding-right: 5px;
                        }
                        .wallpaper-option {
                            height: 60px; border-radius: 12px; border: 2px solid transparent;
                            color: white; font-weight: 600; text-shadow: 0 1px 3px rgba(0,0,0,0.8);
                            cursor: pointer; transition: transform 0.2s;
                            display: flex; align-items: center; justify-content: center;
                            background-size: cover; background-position: center;
                        }
                        .wallpaper-option:hover { transform: scale(1.02); }
                        .wallpaper-option.active { border-color: #00f0ff; box-shadow: 0 0 10px rgba(0, 240, 255, 0.4); }
                        .wallpaper-option.default { background: #333; grid-column: 1 / -1; }
                        
                        .upload-btn {
                            background: rgba(255,255,255,0.1);
                            border: 1px dashed rgba(255,255,255,0.3);
                            grid-column: 1 / -1;
                        }
                        .upload-btn:hover { background: rgba(255,255,255,0.15); }
                    `}</style>
                </div>
            )}


            <div 
                className={`chat-messages ${getThemeClass()}`}
                data-theme={chatTheme}
                data-pattern={CHAT_THEMES[chatTheme]?.backgroundPattern || 'none'}
                onClick={() => {
                    // Click background to clear selection if in selection mode
                    if (isSelectionMode) {
                        clearSelection();
                    }
                }}
                style={{ 
                    // Background handled by parent container via CSS variable
                    position: 'relative',
                    zIndex: 1
                }}
            >
                {messages.length === 0 && (
                    <div className="empty-chat-state">
                        <div className="empty-chat-icon">
                            <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                            </svg>
                        </div>
                        <h3>No messages yet</h3>
                        <p>Start a conversation with <strong>{partner.username}</strong></p>
                        <button className="tap-to-chat-btn" onClick={() => document.querySelector('.msg-input')?.focus()}>
                            Tap to chat
                        </button>
                    </div>
                )}
                {messages.map((msg, i) => {
                    const isMe = msg.sender_id === currentUser.id;
                    
                    // Date Separator Logic
                    const msgDate = new Date(msg.created_at);
                    const prevMsg = messages[i - 1];
                    const prevDate = prevMsg ? new Date(prevMsg.created_at) : null;
                    let dateHeader = null;

                    if (!prevDate || !isSameDay(msgDate, prevDate)) {
                        dateHeader = (
                            <div className="chat-date-header" key={`date-${msg.id || i}`}>
                                <span>{formatDateHeader(msg.created_at)}</span>
                            </div>
                        );
                    }

                    // System Message Rendering
                    if (msg.message_type === 'system') {
                        // Determine who sent the system message
                        let senderName;
                        const msgSenderId = String(msg.sender_id);
                        const currentUserId = String(currentUser.id);
                        // Use partner state if available (for real-time updates), fallback to targetUser
                        const targetUserId = String(partner?.id || targetUser.id);
                        
                        // Debug log for system naming issues
                        if (msg.content.includes('changed the theme')) {
                            console.log('🔍 [SysMsgRender] Rendering theme msg:', {
                                msgId: msg.id,
                                msgSenderId: msgSenderId,
                                currentUserId: currentUserId,
                                targetUserId: targetUserId,
                                partnerName: partner?.username,
                                targetName: targetUser.username
                            });
                        }

                        if (String(msg.sender_id) === String(currentUser.id)) {
                            senderName = 'You';
                        } else {
                            // In 1:1 chat, if it's not me, it's the partner
                            const p = partner || targetUser;
                            senderName = p.username || p.full_name || 'Friend';
                        }
                            
                        const isThemeMsg = msg.content.includes('changed the theme');
                        
                        return (
                            <React.Fragment key={`system-${msg.id || i}`}>
                                {dateHeader}
                                <div className="msg-system" style={{
                                    display: 'flex', justifyContent: 'center', margin: '12px 0', opacity: 0.85, width: '100%'
                                }}>
                                    <span style={{
                                        background: 'rgba(0, 0, 0, 0.2)',
                                        color: '#ffffff',
                                        padding: '6px 14px',
                                        borderRadius: '100px',
                                        fontSize: '0.75rem',
                                        fontWeight: '400',
                                        backdropFilter: 'blur(8px)',
                                        WebkitBackdropFilter: 'blur(8px)',
                                        maxWidth: '90%',
                                        textAlign: 'center',
                                        display: 'inline-block', // Block logic for text wrap
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                        lineHeight: '1.4'
                                    }}>
                                        {isThemeMsg ? (
                                            <>
                                                <span style={{ fontWeight: 600, opacity: 1 }}>{senderName}</span>
                                                <span style={{ opacity: 0.9 }}> {msg.content}</span>
                                            </>
                                        ) : (
                                            msg.content
                                        )}
                                    </span>
                                </div>
                            </React.Fragment>
                        );
                    }

                    // Special rendering for Call Logs
                    if (msg.message_type === 'call_log') {
                        let callData;
                        try {
                            callData = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
                        } catch {
                            // Fallback for old format
                            callData = { status: 'unknown', call_type: 'audio' };
                        }

                        const getCallIcon = () => {
                            // User prefers Type-based icons (🎥/📞) even for missed/declined
                            return callData.call_type === 'video' ? '🎥' : '📞';
                        };

                        const getCallText = () => {
                            const prefix = isMe ? 'Outgoing' : 'Incoming';
                            const typeLabel = callData.call_type === 'video' ? 'Video' : 'Audio';
                            const base = `${prefix} ${typeLabel} Call`;

                            if (callData.status === 'missed') {
                                // If I am the caller, it means they didn't answer -> "Not Answered"
                                // If I am the receiver, I missed it -> "Missed"
                                return isMe ? `${base} • Not Answered` : `${base} • Missed`;
                            }
                            
                            if (callData.status === 'declined' || callData.status === 'rejected' || callData.status === 'busy') {
                                return `${base} • Declined`;
                            }
                            
                            if (callData.status === 'ended') {
                                const duration = callData.duration || 0;
                                const mins = Math.floor(duration / 60);
                                const secs = duration % 60;
                                const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                                return `${base} • ${timeStr}`;
                            }
                            
                            // Active/Ringing
                            if (callData.status === 'ringing' || callData.status === 'calling') {
                                return `${base} • ${callData.status === 'calling' ? 'Calling...' : 'Ringing...'}`;
                            }
                            
                            // Fallback
                            return base;
                        };

                        return (
                            <React.Fragment key={`call-${msg.id || msg.tempId || i}`}>
                                {dateHeader}
                                <div className={`call-log-entry ${callData.status}`}>
                                    <span className="call-icon">{getCallIcon()}</span>
                                    <div className="call-details">
                                        <span className="call-text">{getCallText()}</span>
                                        <span className="call-time">{formatTime(msg.created_at)}</span>
                                    </div>
                                </div>
                            </React.Fragment>
                        );
                    }

                    const isImage = msg.message_type === 'image' || msg.type === 'image';
                    const imageUrl = msg.image_url || msg.media_url;

                    // Determine message status with proper tick indicators
                    const isSelected = selectedMessages.has(msg.id);
                    
                    // Normalize status: Prioritize is_read or explicit seen status
                    const isRead = msg.is_read === true;
                    const status = msg.delivery_status;
                    const isSeen = isRead || status === 'seen' || status === 'read';
                    
                    const displayStatus = isSeen ? 'seen' : (status || 'delivered');

                    return (
                        <React.Fragment key={`${msg.id || msg.tempId || 'msg'}-${i}`}>
                            <MessageBubble
                                msg={{...msg, delivery_status: displayStatus}}
                                userId={currentUser.id}
                                partner={partner || targetUser}
                                isSelectionMode={isSelectionMode}
                                isSelected={isSelected}
                                isHighlighted={highlightedMessageId === msg.id}
                                dateHeader={dateHeader}
                                onSwipeReply={(m) => setReplyToMessage(m)}
                                onToggleSelection={toggleSelection}
                                onViewImage={(url) => setViewingImage(url)}
                                onScrollToMessage={scrollToMessage}
                            />
                        </React.Fragment>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Message Context Menu (Long-Press) */}


            {blockStatus.blockedByMe ? (
                <div className="blocked-message-banner">
                    <p>You have blocked this contact.</p>
                    <button onClick={handleBlockAction} className="unblock-btn">Unblock</button>
                </div>
            ) : (
            <div className="chat-input-container" onClick={(e) => e.stopPropagation()}>
                {/* Reply Preview */}
                {replyToMessage && (
                    <div className="reply-preview">
                        <div className="reply-preview-content">
                            <div className="reply-preview-header">
                                <span className="reply-icon">↩️</span>
                                <span className="reply-to-name">
                                    {replyToMessage.sender_id === currentUser.id ? 'You' : (partner.username || partner.full_name)}
                                </span>
                            </div>
                            <div className="reply-preview-text">
                                {replyToMessage.message_type === 'image' ? '📷 Photo' : replyToMessage.content}
                            </div>
                        </div>
                        <button className="reply-preview-close" onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setReplyToMessage(null);
                            // Refocus input to keep keyboard open
                            setTimeout(() => messageInputRef.current?.focus(), 10);
                        }}>
                             ✕
                        </button>
                    </div>
                )}
                
                <div className="glass-input-bar">
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        accept="image/*"
                        onChange={handleImageUpload}
                    />
                    {/* Hidden file inputs for attachment system */}
                    <input
                        type="file"
                        ref={cameraInputRef}
                        style={{ display: 'none' }}
                        accept="image/*,video/*"
                        capture="environment"
                        onChange={handleFileSelect}
                    />
                    <input
                        type="file"
                        ref={galleryInputRef}
                        style={{ display: 'none' }}
                        accept="image/*,video/*"
                        multiple
                        onChange={handleFileSelect}
                    />
                    <input
                        type="file"
                        ref={documentInputRef}
                        style={{ display: 'none' }}
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.txt"
                        multiple
                        onChange={handleFileSelect}
                    />
                    
                    {/* Attachment "+" Button */}
                    <button 
                        onClick={() => setShowAttachmentPicker(true)} 
                        className="input-icon-btn attachment-btn"
                        title="Attach files"
                    >
                        <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="16"></line>
                            <line x1="8" y1="12" x2="16" y2="12"></line>
                        </svg>
                    </button>
                    
                    {/* Existing Image Button */}
                    <button onClick={() => fileInputRef.current.click()} disabled={uploading} className="input-icon-btn">
                        {uploading ? '⏳' : <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>}
                    </button>

                    {/* Emoji Picker Button (Moved to Left) */}
                    <button 
                        ref={emojiBtnRef}
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)} 
                        className="input-icon-btn emoji-btn"
                        title="Add emoji"
                        style={{ marginRight: '8px' }}
                    >
                        😊
                    </button>

                    <input
                        ref={messageInputRef}
                        className="msg-input"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyPress={e => e.key === 'Enter' && sendMessage()}
                        placeholder="Type a message..."
                        disabled={uploading}
                    />
                    
                    <button onClick={() => sendMessage()} className="send-btn" disabled={uploading || (!input.trim() && !uploading)}>
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
                    </button>
                </div>
            </div>
            )}

            {/* Emoji Picker Popup using Library */}
            {showEmojiPicker && (
                <div ref={emojiPickerRef} className="emoji-picker-popup" onClick={(e) => e.stopPropagation()}>
                    <EmojiPicker 
                        onEmojiClick={handleEmojiSelect}
                        theme="dark"
                        searchDisabled={false}
                        width="100%"
                        height={350}
                        previewConfig={{ showPreview: false }}
                    />
                </div>
            )}

            {/* Image Viewer Modal */}
            {viewingImage && (
                <div className="image-viewer-modal" onClick={(e) => { e.stopPropagation(); setViewingImage(null); }}>
                    <div className="image-viewer-content" onClick={(e) => e.stopPropagation()}>
                        <button className="close-viewer" onClick={() => setViewingImage(null)}>✕</button>
                        <img src={viewingImage} alt="Full size" />
                    </div>
                </div>
            )}

            {/* Mute Menu Modal */}
            {showMuteMenu && (
                <div className="mute-menu-modal" onClick={() => setShowMuteMenu(false)}>
                    <div className="mute-menu-content glass-panel" onClick={(e) => e.stopPropagation()}>
                        <h3>Mute Notifications</h3>
                        <p>You won't receive notifications from this chat</p>
                        <div className="mute-options">
                            {isChatMuted() ? (
                                <button onClick={() => handleMuteChat('unmute')} className="mute-option active">
                                    <span className="icon">
                                        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                                    </span>
                                    Unmute
                                </button>
                            ) : (
                                <>
                                    <button onClick={() => handleMuteChat('8h')} className="mute-option">
                                        <span className="icon">
                                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M19.07 4.93L4.93 19.07M2 2l20 20M13.73 21a2 2 0 0 1-3.46 0M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path></svg>
                                        </span>
                                        Mute for 8 hours
                                    </button>
                                    <button onClick={() => handleMuteChat('1w')} className="mute-option">
                                        <span className="icon">
                                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M19.07 4.93L4.93 19.07M2 2l20 20M13.73 21a2 2 0 0 1-3.46 0M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path></svg>
                                        </span>
                                        Mute for 1 week
                                    </button>
                                    <button onClick={() => handleMuteChat('always')} className="mute-option">
                                        <span className="icon">
                                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M19.07 4.93L4.93 19.07M2 2l20 20M13.73 21a2 2 0 0 1-3.46 0M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path></svg>
                                        </span>
                                        Mute always
                                    </button>
                                </>
                            )}
                        </div>
                        <button onClick={() => setShowMuteMenu(false)} className="cancel-btn">Cancel</button>
                    </div>
                </div>
            )}

            <style>{`
                :root {
                    --glass-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
                    --glass-border: rgba(255, 255, 255, 0.15);
                    --accent-gradient: linear-gradient(135deg, #00C6FF, #0072FF);
                    --text-primary: #ffffff;
                }

                .chat-room-container {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    width: 100%;
                    height: 100%; /* Allow resize with keyboard */
                    background: var(--theme-bg);
                    background-size: cover;
                    background-position: center;
                    background-repeat: no-repeat;
                    z-index: 10000;
                    display: flex; flex-direction: column;
                    font-family: 'Inter', sans-serif;
                    overflow: hidden;
                }
                
                .ambient-glow-chat {
                    position: absolute; top: -10%; left: -10%; 
                    width: 50vw; height: 50vh;
                    background: radial-gradient(circle, rgba(0, 114, 255, 0.12) 0%, transparent 60%);
                    filter: blur(80px); pointer-events: none;
                }

                .glass-header {
                    background: rgba(10, 10, 10, 0.7);
                    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
                    border-bottom: 1px solid rgba(255,255,255,0.08);
                    padding: 15px 20px; 
                    padding-top: calc(15px + env(safe-area-inset-top)); /* Notch support */
                    display: flex; align-items: center; gap: 15px;
                    z-index: 10;
                }
                
                .back-btn { 
                    background: rgba(255,255,255,0.1); color: white; border: none; 
                    width: 40px; height: 40px; border-radius: 12px;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer; transition: all 0.2s;
                }
                .back-btn:hover { background: rgba(255,255,255,0.2); }

                .header-user { flex: 1; display: flex; align-items: center; gap: 12px; }
                .header-avatar { 
                    width: 44px; height: 44px; border-radius: 14px; object-fit: cover; 
                    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
                }
                .header-text h3 { margin: 0; font-size: 1.05rem; color: white; font-weight: 600; }
                .header-text .user-status { 
                    font-size: 0.8rem; 
                    color: #888; 
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    margin-top: 2px; 
                }
                .header-text .user-status.online { 
                    color: #00ff99; 
                    font-weight: 600; 
                    text-shadow: 0 0 10px rgba(0,255,153,0.3); 
                }
                .header-text .user-status.offline {
                    color: #888;
                    font-weight: 400;
                }
                .header-text .user-status .online-dot {
                    font-size: 0.6rem;
                    animation: pulse 2s ease-in-out infinite;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                
                .header-actions { display: flex; gap: 10px; }
                .icon-btn { 
                    background: transparent; border: none; color: #ccc; 
                    width: 40px; height: 40px; border-radius: 12px;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer; transition: all 0.2s;
                }
                .icon-btn:hover { background: rgba(255,255,255,0.1); color: white; }
                
                /* Chat Area */
                .chat-messages { 
                    flex: 1; 
                    padding: 20px; 
                    overflow-y: auto; 
                    display: flex; 
                    flex-direction: column; 
                    gap: 6px; 
                    min-height: 0; 
                    scroll-behavior: smooth;
                    overscroll-behavior-y: contain;
                }
                
                .msg-bubble { 
                    max-width: 75%; padding: 12px 16px; border-radius: 20px; 
                    position: relative; word-wrap: break-word; font-size: 0.95rem;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                
                .msg-bubble.me { 
                    align-self: flex-end; 
                    background: var(--accent-gradient); 
                    color: white; 
                    border-bottom-right-radius: 4px; 
                    box-shadow: 0 4px 15px rgba(0, 114, 255, 0.3);
                }
                
                .msg-bubble.them { 
                    align-self: flex-start; 
                    background: rgba(255,255,255,0.08); 
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255,255,255,0.05);
                    color: #eee; 
                    border-bottom-left-radius: 4px; 
                }
                
                /* Theme-specific message bubble colors */
                .msg-bubble.me {
                    background: var(--theme-bubble-sent, var(--accent-gradient));
                    color: var(--theme-text-color, white); 
                    /* Use accent color for shadow or default */
                    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                }
                
                .msg-bubble.them {
                    background: var(--theme-bubble-received, rgba(255,255,255,0.08));
                    color: var(--theme-text-color, #eee);
                }

                /* Dark mode incoming bubbles - Light bubble, black text */
                html[data-theme="dark"] .msg-bubble.them {
                    background: #e0e0e0 !important;
                    color: #000000 !important;
                    border: none !important;
                }
                html[data-theme="dark"] .msg-bubble.them .msg-text,
                html[data-theme="dark"] .msg-bubble.them .msg-time {
                    color: #000000 !important;
                }

                /* Dark mode SENT bubbles - Light bubble, black text */
                html[data-theme="dark"] .msg-bubble.me {
                    background: #bbdefb !important; /* Light blue to distinguish from incoming */
                    color: #000000 !important;
                    box-shadow: none !important;
                }
                html[data-theme="dark"] .msg-bubble.me .msg-text,
                html[data-theme="dark"] .msg-bubble.me .msg-time {
                    color: #000000 !important;
                }
                
                @media (prefers-color-scheme: dark) {
                    html[data-theme="system"] .msg-bubble.them {
                        background: #e0e0e0 !important;
                        color: #000000 !important;
                        border: none !important;
                    }
                    html[data-theme="system"] .msg-bubble.them .msg-text,
                    html[data-theme="system"] .msg-bubble.them .msg-time {
                        color: #000000 !important;
                    }

                    html[data-theme="system"] .msg-bubble.me {
                        background: #bbdefb !important;
                        color: #000000 !important;
                        box-shadow: none !important;
                    }
                    html[data-theme="system"] .msg-bubble.me .msg-text,
                    html[data-theme="system"] .msg-bubble.me .msg-time {
                        color: #000000 !important;
                    }
                }
                
                .msg-content-wrapper {
                    display: flex;
                    align-items: baseline;
                    gap: 8px;
                    flex-wrap: wrap;
                }
                
                .msg-text-container {
                    display: flex;
                    align-items: baseline;
                    gap: 6px;
                    flex-wrap: wrap;
                }
                
                .msg-text { 
                    display: inline;
                    line-height: 1.4;
                    flex: 1;
                    min-width: 0;
                }
                
                .msg-time-inline {
                    font-size: 0.65rem;
                    opacity: 0.6;
                    white-space: nowrap;
                    margin-left: 4px;
                }
                
                .msg-time { 
                    font-size: 0.65rem;
                    opacity: 0.7;
                    white-space: nowrap;
                    margin-left: auto;
                }
                
                .msg-status { 
                    font-size: 0.7rem;
                    opacity: 0.7;
                    white-space: nowrap;
                    margin-left: 2px;
                }
                
                .msg-status.read { color: #FFB300; font-weight: bold; opacity: 1; }
                
                .msg-system {
                    width: 100%;
                    text-align: center;
                    margin: 12px 0;
                    display: flex;
                    justify-content: center;
                }
                
                .msg-system span {
                    background: rgba(0, 0, 0, 0.2);
                    padding: 4px 12px;
                    border-radius: 12px;
                    font-size: 0.75rem;
                    color: rgba(255, 255, 255, 0.6);
                    backdrop-filter: blur(4px);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                }
                .chat-room-container[data-theme-type="light"] .msg-system span {
                    background: rgba(0, 0, 0, 0.05);
                    color: rgba(0,0,0,0.5);
                    border-color: rgba(0,0,0,0.05);
                }
                /* Theme Background Patterns */
                [data-pattern="hearts"]::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background-image: 
                        radial-gradient(circle, var(--theme-accent) 1px, transparent 1px),
                        radial-gradient(circle, var(--theme-bubble-sent) 1px, transparent 1px);
                    background-size: 50px 50px, 80px 80px;
                    background-position: 0 0, 25px 25px;
                    opacity: 0.05;
                    pointer-events: none;
                }
                
                [data-pattern="leaves"]::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background-image: 
                        radial-gradient(circle, var(--theme-accent) 1.5px, transparent 1.5px);
                    background-size: 60px 60px;
                    background-position: 0 0, 30px 30px;
                    opacity: 0.06;
                    pointer-events: none;
                }
                
                [data-pattern="confetti"]::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background-image: 
                        radial-gradient(circle, var(--theme-accent) 1px, transparent 1px),
                        radial-gradient(circle, var(--theme-bubble-sent) 1px, transparent 1px),
                        radial-gradient(circle, var(--theme-bubble-received) 1px, transparent 1px);
                    background-size: 40px 40px, 60px 60px, 50px 50px;
                    background-position: 0 0, 20px 20px, 10px 30px;
                    opacity: 0.08;
                    pointer-events: none;
                }
                
                [data-pattern="geometric"]::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background-image: 
                        linear-gradient(45deg, rgba(255,255,255,0.03) 25%, transparent 25%),
                        linear-gradient(-45deg, rgba(255,255,255,0.03) 25%, transparent 25%);
                    background-size: 30px 30px;
                    background-position: 0 0, 15px 15px;
                    pointer-events: none;
                }
                
                .chat-messages {
                    position: relative;
                }
                
                /* Input Area */
                .chat-input-container {
                    padding: 16px 20px;
                    padding-bottom: calc(16px + env(safe-area-inset-bottom)); /* Safe area for mobile */
                    background: #ffffff; /* Force white background */
                    border-top: 1px solid rgba(0,0,0,0.1); /* Subtle divider */
                    transition: background 0.3s ease;
                    position: relative;
                    z-index: 10;
                }
                
                @media (max-width: 768px) {
                    .chat-input-container {
                        padding: 10px 12px; /* Tighter padding on mobile */
                        padding-bottom: calc(10px + env(safe-area-inset-bottom));
                    }
                    .glass-input-bar {
                        padding: 4px 4px 4px 12px !important; /* Less internal padding */
                        gap: 4px !important; /* Smaller gap */
                    }
                    .input-icon-btn, .attachment-btn {
                        width: 32px; height: 32px; padding: 2px;
                    }
                    .emoji-btn {
                        margin-right: 2px !important;
                    }
                }
                
                /* Light theme override for input area (Redundant but safe) */
                .chat-room-container[data-theme-type="light"] .chat-input-container {
                     background: #ffffff;
                     border-top: 1px solid rgba(0,0,0,0.05);
                }
                
                .glass-input-bar {
                    display: flex; align-items: center; gap: 10px;
                    background: #f5f5f5; /* Light grey for input field itself */
                    border: 1px solid #e0e0e0;
                    border-radius: 24px; padding: 6px 6px 6px 16px;
                    transition: all 0.2s;
                }
                
                .chat-room-container[data-theme-type="light"] .glass-input-bar {
                     background: #f5f5f5;
                     border-color: #e0e0e0;
                }
                
                .glass-input-bar:focus-within {
                    background: #ffffff;
                    border-color: var(--accent-gradient); /* Or accent color */
                    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                }
                
                .chat-room-container[data-theme-type="light"] .glass-input-bar:focus-within {
                    background: #ffffff;
                    border-color: rgba(0,0,0,0.15);
                }
                
                .msg-input {
                    flex: 1; background: transparent !important; border: none; outline: none;
                    color: #000000 !important; /* Force black text */
                    font-size: 1rem; padding: 8px 0;
                    min-width: 0; /* Allow shrinking */
                }
                .msg-input::placeholder { color: #888888; }
                
                .chat-room-container[data-theme-type="light"] .msg-input {
                     color: #000000;
                }
                .chat-room-container[data-theme-type="light"] .msg-input::placeholder {
                     color: #888888;
                }
                
                .input-icon-btn {
                    color: #555555; background: none; border: none;
                    cursor: pointer; padding: 4px; transition: color 0.2s;
                    width: 32px; height: 32px; flex-shrink: 0;
                }
                .input-icon-btn:hover { color: var(--theme-accent, #000); }
                
                .chat-room-container[data-theme-type="light"] .input-icon-btn { color: #555555; }
                .chat-room-container[data-theme-type="light"] .input-icon-btn:hover { color: var(--theme-accent, #333); }
                
                .send-btn { 
                    width: 36px; height: 36px; border-radius: 50%; border: none;
                    background: var(--theme-accent, #0084ff); /* Fallback blue */
                    background-image: var(--accent-gradient); /* Optional override */
                    color: white;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                    transition: transform 0.2s;
                    flex-shrink: 0; /* Prevent shrinking on small screens */
                    min-width: 36px; /* Force width */
                    margin-left: 8px; /* Fixed margin instead of auto */
                    z-index: 5;
                }
                .send-btn svg { width: 18px; height: 18px; }
                .send-btn:hover { transform: scale(1.05); }
                .send-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

                /* Emoji Picker */
                .emoji-btn {
                    font-size: 1.5rem;
                    padding: 0;
                    width: 36px;
                    height: 36px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-right: 4px; /* Added spacing */
                }

                .emoji-picker-popup {
                    position: absolute;
                    bottom: 80px;
                    left: 20px; /* Moved to left */
                    background: rgba(20, 20, 20, 0.98);
                    backdrop-filter: blur(16px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    padding: 0; /* Remove padding for library component */
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
                    z-index: 1000;
                    width: 350px; /* Fixed width for picker */
                    overflow: hidden; /* rounded corners */
                    animation: slideUpFade 0.2s ease-out;
                }

                @keyframes slideUpFade {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                /* Dropdown & Modals */
                .dropdown-menu {
                    position: absolute; 
                    top: calc(100% + 8px); 
                    right: 0;
                    background: rgba(28, 28, 30, 0.98);
                    backdrop-filter: blur(20px) saturate(180%);
                    -webkit-backdrop-filter: blur(20px) saturate(180%);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 16px;
                    padding: 6px;
                    min-width: 220px;
                    box-shadow: 
                        0 8px 32px rgba(0, 0, 0, 0.4),
                        0 2px 8px rgba(0, 0, 0, 0.2),
                        inset 0 1px 0 rgba(255, 255, 255, 0.05);
                    z-index: 10001; 
                    animation: slideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                    transform-origin: top right;
                    overflow: hidden;
                }
                .dropdown-menu button { 
                    padding: 12px 14px; 
                    width: 100%; 
                    text-align: left;
                    background: none; 
                    border: none; 
                    color: rgba(255, 255, 255, 0.9);
                    border-radius: 10px; 
                    cursor: pointer;
                    display: flex; 
                    align-items: center; 
                    gap: 12px;
                    font-size: 0.95rem; 
                    font-weight: 500;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    letter-spacing: 0.01em;
                }
                .dropdown-menu button:active {
                    transform: scale(0.98);
                }
                .dropdown-menu button:hover { 
                    background: rgba(255,255,255,0.1); 
                    color: white; 
                }
                .dropdown-menu .divider { 
                    height: 1px; 
                    background: linear-gradient(
                        90deg, 
                        transparent, 
                        rgba(255, 255, 255, 0.12) 50%, 
                        transparent
                    );
                    margin: 6px 8px; 
                }
                .dropdown-menu button.danger { 
                    color: #ff5757; 
                }
                .dropdown-menu button.danger:hover { 
                    background: rgba(255, 69, 58, 0.15); 
                    color: #ff6b6b;
                }
                
                .glass-panel {
                    background: rgba(20,20,20,0.8); backdrop-filter: blur(20px);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 24px; padding: 24px;
                    width: 90%; max-width: 320px;
                }
                
                /* Light Theme */
                .light-theme { background: transparent; }
                .light-theme .glass-header { background: rgba(255,255,255,0.85); border-bottom-color: rgba(0,0,0,0.1); }
                .light-theme .header-text h3 { color: #000; }
                .light-theme .back-btn, .light-theme .icon-btn { color: #333; }
                .light-theme .back-btn:hover, .light-theme .icon-btn:hover { background: rgba(0,0,0,0.05); }
                .light-theme .msg-bubble.them { background: #ffffff; color: #111; box-shadow: 0 2px 5px rgba(0,0,0,0.05); border-color: transparent; }
                .light-theme .chat-input-container { background: rgba(255,255,255,0.8); }
                .light-theme .glass-input-bar { background: #fff; border-color: #ddd; }
                .light-theme .msg-input { color: #000; }
                .light-theme .input-icon-btn { color: #555; }

                .chat-room-header {
                    padding: 8px 12px; 
                    padding-top: max(8px, env(safe-area-inset-top)); /* Safe area top */
                    display: flex; align-items: center; gap: 10px;
                    background: rgba(20,20,20,0.95); border-bottom: 1px solid #333; color: white;
                    height: auto; /* Allow growth */
                    min-height: 60px; /* Maintain minimum height */
                }
                .back-btn { background: none; color: white; font-size: 1.5rem; border: none; padding: 0 8px; cursor: pointer; }
                .header-user { flex: 1; display: flex; align-items: center; gap: 10px; min-width: 0; /* Enable truncation */ }
                .header-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
                .header-text { display: flex; flex-direction: column; justify-content: center; min-width: 0; /* Enable flex child truncation */ }
                .header-text h3 { margin: 0; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; }
                .header-text .user-status { 
                    font-size: 0.75rem; color: #888; 
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                    line-height: 1.2;
                }
                .header-text .user-status.online { color: #00ff99; font-weight: 600; }
                .header-actions { display: flex; gap: 12px; }
                .header-actions button { background: none; border: none; font-size: 1.2rem; color: white; cursor: pointer; }
                
                .dropdown-menu {
                    position: absolute; 
                    top: calc(100% + 8px); 
                    right: 0;
                    background: rgba(28, 28, 30, 0.98);
                    backdrop-filter: blur(20px) saturate(180%);
                    -webkit-backdrop-filter: blur(20px) saturate(180%);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 16px;
                    padding: 6px;
                    display: flex; 
                    flex-direction: column; 
                    gap: 2px;
                    min-width: 220px;
                    box-shadow: 
                        0 8px 32px rgba(0, 0, 0, 0.4),
                        0 2px 8px rgba(0, 0, 0, 0.2),
                        inset 0 1px 0 rgba(255, 255, 255, 0.05);
                    z-index: 10001; 
                    animation: slideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                    transform-origin: top right;
                    overflow: hidden;
                }
                @keyframes slideDown {
                    from { 
                        opacity: 0; 
                        transform: scale(0.92) translateY(-8px); 
                    }
                    to { 
                        opacity: 1; 
                        transform: scale(1) translateY(0); 
                    }
                }
                .dropdown-menu button { 
                    font-size: 0.95rem; 
                    color: rgba(255, 255, 255, 0.9); 
                    padding: 12px 14px; 
                    text-align: left; 
                    width: 100%; 
                    cursor: pointer; 
                    background: none; 
                    border: none; 
                    border-radius: 10px;
                    display: flex; 
                    align-items: center; 
                    gap: 12px;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    font-weight: 500;
                    position: relative;
                    letter-spacing: 0.01em;
                }
                .dropdown-menu button:active {
                    transform: scale(0.98);
                }
                .dropdown-menu button:hover { 
                    background: rgba(255, 255, 255, 0.1); 
                    color: white; 
                }
                .dropdown-menu button.danger { 
                    color: #ff5757; 
                }
                .dropdown-menu button.danger:hover { 
                    background: rgba(255, 69, 58, 0.15); 
                    color: #ff6b6b;
                }
                .dropdown-menu .icon { 
                    display: flex; 
                    align-items: center; 
                    justify-content: center; 
                    width: 20px;
                    height: 20px;
                    opacity: 0.85;
                    flex-shrink: 0;
                }
                .dropdown-menu button:hover .icon {
                    opacity: 1;
                }
                .dropdown-menu .divider { 
                    height: 1px; 
                    background: linear-gradient(
                        90deg, 
                        transparent, 
                        rgba(255, 255, 255, 0.12) 50%, 
                        transparent
                    );
                    margin: 6px 8px; 
                }


                .sent-image { max-width: 100%; max-height: 300px; border-radius: 10px; display: block; }

                /* Image Viewer Modal */
                .image-viewer-modal {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.95); z-index: 15000;
                    display: flex; align-items: center; justify-content: center;
                    animation: fadeIn 0.2s;
                }
                .image-viewer-content { position: relative; max-width: 90%; max-height: 90%; }
                .image-viewer-content img { max-width: 100%; max-height: 90vh; object-fit: contain; }
                .close-viewer {
                    position: absolute; top: -40px; right: 0;
                    background: rgba(255,255,255,0.2); color: white;
                    border: none; width: 35px; height: 35px; border-radius: 50%;
                    font-size: 1.2rem; cursor: pointer; backdrop-filter: blur(10px);
                }
                .close-viewer:hover { background: rgba(255,255,255,0.3); }

                /* Mute Menu Modal */
                .mute-menu-modal {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.8); z-index: 14000;
                    display: flex; align-items: center; justify-content: center;
                    animation: fadeIn 0.2s;
                    backdrop-filter: blur(5px);
                }
                .mute-menu-content {
                    background: rgba(30,30,30,0.85); 
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border-radius: 20px; padding: 25px;
                    width: 85%; max-width: 340px; color: white;
                    border: 1px solid rgba(255,255,255,0.1);
                    box-shadow: 0 20px 50px rgba(0,0,0,0.5);
                }
                .mute-menu-content h3 { margin: 0 0 8px 0; font-size: 1.3rem; font-weight: 600; }
                .mute-menu-content p { margin: 0 0 20px 0; font-size: 0.9rem; color: #a0a0a0; }
                .mute-options { display: flex; flex-direction: column; gap: 8px; margin-bottom: 15px; }
                .mute-option {
                    padding: 14px 16px; background: rgba(255,255,255,0.05); 
                    border: 1px solid rgba(255,255,255,0.05);
                    border-radius: 12px; color: white; cursor: pointer; font-size: 1rem;
                    display: flex; align-items: center; gap: 12px;
                    transition: all 0.2s; font-weight: 500;
                }
                .mute-option:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); transform: translateY(-1px); }
                .mute-option.active { border-color: #00f0ff; background: rgba(0, 240, 255, 0.15); color: #00f0ff; }
                
                .mute-option .icon { display: flex; align-items: center; justify-content: center; opacity: 0.9; }
                
                .cancel-btn {
                    width: 100%; padding: 14px; background: transparent;
                    border: 1px solid rgba(255,255,255,0.15); border-radius: 12px;
                    color: white; cursor: pointer; font-size: 1rem;
                    transition: all 0.2s;
                }
                .cancel-btn:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.3); }
                
                /* Delete Confirmation Modal */
                .delete-confirm-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.85);
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                    z-index: 15000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    animation: fadeIn 0.2s ease-out;
                }

                .delete-confirm-modal {
                    background: linear-gradient(135deg, rgba(30, 30, 35, 0.98) 0%, rgba(20, 20, 25, 0.98) 100%);
                    backdrop-filter: blur(40px);
                    -webkit-backdrop-filter: blur(40px);
                    border-radius: 24px;
                    padding: 32px 28px;
                    width: 90%;
                    max-width: 380px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
                    animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    text-align: center;
                }

                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px) scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }

                .delete-icon-wrapper {
                    width: 80px;
                    height: 80px;
                    margin: 0 auto 20px;
                    background: rgba(255, 69, 58, 0.1);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 2px solid rgba(255, 69, 58, 0.2);
                    animation: iconPulse 2s ease-in-out infinite;
                }

                .delete-icon-wrapper svg {
                    color: #ff453a;
                    filter: drop-shadow(0 2px 8px rgba(255, 69, 58, 0.3));
                }

                @keyframes iconPulse {
                    0%, 100% {
                        transform: scale(1);
                        box-shadow: 0 0 0 0 rgba(255, 69, 58, 0.4);
                    }
                    50% {
                        transform: scale(1.05);
                        box-shadow: 0 0 0 10px rgba(255, 69, 58, 0);
                    }
                }

                .delete-title {
                    margin: 0 0 12px 0;
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: white;
                    letter-spacing: -0.02em;
                }

                .delete-description {
                    margin: 0 0 28px 0;
                    font-size: 0.95rem;
                    line-height: 1.5;
                    color: rgba(255, 255, 255, 0.7);
                }

                .delete-description strong {
                    color: white;
                    font-weight: 600;
                }

                .delete-actions {
                    display: flex;
                    gap: 12px;
                }

                .delete-btn-cancel {
                    flex: 1;
                    padding: 14px 20px;
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 14px;
                    color: white;
                    font-size: 1rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }

                .delete-btn-cancel:hover {
                    background: rgba(255, 255, 255, 0.12);
                    border-color: rgba(255, 255, 255, 0.25);
                    transform: translateY(-1px);
                }

                .delete-btn-cancel:active {
                    transform: translateY(0) scale(0.98);
                }

                .delete-btn-confirm {
                    flex: 1;
                    padding: 14px 20px;
                    background: linear-gradient(135deg, #ff453a 0%, #e63946 100%);
                    border: none;
                    border-radius: 14px;
                    color: white;
                    font-size: 1rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 0 4px 16px rgba(255, 69, 58, 0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                }

                .delete-btn-confirm:hover {
                    background: linear-gradient(135deg, #ff5a50 0%, #ff4757 100%);
                    box-shadow: 0 6px 24px rgba(255, 69, 58, 0.4);
                    transform: translateY(-2px);
                }

                .delete-btn-confirm:active {
                    transform: translateY(0) scale(0.98);
                }

                .delete-btn-confirm svg {
                    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
                }
                
                /* Chat Theme Selector Modal */
                .theme-selector-modal {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.85); z-index: 14000;
                    display: flex; align-items: center; justify-content: center;
                    animation: fadeIn 0.2s;
                    backdrop-filter: blur(8px);
                }
                
                .theme-selector-content {
                    background: rgba(20,20,25,0.95); 
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border-radius: 24px; padding: 28px;
                    width: 90%; max-width: 500px; color: white;
                    border: 1px solid rgba(255,255,255,0.1);
                    box-shadow: 0 20px 60px rgba(0,0,0,0.6);
                    max-height: 85vh;
                    overflow-y: auto;
                }
                
                .theme-selector-content h3 { 
                    margin: 0 0 20px 0; 
                    font-size: 1.5rem; 
                    font-weight: 700;
                    text-align: center;
                }
                
                .theme-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                    gap: 16px;
                    margin-bottom: 20px;
                }
                
                .theme-card {
                    padding: 16px;
                    border-radius: 16px;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    border: 3px solid transparent;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 12px;
                }
                
                .theme-card:hover {
                    transform: translateY(-4px) scale(1.02);
                    box-shadow: 0 12px 24px rgba(0,0,0,0.3);
                }
                
                .theme-card.active {
                    border-width: 3px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
                }
                
                .theme-emoji {
                    font-size: 2.5rem;
                    line-height: 1;
                }
                
                .theme-name {
                    font-size: 1rem;
                    font-weight: 700;
                    text-align: center;
                }
                
                .theme-preview {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    width: 100%;
                }
                
                .preview-bubble {
                    padding: 8px 12px;
                    border-radius: 12px;
                    font-size: 0.75rem;
                    text-align: center;
                }
                
                .preview-bubble.sent {
                    align-self: flex-end;
                    border-bottom-right-radius: 4px;
                }
                
                .preview-bubble.received {
                    align-self: flex-start;
                    border-bottom-left-radius: 4px;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                /* Cleaned up duplicate styles */

                /* INCOMING CALL MODAL */
                .incoming-call-overlay {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.85); z-index: 12000;
                    display: flex; align-items: center; justify-content: center;
                    animation: fadeIn 0.3s;
                }
                .call-card {
                    background: #1e1e24; width: 80%; max-width: 300px; padding: 30px;
                    border-radius: 20px; text-align: center; color: white;
                    box-shadow: 0 0 50px rgba(0, 240, 255, 0.3);
                    border: 1px solid rgba(255,255,255,0.1);
                    animation: pulseCall 2s infinite;
                }
                .call-avatar { width: 100px; height: 100px; border-radius: 50%; border: 4px solid #00f0ff; margin-bottom: 20px; }
                .call-actions { display: flex; justify-content: space-around; margin-top: 30px; }
                .answer-btn, .reject-btn {
                    width: 60px; height: 60px; border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 1.5rem; border: none; cursor: pointer;
                    transition: transform 0.2s;
                }
                .answer-btn:active, .reject-btn:active { transform: scale(0.9); }
                .answer-btn { background: #00ff00; color: black; box-shadow: 0 0 20px rgba(0,255,0,0.4); }
                .reject-btn { background: #ff4444; color: white; box-shadow: 0 0 20px rgba(255,0,0,0.4); }

                @keyframes pulseCall {
                    0% { box-shadow: 0 0 0 0 rgba(0, 240, 255, 0.4); }
                    70% { box-shadow: 0 0 0 20px rgba(0, 240, 255, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(0, 240, 255, 0); }
                }

                .call-log-entry {
                    width: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 12px 0;
                    padding: 12px 16px;
                    background: rgba(0, 0, 0, 0.03);
                    border-radius: 12px;
                    border-left: 3px solid rgba(0, 0, 0, 0.1);
                }

                .call-log-entry.missed {
                    border-left-color: #f44336;
                    background: rgba(244, 67, 54, 0.05);
                }

                .call-log-entry.declined {
                    border-left-color: #ff9800;
                    background: rgba(255, 152, 0, 0.05);
                }

                .call-log-entry.ended {
                    border-left-color: #4caf50;
                    background: rgba(76, 175, 80, 0.05);
                }

                .call-icon {
                    font-size: 1.2rem;
                    margin-right: 12px;
                }

                .call-details {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .call-text {
                    font-size: 0.9rem;
                    color: #1d1d1f;
                    font-weight: 500;
                }

                .call-time {
                    font-size: 0.75rem;
                    color: #6e6e73;
                }

                .chat-date-header {
                    display: flex; justify-content: center;
                    margin: 24px 0 12px 0;
                    width: 100%;
                }
                .chat-date-header span {
                    background: rgba(40, 40, 45, 0.6);
                    color: rgba(255, 255, 255, 0.5);
                    font-size: 0.75rem;
                    font-weight: 500;
                    padding: 4px 12px;
                    border-radius: 12px;
                    backdrop-filter: blur(4px);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                }

                .empty-chat-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    color: rgba(255,255,255,0.5);
                    padding: 40px;
                    text-align: center;
                }
                .empty-chat-icon {
                    width: 100px;
                    height: 100px;
                    background: rgba(255,255,255,0.03);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 20px;
                    color: var(--theme-accent, #00C6FF);
                    border: 1px solid rgba(255,255,255,0.05);
                }
                .empty-chat-state h3 {
                    font-size: 1.5rem;
                    color: white;
                    margin: 0 0 8px 0;
                    font-weight: 600;
                }
                .empty-chat-state p {
                    font-size: 1rem;
                    margin: 0 0 24px 0;
                    max-width: 250px;
                    line-height: 1.5;
                }
                .tap-to-chat-btn {
                    padding: 12px 28px;
                    background: rgba(255,255,255,0.1);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 99px;
                    color: white;
                    font-weight: 600;
                    font-size: 1rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .tap-to-chat-btn:hover {
                    background: var(--theme-accent, #00C6FF);
                    border-color: transparent;
                    transform: translateY(-2px);
                    box-shadow: 0 8px 20px rgba(0,0,0,0.3);
                }
                /* Reply Preview Styling */
                .reply-preview {
                    position: absolute;
                    bottom: 100%;
                    left: 10px;
                    right: 10px;
                    background: rgba(30, 30, 35, 0.95);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border-top-left-radius: 16px;
                    border-top-right-radius: 16px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-bottom: none;
                    padding: 12px 16px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    animation: slideUpReply 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    box-shadow: 0 -5px 20px rgba(0, 0, 0, 0.2);
                    z-index: 10;
                    margin-bottom: 0px; /* Connects physically to the input bar */
                }

                @keyframes slideUpReply {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                
                @keyframes scaleIn {
                    from { transform: scale(0.95); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }

                .reply-preview-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    overflow: hidden;
                    border-left: 3px solid #00f0ff;
                    padding-left: 10px;
                }

                .reply-preview-header {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .reply-icon {
                    font-size: 0.8rem;
                    color: #00f0ff;
                }

                .reply-to-name {
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: #00f0ff;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .reply-preview-text {
                    font-size: 0.85rem;
                    color: rgba(255, 255, 255, 0.8);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .reply-preview-close {
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    background: rgba(255, 255, 255, 0.1);
                    border: none;
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.9rem;
                    cursor: pointer;
                    margin-left: 10px;
                    transition: all 0.2s;
                }

                .reply-preview-close:hover {
                    background: rgba(255, 255, 255, 0.2);
                    transform: scale(1.1);
                }

            
                /* Menu Overlay for closing on click-outside */
                .menu-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    z-index: 9; /* Below header (10), above content (0) */
                    background: transparent;
                }

                .dropdown-menu {
                    position: absolute;
                    top: 100%; right: 0;
                    background: rgba(30, 30, 30, 0.95);
                    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 16px;
                    padding: 8px;
                    min-width: 220px;
                    display: flex; flex-direction: column; gap: 4px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                    animation: scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                    z-index: 1010; /* Above overlay */
                }
            `}</style>


            {/* Attachment System Components */}
            <AttachmentPicker
                isOpen={showAttachmentPicker}
                onClose={() => setShowAttachmentPicker(false)}
                onSelectCamera={handleSelectCamera}
                onSelectGallery={handleSelectGallery}
                onSelectDocument={handleSelectDocument}
            />

             <AttachmentPreview
                files={selectedFiles}
                onRemove={handleRemoveFile}
                onSend={handleSendAttachments}
                onCancel={handleCancelAttachments}
                uploadProgress={uploadProgress}
            />

            {/* Delete Message Modal */}
            {showDeleteMessageModal && (
                <MessageDeleteModal 
                    selectedMessages={Array.from(selectedMessages).map(id => messages.find(m => m.id === id)).filter(Boolean)}
                    currentUser={currentUser}
                    onDeleteForMe={executeDeleteForMe}
                    onDeleteForEveryone={executeDeleteForEveryone}
                    onCancel={() => setShowDeleteMessageModal(false)}
                />
            )}

            {/* Global Menu Overlay for Click-Outside */}
            {showMenu && (
                <div className="menu-overlay" onClick={() => setShowMenu(false)} />
            )}
        </div>
    );
}

// --- Modal Components ---

function ForwardModal({ chats, onClose, onSend, loading }) {
    const [selected, setSelected] = useState(new Set());
    const [searchTerm, setSearchTerm] = useState('');

    const filteredChats = chats.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const toggleChat = (id) => {
        setSelected(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    return (
        <div className="mute-menu-modal" onClick={onClose}>
            <div className="mute-menu-content glass-panel" onClick={e => e.stopPropagation()} style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '20px' }}>
                <h3 style={{ marginBottom: '15px' }}>Forward to...</h3>
                
                {/* Search */}
                <div className="glass-input-bar" style={{ marginBottom: '15px', padding: '8px 12px' }}>
                    <input 
                        className="msg-input" 
                        placeholder="Search..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        autoFocus
                    />
                </div>

                <div className="forward-list" style={{ overflowY: 'auto', flex: 1, marginBottom: '20px' }}>
                    {filteredChats.map(chat => (
                        <div 
                            key={chat.id} 
                            className={`chat-item ${selected.has(chat.id) ? 'selected' : ''}`}
                            onClick={() => toggleChat(chat.id)}
                            style={{ padding: '10px', borderRadius: '12px', background: selected.has(chat.id) ? 'rgba(0,240,255,0.15)' : 'transparent', border: '1px solid', borderColor: selected.has(chat.id) ? 'rgba(0,240,255,0.3)' : 'transparent' }}
                        >
                            <img src={chat.avatar} className="header-avatar" alt="" style={{ width: '40px', height: '40px' }} />
                            <span style={{ marginLeft: '12px', fontWeight: 500, color: 'white', flex: 1 }}>{chat.name}</span>
                            {selected.has(chat.id) && <span style={{ color: '#00f0ff' }}>✓</span>}
                        </div>
                    ))}
                </div>

                <div className="forward-actions" style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={onClose} className="cancel-btn" style={{ flex: 1 }}>Cancel</button>
                    <button 
                        onClick={() => onSend(Array.from(selected))} 
                        className="mute-option active"
                        style={{ flex: 1, justifyContent: 'center', background: 'var(--accent-gradient)' }}
                        disabled={loading || selected.size === 0}
                    >
                        {loading ? 'Sending...' : `Send (${selected.size})`}
                    </button>
                </div>
            </div>
        </div>
    );
}

function MessageDeleteModal({ selectedMessages, currentUser, onDeleteForMe, onDeleteForEveryone, onCancel }) {
    // Check eligibility: All messages must be sent by Me AND be less than 5 minutes old
    const canDeleteForEveryone = selectedMessages.every(msg => {
        const isMine = msg.sender_id === currentUser.id;
        const diff = Date.now() - new Date(msg.created_at).getTime();
        const isRecent = diff < 5 * 60 * 1000; // 5 minutes
        return isMine && isRecent;
    });

    return (
        <div className="delete-confirm-overlay" onClick={onCancel}>
            <div className="delete-confirm-modal" onClick={e => e.stopPropagation()} style={{ padding: '24px' }}>
                <h3 className="delete-title">Delete Message?</h3>
                <p className="delete-description" style={{ marginBottom: '24px' }}>
                    {canDeleteForEveryone 
                        ? "You sent this recently. You can remove it for everyone or just yourself."
                        : "This will remove the message from your device only."
                    }
                </p>

                <div className="delete-actions" style={{ flexDirection: 'column', gap: '10px' }}>
                    {canDeleteForEveryone && (
                        <button 
                            onClick={onDeleteForEveryone} 
                            className="delete-btn-confirm"
                            style={{ width: '100%', justifyContent: 'center' }}
                        >
                            Delete for Everyone
                        </button>
                    )}
                    
                    <button 
                        onClick={onDeleteForMe} 
                        className="delete-btn-cancel"
                        style={{ width: '100%', justifyContent: 'center', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                        Delete for Me
                    </button>
                    
                    <button 
                        onClick={onCancel} 
                        className="cancel-btn"
                        style={{ width: '100%', marginTop: '5px' }}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
