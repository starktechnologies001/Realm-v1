import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAvatar2D } from '../utils/avatarUtils';


export default function UserProfileCard({ user, onClose, onAction, currentUser }) {
    if (!user) return null;

    // Debug: Log user data to see what's available
    console.log('🔵 [UserProfileCard] User data:', user);
    console.log('🔵 [UserProfileCard] Avatar:', user.avatar);
    console.log('🔵 [UserProfileCard] Avatar URL:', user.avatar_url);

    // Get the avatar URL and convert GLB to PNG if needed
    const avatarUrl = user.avatar || user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.name)}`;
    const displayAvatar = getAvatar2D(avatarUrl);
    console.log('🔵 [UserProfileCard] Display Avatar:', displayAvatar);
    console.log('🔵 [UserProfileCard] hide_status:', user.hide_status);
    console.log('🔵 [UserProfileCard] FULL USER OBJECT:', user);

    // Privacy logic: Can show last seen if BOTH users have show_last_seen enabled
    const canShowLastSeen = (user.show_last_seen !== false) && (currentUser?.show_last_seen !== false);

    // Calculate time since active
    const getLastActive = (dateStr) => {
        if (!dateStr) return 'Offline';
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Online';
        
        // If privacy is disabled, don't show "last seen" times
        if (!canShowLastSeen) {
            return null; // Hide status completely
        }
        
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
                                src={displayAvatar} 
                                alt={user.name} 
                                className="avatar-large"
                            />
                            <div className={`status-dot ${user.isLocationOn ? 'online' : 'offline'}`} />
                        </div>
                        
                        <div className="user-info-area">
                            <h2 onClick={() => onAction('view-profile', user)} style={{ cursor: 'pointer' }}>
                                {user.name} 
                                {user.email_verified && (
                                    <span className="verified-badge" title="Email Verified">
                                        ✔ Verified
                                    </span>
                                )}
                                <span>›</span>
                            </h2>
                            <div className="badges-row">
                                {user.friendshipStatus === 'accepted' && (
                                    <span className="badge-pill status" style={{ background: 'rgba(52, 199, 89, 0.2)', color: '#34c759', border: '1px solid rgba(52, 199, 89, 0.3)' }}>
                                        🤝 Friend
                                    </span>
                                )}
                                {!user.hide_status && <span className="badge-pill status">{user.status || 'Available'}</span>}
                                {(() => {
                                    const lastActive = getLastActive(user.lastActive);
                                    // Always show if Online, otherwise respect privacy
                                    if (lastActive === 'Online' || (canShowLastSeen && lastActive)) {
                                        return <span className="badge-pill active-time">{lastActive}</span>;
                                    }
                                    return null;
                                })()}
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
                        top: 0; left: 0; right: 0; bottom: 80px;
                        background: rgba(0,0,0,0.6);
                        backdrop-filter: blur(8px);
                        -webkit-backdrop-filter: blur(8px);
                        z-index: 2000;
                        display: flex;
                        justify-content: center;
                        align-items: flex-end;
                    }

                    .glass-panel {
                        background: linear-gradient(180deg, rgba(28, 28, 30, 0.98) 0%, rgba(20, 20, 22, 0.98) 100%);
                        backdrop-filter: blur(40px) saturate(180%);
                        -webkit-backdrop-filter: blur(40px) saturate(180%);
                        border-top: 1px solid rgba(255, 255, 255, 0.15);
                        border-left: 1px solid rgba(255, 255, 255, 0.08);
                        border-right: 1px solid rgba(255, 255, 255, 0.08);
                        box-shadow: 
                            0 -20px 60px rgba(0,0,0,0.6),
                            0 -1px 0 rgba(255,255,255,0.1) inset;
                    }

                    .user-profile-card {
                        width: 100%;
                        max-width: 500px;
                        border-radius: 28px 28px 0 0;
                        padding: 24px 20px 32px;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 24px;
                        position: relative;
                    }

                    .card-drag-handle {
                        width: 48px;
                        height: 5px;
                        background: rgba(255,255,255,0.25);
                        border-radius: 3px;
                        margin-bottom: 12px;
                        box-shadow: 0 1px 2px rgba(0,0,0,0.2);
                    }

                    .card-header {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 16px;
                        width: 100%;
                    }

                    .avatar-large-container {
                        position: relative;
                        padding: 5px;
                        background: linear-gradient(135deg, rgba(0, 212, 255, 0.2) 0%, rgba(0, 114, 255, 0.2) 100%);
                        border-radius: 50%;
                        box-shadow: 0 8px 24px rgba(0, 132, 255, 0.25);
                        cursor: pointer;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    }
                    
                    .avatar-large-container:hover {
                        transform: scale(1.05);
                        box-shadow: 0 12px 32px rgba(0, 132, 255, 0.35);
                    }

                    .avatar-large {
                        width: 110px;
                        height: 110px;
                        border-radius: 50%;
                        object-fit: cover;
                        border: 4px solid rgba(0,0,0,0.3);
                        background: linear-gradient(135deg, #2a2a2e 0%, #1a1a1e 100%);
                        box-shadow: 0 4px 16px rgba(0,0,0,0.3);
                    }

                    .status-dot {
                        position: absolute;
                        bottom: 10px;
                        right: 10px;
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        border: 4px solid rgba(28, 28, 30, 0.95);
                        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                    }
                    .status-dot.online { 
                        background: linear-gradient(135deg, #00ff88 0%, #00cc66 100%);
                        box-shadow: 0 0 12px rgba(0,255,136,0.8), 0 2px 8px rgba(0,0,0,0.4);
                        animation: pulse 2s ease-in-out infinite;
                    }
                    .status-dot.offline { 
                        background: linear-gradient(135deg, #666 0%, #555 100%);
                    }
                    
                    @keyframes pulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.7; }
                    }

                    .user-info-area { 
                        text-align: center;
                        width: 100%;
                    }
                    
                    .user-info-area h2 {
                        margin: 0;
                        font-size: 1.75rem;
                        color: white;
                        font-weight: 700;
                        letter-spacing: -0.5px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                    }
                    
                    .user-info-area h2 span {
                        color: rgba(255,255,255,0.4);
                        font-size: 1.5rem;
                    }

                    .verified-badge {
                        display: inline-flex;
                        align-items: center;
                        gap: 4px;
                        font-size: 0.75rem;
                        font-weight: 600;
                        color: #0084ff;
                        background: rgba(0, 132, 255, 0.15);
                        padding: 4px 10px;
                        border-radius: 12px;
                        border: 1px solid rgba(0, 132, 255, 0.3);
                        margin-left: 8px;
                        letter-spacing: 0.3px;
                    }

                    .badges-row {
                        display: flex;
                        justify-content: center;
                        gap: 10px;
                        margin-top: 12px;
                        flex-wrap: wrap;
                    }

                    .badge-pill {
                        font-size: 0.8rem;
                        padding: 6px 14px;
                        border-radius: 14px;
                        font-weight: 600;
                        transition: all 0.2s;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                    }
                    
                    .badge-pill.status {
                        background: linear-gradient(135deg, rgba(0, 212, 255, 0.15) 0%, rgba(0, 132, 255, 0.15) 100%);
                        color: #00d4ff;
                        border: 1px solid rgba(0, 212, 255, 0.3);
                    }
                    
                    .badge-pill.active-time {
                        background: rgba(255, 255, 255, 0.08);
                        color: #aaa;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                    }
                    
                    .view-profile-sm {
                        background: rgba(255,255,255,0.05);
                        border: 1.5px solid rgba(255,255,255,0.15);
                        color: #ddd;
                        padding: 8px 18px;
                        border-radius: 24px;
                        font-size: 0.85rem;
                        font-weight: 600;
                        cursor: pointer;
                        margin-top: 14px;
                        transition: all 0.2s;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                    }
                    
                    .view-profile-sm:hover {
                        border-color: rgba(0, 212, 255, 0.5);
                        color: #00d4ff;
                        background: rgba(0, 212, 255, 0.1);
                        transform: translateY(-1px);
                        box-shadow: 0 4px 12px rgba(0, 212, 255, 0.2);
                    }

                    .thought-bubble-large {
                        background: linear-gradient(135deg, #ffffff 0%, #f5f5f5 100%);
                        color: #1a1a1a;
                        padding: 14px 20px;
                        border-radius: 18px;
                        font-weight: 600;
                        font-size: 1rem;
                        position: relative;
                        box-shadow: 0 6px 20px rgba(0,0,0,0.25);
                        max-width: 90%;
                        line-height: 1.5;
                    }
                    
                    .thought-bubble-large::after {
                        content: '';
                        position: absolute;
                        top: -8px;
                        left: 50%;
                        transform: translateX(-50%);
                        border-width: 0 8px 8px;
                        border-style: solid;
                        border-color: transparent transparent #ffffff;
                        filter: drop-shadow(0 -2px 2px rgba(0,0,0,0.1));
                    }

                    .action-grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr 1fr 1fr;
                        gap: 12px;
                        width: 100%;
                        margin-top: 8px;
                    }

                    .action-btn {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 16px 12px;
                        border-radius: 18px;
                        border: none;
                        background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.05) 100%);
                        color: white;
                        cursor: pointer;
                        gap: 8px;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        border: 1px solid rgba(255,255,255,0.1);
                        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                        position: relative;
                        overflow: hidden;
                    }
                    
                    .action-btn::before {
                        content: '';
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        height: 1px;
                        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
                    }
                    
                    .action-btn:hover {
                        transform: translateY(-2px);
                        background: linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.08) 100%);
                        box-shadow: 0 4px 16px rgba(0,0,0,0.3);
                        border-color: rgba(255,255,255,0.15);
                    }
                    
                    .action-btn:active {
                        transform: translateY(0) scale(0.95);
                    }
                    
                    .action-btn .icon {
                        font-size: 1.75rem;
                        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
                    }
                    
                    .action-btn .label {
                        font-size: 0.8rem;
                        font-weight: 600;
                        opacity: 0.9;
                        letter-spacing: 0.2px;
                    }

                    .primary-action {
                        background: linear-gradient(135deg, #00d4ff 0%, #0084ff 100%);
                        box-shadow: 0 4px 16px rgba(0, 132, 255, 0.4);
                        border-color: rgba(0, 212, 255, 0.3);
                    }
                    
                    .primary-action:hover {
                        background: linear-gradient(135deg, #00e0ff 0%, #0090ff 100%);
                        box-shadow: 0 6px 24px rgba(0, 132, 255, 0.5);
                        transform: translateY(-3px);
                    }
                    
                    .danger {
                        color: #ff6b6b;
                        background: linear-gradient(135deg, rgba(255, 69, 58, 0.15) 0%, rgba(255, 69, 58, 0.1) 100%);
                        border-color: rgba(255, 69, 58, 0.25);
                    }
                    
                    .danger:hover {
                        background: linear-gradient(135deg, rgba(255, 69, 58, 0.25) 0%, rgba(255, 69, 58, 0.15) 100%);
                        border-color: rgba(255, 69, 58, 0.4);
                    }
                `}</style>
            </motion.div>
        </AnimatePresence>
    );
}
