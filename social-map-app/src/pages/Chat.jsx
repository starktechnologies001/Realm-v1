import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import AgoraRTC from "agora-rtc-sdk-ng";
import Toast from '../components/Toast';
import { getAvatarHeadshot } from '../utils/avatarUtils';
import AttachmentPicker from '../components/AttachmentPicker';
import AttachmentPreview from '../components/AttachmentPreview';
import MessageAttachment from '../components/MessageAttachment';
import { uploadToStorage, validateFile } from '../utils/fileUpload';
import EmojiPicker from 'emoji-picker-react';

const APP_ID = "ef79b1bdb8f94b7e990ff633799b7c10"; // User Provided App ID

import { useCall } from '../context/CallContext';

export default function Chat() {
    const [activeChatUser, setActiveChatUser] = useState(null);
    const [chats, setChats] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();
    const { incomingCall, startCall: startGlobalCall, answerCall, rejectCall, sendQuickReply } = useCall();

    useEffect(() => {
        const initChat = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                navigate('/login');
                return;
            }
            setCurrentUser(user);
            
            // If navigated with a target user (from Map or Friends), open that chat immediately
            if (location.state?.targetUser) {
                setActiveChatUser(location.state.targetUser);
            }

            fetchChats(user.id);
        };
        initChat();
    }, [location.state]);

    const fetchChats = async (userId) => {
        // 1. Fetch all accepted friendships (for "Friend" status, if needed later)
        const { data: friendships, error: friendError } = await supabase
            .from('friendships')
            .select(`
                id,
                requester:profiles!requester_id(id, full_name, username, avatar_url, status, gender),
                receiver:profiles!receiver_id(id, full_name, username, avatar_url, status, gender)
            `)
            .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
            .eq('status', 'accepted');

        if (friendError) {
            console.error("Error fetching chats:", friendError);
            setLoading(false);
            return;
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
            setChats([]);
            setLoading(false);
            return;
        }

        // 3. Fetch Profiles for ALL these partners
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, username, avatar_url, status, gender')
            .in('id', Array.from(partnerIds));

        if (!profiles) {
            setLoading(false);
            return;
        }

        // Format into a clean list of "Chat Partners"
        const formattedChats = await Promise.all(profiles.map(async partner => {
            // Fetch unread count
            const { count } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('sender_id', partner.id)
                .eq('receiver_id', userId)
                .eq('is_read', false);

            // Fetch mute settings
            const { data: muteData } = await supabase
                .from('chat_settings')
                .select('muted_until')
                .eq('user_id', userId)
                .eq('partner_id', partner.id)
                .maybeSingle();

            const isMuted = muteData && muteData.muted_until && new Date(muteData.muted_until) > new Date();

            // Avatar Logic: Prefer stored avatar, else generate consistent one
            // similar to MapHome logic
            let genderAvatar = getAvatarHeadshot(partner.avatar_url);
            if (!genderAvatar) {
                 const safeName = encodeURIComponent(partner.username || partner.full_name || 'User');
                 if (partner.gender === 'Male') genderAvatar = `https://avatar.iran.liara.run/public/boy?username=${safeName}`;
                 else if (partner.gender === 'Female') genderAvatar = `https://avatar.iran.liara.run/public/girl?username=${safeName}`;
                 else genderAvatar = `https://avatar.iran.liara.run/public?username=${safeName}`;
            }

            return {
                id: partner.id,
                name: partner.username || partner.full_name,
                avatar: genderAvatar,
                lastMsg: 'Tap to chat',
                time: '',
                unread: count || 0,
                isMuted: isMuted,
                fullProfile: partner
            };
        }));
        setChats(formattedChats);

        // Subscribe for real-time unread updates in list
        const channelName = `chat_list_${userId}_${Date.now()}`;
        const channel = supabase.channel(channelName)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
                // Client-side filter: Only care about messages sent TO me
                if (String(payload.new.receiver_id) !== String(userId)) return;

                setChats(prev => prev.map(chat => {
                    if (String(chat.id) === String(payload.new.sender_id)) {
                        return { ...chat, unread: chat.unread + 1 };
                    }
                    return chat;
                }));
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
                // Client-side filter: Only care about messages sent TO me
                if (String(payload.new.receiver_id) !== String(userId)) return;

                // If message marked as read (is_read became true)
                if (payload.new.is_read && !payload.old.is_read) {
                    setChats(prev => prev.map(chat => {
                        if (chat.id === payload.new.sender_id) {
                            return { ...chat, unread: Math.max(0, chat.unread - 1) };
                        }
                        return chat;
                    }));
                }
            })
            .subscribe((status) => {
               if (status === 'SUBSCRIBED') {
                   console.log(`Subscribed to chat list updates on ${channelName}`);
               } else {
                   console.log(`Subscription status for chat list: ${status}`);
               }
            });

        setLoading(false);
        return () => supabase.removeChannel(channel);

    };

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
                            fetchChats(currentUser.id); // Refresh list
                            return;
                        }
                     }
                     // Always refresh list on delete to be safe
                     fetchChats(currentUser.id); 
                }

                // HANDLE NEW FRIEND (INSERT/UPDATE)
                if (eventType === 'INSERT' || eventType === 'UPDATE') {
                    const rec = newRec;
                    if (rec.status === 'accepted') {
                        // Check if it involves me
                        if (rec.requester_id === currentUser.id || rec.receiver_id === currentUser.id) {
                            fetchChats(currentUser.id); // Refresh list to show new friend
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
                             fetchChats(currentUser.id);
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

    // 1. Missed Call Popup
    // The missedCall state is now managed by the CallContext and rendered by a global CallUI component.

    if (incomingCall && !incomingCall.answered) {
        return (
            <div className="incoming-call-overlay">
                <div className="call-card">
                    <img src={getAvatarHeadshot(incomingCall.caller.avatar_url)} className="call-avatar" alt="Caller" />
                    <h2>{incomingCall.caller.username || incomingCall.caller.full_name}</h2>
                    <p>Incoming {incomingCall.type} call...</p>

                    {!showQuickReplyMenu ? (
                        <div className="call-actions">
                            <button className="ctrl-btn message-btn" onClick={() => setShowQuickReplyMenu(true)}>💬</button>
                            <button className="reject-btn" onClick={rejectCall} style={{ background: '#ff4444', color: 'white' }}>✖</button>
                            <button className="answer-btn" style={{ background: '#00cc66', color: 'white' }} onClick={() => {
                                answerCall();
                            }}>📞</button>
                        </div>
                    ) : (
                        <div className="quick-replies-list">
                            <button className="close-replies" onClick={() => setShowQuickReplyMenu(false)}>✕</button>
                            <h4>Or send a quick message:</h4>
                            <button onClick={() => sendQuickReply("I am busy right now, can’t talk. I’ll call you later.")}>
                                I am busy right now, can’t talk. I’ll call you later.
                            </button>
                            <button onClick={() => sendQuickReply("I'll call you back.")}>I'll call you back</button>
                            <button onClick={() => sendQuickReply("Talk to you later.")}>Talk to you later</button>
                        </div>
                    )}
                </div>
                <style>{`
                    .message-btn { background: #333; box-shadow: 0 0 10px rgba(255,255,255,0.1); font-size: 1.2rem; }
                    .quick-replies-list {
                        display: flex; flex-direction: column; gap: 8px; margin-top: 20px;
                        background: #25252b; padding: 15px; border-radius: 12px;
                        position: relative; animation: slideUp 0.2s;
                    }
                    .quick-replies-list h4 { margin: 0 0 10px 0; font-size: 0.9rem; color: #aaa; }
                    .quick-replies-list button {
                        background: rgba(255,255,255,0.1); border: none; padding: 10px;
                        color: white; border-radius: 8px; cursor: pointer; text-align: left;
                        font-size: 0.9rem; transition: background 0.2s;
                    }
                    .quick-replies-list button:hover { background: rgba(0, 240, 255, 0.2); }
                    .close-replies {
                        position: absolute; top: 10px; right: 10px;
                        background: none !important; color: #aaa !important; width: auto !important; padding: 0 !important;
                    }
                    @keyframes slideUp {
                        from { opacity: 0; transform: translateY(10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `}</style>
            </div>
        );
    }

    // If incoming call is answered, show overlay
    // CallOverlay is now handled by the global CallUI component in CallContext

    if (activeChatUser && currentUser) {
        return (
            <ChatRoom
                currentUser={currentUser}
                targetUser={activeChatUser}
                onBack={() => {
                    setActiveChatUser(null);
                    // Refresh chat list to show latent changes if any
                    fetchChats(currentUser.id);
                }}
            />
        );
    }

    return <ChatList chats={chats} onSelectChat={(chat) => setActiveChatUser(chat.fullProfile)} loading={loading} />;
}

function ChatList({ chats, onSelectChat, loading }) {
    const [searchTerm, setSearchTerm] = useState('');
    
    // Filter chats
    const filteredChats = chats?.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    return (
        <div className="chat-page-container">
            {/* Header */}
            <header className="glass-header">
                <div className="header-top">
                    <h1 className="page-title">Messages</h1>
                    <button className="settings-btn" onClick={() => {}}>
                         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>
                </div>

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
            </header>

            <div className="chat-list-scroll">
                {loading ? (
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
                            className={`chat-item ${chat.unread > 0 ? 'unread' : ''}`}
                            onClick={() => onSelectChat(chat)}
                        >
                            <div className="avatar-wrapper">
                                <img src={chat.avatar} alt={chat.name} className="chat-avatar" />
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
                                    {chat.unread > 0 && <span className="unread-badge">{chat.unread}</span>}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <style>{`
                :root {
                    --bg-dark: #000000;
                    --bg-card: #1c1c1e;
                    --bg-card-hover: #2c2c2e;
                    --text-primary: #ffffff;
                    --text-secondary: #8e8e93;
                    --accent-blue: #0a84ff;
                    --separator: rgba(84, 84, 88, 0.65);
                }

                .chat-page-container {
                    background-color: var(--bg-dark);
                    min-height: 100vh;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    color: var(--text-primary);
                    padding-bottom: 80px; /* Space for bottom nav */
                }

                .glass-header {
                    position: sticky;
                    top: 0;
                    z-index: 100;
                    background: rgba(28, 28, 30, 0.85); /* iOS-like dark tab bar style */
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    padding: 16px 20px 10px 20px;
                    border-bottom: 0.5px solid var(--separator);
                }

                .header-top {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 24px; /* Increased from 12px */
                }

                .page-title {
                    margin: 0;
                    font-size: 34px;
                    font-weight: 700;
                    letter-spacing: -0.5px;
                }

                .settings-btn {
                    background: rgba(255, 255, 255, 0.1);
                    border: none;
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    color: var(--accent-blue);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: background 0.2s;
                }
                .settings-btn:active {
                    background: rgba(255, 255, 255, 0.2);
                }

                .search-bar {
                    background: rgba(118, 118, 128, 0.24);
                    border-radius: 10px;
                    padding: 8px 12px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 20px; /* Added spacing */
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
                    font-size: 17px;
                    width: 100%;
                }
                .search-bar input::placeholder {
                    color: var(--text-secondary);
                }

                .chat-list-scroll {
                    padding: 0;
                }

                .chat-item {
                    display: flex;
                    align-items: center;
                    padding: 12px 20px;
                    gap: 12px;
                    cursor: pointer;
                    transition: background 0.2s;
                    border-bottom: 0.5px solid rgba(84, 84, 88, 0.4); /* Separator */
                }
                
                .chat-item:active {
                    background-color: var(--bg-card-hover);
                }
                .chat-item:last-child {
                    border-bottom: none;
                }

                .avatar-wrapper {
                    position: relative;
                }

                .chat-avatar {
                    width: 52px;
                    height: 52px;
                    border-radius: 50%;
                    object-fit: cover;
                    background-color: #333;
                }

                .online-badge {
                    position: absolute;
                    bottom: 2px;
                    right: 0;
                    width: 12px;
                    height: 12px;
                    background-color: #30d158; /* iOS Green */
                    border: 2px solid var(--bg-dark);
                    border-radius: 50%;
                }

                .chat-info {
                    flex: 1;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .chat-header-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: baseline;
                }

                .chat-name {
                    font-size: 17px;
                    font-weight: 600;
                    color: var(--text-primary);
                }

                .chat-time {
                    font-size: 14px;
                    color: var(--text-secondary);
                }

                .chat-msg-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .chat-preview {
                    margin: 0;
                    font-size: 15px;
                    color: var(--text-secondary);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 85%;
                    line-height: 1.3;
                }

                .chat-item.unread .chat-name {
                    /* font-weight: 700; maybe? */
                }
                .chat-item.unread .chat-preview {
                    color: var(--text-primary);
                    font-weight: 500;
                }

                .unread-badge {
                    background-color: var(--accent-blue);
                    color: white;
                    font-size: 14px;
                    font-weight: 600;
                    min-width: 20px;
                    height: 20px;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0 6px;
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
            `}</style>
        </div>
    );
}

function ChatRoom({ currentUser, targetUser, onBack }) {
    // Local state for partner to handle real-time updates (e.g. online status)
    const [partner, setPartner] = useState(targetUser);
    const { startCall } = useCall();
    
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
    const [input, setInput] = useState('');
    const [showMenu, setShowMenu] = useState(false);
    const [uploading, setUploading] = useState(false);
    const messagesEndRef = useRef(null);
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

    // Theme State
    const [showThemeMenu, setShowThemeMenu] = useState(false);
    const [theme, setTheme] = useState(localStorage.getItem('chat_theme') || 'dark');

    // Wallpaper State
    const [chatBackground, setChatBackground] = useState(null);
    const [showWallpaperMenu, setShowWallpaperMenu] = useState(false);

    // Fetch Wallpaper
    useEffect(() => {
        const fetchWallpaper = async () => {
            const { data } = await supabase.from('profiles').select('chat_background').eq('id', currentUser.id).single();
            if (data?.chat_background) setChatBackground(data.chat_background);
        };
        fetchWallpaper();
    }, [currentUser.id]);

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

    const handleThemeChange = (newTheme) => {
        setTheme(newTheme);
        localStorage.setItem('chat_theme', newTheme);
        setShowThemeMenu(false);
        showToast(`Theme changed to ${newTheme} 🎨`);
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
                    attachments:message_attachments(*)
                `)
                .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetUser.id}),and(sender_id.eq.${targetUser.id},receiver_id.eq.${currentUser.id})`)
                .order('created_at', { ascending: true });

            if (!error && data) {
                setMessages(data);

                // Mark UNREAD messages from this user as READ
                const unreadIds = data.filter(m => m.receiver_id === currentUser.id && !m.is_read).map(m => m.id);
                if (unreadIds.length > 0) {
                    await supabase.from('messages').update({ is_read: true }).in('id', unreadIds);
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
                // 1. Must be sent to me (receiver = currentUser)
                // 2. Must be from the partner (sender = targetUser)
                if (String(payload.new.receiver_id) === String(currentUser.id) && 
                    String(payload.new.sender_id) === String(targetUser.id)) {
                    setMessages(prev => {
                        // Replace optimistic message if exists
                        const withoutOptimistic = prev.filter(m => !m.tempId);
                        return [...withoutOptimistic, payload.new];
                    });
                    // Mark as read immediately
                    await supabase.from('messages').update({ is_read: true }).eq('id', payload.new.id);
                    
                    // Set delivered_at for sender
                    await supabase.from('messages').update({ delivered_at: new Date().toISOString() }).eq('id', payload.new.id);
                }
            })
            // Listen for message updates (read/delivered status)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'messages'
            }, (payload) => {
                // Filter: check if it concerns a message I sent
                if (String(payload.new.sender_id) !== String(currentUser.id)) return;

                // Update message status in UI
                setMessages(prev => prev.map(m => 
                    m.id === payload.new.id ? payload.new : m
                ));
            })
            .subscribe((status) => {
                console.log(`Chat room subscription status: ${status}`);
            });

        return () => { supabase.removeChannel(channel); };
    }, [currentUser.id, targetUser.id]);

    // Polling Fallback: Fetch messages every 3 seconds to ensure delivery if realtime fails
    useEffect(() => {
        const interval = setInterval(() => {
            const fetchLatest = async () => {
                 const { data, error } = await supabase
                    .from('messages')
                    .select('*')
                    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${targetUser.id}),and(sender_id.eq.${targetUser.id},receiver_id.eq.${currentUser.id})`)
                    .order('created_at', { ascending: true });

                if (data) {
                    setMessages(prev => {
                        // Only update if count is different or last message is different
                        // Simple heuristic to avoid aggressive re-renders
                        if (prev.length !== data.length) return data;
                        if (prev.length > 0 && data.length > 0 && prev[prev.length - 1].id !== data[data.length - 1].id) return data;
                        return prev;
                    });
                     // Mark UNREAD messages from this user as READ
                    const unreadIds = data.filter(m => m.receiver_id === currentUser.id && !m.is_read).map(m => m.id);
                    if (unreadIds.length > 0) {
                        await supabase.from('messages').update({ is_read: true }).in('id', unreadIds);
                    }
                }
            };
            fetchLatest();
        }, 3000); // Poll every 3 seconds

        return () => clearInterval(interval);
    }, [currentUser.id, targetUser.id]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const sendMessage = async (type = 'text', content = null, imageUrl = null) => {
        const textToSend = content || input;
        if (!textToSend.trim() && type === 'text' && !imageUrl) return;

        const tempId = `temp_${Date.now()}_${Math.random()}`;
        const optimisticMessage = {
            tempId,
            sender_id: currentUser.id,
            receiver_id: targetUser.id,
            content: type === 'text' ? textToSend : '📷 Photo',
            message_type: type,
            image_url: imageUrl,
            created_at: new Date().toISOString(),
            is_read: false,
            delivered_at: null,
            sending: true // Flag for UI
        };

        // Optimistic Update - show immediately
        setMessages(prev => [...prev, optimisticMessage]);
        if (type === 'text') setInput('');

        // DB Insert
        const { data, error } = await supabase.from('messages').insert({
            sender_id: currentUser.id,
            receiver_id: targetUser.id,
            content: optimisticMessage.content,
            message_type: type,
            image_url: imageUrl
        }).select();

        if (error) {
            console.error("Send error:", error);
            showToast("Failed to send message ❌");
            // Remove optimistic message on error
            setMessages(prev => prev.filter(m => m.tempId !== tempId));
        } else if (data && data[0]) {
            // Replace optimistic with real message
            setMessages(prev => prev.map(m => 
                m.tempId === tempId ? data[0] : m
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
                        has_attachment: true
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
        startCall(targetUser, 'audio');
    };

    const startVideoCall = () => {
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
            // Update friendship status
            await supabase.from('friendships')
                .update({ status: 'blocked' })
                .or(`and(requester_id.eq.${currentUser.id},receiver_id.eq.${targetUser.id}),and(requester_id.eq.${targetUser.id},receiver_id.eq.${currentUser.id})`);

            showToast(`🚫 Blocked ${targetUser.name}`);
            setTimeout(onBack, 1000);
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
    const getLastSeenStatus = (lastActive) => {
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

    return (
        <div className="chat-room-container">
            {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
            
            <div className="ambient-glow-chat"></div>

            <div className="chat-room-header glass-header">
                <button onClick={onBack} className="back-btn">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
                </button>
                <div className="header-user">
                    <img src={(() => {
                        // Priority 1: Stored avatar
                        if (partner.avatar_url) return getAvatarHeadshot(partner.avatar_url);

                        // Priority 2: Consistent generation
                        const safeName = encodeURIComponent(partner.username || partner.full_name || 'User');
                        const g = partner.gender?.toLowerCase();
                        if (g === 'male') return `https://avatar.iran.liara.run/public/boy?username=${safeName}`;
                        if (g === 'female') return `https://avatar.iran.liara.run/public/girl?username=${safeName}`;
                        return `https://avatar.iran.liara.run/public?username=${safeName}`;
                    })()} className="header-avatar" alt="avatar" />
                    <div className="header-text">
                        <h3>{partner.username || partner.full_name}</h3>
                        <span className={`user-status ${getLastSeenStatus(partner.last_active) === 'Active now' ? 'online' : ''}`}>
                            {getLastSeenStatus(partner.last_active)}
                        </span>
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
                            <div className="dropdown-menu">
                                <button onClick={toggleMuteCalls}>
                                    <span className="icon">
                                        {muteCalls ? (
                                            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                                        ) : (
                                            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                        )}
                                    </span>
                                    {muteCalls ? 'Unmute Call' : 'Mute Call'}
                                </button>
                                
                                <button onClick={() => handleMenuAction('mute')}>
                                    <span className="icon">
                                        {isChatMuted() ? (
                                            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg> 
                                        ) : (
                                            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                                        )}
                                    </span>
                                    {isChatMuted() ? 'Unmute Message' : 'Mute Message'}
                                </button>

                                <button onClick={() => {
                                    setShowWallpaperMenu(true);
                                    setShowMenu(false);
                                }}>
                                    <span className="icon">
                                        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                                    </span>
                                    Chat Wallpaper
                                </button>
                                
                                <button onClick={() => {
                                    setShowThemeMenu(true);
                                    setShowMenu(false);
                                }}>
                                    <span className="icon">
                                        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path></svg>
                                    </span>
                                    Theme
                                </button>

                                <div className="divider"></div>

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

                                <button onClick={() => handleMenuAction('block')} className="danger">
                                    <span className="icon">
                                        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                                    </span>
                                    Block
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Theme Menu Modal */}
            {showThemeMenu && (
                <div className="mute-menu-modal" onClick={() => setShowThemeMenu(false)}>
                    <div className="mute-menu-content glass-panel" onClick={(e) => e.stopPropagation()}>
                        <h3>Choose Theme 🎨</h3>
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


            <div className={`chat-messages ${getThemeClass()}`} style={{ 
                background: chatBackground || '',
                backgroundSize: chatBackground?.includes('url') ? 'cover' : undefined,
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat'
            }}>
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

                    // Special rendering for Call Logs
                    if (msg.message_type === 'call_log') {
                        return (
                            <React.Fragment key={msg.id || msg.tempId || i}>
                                {dateHeader}
                                <div className="call-log-system-msg">
                                    <div className="call-log-badge">
                                        <span style={{ marginRight: '6px' }}>
                                            {msg.content.includes('Missed') ? '↘️' : msg.content.includes('declined') ? '🚫' : '📞'}
                                        </span>
                                        <span>{msg.content} • {formatTime(msg.created_at)}</span>
                                    </div>
                                </div>
                            </React.Fragment>
                        );
                    }

                    const isImage = msg.message_type === 'image' || msg.type === 'image';
                    const imageUrl = msg.image_url || msg.media_url;

                    // Determine message status
                    let statusIcon = '';
                    if (isMe) {
                        if (msg.sending) {
                            statusIcon = '🕐'; // Sending
                        } else if (msg.is_read) {
                            statusIcon = '✓✓'; // Read (blue)
                        } else if (msg.delivered_at) {
                            statusIcon = '✓✓'; // Delivered (gray)
                        } else {
                            statusIcon = '✓'; // Sent
                        }
                    }

                    return (
                        <React.Fragment key={msg.id || msg.tempId || i}>
                            {dateHeader}
                            <div className={`msg-bubble ${isMe ? 'me' : 'them'}`}>
                                {isImage ? (
                                    <img 
                                        src={imageUrl} 
                                        alt="Sent" 
                                        className="sent-image" 
                                        onClick={() => setViewingImage(imageUrl)}
                                        style={{ cursor: 'pointer' }}
                                    />
                                ) : (
                                    <span className="msg-text">{msg.content}</span>
                                )}
                                
                                {/* Render attachments if present */}
                                {msg.attachments && msg.attachments.length > 0 && (
                                    <div className="message-attachments">
                                        {msg.attachments.map((attachment, idx) => (
                                            <MessageAttachment key={idx} attachment={attachment} />
                                        ))}
                                    </div>
                                )}
                                
                                <div className="msg-footer">
                                    <span className="msg-time">{formatTime(msg.created_at)}</span>
                                    {isMe && <span className={`msg-status ${msg.is_read ? 'read' : ''}`}>{statusIcon}</span>}
                                </div>
                            </div>
                        </React.Fragment>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-container">
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
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)} 
                        className="input-icon-btn emoji-btn"
                        title="Add emoji"
                        style={{ marginRight: '8px' }}
                    >
                        😊
                    </button>

                    <input
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

            {/* Emoji Picker Popup using Library */}
            {showEmojiPicker && (
                <div className="emoji-picker-popup">
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
                <div className="image-viewer-modal" onClick={() => setViewingImage(null)}>
                    <div className="image-viewer-content">
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
                    background: radial-gradient(ellipse at top, #1a1a2e 0%, #000 90%);
                    z-index: 10000;
                    display: flex; flex-direction: column;
                    font-family: 'Inter', sans-serif;
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
                    padding: 15px 20px; display: flex; align-items: center; gap: 15px;
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
                .header-text .user-status { font-size: 0.8rem; color: #888; display: block; margin-top: 2px; }
                .header-text .user-status.online { color: #00ff99; font-weight: 600; text-shadow: 0 0 10px rgba(0,255,153,0.3); }
                
                .header-actions { display: flex; gap: 10px; }
                .icon-btn { 
                    background: transparent; border: none; color: #ccc; 
                    width: 40px; height: 40px; border-radius: 12px;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer; transition: all 0.2s;
                }
                .icon-btn:hover { background: rgba(255,255,255,0.1); color: white; }
                
                /* Chat Area */
                .chat-messages { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
                
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
                
                .msg-text { display: block; line-height: 1.4; }
                .msg-footer { display: flex; align-items: center; gap: 4px; justify-content: flex-end; margin-top: 4px; opacity: 0.7; }
                .msg-time { font-size: 0.65rem; }
                .msg-status { font-size: 0.7rem; }
                .msg-status.read { color: #fff; font-weight: bold; }
                
                /* Input Area */
                .chat-input-container {
                    padding: 16px 20px;
                    background: rgba(10, 10, 10, 0.6);
                    backdrop-filter: blur(10px);
                }
                
                .glass-input-bar {
                    display: flex; align-items: center; gap: 10px;
                    background: rgba(255,255,255,0.08);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 24px; padding: 6px 6px 6px 16px;
                    transition: all 0.2s;
                }
                .glass-input-bar:focus-within {
                    background: rgba(255,255,255,0.12);
                    border-color: rgba(255,255,255,0.2);
                    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                }
                
                .msg-input {
                    flex: 1; background: transparent; border: none; outline: none;
                    color: white; font-size: 1rem; padding: 8px 0;
                }
                .msg-input::placeholder { color: rgba(255,255,255,0.3); }
                
                .input-icon-btn {
                    color: #aaa; background: none; border: none;
                    cursor: pointer; padding: 4px; transition: color 0.2s;
                }
                .input-icon-btn:hover { color: white; }
                
                .send-btn { 
                    width: 44px; height: 44px; border-radius: 50%; border: none;
                    background: var(--accent-gradient); color: white;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer; box-shadow: 0 4px 12px rgba(0, 114, 255, 0.4);
                    transition: transform 0.2s;
                }
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
                    position: absolute; top: 110%; right: 0;
                    background: rgba(20, 20, 20, 0.95);
                    backdrop-filter: blur(16px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px; padding: 8px;
                    width: 220px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.6);
                    z-index: 10001; 
                }
                .dropdown-menu button { 
                    padding: 12px; width: 100%; text-align: left;
                    background: none; border: none; color: #ddd;
                    border-radius: 8px; cursor: pointer;
                    display: flex; align-items: center; gap: 12px;
                    font-size: 0.9rem; transition: background 0.2s;
                }
                .dropdown-menu button:hover { background: rgba(255,255,255,0.1); color: white; }
                .dropdown-menu .divider { height: 1px; background: rgba(255,255,255,0.1); margin: 6px 0; }
                .dropdown-menu button.danger { color: #ff5555; }
                .dropdown-menu button.danger:hover { background: rgba(255, 85, 85, 0.15); }
                
                .glass-panel {
                    background: rgba(20,20,20,0.8); backdrop-filter: blur(20px);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 24px; padding: 24px;
                    width: 90%; max-width: 320px;
                }
                
                /* Light Theme */
                .light-theme { background: #f0f2f5; }
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
                    padding: 15px; display: flex; align-items: center; gap: 15px;
                    background: rgba(20,20,20,0.95); border-bottom: 1px solid #333; color: white;
                }
                .back-btn { background: none; color: white; font-size: 1.5rem; border: none; padding: 0 10px; cursor: pointer; }
                .header-user { flex: 1; display: flex; align-items: center; gap: 10px; }
                .header-avatar { width: 40px; height: 40px; border-radius: 50%; }
                .header-text h3 { margin: 0; font-size: 1rem; }
                .header-text .user-status { font-size: 0.75rem; color: #888; }
                .header-text .user-status.online { color: #00ff99; font-weight: 600; }
                .header-actions { display: flex; gap: 12px; }
                .header-actions button { background: none; border: none; font-size: 1.2rem; color: white; cursor: pointer; }
                
                .dropdown-menu {
                    position: absolute; top: 110%; right: 0;
                    background: rgba(30, 30, 30, 0.95);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    padding: 8px;
                    display: flex; flex-direction: column; gap: 4px;
                    min-width: 200px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                    z-index: 10001; 
                    animation: slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                    transform-origin: top right;
                }
                @keyframes slideDown {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                .dropdown-menu button { 
                    font-size: 0.95rem; color: #ececec; 
                    padding: 10px 12px; 
                    text-align: left; width: 100%; 
                    cursor: pointer; background: none; border: none; 
                    border-radius: 8px;
                    display: flex; align-items: center; gap: 10px;
                    transition: all 0.2s ease;
                    font-weight: 500;
                }
                .dropdown-menu button:hover { background: rgba(255,255,255,0.08); color: white; transform: translateX(2px); }
                .dropdown-menu button.danger { color: #ff5555; }
                .dropdown-menu button.danger:hover { background: rgba(255, 85, 85, 0.1); }
                .dropdown-menu .icon { display: flex; align-items: center; justify-content: center; opacity: 0.8; }
                .dropdown-menu .divider { height: 1px; background: rgba(255,255,255,0.1); margin: 6px 0; }


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

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                .chat-input-bar { padding: 15px; background: #1e1e1e; display: flex; gap: 10px; align-items: center; }
                .chat-input-bar input { flex: 1; padding: 12px; border-radius: 25px; border: none; background: #333; color: white; outline: none; }
                .send-btn { background: #00f0ff; width: 40px; height: 40px; border-radius: 50%; color: black; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; }
                .chat-input-bar button { cursor: pointer; background: none; border: none; font-size: 1.2rem; }

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

                .call-log-system-msg {
                    width: 100%;
                    display: flex; justify-content: center;
                    margin: 15px 0;
                }
                .call-log-badge {
                    background: rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(10px);
                    padding: 6px 16px;
                    border-radius: 100px;
                    font-size: 0.75rem;
                    color: rgba(255, 255, 255, 0.7);
                    display: flex; align-items: center;
                    border: 1px solid rgba(255, 255, 255, 0.05);
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
        </div>
    );
}
