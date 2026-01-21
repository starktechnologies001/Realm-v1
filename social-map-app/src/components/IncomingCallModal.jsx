import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient'; // Ensure path is correct relative to components

export default function IncomingCallModal({ incomingCall, onAnswer, onReject, onRejectWithMessage }) {
    const [ringtoneAudio, setRingtoneAudio] = useState(null);

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

    const getAvatarUrl = (u) => {
        if (u.avatar_url) return u.avatar_url;
        const safeName = encodeURIComponent(u.username || u.full_name || 'User');
        const g = u.gender?.toLowerCase();
        if (g === 'male') return `https://avatar.iran.liara.run/public/boy?username=${safeName}`;
        if (g === 'female') return `https://avatar.iran.liara.run/public/girl?username=${safeName}`;
        return `https://avatar.iran.liara.run/public?username=${safeName}`;
    };

    const avatarUrl = getAvatarUrl(incomingCall.caller);

    return (
        <div className="incoming-call-banner-container">
            <div className="incoming-call-banner glass-panel">
                <div className="banner-content">
                    <img 
                        src={avatarUrl}
                        alt="Caller" 
                        className="banner-avatar"
                    />
                    <div className="banner-text">
                        <h3>{incomingCall.caller.username}</h3>
                        <p className="call-type">Incoming {incomingCall.type} call...</p>
                    </div>
                </div>
                
                <div className="banner-actions">
                    <button 
                        className="banner-btn decline" 
                        onClick={() => handleAction(onReject)}
                        title="Decline"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" y1="1" x2="1" y2="23"></line></svg>
                    </button>
                    
                    <button 
                        className="banner-btn message"
                        onClick={() => handleAction(onRejectWithMessage)}
                        title="Message"
                    >
                         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    </button>

                    <button 
                        className="banner-btn accept" 
                        onClick={() => handleAction(onAnswer)}
                        title="Accept"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                    </button>
                </div>
            </div>

            <style>{`
                .incoming-call-banner-container {
                    position: fixed; top: 16px; left: 0; right: 0;
                    display: flex; justify-content: center;
                    z-index: 11000; /* Above all map elements */
                    pointer-events: none; /* Let clicks pass through outside the card */
                    padding: 0 16px;
                }
                
                .incoming-call-banner {
                    pointer-events: auto; /* Re-enable clicks on the card */
                    background: rgba(28, 28, 30, 0.95);
                    backdrop-filter: blur(20px) saturate(180%);
                    -webkit-backdrop-filter: blur(20px) saturate(180%);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    padding: 16px 20px; 
                    border-radius: 24px;
                    display: flex; align-items: center; justify-content: space-between; gap: 20px;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
                    width: 100%; max-width: 480px;
                    animation: slideDown 0.5s cubic-bezier(0.19, 1, 0.22, 1);
                }
                
                @keyframes slideDown { from { transform: translateY(-150%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

                .banner-content {
                    display: flex; align-items: center; gap: 16px;
                    flex: 1;
                    min-width: 0; /* Text truncation fix */
                }
                
                .banner-avatar {
                    width: 56px; height: 56px; object-fit: cover; border-radius: 50%;
                    border: 2px solid rgba(255,255,255,0.2);
                    animation: pulse-border 2s infinite;
                }
                
                @keyframes pulse-border {
                    0% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0.4); }
                    70% { box-shadow: 0 0 0 6px rgba(52, 199, 89, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0); }
                }

                .banner-text {
                    display: flex; flex-direction: column;
                    min-width: 0;
                }
                
                .banner-text h3 {
                    margin: 0; font-size: 1.1rem; font-weight: 700; color: white;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                
                .call-type {
                    margin: 2px 0 0 0; font-size: 0.85rem; color: #34c759;
                    font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;
                }

                .banner-actions {
                    display: flex; gap: 12px;
                }
                
                .banner-btn {
                    width: 48px; height: 48px; border-radius: 50%;
                    border: none;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer; transition: all 0.2s;
                    color: white;
                }
                
                .banner-btn:active { transform: scale(0.9); }
                
                .banner-btn.decline {
                    background: #ff3b30;
                    color: white;
                }
                
                .banner-btn.message {
                    background: rgba(255,255,255,0.15);
                    color: rgba(255,255,255,0.9);
                }
                
                .banner-btn.accept {
                    background: #34c759;
                    color: white;
                    animation: bounce-small 2s infinite;
                }
                
                @keyframes bounce-small {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-3px); }
                }
            `}</style>
        </div>
    );
}
