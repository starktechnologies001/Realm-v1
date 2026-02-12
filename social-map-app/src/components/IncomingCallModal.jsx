import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { getAvatar2D, handleAvatarError } from '../utils/avatarUtils';

export default function IncomingCallModal({ incomingCall, onAnswer, onReject, onRejectWithMessage }) {
    const [ringtoneAudio, setRingtoneAudio] = useState(null);
    const [showQuickReplies, setShowQuickReplies] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false); // New State
    const [isProcessing, setIsProcessing] = useState(false);
    const navigate = useNavigate();

    const quickReplyMessages = [
        "I am busy right now, call you later",
        "I am outside",
        "Can't talk right now, I'll call you back"
    ];

    useEffect(() => {
        // Play ringtone
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/1359/1359.wav');
        audio.loop = true;
        audio.play().catch(e => {
            console.error("Ringtone play error:", e);
            // Fallback: Use vibration on mobile if audio is blocked
            if (navigator.vibrate) {
                // Vibrate pattern: [vibrate, pause, vibrate, pause, ...]
                const vibratePattern = [400, 200, 400, 200, 400];
                const vibrateInterval = setInterval(() => {
                    navigator.vibrate(vibratePattern);
                }, 2000); // Repeat every 2 seconds
                
                // Store interval to clear on cleanup
                audio.vibrateInterval = vibrateInterval;
            }
        });
        setRingtoneAudio(audio);

        return () => {
            if (audio) {
                audio.pause();
                audio.currentTime = 0;
                // Clear vibration interval if it exists
                if (audio.vibrateInterval) {
                    clearInterval(audio.vibrateInterval);
                    navigator.vibrate(0); // Stop vibration
                }
            }
        };
    }, []);

    // Cleanup audio when answering/rejecting
    const handleAction = async (action) => {
        if (isProcessing) return;
        setIsProcessing(true);
        if (ringtoneAudio) {
            ringtoneAudio.pause();
            ringtoneAudio.currentTime = 0;
        }
        await action();
        // Don't setProcessing(false) because component will unmount
    };

    const handleQuickReply = async (message) => {
        if (isProcessing) return;
        setIsProcessing(true);

        if (ringtoneAudio) {
            ringtoneAudio.pause();
            ringtoneAudio.currentTime = 0;
        }

        console.log('📱 [QuickReply] Starting quick reply process...');
        
        // First, reject the call (this triggers the Caller to create the log)
        await onReject();
        
        // Wait a bit for the call log to be created by CallContext
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Poll for the call log (Caller creates it via Realtime, might take a moment)
        let callLogMessage = null;
        let attempts = 0;
        const maxAttempts = 3;
        
        while (!callLogMessage && attempts < maxAttempts) {
            const { data: recentMessages } = await supabase
                .from('messages')
                .select('*')
                .eq('message_type', 'call_log')
                .or(`and(sender_id.eq.${incomingCall.caller_id},receiver_id.eq.${incomingCall.receiver_id}),and(sender_id.eq.${incomingCall.receiver_id},receiver_id.eq.${incomingCall.caller_id})`)
                .gt('created_at', new Date(Date.now() - 10000).toISOString()) // Created within last 10s
                .order('created_at', { ascending: false })
                .limit(1);

            if (recentMessages?.[0]) {
                callLogMessage = recentMessages[0];
                console.log('📞 Found call log message:', callLogMessage);
                break; // Found it!
            }
            
            if (attempts < maxAttempts - 1) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            attempts++;
        }

        // Send the message automatically
        const { error } = await supabase.from('messages').insert({
            sender_id: incomingCall.receiver_id,
            receiver_id: incomingCall.caller_id,
            content: message,
            message_type: 'text',
            reply_to_message_id: callLogMessage?.id || null
        });

        if (error) {
            console.error("❌ [QuickReply] Error sending message:", error);
        } else {
            console.log("✅ [QuickReply] Message sent successfully");
        }

        // Navigate to chat to show the sent message
        navigate('/chat', {
            state: {
                targetUser: incomingCall.caller
            }
        });
    };

    const avatarUrl = getAvatar2D(incomingCall.caller.avatar_url || incomingCall.caller.avatar);

    return (
        <div className={`incoming-call-banner-container ${isExpanded ? 'expanded-container' : ''}`}>
            {/* Backdrop for expanded mode */}
            {isExpanded && <div className="expanded-backdrop" />}

            <div 
                className={`incoming-call-banner glass-panel ${isExpanded ? 'expanded' : ''}`}
                onClick={() => !isExpanded && setIsExpanded(true)}
            >
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
                
                <div className="banner-actions" onClick={e => e.stopPropagation()}>
                    <button 
                        className="banner-btn decline" 
                        onClick={() => handleAction(onReject)}
                        title="Decline"
                        disabled={isProcessing}
                        style={{ opacity: isProcessing ? 0.6 : 1 }}
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
                <div className="quick-reply-popup" onClick={e => e.stopPropagation()}>
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
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleQuickReply(msg);
                                }}
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
                    transition: all 0.4s cubic-bezier(0.22, 1, 0.36, 1);
                }
                
                .incoming-call-banner-container.expanded-container {
                    top: 0; bottom: 0;
                    padding: 0;
                    justify-content: center;
                    background: rgba(0,0,0,0.8);
                    pointer-events: auto;
                    backdrop-filter: blur(8px);
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
                    transition: all 0.5s cubic-bezier(0.22, 1, 0.36, 1);
                }

                .incoming-call-banner.expanded {
                    flex-direction: column;
                    justify-content: center;
                    width: 100%;
                    max-width: 100%;
                    height: 100%;
                    border-radius: 0;
                    background: transparent;
                    border: none;
                    box-shadow: none;
                    padding: 40px;
                    gap: 60px;
                }
                
                @keyframes slideDown { 
                    from { transform: translateY(-120%) scale(0.9); opacity: 0; } 
                    to { transform: translateY(0) scale(1); opacity: 1; } 
                }

                .banner-content {
                    display: flex; align-items: center; gap: 14px;
                    flex: 1;
                    min-width: 0;
                    transition: all 0.4s ease;
                }

                .expanded .banner-content {
                    flex-direction: column;
                    flex: initial;
                    gap: 24px;
                    text-align: center;
                }
                
                .avatar-wrapper {
                    position: relative;
                    width: 48px; height: 48px;
                    transition: all 0.5s cubic-bezier(0.22, 1, 0.36, 1);
                }

                .expanded .avatar-wrapper {
                    width: 160px; height: 160px;
                }
                
                .banner-avatar {
                    width: 100%; height: 100%; object-fit: cover; border-radius: 50%;
                    background: #444;
                    position: relative; z-index: 2;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
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
                    transition: all 0.3s ease;
                }

                .expanded .banner-text h3 {
                    font-size: 2rem;
                    margin-bottom: 8px;
                }
                
                .call-type {
                    margin: 2px 0 0 0; font-size: 0.85rem; color: #4CAF50;
                    font-weight: 500; letter-spacing: 0.3px;
                    transition: all 0.3s ease;
                }

                .expanded .call-type {
                    font-size: 1.2rem;
                }
                
                .banner-actions {
                    display: flex; gap: 12px; align-items: center;
                    transition: all 0.4s ease;
                }
                
                .expanded .banner-actions {
                    gap: 40px;
                }
                
                .banner-btn {
                    width: 44px; height: 44px; border-radius: 50%;
                    border: none;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer; transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                    color: white;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                }

                .expanded .banner-btn {
                    width: 72px; height: 72px;
                }

                .expanded .banner-btn svg {
                    width: 36px; height: 36px;
                }
                
                .banner-btn:active { transform: scale(0.92); }
                .banner-btn:hover { filter: brightness(1.1); transform: translateY(-2px); }
                
                .banner-btn.decline {
                    background: #ff3b30;
                }
                
                .banner-btn.message {
                    background: #3a3a3c;
                    width: 40px; height: 40px; 
                }

                .expanded .banner-btn.message {
                    width: 56px; height: 56px;
                }
                
                .banner-btn.accept {
                    background: #34c759;
                }

                /* Quick Reply Popup */
                .quick-reply-popup {
                    pointer-events: auto;
                    background: #202020;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 20px;
                    width: 100%; max-width: 440px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                    animation: slideUpPopup 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                    overflow: hidden;
                    position: relative; 
                    z-index: 11001;
                }

                .expanded-container .quick-reply-popup {
                    position: absolute;
                    bottom: 40px;
                    width: 90%;
                    max-width: 380px;
                }
                
                @keyframes slideUpPopup {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }

                .quick-reply-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px 20px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                    background: rgba(255,255,255,0.03);
                    color: white;
                    font-weight: 600;
                    font-size: 1rem;
                }

                .close-btn {
                    background: rgba(255,255,255,0.1);
                    border: none;
                    color: white;
                    font-size: 20px;
                    cursor: pointer;
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    transition: all 0.2s;
                    line-height: 1;
                    padding: 0;
                }

                .close-btn:hover {
                    background: rgba(255, 255, 255, 0.2);
                }

                .quick-reply-options {
                    display: flex;
                    flex-direction: column;
                    padding: 16px;
                    gap: 10px;
                    max-height: 300px;
                    overflow-y: auto;
                }

                .quick-reply-option {
                    background: #3a3a3c; /* iMessage gray style */
                    border: none;
                    border-radius: 18px;
                    padding: 12px 16px;
                    color: white;
                    font-size: 0.95rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-align: left;
                    line-height: 1.4;
                }

                .quick-reply-option:hover {
                    background: #4a4a4c;
                    transform: scale(1.02);
                }

                .quick-reply-option:active {
                    transform: scale(0.98);
                }
            `}</style>
        </div>
    );
}
