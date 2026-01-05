import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function UserProfileCard({ user, onClose, onAction }) {
    if (!user) return null;

    // Calculate time since active
    const getLastActive = (dateStr) => {
        if (!dateStr) return 'Offline';
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Online';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        return 'Offline';
    };

    return (
        <AnimatePresence>
            <motion.div 
                className="user-profile-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
            >
                <motion.div 
                    className="user-profile-card glass-panel"
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="card-drag-handle" />
                    
                    <div className="card-header">
                        <div className="avatar-large-container" onClick={() => onAction('view-profile', user)}>
                            <img 
                                src={user.avatar?.replace('size=96', 'size=200')} 
                                alt={user.name} 
                                className="avatar-large"
                            />
                            <div className={`status-dot ${user.isLocationOn ? 'online' : 'offline'}`} />
                        </div>
                        
                        <div className="user-info-area">
                            <h2 onClick={() => onAction('view-profile', user)} style={{ cursor: 'pointer' }}>{user.name} <span>›</span></h2>
                            <div className="badges-row">
                                {user.friendshipStatus === 'accepted' && (
                                    <span className="badge-pill status" style={{ background: 'rgba(52, 199, 89, 0.2)', color: '#34c759', border: '1px solid rgba(52, 199, 89, 0.3)' }}>
                                        🤝 Friend
                                    </span>
                                )}
                                <span className="badge-pill status">{user.status || 'Available'}</span>
                                <span className="badge-pill active-time">{getLastActive(user.lastActive)}</span>
                            </div>
                            {user.friendshipStatus === 'accepted' && (
                                <button className="view-profile-sm" onClick={() => onAction('view-profile', user)}>View Profile</button>
                            )}
                        </div>
                    </div>

                    {user.thought && (
                        <div className="thought-bubble-large">
                            {user.thought}
                        </div>
                    )}

                    <div className="action-grid">
                        {user.friendshipStatus === 'accepted' ? (
                            <>
                                <button 
                                    className="action-btn primary-action"
                                    onClick={() => onAction('message', user)}
                                >
                                    <span className="icon">💬</span>
                                    <span className="label">Message</span>
                                </button>
                                {/* Mute Button */}
                                <button 
                                    className="action-btn secondary-action"
                                    onClick={() => onAction('mute', user)}
                                >
                                    <span className="icon">{user.isMuted ? '🔕' : '🔔'}</span>
                                    <span className="label">{user.isMuted ? 'Unmute' : 'Mute'}</span>
                                </button>
                            </>
                        ) : (
                            <>
                                <button 
                                    className="action-btn primary-action"
                                    onClick={() => onAction('poke', user)}
                                    disabled={user.friendshipStatus === 'pending'}
                                    style={{ opacity: user.friendshipStatus === 'pending' ? 0.6 : 1 }}
                                >
                                    <span className="icon">👋</span>
                                    <span className="label">{user.friendshipStatus === 'pending' ? 'Poke Sent' : 'Poke'}</span>
                                </button>
                                <button 
                                    className="action-btn secondary-action"
                                    onClick={() => onAction('message', user)}
                                    style={{ opacity: 0.5, cursor: 'not-allowed' }}
                                >
                                    <span className="icon">🔒</span>
                                    <span className="label">Message</span>
                                </button>
                            </>
                        )}
                        
                         <button 
                            className="action-btn secondary-action danger"
                            onClick={() => onAction('block', user)}
                        >
                            <span className="icon">🚫</span>
                            <span className="label">Block</span>
                        </button>

                         <button 
                            className="action-btn secondary-action danger"
                            onClick={() => onAction('report', user)}
                        >
                            <span className="icon">⚠️</span>
                            <span className="label">Report</span>
                        </button>
                    </div>

                </motion.div>

                <style>{`
                    .user-profile-overlay {
                        position: fixed;
                        top: 0; left: 0; right: 0; bottom: 80px; /* Above nav */
                        background: rgba(0,0,0,0.4);
                        z-index: 2000;
                        display: flex;
                        justify-content: center;
                        align-items: flex-end;
                    }

                    .glass-panel {
                        background: rgba(20, 20, 20, 0.85);
                        backdrop-filter: blur(20px) saturate(180%);
                        -webkit-backdrop-filter: blur(20px) saturate(180%);
                        border-top: 1px solid rgba(255, 255, 255, 0.1);
                        border-left: 1px solid rgba(255, 255, 255, 0.05);
                        border-right: 1px solid rgba(255, 255, 255, 0.05);
                        box-shadow: 0 -10px 40px rgba(0,0,0,0.5);
                    }

                    .user-profile-card {
                        width: 100%;
                        max-width: 500px;
                        border-radius: 24px 24px 0 0;
                        padding: 20px;
                        padding-bottom: 30px;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 20px;
                        position: relative;
                    }

                    .card-drag-handle {
                        width: 40px;
                        height: 4px;
                        background: rgba(255,255,255,0.2);
                        border-radius: 2px;
                        margin-bottom: 10px;
                    }

                    .card-header {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 12px;
                        width: 100%;
                    }

                    .avatar-large-container {
                        position: relative;
                        padding: 4px;
                        /* Removed gradient usage based on user preference to keep it clean */
                        background: transparent;
                        border-radius: 50%;
                    }

                    .avatar-large {
                        width: 100px;
                        height: 100px;
                        border-radius: 50%;
                        object-fit: cover;
                        border: 3px solid rgba(255,255,255,0.1);
                        background: #1a1a1a;
                    }

                    .status-dot {
                        position: absolute;
                        bottom: 8px;
                        right: 8px;
                        width: 16px;
                        height: 16px;
                        border-radius: 50%;
                        border: 3px solid #1a1a1a;
                    }
                    .status-dot.online { background: #00ff88; box-shadow: 0 0 8px rgba(0,255,136,0.6); }
                    .status-dot.offline { background: #666; }

                    .user-info-area { text-align: center; }
                    .user-info-area h2 {
                        margin: 0;
                        font-size: 1.5rem;
                        color: white;
                        font-weight: 700;
                    }

                    .badges-row {
                        display: flex;
                        justify-content: center;
                        gap: 8px;
                        margin-top: 8px;
                    }

                    .badge-pill {
                        font-size: 0.75rem;
                        padding: 4px 10px;
                        border-radius: 12px;
                        font-weight: 600;
                    }
                    .badge-pill.status {
                        background: rgba(0, 198, 255, 0.1);
                        color: #00d4ff;
                        border: 1px solid rgba(0, 198, 255, 0.2);
                    }
                    .badge-pill.active-time {
                        background: rgba(255, 255, 255, 0.05);
                        color: #aaa;
                    }
                    
                    .view-profile-sm {
                        background: transparent;
                        border: 1px solid rgba(255,255,255,0.2);
                        color: #ccc;
                        padding: 4px 12px;
                        border-radius: 20px;
                        font-size: 0.75rem;
                        cursor: pointer;
                        margin-top: 10px;
                        transition: all 0.2s;
                    }
                    .view-profile-sm:hover {
                        border-color: white; color: white; background: rgba(255,255,255,0.05);
                    }

                    .thought-bubble-large {
                        background: white;
                        color: #111;
                        padding: 10px 16px;
                        border-radius: 16px;
                        font-weight: 600;
                        font-size: 0.95rem;
                        position: relative;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                    }
                    .thought-bubble-large::after {
                        content: '';
                        position: absolute;
                        top: -6px; left: 50%; transform: translateX(-50%);
                        border-width: 0 6px 6px;
                        border-style: solid;
                        border-color: transparent transparent white;
                    }

                    .action-grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr 1fr 1fr;
                        gap: 10px;
                        width: 100%;
                        margin-top: 5px;
                    }

                    .action-btn {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 12px;
                        border-radius: 16px;
                        border: none;
                        background: rgba(255,255,255,0.05);
                        color: white;
                        cursor: pointer;
                        gap: 6px;
                        transition: transform 0.2s, background 0.2s;
                    }
                    .action-btn:active { transform: scale(0.95); }
                    .action-btn .icon { font-size: 1.5rem; }
                    .action-btn .label { font-size: 0.75rem; font-weight: 500; opacity: 0.8; }

                    .primary-action {
                        background: linear-gradient(135deg, #00C6FF, #0072FF);
                        box-shadow: 0 4px 12px rgba(0,114,255,0.3);
                    }
                    .danger {
                         color: #ff6b6b;
                         background: rgba(255, 69, 58, 0.1);
                    }
                `}</style>
            </motion.div>
        </AnimatePresence>
    );
}
