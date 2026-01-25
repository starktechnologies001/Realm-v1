import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { getAvatar2D, handleAvatarError } from '../utils/avatarUtils';

export default function IncomingCallModal({ incomingCall, onAnswer, onReject, onRejectWithMessage }) {
    const [ringtoneAudio, setRingtoneAudio] = useState(null);
    const [showQuickReplies, setShowQuickReplies] = useState(false);

    const quickReplyMessages = [
        "I am busy right now, call you later",
        "I am outside",
        "Can't talk right now, I'll call you back"
    ];

    useEffect(() => {
        // Play ringtone
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/1359/1359.wav');
        audio.loop = true;
        audio.play().catch(e => console.error("Ringtone play error:", e));
        setRingtoneAudio(audio);

        return () => {
            if (audio) {
                audio.pause();
                audio.currentTime = 0;
            }
        };
    }, []);

    // Cleanup audio when answering/rejecting
    const handleAction = (action) => {
        if (ringtoneAudio) {
            ringtoneAudio.pause();
            ringtoneAudio.currentTime = 0;
        }
        action();
    };

    const handleQuickReply = async (message) => {
        if (ringtoneAudio) {
            ringtoneAudio.pause();
            ringtoneAudio.currentTime = 0;
        }

        console.log('📱 [QuickReply] Starting quick reply process...');
        console.log('📱 [QuickReply] Message:', message);
        console.log('📱 [QuickReply] Caller ID:', incomingCall.caller_id);
        console.log('📱 [QuickReply] Receiver ID:', incomingCall.receiver_id);

        // First, reject the call (this will create the call log)
        await onReject();

        // Wait a brief moment for the call log to be created
        await new Promise(resolve => setTimeout(resolve, 800));

        // Then send the message as a reply to the call log
        // We need to fetch the most recent call log message between these two users
        const { data: recentMessages, error: fetchError } = await supabase
            .from('messages')
            .select('id, created_at, content')
            .eq('message_type', 'call_log')
            .or(`and(sender_id.eq.${incomingCall.caller_id},receiver_id.eq.${incomingCall.receiver_id}),and(sender_id.eq.${incomingCall.receiver_id},receiver_id.eq.${incomingCall.caller_id})`)
            .order('created_at', { ascending: false })
            .limit(1);

        console.log('📱 [QuickReply] Fetch error:', fetchError);
        console.log('📱 [QuickReply] Recent call logs:', recentMessages);

        const replyToId = recentMessages?.[0]?.id || null;
        console.log('📱 [QuickReply] Replying to message ID:', replyToId);

        // Send the selected message as a reply
        const { error } = await supabase.from('messages').insert({
            sender_id: incomingCall.receiver_id,
            receiver_id: incomingCall.caller_id,
            content: message,
            message_type: 'text',
            reply_to_message_id: replyToId
        });

        if (error) {
            console.error("❌ [QuickReply] Error sending message:", error);
        } else {
            console.log("✅ [QuickReply] Message sent successfully!");
        }
    };

    const avatarUrl = getAvatar2D(incomingCall.caller.avatar_url || incomingCall.caller.avatar);

    return (
        <div className="incoming-call-banner-container">
            <div className="incoming-call-banner glass-panel">
                <div className="banner-content">
                    <div className="avatar-wrapper">
                        <img 
                            src={avatarUrl}
                            alt="Caller" 
                            className="banner-avatar"
                            onError={(e) => handleAvatarError(e, incomingCall.caller.username)}
                        />
                        <div className="pulsing-ring"></div>
                    </div>
                    <div className="banner-text">
                        <h3>{incomingCall.caller.username || incomingCall.caller.full_name || 'Unknown User'}</h3>
                        <p className="call-type">
                            <span className="scrolling-text">Incoming {incomingCall.type} call...</span>
                        </p>
                    </div>
                </div>
                
                <div className="banner-actions">
                    <button 
                        className="banner-btn decline" 
                        onClick={() => handleAction(onReject)}
                        title="Decline"
                    >
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                    
                    <button 
                        className="banner-btn message"
                        onClick={() => setShowQuickReplies(!showQuickReplies)}
                        title="Quick Reply"
                    >
                         <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                    </button>

                    <button 
                        className="banner-btn accept" 
                        onClick={() => handleAction(onAnswer)}
                        title="Accept"
                    >
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                    </button>
                </div>
            </div>

            {/* Quick Reply Popup */}
            {showQuickReplies && (
                <div className="quick-reply-popup">
                    <div className="quick-reply-header">
                        <span>Quick Reply</span>
                        <button 
                            className="close-btn"
                            onClick={() => setShowQuickReplies(false)}
                        >×</button>
                    </div>
                    <div className="quick-reply-options">
                        {quickReplyMessages.map((msg, idx) => (
                            <button
                                key={idx}
                                className="quick-reply-option"
                                onClick={() => handleQuickReply(msg)}
                            >
                                {msg}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <style>{`
                .incoming-call-banner-container {
                    position: fixed; top: 12px; left: 0; right: 0;
                    display: flex; flex-direction: column; align-items: center;
                    z-index: 11000;
                    pointer-events: none;
                    padding: 0 12px;
                    gap: 12px;
                }
                
                .incoming-call-banner {
                    pointer-events: auto;
                    background: #2e2e2e;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    padding: 12px 16px; 
                    border-radius: 18px;
                    display: flex; align-items: center; justify-content: space-between; gap: 24px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                    width: 100%; max-width: 440px;
                    animation: slideDown 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                    color: white;
                }
                
                @keyframes slideDown { 
                    from { transform: translateY(-120%) scale(0.9); opacity: 0; } 
                    to { transform: translateY(0) scale(1); opacity: 1; } 
                }

                .banner-content {
                    display: flex; align-items: center; gap: 14px;
                    flex: 1;
                    min-width: 0;
                }
                
                .avatar-wrapper {
                    position: relative;
                    width: 48px; height: 48px;
                }
                
                .banner-avatar {
                    width: 100%; height: 100%; object-fit: cover; border-radius: 50%;
                    background: #444;
                    position: relative; z-index: 2;
                }
                
                .pulsing-ring {
                    position: absolute; top: -4px; left: -4px; right: -4px; bottom: -4px;
                    border-radius: 50%;
                    border: 2px solid #4CAF50;
                    opacity: 0;
                    z-index: 1;
                    animation: pulse-ring 2s infinite;
                }
                
                @keyframes pulse-ring {
                    0% { transform: scale(0.8); opacity: 0.8; }
                    100% { transform: scale(1.5); opacity: 0; }
                }

                .banner-text {
                    display: flex; flex-direction: column;
                    min-width: 0;
                }
                
                .banner-text h3 {
                    margin: 0; font-size: 1.05rem; font-weight: 600; color: white;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                
                .call-type {
                    margin: 2px 0 0 0; font-size: 0.85rem; color: #4CAF50;
                    font-weight: 500; letter-spacing: 0.3px;
                }
                
                .banner-actions {
                    display: flex; gap: 12px; align-items: center;
                }
                
                .banner-btn {
                    width: 44px; height: 44px; border-radius: 50%;
                    border: none;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer; transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                    color: white;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                }
                
                .banner-btn:active { transform: scale(0.92); }
                .banner-btn:hover { filter: brightness(1.1); transform: translateY(-2px); }
                
                .banner-btn.decline {
                    background: #ff3b30;
                }
                
                .banner-btn.message {
                    background: #3a3a3c;
                    width: 40px; height: 40px; /* Slightly smaller */
                }
                
                .banner-btn.accept {
                    background: #34c759;
                }

                /* Quick Reply Popup */
                .quick-reply-popup {
                    pointer-events: auto;
                    background: #2e2e2e;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 16px;
                    width: 100%; max-width: 440px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                    animation: slideDown 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                    overflow: hidden;
                }

                .quick-reply-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 14px 18px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    color: white;
                    font-weight: 600;
                    font-size: 0.95rem;
                }

                .close-btn {
                    background: none;
                    border: none;
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 28px;
                    cursor: pointer;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    transition: all 0.2s;
                    line-height: 1;
                    padding: 0;
                }

                .close-btn:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                }

                .quick-reply-options {
                    display: flex;
                    flex-direction: column;
                    padding: 8px;
                    gap: 6px;
                }

                .quick-reply-option {
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    padding: 14px 16px;
                    color: white;
                    font-size: 0.9rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-align: left;
                }

                .quick-reply-option:hover {
                    background: rgba(255, 255, 255, 0.1);
                    border-color: rgba(255, 255, 255, 0.2);
                    transform: translateX(4px);
                }

                .quick-reply-option:active {
                    transform: scale(0.98);
                }
            `}</style>
        </div>
    );
}
