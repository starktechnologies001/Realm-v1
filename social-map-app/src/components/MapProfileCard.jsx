import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAvatar2D } from '../utils/avatarUtils';
import { calculateDistance, formatDistance } from '../utils/distanceUtils';


export default function MapProfileCard({ user, onClose, onAction, currentUser }) {
    if (!user) return null;

    // Debug: Log user data to see what's available
    console.log('🔵 [MapProfileCard] User data:', user);
    console.log('🔵 [MapProfileCard] Avatar:', user.avatar);
    console.log('🔵 [MapProfileCard] Avatar URL:', user.avatar_url);

    // Get the avatar URL and convert GLB to PNG if needed
    const avatarUrl = user.avatar || user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.name)}`;
    const displayAvatar = getAvatar2D(avatarUrl);
    console.log('🔵 [MapProfileCard] Display Avatar:', displayAvatar);
    console.log('🔵 [MapProfileCard] hide_status:', user.hide_status);
    console.log('🔵 [MapProfileCard] FULL USER OBJECT:', user);

    // Privacy Logic hierarchy
    const isOwner = currentUser?.id === user.id;
    const isFriend = user.friendshipStatus === 'accepted';
    const isPublic = user.is_public !== false; // Default to public if undefined
    const canViewDetails = isOwner || isFriend || isPublic;

    // Privacy logic: Can show last seen if BOTH users have show_last_seen enabled AND privacy allows
    const canShowLastSeen = canViewDetails && (user.show_last_seen !== false) && (currentUser?.show_last_seen !== false);

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

    // Calculate Distance
    const distanceMeters = calculateDistance(
        currentUser?.latitude, 
        currentUser?.longitude, 
        user.lat || user.latitude, 
        user.lng || user.longitude
    );
    const distanceStr = formatDistance(distanceMeters);

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
                        {/* Avatar - No longer clickable */}
                        <div 
                            className={`avatar-large-container ${user.hasStory ? (user.hasUnseenStory ? 'has-story' : 'has-viewed-story') : ''}`}
                            onClick={() => user.hasStory && onAction('view-story', user)}
                        >
                            <img 
                                src={displayAvatar} 
                                alt={user.name} 
                                className="avatar-large"
                                style={{ filter: canViewDetails ? 'none' : 'blur(5px)' }}
                            />
                            <div className={`status-dot ${user.isLocationOn ? 'online' : 'offline'}`} />
                        </div>
                        
                        <div className="user-info-area">
                            <h2 style={{ cursor: 'default' }}>
                                {user.name} 
                                {user.email_verified && (
                                    <span className="verified-badge" title="Email Verified">
                                        ✔ Verified
                                    </span>
                                )}
                            </h2>
                            <div className="badges-row">
                                {!canViewDetails ? (
                                    <span className="badge-pill status" style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#aaa', border: '1px solid rgba(255,255,255,0.2)' }}>
                                        🔒 Private Profile
                                    </span>
                                ) : (
                                    <>
                                        {user.friendshipStatus === 'accepted' && (
                                            <span className="badge-pill status" style={{ background: 'rgba(0, 212, 255, 0.15)', color: '#00d4ff', border: '1px solid rgba(0, 212, 255, 0.3)' }}>
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
                                    </>
                                )}
                            </div>
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
                            </>
                        ) : (
                            <>
                                {(() => {
                                    // Logic for Pending State
                                    if (user.friendshipStatus === 'pending') {
                                         const isRequester = user.requesterId === currentUser?.id;
                                         if (isRequester) {
                                             return (
                                                <button 
                                                    className="action-btn"
                                                    onClick={() => onAction('cancel-poke', user)}
                                                    style={{ 
                                                        background: 'rgba(255, 149, 0, 0.15)', 
                                                        color: '#FF9500', 
                                                        border: '1px solid rgba(255, 149, 0, 0.3)' 
                                                    }}
                                                >
                                                    <span className="icon">⏳</span>
                                                    <span className="label">Requested</span>
                                                </button>
                                             );
                                         } else {
                                             // I am the receiver -> Show Accept Option (functionally same as poke back logic)
                                             return (
                                                <button 
                                                    className="action-btn primary-action"
                                                    onClick={() => onAction('poke', user)}
                                                    style={{ background: 'linear-gradient(135deg, #34c759 0%, #30b350 100%)' }}
                                                >
                                                    <span className="icon">🤝</span>
                                                    <span className="label">Accept Poke</span>
                                                </button>
                                             );
                                         }
                                    }
                                    
                                    // Default Poke Button
                                    return (
                                        <button 
                                            className="action-btn primary-action"
                                            onClick={() => onAction('poke', user)}
                                        >
                                            <span className="icon">👋</span>
                                            <span className="label">Poke</span>
                                        </button>
                                    );
                                })()}
                            </>
                        )}

                        {/* View Profile Button - Now Second */}
                        {canViewDetails && (
                            <button 
                                className="action-btn"
                                onClick={() => onAction('view-profile', user)}
                            >
                                <span className="icon">👤</span>
                                <span className="label">Profile</span>
                            </button>
                        )}
                        
                         <button 
                            className="action-btn secondary-action danger"
                            onClick={() => onAction('block', user)}
                        >
                            <span className="icon">🚫</span>
                            <span className="label">Block</span>
                        </button>

                         <div 
                            className="action-btn secondary-action"
                            style={{ cursor: 'default', opacity: 0.8 }}
                        >
                            <span className="icon">📍</span>
                            <span className="label">{distanceStr || 'N/A'}</span>
                        </div>
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
                        background: #1c1c1e;
                        border-top: 1px solid rgba(255, 255, 255, 0.15);
                        box-shadow: 0 -20px 60px rgba(0,0,0,0.6);
                    }

                    .user-profile-card {
                        width: 100%;
                        max-width: 500px;
                        border-radius: 32px 32px 0 0;
                        padding: 32px 24px 40px;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 24px;
                    }

                    .card-drag-handle {
                        width: 40px; height: 5px;
                        background: rgba(255,255,255,0.2);
                        border-radius: 100px;
                        margin-bottom: 8px;
                    }

                    .card-header {
                        display: flex; flex-direction: column; align-items: center; gap: 16px; width: 100%;
                    }

                    .avatar-large-container {
                        position: relative;
                        width: 100px; height: 100px;
                        padding: 4px;
                        background: linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.02) 100%);
                        border-radius: 50%;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.5); 
                        cursor: default;
                        display: flex; justify-content: center; align-items: center;
                    }
                    
                    .avatar-large-container.has-story {
                        border: 3px solid #00D4FF; /* Cyan/Blue Ring - UNSEEN */
                        box-shadow: 0 0 20px rgba(0, 212, 255, 0.6), 0 10px 30px rgba(0,0,0,0.5);
                        padding: 2px;
                        background: linear-gradient(180deg, rgba(0, 212, 255, 0.2) 0%, rgba(0, 212, 255, 0.05) 100%);
                        cursor: pointer;
                    }
                    
                    .avatar-large-container.has-viewed-story {
                        border: 3px solid #6e6e73; /* Grey Ring - VIEWED */
                        box-shadow: 0 0 10px rgba(255,255,255,0.1);
                        padding: 2px;
                        background: linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.02) 100%);
                        cursor: pointer;
                    }

                    .avatar-large {
                        width: 100%; height: 100%; border-radius: 50%; object-fit: cover;
                        border: 3px solid #1c1c1e;
                    }

                    .status-dot {
                        position: absolute; bottom: 6px; right: 6px;
                        width: 22px; height: 22px;
                        border-radius: 50%; border: 4px solid #1c1c1e;
                    }
                    .status-dot.online { background: #00ff88; box-shadow: 0 0 10px rgba(0,255,136,0.6); }
                    .status-dot.offline { background: #666; }

                    .user-info-area h2 {
                        margin: 0; font-size: 1.6rem; color: white; font-weight: 700;
                        display: flex; align-items: center; justify-content: center; gap: 6px;
                    }
                    .user-info-area h2 span { color: #666; font-size: 1.4rem; }

                    .badges-row {
                        display: flex; justify-content: center; gap: 8px; margin-top: 12px;
                    }

                    .badge-pill {
                        font-size: 0.8rem; padding: 6px 16px; border-radius: 100px;
                        font-weight: 600; background: rgba(255,255,255,0.1); color: #aaa;
                    }
                    .badge-pill.status { 
                        background: rgba(0, 212, 255, 0.15); color: #00d4ff; border: 1px solid rgba(0, 212, 255, 0.2); 
                    }

                    .thought-bubble-large {
                        background: white; color: black; padding: 12px 20px; border-radius: 20px;
                        font-weight: 600; position: relative; max-width: 90%; text-align: center;
                    }
                    .thought-bubble-large::after {
                        content: ''; position: absolute; top: -6px; left: 50%; transform: translateX(-50%);
                        border-width: 0 8px 8px; border-style: solid; border-color: transparent transparent white;
                    }

                    /* 5-Column Grid for Buttons */
                    .action-grid {
                        display: grid;
                        grid-template-columns: repeat(4, 1fr);
                        gap: 10px;
                        width: 100%;
                        margin-top: 12px;
                    }

                    .action-btn {
                        display: flex; flex-direction: column; align-items: center; justify-content: center;
                        aspect-ratio: 1; /* Square shape */
                        border-radius: 16px;
                        border: 1px solid rgba(255,255,255,0.08);
                        background: rgba(255,255,255,0.08); /* Neutral dark default */
                        color: #ccc;
                        cursor: pointer;
                        transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                        padding: 0;
                        gap: 8px;
                    }

                    .action-btn:hover {
                        transform: translateY(-3px);
                        filter: brightness(1.2);
                    }
                    .action-btn:active { transform: scale(0.95); }

                    .action-btn .icon { font-size: 28px; line-height: 1; margin-bottom: 2px; }
                    .action-btn .label { font-size: 11px; font-weight: 600; letter-spacing: 0.3px; color: #aaa; }

                    /* Button Specific Styles */
                    
                    /* Primary (Message) - Blue Glow */
                    .primary-action {
                        background: #0084ff;
                        border: none;
                        box-shadow: 0 4px 20px rgba(0, 132, 255, 0.4);
                        color: white !important;
                    }
                    .primary-action .label { color: rgba(255,255,255,0.95) !important; }
                    .primary-action .icon { color: white; }

                    /* Danger (Block/Report) - Red tint */
                    .danger {
                        background: rgba(255, 59, 48, 0.15);
                        border-color: rgba(255, 59, 48, 0.3);
                        color: #ff453a;
                    }
                    .danger .label { color: #ff453a; }
                    .danger .icon { color: #ff453a; }
                    
                `}</style>
            </motion.div>
        </AnimatePresence>
    );
}
