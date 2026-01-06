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

    return (
        <div className="incoming-call-overlay">
            <div className="incoming-call-card glass-panel">
                <div className="caller-info">
                    <img 
                        src={(() => {
                            const u = incomingCall.caller;
                            if (u.avatar_url) return u.avatar_url;
                            const safeName = encodeURIComponent(u.username || u.full_name || 'User');
                            const g = u.gender?.toLowerCase();
                            if (g === 'male') return `https://avatar.iran.liara.run/public/boy?username=${safeName}`;
                            if (g === 'female') return `https://avatar.iran.liara.run/public/girl?username=${safeName}`;
                            return `https://avatar.iran.liara.run/public?username=${safeName}`;
                        })()} 
                        alt="Caller" 
                        className="caller-avatar"
                    />
                    <h3>{incomingCall.caller.full_name || incomingCall.caller.username}</h3>
                    <p className="call-type">Incoming {incomingCall.type} call...</p>
                </div>
                
                <div className="incoming-actions">
                    <button 
                        className="action-btn decline" 
                        onClick={() => handleAction(onReject)}
                    >
                        <div className="icon-circle decline-bg">
                             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" y1="1" x2="1" y2="23"></line></svg>
                        </div>
                        <span>Decline</span>
                    </button>
                    
                    <button 
                        className="action-btn message"
                        onClick={() => handleAction(onRejectWithMessage)}
                    >
                         <div className="icon-circle message-bg">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                        </div>
                        <span>Message</span>
                    </button>

                    <button 
                        className="action-btn accept" 
                        onClick={() => handleAction(onAnswer)}
                    >
                        <div className="icon-circle accept-bg">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                        </div>
                        <span>Accept</span>
                    </button>
                </div>
            </div>

            <style>{`
                .incoming-call-overlay {
                    position: fixed; inset: 0; z-index: 9999;
                    background: rgba(0,0,0,0.8);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    display: flex; align-items: center; justify-content: center;
                    animation: fadeIn 0.3s ease-out;
                }
                .incoming-call-card {
                    background: rgba(30, 30, 30, 0.6);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    padding: 50px 30px; border-radius: 32px;
                    display: flex; flex-direction: column; align-items: center; gap: 40px;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                    width: 90%; max-width: 380px;
                }
                .caller-info {
                    display: flex; flex-direction: column; align-items: center;
                    width: 100%;
                }
                .caller-avatar {
                    width: 120px; height: 120px; object-fit: cover; border-radius: 50%;
                    border: 4px solid rgba(255,255,255,0.1);
                    margin-bottom: 24px;
                    box-shadow: 0 0 30px rgba(0,0,0,0.3);
                    animation: pulse 2s infinite;
                }
                .caller-info h3 {
                    margin: 0; font-size: 1.8rem; font-weight: 700; color: white;
                    text-align: center; margin-bottom: 8px;
                }
                .call-type {
                    margin: 0; font-size: 1rem; color: rgba(255,255,255,0.6);
                    text-transform: uppercase; letter-spacing: 1px; font-weight: 500;
                }

                .incoming-actions {
                    display: flex; gap: 20px; width: 100%; justify-content: space-evenly;
                    margin-top: 10px;
                }
                .action-btn {
                    background: transparent; border: none; padding: 0;
                    display: flex; flex-direction: column; align-items: center; gap: 12px;
                    cursor: pointer; transition: transform 0.2s;
                }
                .action-btn:active { transform: scale(0.9); }
                .action-btn span {
                    color: rgba(255,255,255,0.8); font-size: 0.9rem; font-weight: 500;
                }

                .icon-circle {
                    width: 64px; height: 64px; border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    color: white; box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                    transition: filter 0.2s;
                }
                .icon-circle:hover { filter: brightness(1.1); }

                .decline-bg {
                    background: #ff3b30;
                }
                .message-bg {
                    background: rgba(255,255,255,0.15); /* Neutral/Glass */
                }
                .accept-bg {
                    background: #34c759;
                }
                
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(255,255,255, 0.4); }
                    70% { box-shadow: 0 0 0 15px rgba(255,255,255, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(255,255,255, 0); }
                }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            `}</style>
        </div>
    );
}
