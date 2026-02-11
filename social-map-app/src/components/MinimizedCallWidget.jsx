import React from 'react';
import { getAvatar2D, handleAvatarError } from '../utils/avatarUtils';

export default function MinimizedCallWidget({ callData, callDuration, onMaximize, onEnd }) {
    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="minimized-call-widget">
            <div className="widget-content" onClick={onMaximize}>
                <img 
                    src={getAvatar2D(callData.partner.avatar_url, callData.partner.username)} 
                    alt={callData.partner.username}
                    className="mini-avatar"
                    onError={(e) => handleAvatarError(e, callData.partner.username)}
                />
                <div className="call-info">
                    <span className="partner-name">{callData.partner.username}</span>
                    <span className="call-timer">{formatDuration(callDuration)}</span>
                </div>
            </div>
            
            <div className="widget-actions">
                <button 
                    className="widget-btn maximize-btn" 
                    onClick={(e) => { e.stopPropagation(); onMaximize(); }}
                    title="Maximize"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <polyline points="9 21 3 21 3 15"></polyline>
                        <line x1="21" y1="3" x2="14" y2="10"></line>
                        <line x1="3" y1="21" x2="10" y2="14"></line>
                    </svg>
                </button>
                <button 
                    className="widget-btn end-btn" 
                    onClick={(e) => { e.stopPropagation(); onEnd(); }}
                    title="End Call"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path>
                        <line x1="23" y1="1" x2="1" y2="23"></line>
                    </svg>
                </button>
            </div>

            <style>{`
                .minimized-call-widget {
                    position: fixed;
                    top: 20px;
                    left: 20px;
                    background: rgba(0, 0, 0, 0.85);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border-radius: 16px;
                    padding: 12px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    z-index: 11000;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    min-width: 280px;
                    animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }

                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .widget-content {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    flex: 1;
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 12px;
                    transition: background 0.2s;
                }

                .widget-content:hover {
                    background: rgba(255, 255, 255, 0.05);
                }

                .mini-avatar {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    object-fit: cover;
                    border: 2px solid rgba(52, 199, 89, 0.5);
                    box-shadow: 0 0 12px rgba(52, 199, 89, 0.3);
                    background: #2c2c2e;
                }

                .call-info {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .partner-name {
                    color: white;
                    font-size: 0.95rem;
                    font-weight: 600;
                    line-height: 1.2;
                }

                .call-timer {
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 0.85rem;
                    font-weight: 500;
                    font-variant-numeric: tabular-nums;
                }

                .widget-actions {
                    display: flex;
                    gap: 8px;
                }

                .widget-btn {
                    width: 36px;
                    height: 36px;
                    border-radius: 50%;
                    border: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }

                .maximize-btn {
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                }

                .maximize-btn:hover {
                    background: rgba(255, 255, 255, 0.2);
                    transform: scale(1.1);
                }

                .end-btn {
                    background: #ff3b30;
                    color: white;
                }

                .end-btn:hover {
                    background: #ff453a;
                    transform: scale(1.1);
                    box-shadow: 0 4px 16px rgba(255, 59, 48, 0.4);
                }

                .widget-btn:active {
                    transform: scale(0.95);
                }

                /* Mobile adjustments */
                @media (max-width: 768px) {
                    .minimized-call-widget {
                        left: 50%;
                        transform: translateX(-50%);
                        top: 10px;
                        min-width: auto;
                        width: calc(100% - 40px);
                        max-width: 360px;
                    }
                }
            `}</style>
        </div>
    );
}
