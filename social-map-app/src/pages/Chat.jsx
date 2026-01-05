import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import AgoraRTC from "agora-rtc-sdk-ng";
import Toast from '../components/Toast';

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
        // Fetch all accepted friendships
        const { data: friendships, error } = await supabase
            .from('friendships')
            .select(`
                id,
                requester:profiles!requester_id(id, full_name, username, avatar_url, status, gender),
                receiver:profiles!receiver_id(id, full_name, username, avatar_url, status, gender)
            `)
            .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
            .eq('status', 'accepted');

        if (error) {
            console.error("Error fetching chats:", error);
            setLoading(false);
            return;
        }

        // Format into a clean list of "Chat Partners"
        const formattedChats = await Promise.all(friendships.map(async f => {
            const isRequester = f.requester.id === userId;
            const partner = isRequester ? f.receiver : f.requester;

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
                .eq('partner_id', partner.id)
                .maybeSingle();

            const isMuted = muteData && muteData.muted_until && new Date(muteData.muted_until) > new Date();

            // Generate gender-based avatar
            const safeName = encodeURIComponent(partner.username || partner.full_name || 'User');
            let genderAvatar;
            if (partner.gender === 'Male') genderAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=male-${safeName}`;
            else if (partner.gender === 'Female') genderAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=female-${safeName}`;
            else genderAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeName}`;

            return {
                id: partner.id,
                name: partner.full_name || partner.username,
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
        const channel = supabase.channel('chat_list_updates')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${userId}` }, (payload) => {
                setChats(prev => prev.map(chat => {
                    if (chat.id === payload.new.sender_id) {
                        return { ...chat, unread: chat.unread + 1 };
                    }
                    return chat;
                }));
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `receiver_id=eq.${userId}` }, (payload) => {
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
            .subscribe();

        setLoading(false);
        return () => supabase.removeChannel(channel);
    };

    // Global Incoming Call State
    const [showQuickReplyMenu, setShowQuickReplyMenu] = useState(false);

    // --- Render Logic ---

    // 1. Missed Call Popup
    // The missedCall state is now managed by the CallContext and rendered by a global CallUI component.

    if (incomingCall && !incomingCall.answered) {
        return (
            <div className="incoming-call-overlay">
                <div className="call-card">
                    <img src={incomingCall.caller.avatar_url} className="call-avatar" alt="Caller" />
                    <h2>{incomingCall.caller.full_name || incomingCall.caller.username}</h2>
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
            <div className="ambient-glow"></div>
            
            <header className="glass-header">
                <div className="header-top">
                    <h1 className="page-title">Messages</h1>
                    <button className="btn-icon settings-btn">⚙️</button>
                </div>
                <div className="search-bar">
                    <span className="search-icon">🔍</span>
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
                        <p>Syncing messages...</p>
                    </div>
                ) : (!chats || chats.length === 0) ? (
                    <div className="empty-state">
                        <div className="empty-icon">💬</div>
                        <h3>No messages yet</h3>
                        <p>Start a conversation from the map!</p>
                    </div>
                ) : (
                    filteredChats.map(chat => (
                        <div key={chat.id} className="chat-item" onClick={() => onSelectChat(chat)}>
                            <div className="avatar-wrapper">
                                <img src={(() => {
                                    const user = chat.fullProfile || chat; 
                                    const safeName = encodeURIComponent(chat.name || 'User');
                                    const g = user.gender?.toLowerCase();
                                    if (g === 'male') return `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&hair=short01,short02,short03,short04,short05,short06,short07,short08&earringsProbability=0`;
                                    if (g === 'female') return `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&glassesProbability=0&mustacheProbability=0&beardProbability=0&hair=long01,long02,long03,long04,long05,long10,long12`;
                                    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeName}`;
                                })()} alt={chat.name} className="chat-avatar" />
                                {chat.unread > 0 && <span className="online-badge"></span>}
                            </div>
                            
                            <div className="chat-info">
                                <div className="chat-header-row">
                                    <span className="chat-name">{chat.name}</span>
                                    <div className="meta-info">
                                        {chat.isMuted && <span className="mute-icon">🔇</span>}
                                        {chat.time && <span className="chat-time">{chat.time}</span>}
                                    </div>
                                </div>
                                <div className="chat-msg-row">
                                    <p className={`chat-preview ${chat.unread > 0 ? 'bold' : ''}`}>
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
                    /* Solid Professional Theme */
                    --card-bg: #1e1e1e;
                    --card-bg-hover: #2a2a2a;
                    --bg-dark: #0a0a0a;
                    --border-subtle: #333333;
                    --text-primary: #ffffff;
                    --text-secondary: #a0a0a0;
                    --accent: #4285F4;
                }

                .chat-page-container {
                    min-height: 100vh;
                    background: var(--bg-dark);
                    color: var(--text-primary);
                    font-family: 'Inter', sans-serif;
                    position: relative;
                    padding-bottom: 80px;
                }

                /* Removed Ambient Glow/Blur for professional crisp look */
                .ambient-glow { display: none; }

                .glass-header {
                    padding: 20px 20px 15px 20px;
                    background: var(--bg-dark);
                    position: sticky; top: 0; z-index: 100;
                    border-bottom: 1px solid var(--border-subtle);
                }

                .header-top { 
                    display: flex; justify-content: space-between; align-items: center; 
                    margin-bottom: 15px;
                }

                .page-title {
                    font-size: 2rem; font-weight: 700; margin: 0;
                    letter-spacing: -0.5px;
                    color: var(--text-primary);
                }

                .settings-btn {
                    background: var(--card-bg); border: 1px solid var(--border-subtle);
                    width: 40px; height: 40px; border-radius: 12px;
                    cursor: pointer; transition: all 0.2s;
                }
                .settings-btn:hover { background: var(--card-bg-hover); border-color: #555; }

                .search-bar {
                    background: var(--card-bg);
                    border-radius: 12px; padding: 12px 16px;
                    display: flex; align-items: center; gap: 10px;
                    border: 1px solid var(--border-subtle);
                    transition: all 0.2s;
                }
                .search-bar:focus-within {
                    border-color: var(--accent);
                    box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.2);
                }
                .search-icon { opacity: 0.5; color: var(--text-secondary); }
                .search-bar input {
                    background: transparent; border: none; outline: none;
                    color: var(--text-primary); width: 100%;
                    font-size: 1rem;
                }
                .search-bar input::placeholder { color: #666; }

                .chat-list-scroll { 
                    display: flex; flex-direction: column; gap: 0; 
                    padding: 10px 0;
                }

                .chat-item {
                    display: flex; align-items: center; gap: 16px; 
                    padding: 16px 20px;
                    background: transparent;
                    border: none;
                    border-bottom: 1px solid var(--border-subtle);
                    border-radius: 0;
                    cursor: pointer; transition: background 0.2s;
                    position: relative; overflow: hidden;
                }
                .chat-item:last-child { border-bottom: none; }
                
                .chat-item:hover { 
                    background: var(--card-bg-hover);
                    transform: none;
                    box-shadow: none;
                }
                .chat-item:active { background: #333; }

                .avatar-wrapper { position: relative; width: 60px; height: 60px; flex-shrink: 0; }
                .chat-avatar { 
                    width: 100%; height: 100%; border-radius: 20px; 
                    object-fit: cover; background: rgba(0,0,0,0.3);
                    box-shadow: inset 0 0 10px rgba(0,0,0,0.2);
                }
                .online-badge {
                    position: absolute; bottom: -2px; right: -2px;
                    width: 14px; height: 14px;
                    background: #00f0ff; border: 3px solid #0f0f0f;
                    border-radius: 50%;
                }

                .chat-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
                
                .chat-header-row { display: flex; justify-content: space-between; align-items: center; }
                .chat-name { font-weight: 700; font-size: 1.1rem; color: white; letter-spacing: 0.3px; }
                
                .meta-info { display: flex; align-items: center; gap: 6px; }
                .mute-icon { font-size: 0.8rem; opacity: 0.6; }
                .chat-time { font-size: 0.75rem; color: rgba(255,255,255,0.4); font-weight: 500; }

                .chat-msg-row { display: flex; justify-content: space-between; align-items: center; }
                .chat-preview { 
                    color: rgba(255,255,255,0.6); font-size: 0.95rem; 
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; 
                    flex: 1; margin: 0; padding-right: 15px;
                }
                .chat-preview.bold { color: white; font-weight: 600; }
                
                .unread-badge { 
                    background: linear-gradient(135deg, #00f0ff, #0072ff); 
                    color: white; font-weight: 800; font-size: 0.75rem; 
                    padding: 4px 10px; border-radius: 12px; 
                    box-shadow: 0 4px 10px rgba(0, 114, 255, 0.4);
                }

                .loading-state, .empty-state { 
                    text-align: center; margin-top: 60px; color: rgba(255,255,255,0.5); 
                    display: flex; flex-direction: column; align-items: center; gap: 15px;
                }
                .spinner {
                    width: 30px; height: 30px; border: 3px solid rgba(255,255,255,0.1);
                    border-top-color: #00f0ff; border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                .empty-icon { font-size: 4rem; opacity: 0.5; margin-bottom: 10px; }
                .empty-state h3 { margin: 0; color: white; }
                .empty-state p { margin: 0; font-size: 0.9rem; }

                @keyframes spin { to { transform: rotate(360deg); } }
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

    const WALLPAPERS = [
        { name: 'Midnight', value: 'linear-gradient(to bottom, #0f0c29, #302b63, #24243e)' },
        { name: 'Synthwave', value: 'linear-gradient(to bottom, #2b0c29, #302b63)' },
        { name: 'Forest', value: 'linear-gradient(to bottom, #134e5e, #71b280)' },
        { name: 'Ocean', value: 'linear-gradient(to bottom, #00c6ff, #0072ff)' },
        { name: 'Minimal Dark', value: '#1a1a1a' },
        { name: 'Pure Black', value: '#000000' }
    ];

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
                .select('*')
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
            .channel('chat_room')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `receiver_id=eq.${currentUser.id}`
            }, async (payload) => {
                // If the message is from the user we are currently chatting with
                if (payload.new.sender_id === targetUser.id) {
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
                table: 'messages',
                filter: `sender_id=eq.${currentUser.id}`
            }, (payload) => {
                // Update message status in UI
                setMessages(prev => prev.map(m => 
                    m.id === payload.new.id ? payload.new : m
                ));
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
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
        if (diffMins < 2) return 'Online';
        
        // Minutes ago
        if (diffMins < 60) return `Seen ${diffMins}m ago`;
        
        // Hours ago
        if (diffHours < 24) {
            return `Seen ${diffHours}h ago`;
        }
        
        // Yesterday
        if (diffDays === 1) return 'Seen yesterday';
        
        // Days ago
        if (diffDays < 7) return `Seen ${diffDays}d ago`;
        
        // More than a week
        return 'Seen a while ago';
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
                        const safeName = encodeURIComponent(partner.username || partner.full_name || 'User');
                        const g = partner.gender?.toLowerCase();
                        if (g === 'male') return `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&hair=short01,short02,short03,short04,short05,short06,short07,short08&earringsProbability=0`;
                        if (g === 'female') return `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&glassesProbability=0&mustacheProbability=0&beardProbability=0&hair=long01,long02,long03,long04,long05,long10,long12`;
                        return `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeName}`;
                    })()} className="header-avatar" alt="avatar" />
                    <div className="header-text">
                        <h3>{partner.full_name || partner.username}</h3>
                        <span className={`user-status ${getLastSeenStatus(partner.last_active) === 'Online' ? 'online' : ''}`}>
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
                        <div className="wallpaper-grid">
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
                        }
                        .wallpaper-option {
                            height: 60px; border-radius: 12px; border: 2px solid transparent;
                            color: white; font-weight: 600; text-shadow: 0 1px 3px rgba(0,0,0,0.8);
                            cursor: pointer; transition: transform 0.2s;
                            display: flex; align-items: center; justify-content: center;
                        }
                        .wallpaper-option:hover { transform: scale(1.02); }
                        .wallpaper-option.active { border-color: #00f0ff; box-shadow: 0 0 10px rgba(0, 240, 255, 0.4); }
                        .wallpaper-option.default { background: #333; grid-column: auto; }
                    `}</style>
                </div>
            )}

            <div className={`chat-messages ${getThemeClass()}`} style={{ background: chatBackground || '', backgroundImage: chatBackground || '' }}>
                {messages.map((msg, i) => {
                    const isMe = msg.sender_id === currentUser.id;
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
                        <div key={msg.id || msg.tempId || i} className={`msg-bubble ${isMe ? 'me' : 'them'}`}>
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
                            <div className="msg-footer">
                                <span className="msg-time">{formatTime(msg.created_at)}</span>
                                {isMe && <span className={`msg-status ${msg.is_read ? 'read' : ''}`}>{statusIcon}</span>}
                            </div>
                        </div>
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
                    <button onClick={() => fileInputRef.current.click()} disabled={uploading} className="input-icon-btn">
                        {uploading ? '⏳' : <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>}
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
                .light-theme { background: #f0f2f5 !important; }
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

                .chat-messages { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
                .msg-bubble { max-width: 75%; padding: 10px 15px; border-radius: 18px; color: white; position: relative; word-wrap: break-word; }
                .msg-bubble.me { align-self: flex-end; background: linear-gradient(135deg, #00C6FF, #0072FF); color: white; border-bottom-right-radius: 4px; }
                .msg-bubble.them { align-self: flex-start; background: #2a2a2a; border-bottom-left-radius: 4px; }
                
                .msg-text { display: block; margin-bottom: 4px; }
                .msg-footer { display: flex; align-items: center; gap: 5px; justify-content: flex-end; margin-top: 4px; }
                .msg-time { font-size: 0.65rem; opacity: 0.7; }
                .msg-status { font-size: 0.7rem; opacity: 0.8; }
                .msg-status.read { color: #00d4ff; }
                
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
            `}</style>
        </div>
    );
}
