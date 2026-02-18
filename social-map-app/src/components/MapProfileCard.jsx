import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getAvatar2D } from '../utils/avatarUtils';
import { calculateDistance, formatDistance } from '../utils/distanceUtils';
import { canViewStatus, hasActiveStatus, getStatusRingClass, getAvatarTapAction } from '../utils/statusUtils';


export default function MapProfileCard({ user, onClose, onAction, currentUser }) {
    if (!user) return null;
    const navigate = useNavigate();

    // Debug: Log user data to see what's available
    console.log('🔵 [MapProfileCard] User data:', user);
    console.log('🔵 [MapProfileCard] Avatar:', user.avatar);
    console.log('🔵 [MapProfileCard] Avatar URL:', user.avatar_url);

    // Get the avatar URL and convert GLB to PNG if needed
    // Use unified utility - user.avatar (from MapHome) should already be processed, but double checking doesn't hurt.
    const displayAvatar = getAvatar2D(user.avatar || user.avatar_url);
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

    // Interaction States
    const [isFullPhoto, setIsFullPhoto] = useState(false);
    const [showContextMenu, setShowContextMenu] = useState(false);
    
    // Debug: Log when isFullPhoto changes
    useEffect(() => {
        console.log('📸 [MapProfileCard] isFullPhoto changed to:', isFullPhoto);
    }, [isFullPhoto]);
    
    // Long Press Logic
    const longPressTimer = useRef(null);
    const isLongPress = useRef(false);

    const startPress = useCallback((e) => {
        // e.preventDefault(); // Prevent ghost clicks? Careful with scrolling.
        isLongPress.current = false;
        longPressTimer.current = setTimeout(() => {
            isLongPress.current = true;
            setShowContextMenu(true);
            // Haptic feedback
            if (window.navigator?.vibrate) window.navigator.vibrate(50);
        }, 1000); // 1000ms (1 second) for long press
    }, []);

    const endPress = useCallback((e) => {
        console.log('👆 [MapProfileCard] endPress called');
        
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
        console.log('👆 [MapProfileCard] Single tap detected');
        
        // Determine action based on status visibility
        const tapAction = getAvatarTapAction(user, currentUser);
        console.log('👆 [MapProfileCard] Tap action:', tapAction);
        
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
                                alt={user.name} 
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
                                        {/* Fallback Status Text if requested, but prompt implies 'See Status' button. Keeping text if no story? Prompt says 'See Status' and 'See Profile' buttons. */} 
                                        {/* If status is text-only (thought), maybe show that? Prompt says 'See Status' -> implies Action. Let's stick to buttons as primary. */}
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

                    {canViewDetails && user.thought && (
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

                         <div 
                            className="action-btn secondary-action"
                            style={{ cursor: 'default', opacity: 0.8 }}
                        >
                            <span className="icon">📍</span>
                            <span className="label">{distanceStr || 'N/A'}</span>
                        </div>
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
                                alt={user.name}
                                className="full-screen-image"
                                initial={{ scale: 0.5, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.5, opacity: 0 }}
                                transition={{ type: "spring", damping: 20, stiffness: 200 }}
                            />
                            
                            {/* Status Overlay in Full View - HIDDEN */}
                            {/* {(user.thought || user.status) && (
                                <motion.div 
                                    className="full-photo-status"
                                    initial={{ y: 20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    delay={0.2}
                                >
                                    {user.thought || user.status}
                                </motion.div>
                            )} */}
                        </motion.div>
                    )}
                </AnimatePresence>

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
                    
                    /* New Styles for Interaction */
                    .avatar-context-menu {
                        position: absolute;
                        top: -60px; /* Moves up */
                        left: 50%;
                        transform: translateX(-50%);
                        background: white;
                        border-radius: 12px;
                        padding: 6px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                        display: flex;
                        flex-direction: column;
                        min-width: 140px;
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
                        color: #1c1c1e;
                        font-size: 0.9rem;
                        border-radius: 8px;
                    }
                    .avatar-context-menu button:hover { background: #f2f2f7; }
                    .menu-divider { height: 1px; background: #e5e5ea; margin: 4px 0; }
                    .menu-status-text {
                        padding: 8px 14px;
                        font-size: 0.8rem;
                        color: #666;
                        font-style: italic;
                        text-align: center;
                    }
                    
                    .context-menu-backdrop {
                        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                        z-index: 2500;
                    }

                    .full-photo-overlay {
                        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(0,0,0,0.95);
                        backdrop-filter: blur(15px);
                        z-index: 5000;
                        display: flex; flex-direction: column;
                        justify-content: center; align-items: center;
                    }
                    .full-screen-image {
                        width: 80vw; height: 80vw; max-width: 400px; max-height: 400px;
                        border-radius: 50%;
                        object-fit: cover;
                        box-shadow: 0 20px 80px rgba(0,0,0,0.8);
                        border: 2px solid rgba(255,255,255,0.1);
                    }
                    .full-photo-status {
                        margin-top: 30px;
                        background: rgba(255,255,255,0.1);
                        color: white;
                        padding: 10px 24px;
                        border-radius: 30px;
                        font-size: 1.1rem;
                        font-weight: 500;
                        border: 1px solid rgba(255,255,255,0.2);
                    }

                    /* ... Existing Styles ... */
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
                        position: relative; /* Keep relative for z-index containment if needed */
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
                        padding: 0; /* Remove padding as using ::after */
                        background: none; /* Let ::after handle bg */
                        border-radius: 50%;
                        cursor: pointer;
                        display: flex; justify-content: center; align-items: center;
                        -webkit-user-select: none;
                        user-select: none;
                        -webkit-touch-callout: none;
                        /* Ensure no border on container itself */
                        border: none !important; 
                        box-shadow: none !important;
                    }
                    
                    /* The Actual Ring - Pseudo Element */
                    .avatar-large-container::after {
                        content: '';
                        position: absolute;
                        inset: -6px; /* Sits outside by 6px */
                        border-radius: 50%;
                        border: 3px solid transparent; /* Default */
                        pointer-events: none;
                        box-sizing: border-box;
                        z-index: 1;
                    }

                    .avatar-large-container.status-ring-active::after {
                        border-color: #4285F4;
                        box-shadow: 0 0 15px rgba(66, 133, 244, 0.5);
                        animation: pulse-ring 2s infinite;
                    }
                    
                    .avatar-large-container.status-ring-viewed::after {
                        border-color: #8e8e93;
                        box-shadow: 0 0 8px rgba(255,255,255,0.1);
                    }

                    .avatar-large-container.status-ring-default::after {
                        border-color: transparent;
                        /* Subtle default */
                    }
                    
                    /* Image Styling - Inner Ring */
                    .avatar-large {
                        width: 100%; height: 100%; 
                        border-radius: 50%; 
                        object-fit: cover;
                        border: 3px solid #1c1c1e; /* Separation from outer ring */
                        position: relative;
                        z-index: 2; /* Image above ring */
                    }

                    .status-dot {
                        position: absolute; bottom: 6px; right: 6px;
                        width: 22px; height: 22px;
                        border-radius: 50%; border: 4px solid #1c1c1e;
                        z-index: 2;
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
                    .action-btn .label { font-size: 12px; font-weight: 600; letter-spacing: 0.3px; color: #aaa; }

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
