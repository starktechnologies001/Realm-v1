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
            <div className="incoming-call-card">
                <div className="caller-info">
                    <img 
                        src={incomingCall.caller.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + incomingCall.caller.id} 
                        alt="Caller" 
                        className="caller-avatar"
                    />
                    <h3>{incomingCall.caller.full_name || incomingCall.caller.username}</h3>
                    <p>Incoming {incomingCall.type} call...</p>
                </div>
                
                <div className="incoming-actions">
                    <button 
                        className="action-btn decline" 
                        onClick={() => handleAction(onReject)}
                    >
                        <span className="icon">📞</span> Decline
                    </button>
                    
                    <button 
                        className="action-btn message"
                        onClick={() => handleAction(onRejectWithMessage)}
                    >
                        <span className="icon">💬</span> Message
                    </button>

                    <button 
                        className="action-btn accept" 
                        onClick={() => handleAction(onAnswer)}
                    >
                        <span className="icon">📞</span> Accept
                    </button>
                </div>
            </div>

            <style>{`
                .incoming-call-overlay {
                    position: fixed; inset: 0; z-index: 9999;
                    background: rgba(0,0,0,0.85);
                    backdrop-filter: blur(8px);
                    display: flex; align-items: center; justify-content: center;
                    animation: fadeIn 0.3s ease-out;
                }
                .incoming-call-card {
                    background: rgba(30,30,30,0.9);
                    border: 1px solid rgba(255,255,255,0.1);
                    padding: 40px; border-radius: 24px;
                    display: flex; flex-direction: column; align-items: center; gap: 32px;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.5);
                    width: 90%; max-width: 360px;
                }
                .caller-avatar {
                    width: 100px; height: 100px; object-fit: cover; border-radius: 50%;
                    border: 4px solid rgba(255,255,255,0.1);
                    margin-bottom: 16px;
                    animation: pulse 2s infinite;
                }
                .incoming-actions {
                    display: flex; gap: 16px; width: 100%; justify-content: space-between;
                }
                .action-btn {
                    flex: 1; padding: 12px; border-radius: 16px; border: none;
                    display: flex; flex-direction: column; align-items: center; gap: 8px;
                    font-size: 0.8rem; font-weight: 500; cursor: pointer;
                    transition: transform 0.2s;
                    color: white;
                }
                .action-btn:active { transform: scale(0.95); }
                .action-btn.decline { background: rgba(255, 59, 48, 0.2); color: #ff3b30; }
                .action-btn.message { background: rgba(10, 132, 255, 0.2); color: #0a84ff; }
                .action-btn.accept { background: #34c759; color: white; box-shadow: 0 4px 12px rgba(52, 199, 89, 0.3); }
                .action-btn .icon { font-size: 1.5rem; }
                
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(255,255,255, 0.4); }
                    70% { box-shadow: 0 0 0 10px rgba(255,255,255, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(255,255,255, 0); }
                }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            `}</style>
        </div>
    );
}
