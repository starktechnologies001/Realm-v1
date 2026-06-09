import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getAvatar2D } from '../utils/avatarUtils';
import { calculateDistance } from '../utils/distanceUtils';
import { canViewStatus, hasActiveStatus, getStatusRingClass, getAvatarTapAction } from '../utils/statusUtils';
import { nearbyLabel } from '../utils/locationPrivacy';


export default function MapProfileCard({ user, onClose, onAction, currentUser, userLocation }) {
    if (!user) return null;
    const navigate = useNavigate();

    // Get the avatar URL and convert GLB to PNG if needed
    const displayAvatar = getAvatar2D(user.avatar || user.avatar_url);

    // Privacy Logic hierarchy
    const isOwner = currentUser?.id === user.id;
    const isFriend = user.friendshipStatus === 'accepted';
    const isPublic = user.is_public !== false; // Default to public if undefined
    const canViewDetails = isOwner || isFriend || isPublic;

    // Check if the thought has expired (3 hours)
    const thoughtText = user.thought || user.status_message;
    const thoughtTime = user.thoughtTime || user.status_updated_at || user.statusUpdatedAt;
    const isThoughtExpired = thoughtText && thoughtTime && (new Date(thoughtTime).getTime() < Date.now() - 3 * 60 * 60 * 1000);
    const displayThought = isThoughtExpired ? null : thoughtText;

    // Privacy logic: Can show last seen if BOTH users have show_last_seen enabled AND privacy allows
    const canShowLastSeen = canViewDetails && (user.show_last_seen !== false) && (currentUser?.show_last_seen !== false);

    const getLastActive = (dateStr) => {
        if (!dateStr) return null;
        const diff = Date.now() - new Date(dateStr).getTime();
        if (diff < 5 * 60 * 1000) return 'Active now';
        if (diff < 60 * 60 * 1000 && canShowLastSeen) return 'Recently active';
        return null;
    };

    // Calculate Distance — prefer live GPS coords from userLocation, fall back to DB
    const myLat = userLocation?.lat ?? currentUser?.latitude;
    const myLng = userLocation?.lng ?? currentUser?.longitude;
    const theirLat = user.lat || user.latitude;
    const theirLng = user.lng || user.longitude;
    const distanceMeters = calculateDistance(myLat, myLng, theirLat, theirLng);

    // Show a fuzzy "nearby" label — never an exact distance
    const distanceStr = distanceMeters != null ? nearbyLabel(distanceMeters) : null;

    // Interaction States
    const [isFullPhoto, setIsFullPhoto] = useState(false);
    const [showContextMenu, setShowContextMenu] = useState(false);
    

    // Long Press Logic
    const longPressTimer = useRef(null);
    const isLongPress = useRef(false);

    const startPress = useCallback((e) => {
        isLongPress.current = false;
        longPressTimer.current = setTimeout(() => {
            isLongPress.current = true;
            setShowContextMenu(true);
            // Haptic feedback
            if (window.navigator?.vibrate) window.navigator.vibrate(50);
        }, 1000); // 1000ms (1 second) for long press
    }, []);

    const endPress = useCallback((e) => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
        
        if (isLongPress.current) {
            // Was a long press, menu already triggered
            console.log('👆 [MapProfileCard] Was long press, ignoring');
            isLongPress.current = false;
            return;
        }

        // Single Tap Logic - Refined based on status availability
        const tapAction = getAvatarTapAction(user, currentUser);
        
        if (tapAction === 'view-status') {
            // User has status and viewer can see it
            onAction('view-story', user);
        } else {
            // No status or viewer cannot see it - show full-screen photo
            console.log('👆 [MapProfileCard] Showing full-screen photo');
            setTimeout(() => {
                setIsFullPhoto(true);
            }, 0);
        }
    }, [user, canViewDetails, onAction, setIsFullPhoto]);

    const cancelPress = useCallback(() => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }, []);


    return (
        <AnimatePresence>
            <motion.div 
                className="user-profile-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={(e) => {
                    // If clicking the overlay background, close everything
                    if (e.target === e.currentTarget) onClose();
                }}
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
                        {/* Avatar with Interaction Hooks */}
                        <div 
                            className={`avatar-large-container ${getStatusRingClass(user, currentUser)}`}
                            onMouseDown={(e) => {
                                e.stopPropagation();
                                startPress(e);
                            }}
                            onMouseUp={(e) => {
                                e.stopPropagation();
                                endPress(e);
                            }}
                            onMouseLeave={cancelPress}
                            onTouchStart={(e) => {
                                e.stopPropagation();
                                startPress(e);
                            }}
                            onTouchEnd={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                endPress(e);
                            }}
                            onTouchMove={cancelPress} // Cancel if scrolling
                            style={{ position: 'relative' }} /* For context menu anchoring */
                        >
                            <img 
                                src={displayAvatar} 
                                alt={user.username || user.name} 
                                className="avatar-large"
                                style={{ filter: 'none', pointerEvents: 'none' }} 
                            />


                            {/* Context Menu Popup (Anchored to Avatar) */}
                            <AnimatePresence>
                                {showContextMenu && (
                                    <motion.div 
                                        className="avatar-context-menu"
                                        initial={{ opacity: 0, scale: 0.8, y: 10 }}
                                        animate={{ opacity: 1, scale: 1, y: -80 }}
                                        exit={{ opacity: 0, scale: 0.8, y: 10 }}
                                        onClick={(e) => e.stopPropagation()}
                                        onMouseUp={(e) => e.stopPropagation()}
                                        onTouchEnd={(e) => e.stopPropagation()}
                                    >
                                        {canViewStatus(currentUser, user) && (
                                            <>
                                            <button onClick={(e) => {
                                                e.stopPropagation();
                                                onAction('view-story', user); // Show uploaded status
                                                setShowContextMenu(false);
                                            }}>
                                                See Status
                                            </button>
                                            <div className="menu-divider" />
                                            </>
                                        )}
                                        <button onClick={(e) => {
                                            e.stopPropagation();
                                            setIsFullPhoto(true); // Show profile photo in zoom
                                            setShowContextMenu(false);
                                        }}>
                                            See Profile Photo
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
        
                        {/* Backdrop for closing context menu */}
                        {showContextMenu && (
                            <div className="context-menu-backdrop" onClick={(e) => {
                                e.stopPropagation();
                                setShowContextMenu(false);
                            }} />
                        )}

                        <div className="user-info-area">
                            <h2 style={{ cursor: 'default' }}>
                                {user.username || user.name} 
                                {user.email_verified && (
                                    <span className="verified-badge" title="Email Verified">
                                        ✔ Verified
                                    </span>
                                )}
                                {/* Mood emoji — shown if set and not expired (6h) */}
                                {(() => {
                                    if (!user.mood || !user.moodUpdatedAt) return null;
                                    const isExpired = new Date(user.moodUpdatedAt).getTime() < Date.now() - 6 * 60 * 60 * 1000;
                                    if (isExpired) return null;
                                    return (
                                        <span 
                                            title="Mood"
                                            style={{ fontSize: '1.4rem', marginLeft: '6px', verticalAlign: 'middle' }}
                                        >
                                            {user.mood}
                                        </span>
                                    );
                                })()}
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
                                        {!user.hide_status && user.relationshipStatus && (
                                            <span className="badge-pill status" style={{ background: 'rgba(255, 105, 180, 0.15)', color: '#ff69b4', border: '1px solid rgba(255, 105, 180, 0.3)' }}>
                                                {user.relationshipStatus}
                                            </span>
                                        )}
                                        {/* Unified presence badge — Online OR last-seen, never both */}
                                        {(() => {
                                            if (!user.lastActive) return null;
                                            const diffMs = Date.now() - new Date(user.lastActive).getTime();
                                            const isOnline = diffMs < 5 * 60 * 1000; // online if active in last 5 min

                                            if (isOnline) {
                                                return (
                                                    <span className="badge-pill active-time" style={{ background: 'rgba(0,255,136,0.15)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.3)' }}>
                                                        🟢 Active now
                                                    </span>
                                                );
                                            }

                                            const isRecentlyActive = diffMs < 60 * 60 * 1000; // recently active if in last 60 min
                                            if (isRecentlyActive && canShowLastSeen) {
                                                return (
                                                    <span className="badge-pill active-time" style={{ background: 'rgba(255,165,0,0.15)', color: '#ffa500', border: '1px solid rgba(255,165,0,0.3)' }}>
                                                        ⏱ Recently active
                                                    </span>
                                                );
                                            }

                                            return null;
                                        })()}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {canViewDetails && displayThought && (
                        <div className="thought-bubble-large">
                            {displayThought}
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

                        <button 
                            className="action-btn"
                            onClick={() => {
                                onClose();
                                navigate(`/profile/${user.id}`);
                            }}
                        >
                            <span className="icon">👤</span>
                            <span className="label">Profile</span>
                        </button>
                        
                         <button 
                            className="action-btn secondary-action danger"
                            onClick={() => onAction('block', user)}
                        >
                            <span className="icon">🚫</span>
                            <span className="label">Block</span>
                        </button>

                        {distanceStr && (
                            <div
                                className="action-btn"
                                style={{ cursor: 'default', background: 'rgba(255,200,0,0.1)', border: '1px solid rgba(255,200,0,0.25)' }}
                            >
                                <span className="icon">📍</span>
                                <span className="label" style={{ color: '#FFD700', fontVariantNumeric: 'tabular-nums' }}>{distanceStr}</span>
                            </div>
                        )}
                    </div>

                </motion.div>
                
                {/* Full Screen Photo Overlay */}
                <AnimatePresence>
                    {isFullPhoto && (
                        <motion.div 
                            className="full-photo-overlay"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsFullPhoto(false)}
                        >
                            <motion.img 
                                src={displayAvatar} 
                                alt={user.username || user.name}
                                className="full-screen-image"
                                initial={{ scale: 0.5, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.5, opacity: 0 }}
                                transition={{ type: "spring", damping: 20, stiffness: 200 }}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                <style>{`
                    .user-profile-overlay {
                        position: fixed;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(0,0,0,0.4);
                        backdrop-filter: blur(10px);
                        -webkit-backdrop-filter: blur(10px);
                        z-index: 2500;
                        display: flex;
                        justify-content: center;
                        align-items: flex-end;
                    }
                    
                    .avatar-context-menu {
                        position: absolute;
                        top: -60px; /* Moves up */
                        left: 50%;
                        transform: translateX(-50%);
                        background: var(--bg-color);
                        border: 1px solid var(--glass-border);
                        border-radius: 16px;
                        padding: 6px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.25);
                        display: flex;
                        flex-direction: column;
                        min-width: 150px;
                        z-index: 3000;
                    }
                    .avatar-context-menu button {
                        background: none;
                        border: none;
                        padding: 10px 14px;
                        text-align: left;
                        width: 100%;
                        cursor: pointer;
                        font-weight: 600;
                        color: var(--text-primary);
                        font-size: 0.9rem;
                        border-radius: 10px;
                        transition: background 0.15s;
                    }
                    .avatar-context-menu button:hover { background: var(--bg-secondary); }
                    .menu-divider { height: 1px; background: var(--glass-border); margin: 4px 0; }
                    .menu-status-text {
                        padding: 8px 14px;
                        font-size: 0.8rem;
                        color: var(--text-secondary);
                        font-style: italic;
                        text-align: center;
                    }
                    
                    .context-menu-backdrop {
                        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                        z-index: 2500;
                    }

                    .full-photo-overlay {
                        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(0,0,0,0.92);
                        backdrop-filter: blur(20px);
                        z-index: 5000;
                        display: flex; flex-direction: column;
                        justify-content: center; align-items: center;
                    }
                    .full-screen-image {
                        width: 80vw; height: 80vw; max-width: 400px; max-height: 400px;
                        border-radius: 50%;
                        object-fit: cover;
                        box-shadow: 0 20px 80px rgba(0,0,0,0.7);
                        border: 3.5px solid rgba(255,255,255,0.2);
                    }
                    .full-photo-status {
                        margin-top: 30px;
                        background: var(--glass-bg);
                        color: var(--text-primary);
                        padding: 10px 24px;
                        border-radius: 30px;
                        font-size: 1.1rem;
                        font-weight: 500;
                        border: 1px solid var(--glass-border);
                        backdrop-filter: blur(10px);
                    }

                    .user-profile-card {
                        width: 100%;
                        max-width: 500px;
                        border-radius: 32px 32px 0 0;
                        padding: 24px 20px calc(24px + env(safe-area-inset-bottom));
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 20px;
                        position: relative;
                        background: linear-gradient(135deg, rgba(28, 28, 30, 0.96), rgba(18, 18, 20, 0.98));
                        backdrop-filter: blur(30px);
                        -webkit-backdrop-filter: blur(30px);
                        border: 1px solid rgba(255, 255, 255, 0.08);
                        border-bottom: none;
                        box-shadow: 0 -12px 40px rgba(0,0,0,0.45);
                    }

                    .card-drag-handle {
                        width: 36px; height: 5px;
                        background: var(--text-secondary);
                        opacity: 0.3;
                        border-radius: 100px;
                        margin-bottom: 4px;
                    }

                    .card-header {
                        display: flex; flex-direction: column; align-items: center; gap: 14px; width: 100%;
                    }

                    .avatar-large-container {
                        position: relative;
                        width: 96px; height: 96px;
                        padding: 0;
                        background: none;
                        border-radius: 50%;
                        cursor: pointer;
                        display: flex; justify-content: center; align-items: center;
                        -webkit-user-select: none;
                        user-select: none;
                        -webkit-touch-callout: none;
                        border: none !important; 
                        box-shadow: none !important;
                    }
                    
                    /* The Actual Ring - Pseudo Element */
                    .avatar-large-container::after {
                        content: '';
                        position: absolute;
                        inset: -6px;
                        border-radius: 50%;
                        border: 3px solid transparent;
                        pointer-events: none;
                        box-sizing: border-box;
                        z-index: 1;
                    }

                    .avatar-large-container.status-ring-active::after {
                        border-color: #0084ff;
                        box-shadow: 0 0 15px rgba(0, 132, 255, 0.4);
                        animation: pulse-ring 2s infinite;
                    }
                    
                    .avatar-large-container.status-ring-viewed::after {
                        border-color: var(--text-secondary);
                        border-color: rgba(255, 255, 255, 0.5);
                        opacity: 0.5;
                        box-shadow: 0 0 8px rgba(0,0,0,0.05);
                    }

                    .avatar-large-container.status-ring-default::after {
                        border-color: transparent;
                    }
                    
                    /* Image Styling - Inner Ring */
                    .avatar-large {
                        width: 100%; height: 100%; 
                        border-radius: 50%; 
                        object-fit: cover;
                        border: 3.5px solid #1e1e23;
                        position: relative;
                        z-index: 2;
                    }

                    .status-dot {
                        position: absolute; bottom: 4px; right: 4px;
                        width: 20px; height: 20px;
                        border-radius: 50%; border: 3.5px solid #1e1e23;
                        z-index: 2;
                    }
                    .status-dot.online { background: #34C759; box-shadow: 0 0 8px rgba(52,199,89,0.5); }
                    .status-dot.offline { background: #8e8e93; }

                    .user-info-area h2 {
                        margin: 0; font-size: 1.5rem; color: #ffffff; font-weight: 700;
                        display: flex; align-items: center; justify-content: center; gap: 6px;
                    }
                    .user-info-area h2 span { color: rgba(255, 255, 255, 0.6); font-size: 1.2rem; }

                    .badges-row {
                        display: flex; justify-content: center; gap: 8px; margin-top: 14px;
                    }
                    .badge-pill {
                        font-size: 0.78rem; padding: 6px 14px; border-radius: 100px;
                        font-weight: 600; background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.7);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                    }
                    .badge-pill.status { 
                        background: rgba(0, 132, 255, 0.12); color: #38a1ff; border: 1px solid rgba(0, 132, 255, 0.25); 
                    }
 
                    .thought-bubble-large {
                        background: #ffffff; color: #1c1c1e; padding: 12px 18px; border-radius: 18px;
                        font-weight: 600; position: relative; max-width: 90%; text-align: center;
                        font-size: 0.92rem;
                        box-shadow: 0 6px 16px rgba(0,0,0,0.25);
                    }
                    .thought-bubble-large::after {
                        content: ''; position: absolute; top: -6px; left: 50%; transform: translateX(-50%);
                        border-width: 0 8px 8px; border-style: solid; border-color: transparent transparent #ffffff;
                    }

                    /* 4-Column Grid for Buttons */
                    .action-grid {
                        display: grid;
                        grid-template-columns: repeat(4, 1fr);
                        gap: 10px;
                        width: 100%;
                        margin-top: 8px;
                    }

                    .action-btn {
                        display: flex; flex-direction: column; align-items: center; justify-content: center;
                        aspect-ratio: 1;
                        border-radius: 20px;
                        border: 1px solid rgba(255, 255, 255, 0.08);
                        background: rgba(255, 255, 255, 0.08);
                        color: #ffffff;
                        cursor: pointer;
                        transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
                        padding: 0;
                        gap: 6px;
                    }

                    .action-btn:hover {
                        transform: translateY(-2px);
                        background: rgba(255, 255, 255, 0.15);
                        border-color: rgba(255, 255, 255, 0.15);
                    }
                    .action-btn:active { transform: scale(0.95); }

                    .action-btn .icon { font-size: 24px; line-height: 1; }
                    .action-btn .label { font-size: 11px; font-weight: 700; letter-spacing: 0.1px; color: rgba(255, 255, 255, 0.65); }

                    /* Button Specific Styles */
                    
                    /* Primary (Message) - Brand Gradient */
                    .primary-action {
                        background: linear-gradient(135deg, #0084ff 0%, #00d4ff 100%);
                        border: none;
                        box-shadow: 0 6px 18px rgba(0, 132, 255, 0.25);
                        color: white !important;
                    }
                    .primary-action .label { color: rgba(255,255,255,0.9) !important; }
                    .primary-action .icon { color: white; }

                    /* Danger (Block/Report) - Red tint */
                    .danger {
                        background: rgba(255, 59, 48, 0.12);
                        border-color: rgba(255, 59, 48, 0.25);
                        color: #ff453a;
                    }
                    .danger .label { color: #ff453a; }
                    .danger .icon { color: #ff453a; }

                    /* Mobile: shrink card to fit screen */
                    @media (max-width: 480px) {
                        .user-profile-card {
                            padding: 20px 16px calc(20px + env(safe-area-inset-bottom));
                            gap: 16px;
                        }
                        .avatar-large-container {
                            width: 80px; height: 80px;
                        }
                        .user-info-area h2 {
                            font-size: 1.3rem;
                        }
                        .user-info-area h2 span {
                            font-size: 1.1rem;
                        }
                        .action-grid {
                            gap: 8px;
                            margin-top: 4px;
                        }
                        .action-btn .icon { font-size: 20px; }
                        .action-btn .label { font-size: 10px; }
                        .badge-pill { font-size: 0.72rem; padding: 4px 12px; }
                        .thought-bubble-large { padding: 10px 14px; font-size: 0.88rem; }
                    }
                    
                `}</style>
            </motion.div>
        </AnimatePresence>
    );
}
