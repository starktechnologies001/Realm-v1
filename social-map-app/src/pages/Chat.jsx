import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import AgoraRTC from "agora-rtc-sdk-ng";
import Toast from '../components/Toast';

const APP_ID = "ef79b1bdb8f94b7e990ff633799b7c10"; // User Provided App ID

export default function Chat() {
    const [activeChatUser, setActiveChatUser] = useState(null);
    const [chats, setChats] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();

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
                .single();

            const isMuted = muteData && muteData.muted_until && new Date(muteData.muted_until) > new Date();

            // Generate gender-based avatar
            const safeName = encodeURIComponent(partner.username || partner.full_name || 'User');
            let genderAvatar;
            if (partner.gender === 'Male') genderAvatar = `https://avatar.iran.liara.run/public/boy?username=${safeName}`;
            else if (partner.gender === 'Female') genderAvatar = `https://avatar.iran.liara.run/public/girl?username=${safeName}`;
            else genderAvatar = `https://avatar.iran.liara.run/public?username=${safeName}`;

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
    const [incomingCall, setIncomingCall] = useState(null);
    const [missedCall, setMissedCall] = useState(null);
    const ringtoneRef = useRef(new Audio('https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg'));
    const notificationRef = useRef(new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg'));

    useEffect(() => {
        ringtoneRef.current.loop = true;
    }, []);

    // Handle Ringtone
    useEffect(() => {
        if (incomingCall && !incomingCall.answered) {
            ringtoneRef.current.currentTime = 0;
            const playPromise = ringtoneRef.current.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => console.log("Audio play failed (interaction needed):", error));
            }
        } else {
            ringtoneRef.current.pause();
            ringtoneRef.current.currentTime = 0;
        }
    }, [incomingCall]);

    useEffect(() => {
        if (!currentUser) return;

        const channel = supabase.channel('global_calls')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `receiver_id=eq.${currentUser.id}` }, async (payload) => {
                if (payload.new.status === 'pending') {
                    // Fetch caller details
                    const { data: callerProfile } = await supabase.from('profiles').select('*').eq('id', payload.new.caller_id).single();
                    if (callerProfile) {
                        setIncomingCall({ ...payload.new, caller: callerProfile });
                    }
                }
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls', filter: `receiver_id=eq.${currentUser.id}` }, async (payload) => {
                // Check for Missed Call (status went to 'ended' without us answering)
                if (payload.new.status === 'ended') {
                    setIncomingCall(null); // Stop ringing

                    // Logic: If status is 'ended' and we (receiver) didn't set it to 'active' or 'rejected', it's a missed call.
                    // However, we rely on local state 'incomingCall' to know if it was just ringing.
                    // If we have an incomingCall set and it disappears due to 'ended', it's a missed call.
                    // Also need to fetch caller if logic is detached from state.

                    // Simpler: Just trigger notification if we weren't the ones who rejected it.
                    // We can check if it was 'rejected' by us (status would be rejected).
                    // If status is 'ended', sender cancelled it.

                    if (payload.old.status === 'pending') {
                        // Caller cancelled -> Missed Call
                        const { data: callerProfile } = await supabase.from('profiles').select('*').eq('id', payload.new.caller_id).single();
                        setMissedCall({ caller: callerProfile, time: new Date() });
                        notificationRef.current.play().catch(e => console.log(e));
                    }
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            ringtoneRef.current.pause();
        };
    }, [currentUser]);

    const answerCall = async () => {
        if (!incomingCall) return;
        await supabase.from('calls').update({ status: 'active' }).eq('id', incomingCall.id);
        ringtoneRef.current.pause();
    };

    const rejectCall = async () => {
        if (!incomingCall) return;
        await supabase.from('calls').update({ status: 'rejected' }).eq('id', incomingCall.id);
        setIncomingCall(null);
        ringtoneRef.current.pause();
    };

    // Quick Reply State
    const [showQuickReplyMenu, setShowQuickReplyMenu] = useState(false);

    const sendQuickReply = async (text) => {
        if (!incomingCall || !currentUser) return;

        // 1. Send Message
        await supabase.from('messages').insert({
            sender_id: currentUser.id,
            receiver_id: incomingCall.caller.id,
            content: text,
            type: 'text'
        });

        // 2. Reject Call
        await supabase.from('calls').update({ status: 'rejected' }).eq('id', incomingCall.id);

        // 3. Reset
        setIncomingCall(null);
        setShowQuickReplyMenu(false);
        Toast.show && Toast.show("Message sent!");
    };

    // --- Render Logic ---

    // 1. Missed Call Popup
    if (missedCall) {
        return (
            <div className="incoming-call-overlay">
                <div className="call-card" style={{ borderColor: '#ff4444', animation: 'fadeIn 0.3s' }}>
                    <div className="call-avatar" style={{ backgroundImage: `url(${missedCall.caller.avatar_url})`, backgroundSize: 'cover', border: '4px solid #ff4444' }}></div>
                    <h2 style={{ color: '#ff4444' }}>Missed Call</h2>
                    <p>from {missedCall.caller.full_name || missedCall.caller.username}</p>
                    <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>{missedCall.time.toLocaleTimeString()}</span>

                    <div className="call-actions">
                        <button className="reject-btn" style={{ width: '100%', borderRadius: '12px', background: '#333' }} onClick={() => setMissedCall(null)}>
                            Close
                        </button>
                    </div>
                </div>
            </div>
        );
    }

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
                            <button className="reject-btn" onClick={rejectCall}>✖</button>
                            <button className="answer-btn" onClick={() => {
                                setIncomingCall(prev => ({ ...prev, answered: true }));
                                answerCall();
                            }}>📞</button>
                        </div>
                    ) : (
                        <div className="quick-replies-list">
                            <button className="close-replies" onClick={() => setShowQuickReplyMenu(false)}>✕</button>
                            <h4>Or send a quick message:</h4>
                            <button onClick={() => sendQuickReply("I'll call you back.")}>I'll call you back</button>
                            <button onClick={() => sendQuickReply("Don't call.")}>Don't call</button>
                            <button onClick={() => sendQuickReply("Talk to you later.")}>Talk to you later</button>
                            <button onClick={() => sendQuickReply("I am busy right now.")}>I am busy right now</button>
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
    if (incomingCall && incomingCall.answered) {
        return (
            <CallOverlay
                callData={{ partner: incomingCall.caller, type: incomingCall.type, isIncoming: true }}
                currentUser={currentUser}
                onEnd={() => setIncomingCall(null)}
            />
        );
    }

    if (activeChatUser && currentUser && !incomingCall) {
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
    return (
        <div className="chat-page-container">
            <h1 className="page-title">Messages</h1>
            <div className="chat-list-scroll">
                {loading ? (
                    <div style={{ color: '#666', textAlign: 'center' }}>Loading chats...</div>
                ) : (!chats || chats.length === 0) ? (
                    <div className="empty-state">
                        <span style={{ fontSize: '3rem' }}>💤</span>
                        <p>No connections yet.<br />Poke people on the map to make friends!</p>
                    </div>
                ) : (
                    chats.map(chat => (
                        <div key={chat.id} className="chat-item" onClick={() => onSelectChat(chat)}>
                            <img src={chat.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + chat.id} alt={chat.name} className="chat-avatar" />
                            <div className="chat-info">
                                <div className="chat-header-row">
                                    <span className="chat-name">{chat.name}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {chat.isMuted && <span className="mute-icon" title="Muted">🔇</span>}
                                        {chat.time && <span className="chat-time">{chat.time}</span>}
                                    </div>
                                </div>
                                <div className="chat-msg-row">
                                    <span className="chat-preview">{chat.lastMsg}</span>
                                    {chat.unread > 0 && <span className="unread-badge">{chat.unread}</span>}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
            {/* Same styles as before */}
            <style>{`
                .chat-page-container {
                    background-color: var(--bg-color, #121212);
                    min-height: 100vh;
                    padding: 20px; padding-top: 20px; padding-bottom: 80px;
                    color: white;
                }
                .page-title {
                    font-size: 2rem; font-weight: 800; margin-bottom: 20px;
                    background: var(--brand-gradient, linear-gradient(to right, #00f0ff, #bd00ff));
                    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                }
                .chat-list-scroll { display: flex; flex-direction: column; gap: 12px; }
                .chat-item {
                    display: flex; align-items: center; gap: 15px; padding: 16px;
                    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.05);
                    border-radius: 20px; cursor: pointer; transition: all 0.2s;
                }
                .chat-item:active { transform: scale(0.98); background: rgba(255,255,255,0.1); }
                .chat-avatar { width: 56px; height: 56px; border-radius: 50%; border: 2px solid #333; object-fit: cover; }
                .chat-info { flex: 1; min-width: 0; }
                .chat-header-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
                .chat-name { font-weight: 700; font-size: 1.05rem; }
                .chat-time { font-size: 0.8rem; color: #777; }
                .chat-msg-row { display: flex; justify-content: space-between; align-items: center; }
                .chat-preview { color: #aaa; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .unread-badge { background: #00f0ff; color: black; font-weight: bold; font-size: 0.75rem; padding: 4px 8px; border-radius: 12px; }
                .mute-icon { font-size: 0.9rem; opacity: 0.7; }
                .empty-state { text-align: center; margin-top: 50px; color: #555; display: flex; flex-direction: column; gap: 10px; }
            `}</style>
        </div>
    );
}

function ChatRoom({ currentUser, targetUser, onBack }) {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [showMenu, setShowMenu] = useState(false);
    const [uploading, setUploading] = useState(false);
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const [toastMsg, setToastMsg] = useState(null);

    // Call State
    const [isCalling, setIsCalling] = useState(false);
    const [callType, setCallType] = useState('video'); // 'audio' | 'video'

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
                .single();
            
            if (data) setMuteSettings(data);
        };
        fetchMuteSettings();
    }, [currentUser.id, targetUser.id]);

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

    const startCall = (type) => {
        setCallType(type);
        setIsCalling(true);
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
        if (diffMins < 60) return `Last seen ${diffMins} min ago`;
        
        // Hours ago
        if (diffHours < 24) {
            return diffHours === 1 ? 'Last seen 1 hour ago' : `Last seen ${diffHours} hours ago`;
        }
        
        // Yesterday
        if (diffDays === 1) return 'Last seen yesterday';
        
        // Days ago
        if (diffDays < 7) return `Last seen ${diffDays} days ago`;
        
        // More than a week
        return 'Last seen a while ago';
    };

    return (
        <div className="chat-room-container">
            {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
            <div className="chat-room-header">
                <button onClick={onBack} className="back-btn">←</button>
                <div className="header-user">
                    <img src={(() => {
                        const safeName = encodeURIComponent(targetUser.username || targetUser.full_name || 'User');
                        if (targetUser.gender === 'Male') return `https://avatar.iran.liara.run/public/boy?username=${safeName}`;
                        if (targetUser.gender === 'Female') return `https://avatar.iran.liara.run/public/girl?username=${safeName}`;
                        return `https://avatar.iran.liara.run/public?username=${safeName}`;
                    })()} className="header-avatar" />
                    <div className="header-text">
                        <h3>{targetUser.full_name || targetUser.username}</h3>
                        <span className={`user-status ${getLastSeenStatus(targetUser.last_active) === 'Online' ? 'online' : ''}`}>
                            {getLastSeenStatus(targetUser.last_active)}
                        </span>
                    </div>
                </div>
                <div className="header-actions">
                    <button title="Audio Call" onClick={() => startCall('audio')}>
                        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                    </button>
                    <button title="Video Call" onClick={() => startCall('video')}>
                        <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                    </button>
                    <div style={{ position: 'relative' }}>
                        <button onClick={() => setShowMenu(!showMenu)}>⋮</button>
                        {showMenu && (
                            <div className="dropdown-menu">
                                <button onClick={() => handleMenuAction('mute')}>
                                    {isChatMuted() ? '🔔 Unmute Notifications' : '🔇 Mute Notifications'}
                                </button>
                                <div style={{ height: '1px', background: '#555', margin: '4px 0' }}></div>
                                <button onClick={() => handleMenuAction('block')} className="danger">🚫 Block</button>
                                <button onClick={() => handleMenuAction('unfriend')} className="danger">💔 Unfriend</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="chat-messages">
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

            <div className="chat-input-bar">
                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    onChange={handleImageUpload}
                />
                <button onClick={() => fileInputRef.current.click()} disabled={uploading}>
                    {uploading ? '⏳' : '📷'}
                </button>
                <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && sendMessage()}
                    placeholder="Message..."
                    disabled={uploading}
                />
                <button onClick={() => sendMessage()} className="send-btn" disabled={uploading}>➤</button>
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
                    <div className="mute-menu-content" onClick={(e) => e.stopPropagation()}>
                        <h3>Mute Notifications</h3>
                        <p>You won't receive notifications from this chat</p>
                        <div className="mute-options">
                            {isChatMuted() ? (
                                <button onClick={() => handleMuteChat('unmute')} className="mute-option">
                                    🔔 Unmute
                                </button>
                            ) : (
                                <>
                                    <button onClick={() => handleMuteChat('8h')} className="mute-option">
                                        🔇 Mute for 8 hours
                                    </button>
                                    <button onClick={() => handleMuteChat('1w')} className="mute-option">
                                        🔇 Mute for 1 week
                                    </button>
                                    <button onClick={() => handleMuteChat('always')} className="mute-option">
                                        🔇 Mute always
                                    </button>
                                </>
                            )}
                        </div>
                        <button onClick={() => setShowMuteMenu(false)} className="cancel-btn">Cancel</button>
                    </div>
                </div>
            )}

            <style>{`
                .chat-room-container {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: #121212; z-index: 10000;
                    display: flex; flex-direction: column;
                }
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
                    position: absolute; top: 100%; right: 0;
                    background: #333; border-radius: 8px; padding: 5px;
                    display: flex; flex-direction: column; gap: 5px; min-width: 250px;
                    box-shadow: 0 5px 20px rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); z-index: 10001; 
                }
                .dropdown-menu button { font-size: 0.9rem; color: white; padding: 8px; text-align: left; width: 100%; cursor: pointer; background: none; border: none; }
                .dropdown-menu button.danger { color: #ff5555; }
                .dropdown-menu button:hover { background: rgba(255,255,255,0.1); }

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
                }
                .mute-menu-content {
                    background: #1e1e1e; border-radius: 20px; padding: 25px;
                    width: 85%; max-width: 320px; color: white;
                    border: 1px solid rgba(255,255,255,0.1);
                }
                .mute-menu-content h3 { margin: 0 0 10px 0; font-size: 1.2rem; }
                .mute-menu-content p { margin: 0 0 20px 0; font-size: 0.85rem; color: #999; }
                .mute-options { display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px; }
                .mute-option {
                    padding: 12px; background: #2a2a2a; border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 10px; color: white; cursor: pointer; font-size: 0.95rem;
                    transition: all 0.2s;
                }
                .mute-option:hover { background: #333; border-color: #00d4ff; }
                .cancel-btn {
                    width: 100%; padding: 12px; background: rgba(255,255,255,0.1);
                    border: 1px solid rgba(255,255,255,0.2); border-radius: 10px;
                    color: white; cursor: pointer; font-size: 0.95rem;
                }
                .cancel-btn:hover { background: rgba(255,255,255,0.15); }

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

                /* CALL OVERLAY */
                .call-interface-overlay {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: #000; z-index: 12000;
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                }
                
                /* Remote Video Container */
                .remote-video-container {
                    width: 100%; height: 100%; position: absolute; top: 0; left: 0;
                }
                .remote-video-container video {
                    width: 100%; height: 100%; object-fit: cover;
                }
                
                /* Remote Avatar (for audio calls or before video connects) */
                .remote-avatar-container {
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    width: 100%; height: 100%;
                }
                .remote-avatar {
                    width: 150px; height: 150px; border-radius: 50%;
                    border: 4px solid rgba(255,255,255,0.2);
                    object-fit: cover;
                }
                
                /* Local Video */
                .local-video {
                    position: absolute; top: 20px; right: 20px;
                    width: 120px; height: 160px; background: #222;
                    border-radius: 16px; border: 2px solid rgba(255,255,255,0.3);
                    z-index: 3; overflow: hidden;
                }
                .local-video video {
                    width: 100%; height: 100%; object-fit: cover;
                }
                
                /* Call Controls */
                .call-controls {
                    position: absolute; bottom: 50px; left: 0; right: 0;
                    display: flex; justify-content: center; gap: 25px; z-index: 4;
                }
                .ctrl-btn {
                    width: 65px; height: 65px; border-radius: 50%;
                    border: none; background: rgba(255,255,255,0.25);
                    backdrop-filter: blur(15px); color: white;
                    font-size: 1.6rem; cursor: pointer; 
                    display: flex; align-items: center; justify-content: center;
                    transition: all 0.2s;
                }
                .ctrl-btn:hover { background: rgba(255,255,255,0.35); transform: scale(1.05); }
                .ctrl-btn:active { transform: scale(0.95); }
                .ctrl-btn.hangup { background: #ff4444; }
                .ctrl-btn.hangup:hover { background: #ff2222; }
                .ctrl-btn.muted { background: rgba(255,69,58,0.3); }
                .ctrl-btn.camera-off { background: rgba(255,255,255,0.1); }
                
                /* Status Pill */
                .status-pill {
                    position: absolute; top: 60px; left: 50%; transform: translateX(-50%);
                    background: rgba(0,0,0,0.7); backdrop-filter: blur(10px);
                    color: white; padding: 8px 20px; border-radius: 25px; 
                    font-size: 0.9rem; font-weight: 600; z-index: 4;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                }
            `}</style>

            {/* CALL OVERLAY COMPONENT */}
            {(isCalling) && (
                <CallOverlay
                    callData={{
                        partner: targetUser,
                        type: callType,
                        isIncoming: false
                    }}
                    currentUser={currentUser}
                    onEnd={() => {
                        setIsCalling(false);
                        // Also update DB if we were the initiator
                    }}
                />
            )}
        </div>
    );
}

// --- CALL OVERLAY COMPONENT ---
function CallOverlay({ callData, currentUser, onEnd }) {
    const [status, setStatus] = useState('Connecting...');
    const [muted, setMuted] = useState(false);
    const [cameraOff, setCameraOff] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const [remoteUsers, setRemoteUsers] = useState([]);
    
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const clientRef = useRef(null);
    const localAudioTrackRef = useRef(null);
    const localVideoTrackRef = useRef(null);
    const callStartTimeRef = useRef(null);
    const durationIntervalRef = useRef(null);

    useEffect(() => {
        let mounted = true;
        const APP_ID = import.meta.env.VITE_AGORA_APP_ID;

        if (!APP_ID || APP_ID === 'your_agora_app_id_here') {
            setStatus('⚠️ Agora App ID not configured');
            console.error('Please add VITE_AGORA_APP_ID to your .env file');
            return;
        }

        const initializeCall = async () => {
            try {
                // Create Agora client
                const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
                clientRef.current = client;

                // Handle remote user events
                client.on('user-published', async (user, mediaType) => {
                    await client.subscribe(user, mediaType);
                    console.log('Subscribed to remote user:', user.uid, mediaType);

                    if (mediaType === 'video') {
                        setRemoteUsers(prev => {
                            const exists = prev.find(u => u.uid === user.uid);
                            if (exists) return prev;
                            return [...prev, user];
                        });
                        
                        // Play remote video
                        if (remoteVideoRef.current && user.videoTrack) {
                            user.videoTrack.play(remoteVideoRef.current);
                        }
                    }

                    if (mediaType === 'audio' && user.audioTrack) {
                        user.audioTrack.play();
                    }
                });

                client.on('user-unpublished', (user, mediaType) => {
                    console.log('User unpublished:', user.uid, mediaType);
                    if (mediaType === 'video') {
                        setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
                    }
                });

                client.on('user-left', (user) => {
                    console.log('User left:', user.uid);
                    setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
                });

                // Generate channel name from call participants
                const channelName = `call_${[currentUser.id, callData.partner.id].sort().join('_')}`;

                // If we are the caller, create/update call record with channel name
                if (!callData.isIncoming) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('last_active')
                        .eq('id', callData.partner.id)
                        .single();

                    let initialStatus = 'Calling...';
                    if (profile && profile.last_active) {
                        const lastActive = new Date(profile.last_active);
                        const diffMins = (new Date() - lastActive) / 1000 / 60;
                        if (diffMins < 5) initialStatus = 'Ringing...';
                    }
                    setStatus(initialStatus);

                    await supabase.from('calls').insert({
                        caller_id: currentUser.id,
                        receiver_id: callData.partner.id,
                        type: callData.type,
                        status: 'pending',
                        channel_name: channelName
                    });
                }

                // Create local tracks
                const isVideoCall = callData.type === 'video';
                
                if (isVideoCall) {
                    localVideoTrackRef.current = await AgoraRTC.createCameraVideoTrack();
                    if (localVideoRef.current && mounted) {
                        localVideoTrackRef.current.play(localVideoRef.current);
                    }
                }
                
                localAudioTrackRef.current = await AgoraRTC.createMicrophoneAudioTrack();

                // Join channel with user ID
                const uid = await client.join(APP_ID, channelName, null, currentUser.id);
                console.log('Joined channel:', channelName, 'with UID:', uid);

                // Publish local tracks
                const tracksToPublish = [localAudioTrackRef.current];
                if (isVideoCall && localVideoTrackRef.current) {
                    tracksToPublish.push(localVideoTrackRef.current);
                }
                
                await client.publish(tracksToPublish);
                console.log('Published local tracks');

                if (mounted) {
                    setStatus('Connected');
                    callStartTimeRef.current = Date.now();
                    
                    // Start duration timer
                    durationIntervalRef.current = setInterval(() => {
                        if (callStartTimeRef.current) {
                            const elapsed = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
                            setCallDuration(elapsed);
                        }
                    }, 1000);
                }

                // Listen for call status changes
                const channel = supabase.channel('current_call')
                    .on('postgres_changes', { 
                        event: 'UPDATE', 
                        schema: 'public', 
                        table: 'calls',
                        filter: `channel_name=eq.${channelName}`
                    }, (payload) => {
                        if (payload.new.status === 'ended' || payload.new.status === 'rejected') {
                            cleanup();
                            onEnd();
                        }
                        if (payload.new.status === 'active' && mounted) {
                            setStatus('Connected');
                            if (!callStartTimeRef.current) {
                                callStartTimeRef.current = Date.now();
                            }
                        }
                    })
                    .subscribe();

                return () => {
                    supabase.removeChannel(channel);
                };

            } catch (error) {
                console.error('Call initialization error:', error);
                setStatus('Connection Failed');
            }
        };

        const cleanup = async () => {
            mounted = false;
            
            // Stop duration timer
            if (durationIntervalRef.current) {
                clearInterval(durationIntervalRef.current);
            }

            // Close local tracks
            if (localAudioTrackRef.current) {
                localAudioTrackRef.current.close();
            }
            if (localVideoTrackRef.current) {
                localVideoTrackRef.current.close();
            }

            // Leave channel
            if (clientRef.current) {
                await clientRef.current.leave();
                console.log('Left channel');
            }
        };

        initializeCall();

        return () => {
            cleanup();
        };
    }, []);

    const toggleMute = async () => {
        if (localAudioTrackRef.current) {
            await localAudioTrackRef.current.setEnabled(muted);
            setMuted(!muted);
        }
    };

    const toggleCamera = async () => {
        if (localVideoTrackRef.current) {
            await localVideoTrackRef.current.setEnabled(cameraOff);
            setCameraOff(!cameraOff);
        }
    };

    const endCall = async () => {
        // Update DB to end call
        const channelName = `call_${[currentUser.id, callData.partner.id].sort().join('_')}`;
        await supabase.from('calls')
            .update({ status: 'ended' })
            .eq('channel_name', channelName);
        
        onEnd();
    };

    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const isVideoCall = callData.type === 'video';

    return (
        <div className="call-interface-overlay">
            <span className="status-pill">
                {status === 'Connected' ? formatDuration(callDuration) : status}
            </span>

            {/* Remote Video/Avatar */}
            {isVideoCall && remoteUsers.length > 0 ? (
                <div ref={remoteVideoRef} className="remote-video-container"></div>
            ) : (
                <div className="remote-avatar-container">
                    <img 
                        src={callData.partner.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + callData.partner.id} 
                        className="remote-avatar" 
                        alt="Remote User" 
                    />
                    <h2 style={{ color: 'white', marginTop: '20px' }}>
                        {callData.partner.full_name || callData.partner.username}
                    </h2>
                </div>
            )}

            {/* Local Video */}
            {isVideoCall && !cameraOff && (
                <div ref={localVideoRef} className="local-video"></div>
            )}

            {/* Call Controls */}
            <div className="call-controls">
                <button 
                    className={`ctrl-btn ${muted ? 'muted' : ''}`} 
                    onClick={toggleMute}
                    title={muted ? 'Unmute' : 'Mute'}
                >
                    {muted ? '🔇' : '🎤'}
                </button>
                
                <button className="ctrl-btn hangup" onClick={endCall} title="Hang Up">
                    📞
                </button>
                
                {isVideoCall && (
                    <button 
                        className={`ctrl-btn ${cameraOff ? 'camera-off' : ''}`} 
                        onClick={toggleCamera}
                        title={cameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
                    >
                        {cameraOff ? '📷' : '📹'}
                    </button>
                )}
            </div>
        </div>
    );
}
