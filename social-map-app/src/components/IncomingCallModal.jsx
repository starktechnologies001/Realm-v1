import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { getAvatar2D } from '../utils/avatarUtils';

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

    // Use robust avatar handler
    const avatarUrl = getAvatar2D(incomingCall.caller.avatar_url, incomingCall.caller.username);

    return (
        <div className="incoming-call-banner-container">
            <div className="incoming-call-banner glass-panel">
                <div className="banner-content">
                    <img 
                        src={avatarUrl}
                        alt="Caller" 
                        className="banner-avatar"
                        onError={(e) => {
                            e.target.src = `https://avatar.iran.liara.run/public?username=${incomingCall.caller.username}`;
                        }}
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
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                    
                    <button 
                        className="banner-btn message"
                        onClick={() => handleAction(onRejectWithMessage)}
                        title="Message"
                    >
                         <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                    </button>

                    <button 
                        className="banner-btn accept" 
                        onClick={() => handleAction(onAnswer)}
                        title="Accept"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                    </button>
                </div>
            </div>

            <style>{`
                .incoming-call-banner-container {
                    position: fixed; top: 12px; left: 0; right: 0;
                    display: flex; justify-content: center;
                    z-index: 12000;
                    pointer-events: none;
                    padding: 0 16px;
                }
                
                .incoming-call-banner {
                    pointer-events: auto;
                    background: rgba(18, 18, 18, 0.85);
                    backdrop-filter: blur(24px) saturate(180%);
                    -webkit-backdrop-filter: blur(24px) saturate(180%);
                    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.1);
                    padding: 14px 20px; 
                    border-radius: 40px; /* Pill shape */
                    display: flex; align-items: center; justify-content: space-between; gap: 24px;
                    width: 100%; max-width: 440px;
                    animation: banner-drop 0.6s cubic-bezier(0.16, 1, 0.3, 1);
                }
                
                @keyframes banner-drop {
                    0% { transform: translateY(-120%) scale(0.9); opacity: 0; }
                    100% { transform: translateY(0) scale(1); opacity: 1; }
                }

                .banner-content {
                    display: flex; align-items: center; gap: 14px;
                    flex: 1; min-width: 0;
                }
                
                .banner-avatar {
                    width: 52px; height: 52px; object-fit: cover; border-radius: 50%;
                    border: 2px solid rgba(255,255,255,0.1);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                }

                .banner-text {
                    display: flex; flex-direction: column; gap: 2px;
                    min-width: 0;
                }
                
                .banner-text h3 {
                    margin: 0; font-size: 1.05rem; font-weight: 700; color: white;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                    letter-spacing: -0.01em;
                }
                
                .call-type {
                    margin: 0; font-size: 0.8rem; 
                    color: rgba(255, 255, 255, 0.6); /* More subtle than green */
                    font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;
                }

                .banner-actions {
                    display: flex; gap: 12px;
                }
                
                .banner-btn {
                    width: 48px; height: 48px; border-radius: 50%;
                    border: none;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer; transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
                    color: white;
                    position: relative;
                    overflow: hidden;
                }
                
                .banner-btn:hover { transform: scale(1.08); }
                .banner-btn:active { transform: scale(0.95); }
                
                .banner-btn.decline {
                    background: #ff3b30;
                    box-shadow: 0 4px 15px rgba(255, 59, 48, 0.3);
                }
                
                .banner-btn.message {
                    background: rgba(255,255,255,0.15);
                    color: rgba(255,255,255, 0.9);
                    backdrop-filter: blur(10px);
                }
                .banner-btn.message:hover {
                    background: rgba(255,255,255,0.25);
                }
                
                .banner-btn.accept {
                    background: #34c759;
                    box-shadow: 0 4px 15px rgba(52, 199, 89, 0.3);
                    animation: pulse-green 2s infinite;
                }
                
                @keyframes pulse-green {
                    0% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0.4); }
                    70% { box-shadow: 0 0 0 10px rgba(52, 199, 89, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0); }
                }

                /* Mobile Optimizations */
                @media (max-width: 480px) {
                    .incoming-call-banner {
                        padding: 12px 16px;
                        gap: 16px;
                        border-radius: 32px;
                    }
                    .banner-avatar { width: 44px; height: 44px; }
                    .banner-btn { width: 42px; height: 42px; }
                    .banner-text h3 { font-size: 1rem; }
                }
            `}</style>
        </div>
    );
}
