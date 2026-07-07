import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getAvatar2D, DEFAULT_MALE_AVATAR, DEFAULT_FEMALE_AVATAR } from '../utils/avatarUtils';
import { calculateDistance } from '../utils/distanceUtils';
import { canViewStatus, hasActiveStatus, getStatusRingClass, getAvatarTapAction } from '../utils/statusUtils';
import { nearbyLabel, parseThought } from '../utils/locationPrivacy';
import { calculateSmartMatchScore } from '../utils/premiumUtils';
import { getPremiumCustomizations, AvatarAccessories, getUsernameEffectClass } from '../utils/premiumCustomizations.jsx';
import { generateSmartIcebreakers } from '../utils/smartIcebreakers';


export default function MapProfileCard({ user, onClose, onAction, currentUser, userLocation, showToast, reactions = [], onToggleReaction, initialShowReactors = false, friendshipsMapRef, replies = [] }) {
    if (!user) return null;
    const navigate = useNavigate();

    const customizations = getPremiumCustomizations(user);
    const hasMoment = customizations.nearbyMoment && customizations.nearbyMomentExpiresAt && (new Date(customizations.nearbyMomentExpiresAt).getTime() > Date.now());

    // Get the avatar URL and convert GLB to PNG if needed
    const displayAvatar = getAvatar2D(user.avatar || user.avatar_url);

    // Privacy Logic hierarchy
    const isOwner = currentUser?.id === user.id;
    const isFriend = user.friendshipStatus === 'accepted';
    const isPublic = user.is_public !== false; // Default to public if undefined
    const canViewDetails = isOwner || isFriend || isPublic;

    // Check if the thought has expired (3 hours)
    const rawThoughtText = user.thought || user.status_message;
    const parsedThought = parseThought(rawThoughtText);
    const thoughtText = parsedThought.text;
    const thoughtTime = user.thoughtTime || user.status_updated_at || user.statusUpdatedAt;
    const isThoughtExpired = !thoughtText || !thoughtTime || (new Date(thoughtTime).getTime() < Date.now() - 3 * 60 * 60 * 1000);
    const displayThought = isThoughtExpired ? null : thoughtText;

    // Privacy logic: Can show last seen if BOTH users have show_last_seen enabled AND privacy allows
    const canShowLastSeen = canViewDetails && (user.show_last_seen !== false) && (currentUser?.show_last_seen !== false) && !user.hide_last_seen;

    // Calculate if user is online (active in last 5 minutes)
    const userLastActive = user.lastActive || user.last_active || user.last_seen || user.lastSeen;
    const diffMs = userLastActive ? Date.now() - new Date(userLastActive).getTime() : null;
    const isOnline = diffMs != null && !isNaN(diffMs) && diffMs < 5 * 60 * 1000 && !user.hide_online_status && !user.hide_active_status;

    const getLastActiveText = () => {
        if (user.hide_last_seen || user.hide_active_status) return null;
        if (!userLastActive) return null;
        const diff = Date.now() - new Date(userLastActive).getTime();
        if (diff < 5 * 60 * 1000 && !user.hide_online_status) return 'Active now';
        if (!canShowLastSeen) return null;
        
        const diffMins = Math.floor(diff / 60000);
        if (diffMins < 60) return `Active ${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `Active ${diffHours}h ago`;
        const diffDays = Math.floor(diffHours / 24);
        return `Active ${diffDays}d ago`;
    };

    // Calculate Distance — prefer live GPS coords from userLocation, fall back to DB
    const myLat = userLocation?.lat ?? currentUser?.latitude;
    const myLng = userLocation?.lng ?? currentUser?.longitude;
    const theirLat = user.lat || user.latitude;
    const theirLng = user.lng || user.longitude;
    const distanceMeters = calculateDistance(myLat, myLng, theirLat, theirLng);

    // Show a fuzzy "nearby" label — never an exact distance
    const distanceStr = (distanceMeters != null && !user.hide_distance) ? nearbyLabel(distanceMeters) : null;

    // Interaction States
    const [isFullPhoto, setIsFullPhoto] = useState(false);
    const [showContextMenu, setShowContextMenu] = useState(false);
    const [isReplyingToThought, setIsReplyingToThought] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [isSendingReply, setIsSendingReply] = useState(false);

    // Thought Reactions States
    const [showReactorsList, setShowReactorsList] = useState(initialShowReactors);
    const [selectedReactorTab, setSelectedReactorTab] = useState('all');

    // If parent triggers opening the sheet (e.g. via map bubble tap)
    useEffect(() => {
        if (initialShowReactors) {
            if (currentUser?.subscription_tier === 'free') {
                showToast("Upgrade to Silver to see who reacted! 🥈");
                setShowReactorsList(false);
            } else {
                setShowReactorsList(true);
            }
        }
    }, [initialShowReactors, currentUser?.subscription_tier]);

    useEffect(() => {
        if (user && currentUser && user.id !== currentUser.id) {
            import('../utils/premiumUtils').then(({ recordProfileView }) => {
                recordProfileView(user.id, currentUser.id);
            }).catch(err => console.warn(err));
        }
    }, [user?.id, currentUser?.id]);

    const filteredReactors = selectedReactorTab === 'all'
        ? reactions
        : reactions.filter(r => r.reaction_type === selectedReactorTab);

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

    const handleReplySubmit = async (e) => {
        e.preventDefault();
        if (!replyText.trim() || !currentUser) return;

        setIsSendingReply(true);
        try {
            const { supabase } = await import('../supabaseClient');
            
            // Check if there is an existing message request
            const { data: existingRequest } = await supabase
                .from('message_requests')
                .select('status')
                .eq('sender_id', currentUser.id)
                .eq('receiver_id', user.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            const { count: messageCount } = await supabase
                .from('messages')
                .select('id', { count: 'exact', head: true })
                .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${user.id}),and(sender_id.eq.${user.id},receiver_id.eq.${currentUser.id})`);
            
            const hasChatted = (messageCount || 0) > 0;

            const isFriend = user.friendshipStatus === 'accepted';
            const requestAccepted = existingRequest?.status === 'accepted';
            const canChat = isFriend || requestAccepted || hasChatted;

            if (canChat) {
                // Insert into messages
                const messageContent = `Replying to your thought: "${displayThought || ''}"\n\n${replyText.trim()}`;
                
                const { error } = await supabase
                    .from('messages')
                    .insert({
                        sender_id: currentUser.id,
                        receiver_id: user.id,
                        content: messageContent,
                        message_type: 'text',
                        is_read: false,
                        delivery_status: 'sent'
                    });

                if (error) throw error;
                if (showToast) showToast("Reply sent to chat! 💬");
            } else {
                if (existingRequest?.status === 'pending') {
                    throw new Error("You already have a pending request with this user.");
                }
                if (existingRequest?.status === 'rejected') {
                    throw new Error("Your message request was declined. You can only message them if you become friends.");
                }

                // Insert into message_requests
                const { error } = await supabase
                    .from('message_requests')
                    .insert({
                        sender_id: currentUser.id,
                        receiver_id: user.id,
                        content: replyText.trim(),
                        thought_text: displayThought || '',
                        status: 'pending'
                    });

                if (error) {
                    if (error.code === '23505') { // Unique constraint violation
                        throw new Error("You already have a pending request with this user.");
                    }
                    throw error;
                }
                if (showToast) showToast("Message request sent! 📨");
            }
            
            setIsReplyingToThought(false);
            setReplyText('');
        } catch (err) {
            // Suppress expected validation errors from console error logs
            if (!err.message?.includes("already have a pending request") && 
                !err.message?.includes("was declined")) {
                console.error("Error sending reply:", err);
            }
            if (showToast) {
                showToast(err.message || "Failed to send reply");
            } else {
                alert(err.message || "Failed to send reply");
            }
        } finally {
            setIsSendingReply(false);
        }
    };


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
                    className={`user-profile-card glass-panel premium-${user.subscription_tier || 'free'}`}
                    initial={{ y: "100%", scale: (user.subscription_tier === 'diamond' || user.subscription_tier === 'gold') ? 0.97 : 1 }}
                    animate={{ y: 0, scale: 1 }}
                    exit={{ y: "100%", scale: (user.subscription_tier === 'diamond' || user.subscription_tier === 'gold') ? 0.97 : 1 }}
                    transition={{ type: "spring", damping: 25, stiffness: 280 }}
                    onClick={e => e.stopPropagation()}
                >
                    {user.subscription_tier === 'diamond' && (
                        <>
                            <div className="diamond-particles">
                                <span style={{ left: '10%', animationDelay: '0s', animationDuration: '6s' }}></span>
                                <span style={{ left: '30%', animationDelay: '1.5s', animationDuration: '5s' }}></span>
                                <span style={{ left: '55%', animationDelay: '3s', animationDuration: '7s' }}></span>
                                <span style={{ left: '75%', animationDelay: '4.5s', animationDuration: '6s' }}></span>
                                <span style={{ left: '90%', animationDelay: '2s', animationDuration: '8s' }}></span>
                            </div>
                            <div className="vip-label">💎 VIP</div>
                        </>
                    )}
                    
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
                            {/* Render Premium Accessories */}
                            <AvatarAccessories accessory={customizations.avatarAccessory} />
                            {distanceStr && (
                                <div className="avatar-distance-badge">
                                    📍 {distanceStr}
                                </div>
                            )}
                            {canViewDetails && displayThought && (
                                <div className="avatar-floating-thought-bubble">
                                    💬 {displayThought}
                                </div>
                            )}
                            {/* Status Dot */}
                            {!user.hide_online_status && (
                                <div className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
                            )}


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
                                <span className={`username-text ${getUsernameEffectClass(customizations.usernameEffect)}`}>{user.username || user.name}</span>
                                {user.email_verified && (
                                    <span className="verified-badge" title="Email Verified">
                                        ✔ Verified
                                    </span>
                                )}
                                {/* Mood emoji — shown if set and not expired (6h) */}
                                {(() => {
                                    if (!user.mood || !user.moodUpdatedAt || user.hide_mood) return null;
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
                                        {user.subscription_tier === 'silver' && (
                                            <span className="badge-pill status silver" style={{ background: 'rgba(209, 213, 219, 0.15)', color: '#d1d5db', border: '1px solid rgba(209, 213, 219, 0.3)' }}>
                                                🥈 Silver Member
                                            </span>
                                        )}
                                        {user.subscription_tier === 'gold' && (
                                            <span className="badge-pill status gold" style={{ background: 'rgba(250, 204, 21, 0.15)', color: '#facc15', border: '1px solid rgba(250, 204, 21, 0.3)' }}>
                                                🥇 Gold Elite
                                            </span>
                                        )}
                                        {user.subscription_tier === 'diamond' && (
                                            <span className="badge-pill status diamond" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
                                                💎 Diamond Elite
                                            </span>
                                        )}

                                        {/* Active Status Badge */}
                                        {getLastActiveText() && (
                                            <span className="badge-pill status active-now" style={{ background: getLastActiveText() === 'Active now' ? 'rgba(52, 199, 89, 0.15)' : 'rgba(255, 255, 255, 0.08)', color: getLastActiveText() === 'Active now' ? '#34C759' : 'rgba(255, 255, 255, 0.7)', border: getLastActiveText() === 'Active now' ? '1px solid rgba(52, 199, 89, 0.3)' : '1px solid rgba(255, 255, 255, 0.15)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: getLastActiveText() === 'Active now' ? '#34C759' : '#8e8e93', display: 'inline-block' }} />
                                                {getLastActiveText()}
                                            </span>
                                        )}

                                        {/* Relationship Status Badge */}
                                        {(user.relationship_status || user.relationshipStatus) && !(user.hide_relationship_status || user.hideRelationshipStatus) && (
                                            <span className="badge-pill status relationship" style={{ background: 'rgba(244, 63, 94, 0.12)', color: '#fb7185', border: '1px solid rgba(244, 63, 94, 0.25)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                💕 {user.relationship_status || user.relationshipStatus}
                                            </span>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>



                    {/* Active Nearby Moment */}
                    {hasMoment && (
                        <div style={{
                            margin: '12px 16px 0',
                            padding: '10px 14px',
                            borderRadius: '12px',
                            border: '1px solid #00d4ff',
                            background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.12), rgba(0, 0, 0, 0.25))',
                            boxShadow: '0 4px 12px rgba(0, 212, 255, 0.15)',
                            display: 'flex', flexDirection: 'column', gap: '3px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#00d4ff', textTransform: 'uppercase', letterSpacing: '0.6px' }}>📍 Nearby Moment</span>
                                <span style={{ fontSize: '0.62rem', opacity: 0.6 }}>
                                    {Math.round((new Date(customizations.nearbyMomentExpiresAt).getTime() - Date.now()) / 60000)}m left
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                <span style={{ fontSize: '1.2rem' }}>{customizations.nearbyMoment.split(' ')[0]}</span>
                                <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#fff' }}>{customizations.nearbyMoment}</span>
                            </div>
                        </div>
                    )}



                    <div className="action-grid" style={isOwner ? { display: 'flex', justifyContent: 'center' } : {}}>
                        {isOwner ? (
                            <button 
                                className="action-btn primary-action"
                                onClick={() => {
                                    onClose();
                                    navigate(`/profile/${user.id}`);
                                }}
                                style={{ flex: 1, height: '54px', borderRadius: '16px', flexDirection: 'row', gap: '8px', aspectRatio: 'auto' }}
                            >
                                <span className="icon" style={{ fontSize: '20px' }}>👤</span>
                                <span className="label" style={{ fontSize: '14px', color: 'white' }}>View Profile</span>
                            </button>
                        ) : (
                            <>
                                {user.friendshipStatus === 'accepted' ? (
                                    <>
                                        <button 
                                            className="action-btn primary-action"
                                            onClick={() => onAction('message', user)}
                                        >
                                            <span className="icon">💬</span>
                                            <span className="label">Message</span>
                                        </button>
                                        <button 
                                            className="action-btn secondary-action unfriend-btn"
                                            onClick={() => onAction('unfriend', user)}
                                        >
                                            <span className="icon">💔</span>
                                            <span className="label">Unfriend</span>
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
                             </>
                         )}
                    </div>

                </motion.div>

                {/* Reactors List Bottom Sheet Modal */}
                <AnimatePresence>
                    {showReactorsList && (
                        <motion.div
                            className="reactors-bottom-sheet glass-panel"
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 280 }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="sheet-drag-handle" />
                            <div className="sheet-header">
                                <h3>Reactions ({reactions.length})</h3>
                                <button className="sheet-close-btn" onClick={() => setShowReactorsList(false)}>✕</button>
                            </div>

                            {/* Tab Bar */}
                            <div className="sheet-tab-bar">
                                {(() => {
                                    const tabs = ['all', 'love', 'fire', 'laugh', 'clap'];
                                    if (isOwner) {
                                        tabs.push('replies');
                                    }
                                    return tabs.map(tab => {
                                        const emojiMap = { all: 'All', love: '❤️', fire: '🔥', laugh: '😂', clap: '👏', replies: '💬' };
                                        const tabCount = tab === 'all' 
                                            ? reactions.length 
                                            : tab === 'replies'
                                                ? replies.length
                                                : reactions.filter(r => r.reaction_type === tab).length;
                                        return (
                                            <button
                                                key={tab}
                                                className={`sheet-tab-btn ${selectedReactorTab === tab ? 'active' : ''}`}
                                                onClick={() => setSelectedReactorTab(tab)}
                                            >
                                                {emojiMap[tab]} <span className="tab-count">{tabCount}</span>
                                            </button>
                                        );
                                    });
                                })()}
                            </div>

                            {/* Reactors List */}
                            <div className="reactors-list">
                                {(() => {
                                    const emojiMap = { love: '❤️', fire: '🔥', laugh: '😂', clap: '👏' };
                                    const filteredReactors = selectedReactorTab === 'all'
                                        ? reactions
                                        : selectedReactorTab === 'replies'
                                            ? []
                                            : reactions.filter(r => r.reaction_type === selectedReactorTab);

                                    const displayItems = selectedReactorTab === 'replies'
                                        ? replies.map(r => ({
                                            id: r.id,
                                            type: 'reply',
                                            created_at: r.created_at,
                                            user: r.sender || {},
                                            content: r.content
                                        }))
                                        : filteredReactors.map(r => ({
                                            id: r.id,
                                            type: 'reaction',
                                            reaction_type: r.reaction_type,
                                            created_at: r.created_at,
                                            user: r.user || {}
                                        }));

                                    if (displayItems.length === 0) {
                                        return (
                                            <div className="empty-reactors">
                                                {selectedReactorTab === 'replies' ? 'No replies yet' : 'No reactions yet'}
                                            </div>
                                        );
                                    }

                                    return displayItems.map(item => {
                                        const reactorProfile = item.user || {};
                                        const name = reactorProfile.full_name || reactorProfile.username || 'Unknown User';
                                        const username = reactorProfile.username ? `@${reactorProfile.username}` : '';
                                        const reactorAvatar = getAvatar2D(reactorProfile.avatar_url || (reactorProfile.gender === 'Male' ? DEFAULT_MALE_AVATAR : DEFAULT_FEMALE_AVATAR));
                                        
                                        // Calculate time elapsed
                                        const timeElapsedStr = (() => {
                                            if (!item.created_at) return '';
                                            const diff = Date.now() - new Date(item.created_at).getTime();
                                            const mins = Math.floor(diff / 60000);
                                            if (mins < 1) return 'just now';
                                            if (mins < 60) return `${mins}m ago`;
                                            const hours = Math.floor(mins / 60);
                                            if (hours < 24) return `${hours}h ago`;
                                            return `${Math.floor(hours / 24)}d ago`;
                                        })();

                                        const isSelfReactor = reactorProfile.id === currentUser?.id;

                                        // Lookup friendship status
                                        const fData = friendshipsMapRef?.current?.get(reactorProfile.id);
                                        const isFriend = fData?.status === 'accepted';
                                        const isPending = fData?.status === 'pending';
                                        const isRequester = fData?.requesterId === currentUser?.id;

                                        return (
                                            <div key={item.id} className="reactor-item">
                                                <img src={reactorAvatar} alt={name} className="reactor-avatar" />
                                                <div className="reactor-info">
                                                    <div className="reactor-name-row">
                                                        <span className="reactor-name">{name}</span>
                                                        {isFriend && <span className="friends-badge">Friends</span>}
                                                        {item.type === 'reaction' && (
                                                            <span className="reactor-emoji-badge">{emojiMap[item.reaction_type] || '❤️'}</span>
                                                        )}
                                                        {item.type === 'reply' && (
                                                            <span className="reactor-emoji-badge">💬</span>
                                                        )}
                                                    </div>
                                                    <div className="reactor-sub-row">
                                                        {username && username !== `@${name}` && (
                                                            <span className="reactor-username">{username}</span>
                                                        )}
                                                        <span className="reactor-time">{timeElapsedStr}</span>
                                                    </div>
                                                    {item.type === 'reply' && item.content && (
                                                        <div className="reactor-reply-content">
                                                            "{item.content}"
                                                        </div>
                                                    )}
                                                </div>
                                                {!isSelfReactor && (
                                                    <div className="reactor-actions">
                                                        {isFriend ? (
                                                            <button
                                                                className="reactor-msg-btn"
                                                                onClick={() => {
                                                                    setShowReactorsList(false);
                                                                    onClose(); // Close the profile card
                                                                    onAction('message', {
                                                                        id: reactorProfile.id,
                                                                        username: reactorProfile.username,
                                                                        full_name: reactorProfile.full_name,
                                                                        avatar_url: reactorProfile.avatar_url
                                                                    });
                                                                }}
                                                            >
                                                                Message
                                                            </button>
                                                        ) : isPending ? (
                                                            isRequester ? (
                                                                <button
                                                                    className="reactor-requested-btn"
                                                                    onClick={() => {
                                                                        onAction('cancel-poke', {
                                                                            id: reactorProfile.id,
                                                                            name: reactorProfile.full_name || reactorProfile.username || 'User',
                                                                            friendshipId: fData?.id
                                                                        });
                                                                    }}
                                                                >
                                                                    Requested
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    className="reactor-poke-btn"
                                                                    onClick={() => {
                                                                        onAction('poke', {
                                                                            id: reactorProfile.id,
                                                                            name: reactorProfile.full_name || reactorProfile.username || 'User'
                                                                        });
                                                                    }}
                                                                >
                                                                    Poke back
                                                                </button>
                                                            )
                                                        ) : (
                                                            <button
                                                                className="reactor-poke-btn"
                                                                onClick={() => {
                                                                    onAction('poke', {
                                                                        id: reactorProfile.id,
                                                                        name: reactorProfile.full_name || reactorProfile.username || 'User'
                                                                    });
                                                                }}
                                                            >
                                                                Poke
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                
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
                        background: linear-gradient(135deg, rgba(35, 35, 45, 0.96), rgba(20, 20, 25, 0.98));
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
                    
                    .avatar-distance-badge {
                        position: absolute;
                        bottom: -6px;
                        left: 50%;
                        transform: translateX(-50%);
                        background: rgba(255, 204, 0, 0.95);
                        color: #000000;
                        font-weight: 700;
                        font-size: 10px;
                        padding: 3px 8px;
                        border-radius: 100px;
                        white-space: nowrap;
                        box-shadow: 0 4px 10px rgba(0,0,0,0.35);
                        z-index: 10;
                        border: 1.5px solid #1e1e23;
                        pointer-events: none;
                    }

                    .avatar-floating-thought-bubble {
                        position: absolute;
                        top: -14px;
                        right: -75px;
                        background: rgba(22, 22, 26, 0.85);
                        backdrop-filter: blur(12px);
                        -webkit-backdrop-filter: blur(12px);
                        border: 1px solid rgba(0, 198, 255, 0.4);
                        color: white;
                        padding: 6px 12px;
                        border-radius: 16px 16px 16px 4px;
                        font-size: 0.75rem;
                        max-width: 150px;
                        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                        z-index: 10;
                        pointer-events: none; /* Let clicks pass through to avatar tap/press events */
                        white-space: normal;
                        word-break: break-word;
                        text-align: left;
                        line-height: 1.3;
                        animation: bubbleFloat 3s ease-in-out infinite;
                    }

                    @keyframes bubbleFloat {
                        0%, 100% { transform: translateY(0); }
                        50% { transform: translateY(-4px); }
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
                        margin: 0; font-size: 1.5rem;
                        display: flex; align-items: center; justify-content: center; gap: 6px;
                    }
                    .username-text {
                        font-weight: 800;
                        letter-spacing: -0.025em;
                        background: linear-gradient(135deg, #ffffff 40%, #00d4ff 100%);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                    }
                    .verified-badge {
                        background: rgba(0, 132, 255, 0.15);
                        color: #0084ff;
                        font-size: 0.75rem !important;
                        padding: 3px 8px;
                        border-radius: 100px;
                        font-weight: 700;
                        border: 1px solid rgba(0, 132, 255, 0.25);
                        margin-left: 4px;
                    }

                    .badges-row {
                        display: flex; justify-content: center; gap: 8px; margin-top: 24px; flex-wrap: wrap;
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
                        word-wrap: break-word;
                        word-break: break-word;
                        white-space: pre-wrap;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 8px;
                    }
                    .thought-bubble-large::after {
                        content: ''; position: absolute; top: -6px; left: 50%; transform: translateX(-50%);
                        border-width: 0 8px 8px; border-style: solid; border-color: transparent transparent #ffffff;
                    }
                    
                    .thought-section {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        width: 100%;
                        gap: 12px;
                    }
                    
                    .reply-thought-btn {
                        background: rgba(0, 132, 255, 0.1);
                        color: #0084ff;
                        border: none;
                        border-radius: 12px;
                        padding: 4px 12px;
                        font-size: 0.8rem;
                        font-weight: 700;
                        cursor: pointer;
                        margin-top: 4px;
                        transition: background 0.2s;
                    }
                    
                    .reply-thought-btn:hover {
                        background: rgba(0, 132, 255, 0.2);
                    }
                    
                    .thought-reply-form {
                        display: flex;
                        width: 90%;
                        gap: 8px;
                        background: rgba(255, 255, 255, 0.1);
                        padding: 6px;
                        border-radius: 20px;
                        border: 1px solid rgba(255, 255, 255, 0.2);
                    }
                    
                    .thought-reply-form input {
                        flex: 1;
                        background: transparent;
                        border: none;
                        color: white;
                        padding: 8px 12px;
                        outline: none;
                        font-size: 0.9rem;
                    }
                    
                    .thought-reply-form input::placeholder {
                        color: rgba(255, 255, 255, 0.5);
                    }
                    
                    .thought-reply-form button {
                        background: #0084ff;
                        color: white;
                        border: none;
                        border-radius: 16px;
                        padding: 0 16px;
                        font-weight: 600;
                        cursor: pointer;
                    }
                    
                    .thought-reply-form button:disabled {
                        opacity: 0.5;
                        cursor: not-allowed;
                    }

                    /* Flexible Grid for Buttons */
                    .action-grid {
                        display: flex;
                        gap: 10px;
                        width: 100%;
                        margin-top: 8px;
                    }

                    .action-btn {
                        flex: 1;
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

                    /* Unfriend - Warning Orange tint */
                    .unfriend-btn {
                        background: rgba(255, 159, 10, 0.12);
                        border-color: rgba(255, 159, 10, 0.25);
                        color: #ff9f0a;
                    }
                    .unfriend-btn .label { color: #ff9f0a; }
                    .unfriend-btn .icon { color: #ff9f0a; }
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

                    /* Thought Reactions Styling */
                    .thought-reactions-summary {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        margin-top: 8px;
                        cursor: pointer;
                        padding: 6px 12px;
                        border-radius: 12px;
                        background: rgba(255, 255, 255, 0.04);
                        border: 1px solid rgba(255, 255, 255, 0.06);
                        transition: all 0.2s;
                    }
                    .thought-reactions-summary:hover {
                        background: rgba(255, 255, 255, 0.08);
                    }
                    .reaction-summary-pill {
                        font-size: 0.8rem;
                        font-weight: 700;
                        color: var(--text-primary);
                        display: inline-flex;
                        align-items: center;
                        gap: 4px;
                    }

                    .thought-reaction-bar {
                        display: flex;
                        justify-content: center;
                        gap: 10px;
                        width: 100%;
                        margin-top: 12px;
                    }
                    .reaction-pill-btn {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        padding: 8px 16px;
                        border-radius: 20px;
                        border: 1px solid rgba(255, 255, 255, 0.08);
                        background: rgba(255, 255, 255, 0.05);
                        color: var(--text-primary);
                        font-weight: 600;
                        font-size: 0.85rem;
                        cursor: pointer;
                        transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
                    }
                    .reaction-pill-btn:hover {
                        background: rgba(255, 255, 255, 0.12);
                        transform: translateY(-1px);
                    }
                    .reaction-pill-btn.active {
                        background: rgba(138, 43, 226, 0.25);
                        border-color: rgba(138, 43, 226, 0.5);
                        box-shadow: 0 0 12px rgba(138, 43, 226, 0.2);
                    }
                    .reaction-pill-btn.active .reaction-emoji {
                        transform: scale(1.2);
                    }
                    .reaction-emoji {
                        font-size: 1.1rem;
                        transition: transform 0.2s ease;
                    }
                    .reaction-label {
                        font-size: 0.8rem;
                        opacity: 0.8;
                    }

                    /* Bottom Sheet styling */
                    .reactors-bottom-sheet {
                        position: absolute;
                        bottom: 0;
                        left: 0;
                        right: 0;
                        background: #ffffff;
                        color: #000000;
                        border-radius: 24px 24px 0 0;
                        border-top: 1px solid rgba(0, 0, 0, 0.08);
                        box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.15);
                        z-index: 3100;
                        max-height: 75vh;
                        display: flex;
                        flex-direction: column;
                        padding: 16px 20px calc(16px + env(safe-area-inset-bottom));
                    }

                    .sheet-drag-handle {
                        width: 32px;
                        height: 4px;
                        background: rgba(0, 0, 0, 0.1);
                        border-radius: 2px;
                        margin: 0 auto 12px;
                    }

                    .sheet-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 16px;
                    }

                    .sheet-header h3 {
                        margin: 0;
                        font-size: 1.1rem;
                        font-weight: 700;
                        color: #1c1c1e;
                    }

                    .sheet-close-btn {
                        background: none;
                        border: none;
                        color: #8e8e93;
                        font-size: 1.1rem;
                        cursor: pointer;
                        padding: 4px;
                    }

                    .sheet-tab-bar {
                        display: flex;
                        gap: 8px;
                        overflow-x: auto;
                        padding-bottom: 12px;
                        margin-bottom: 12px;
                        border-bottom: 1px solid rgba(0, 0, 0, 0.06);
                    }

                    .sheet-tab-btn {
                        background: #ffffff;
                        border: 1px solid rgba(0, 0, 0, 0.05);
                        color: #8a2be2;
                        padding: 6px 12px;
                        border-radius: 16px;
                        font-size: 0.8rem;
                        font-weight: 600;
                        cursor: pointer;
                        white-space: nowrap;
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        transition: all 0.2s;
                        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
                    }

                    .sheet-tab-btn:hover {
                        background: rgba(138, 43, 226, 0.04);
                    }

                    .sheet-tab-btn.active {
                        background: #8a2be2;
                        border-color: #8a2be2;
                        color: white;
                    }

                    .tab-count {
                        font-size: 0.75rem;
                        font-weight: 700;
                    }

                    .reactors-list {
                        flex: 1;
                        overflow-y: auto;
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                    }

                    .empty-reactors {
                        text-align: center;
                        color: #8e8e93;
                        padding: 20px;
                        font-size: 0.9rem;
                    }

                    .reactor-item {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        padding: 12px 0;
                        border-bottom: 1px solid rgba(0, 0, 0, 0.05);
                    }

                    .reactor-avatar {
                        width: 44px;
                        height: 44px;
                        border-radius: 50%;
                        object-fit: cover;
                        border: 1.5px solid rgba(0, 0, 0, 0.05);
                    }

                    .reactor-info {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        gap: 2px;
                    }

                    .reactor-name-row {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    }

                    .reactor-name {
                        font-weight: 600;
                        font-size: 0.9rem;
                        color: #1c1c1e;
                    }

                    .reactor-emoji-badge {
                        font-size: 0.95rem;
                    }

                    .reactor-time {
                        font-size: 0.75rem;
                        color: #8e8e93;
                    }

                    .reactor-msg-btn, .reactor-poke-btn {
                        background: #f1ebf9;
                        color: #8a2be2;
                        border: none;
                        border-radius: 12px;
                        padding: 6px 12px;
                        font-size: 0.8rem;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .reactor-msg-btn:hover, .reactor-poke-btn:hover {
                        background: #e5daf5;
                    }

                    .reactor-requested-btn {
                        background: #fff4e5;
                        color: #FF9500;
                        border: none;
                        border-radius: 12px;
                        padding: 6px 12px;
                        font-size: 0.8rem;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    .reactor-requested-btn:hover {
                        background: #ffe9cc;
                    }

                    .reactor-reply-content {
                        font-size: 0.8rem;
                        color: #2c2c2e;
                        font-style: italic;
                        margin-top: 4px;
                        background: rgba(138, 43, 226, 0.04);
                        padding: 6px 10px;
                        border-radius: 8px;
                        border-left: 3px solid #8a2be2;
                    }

                    .reactor-sub-row {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }

                    .reactor-username {
                        font-size: 0.75rem;
                        color: var(--text-secondary);
                        opacity: 0.7;
                    }

                    .friends-badge {
                        background: rgba(46, 213, 115, 0.15);
                        color: #2ed573;
                        border: 1px solid rgba(46, 213, 115, 0.3);
                        padding: 2px 6px;
                        border-radius: 8px;
                        font-size: 0.65rem;
                        font-weight: 700;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                        display: inline-flex;
                        align-items: center;
                    }

                    /* =========================================
                       PREMIUM CARD GLOBAL STYLES
                       ========================================= */
                    
                    /* VIP Label */
                    .vip-label {
                        position: absolute;
                        top: 24px;
                        right: 24px;
                        background: linear-gradient(135deg, #06b6d4, #8b5cf6);
                        color: #ffffff;
                        font-size: 0.72rem;
                        font-weight: 800;
                        padding: 4px 10px;
                        border-radius: 12px;
                        letter-spacing: 0.5px;
                        box-shadow: 0 4px 12px rgba(6, 182, 212, 0.35);
                        z-index: 10;
                        animation: bounceSoft 2s infinite alternate;
                    }
                    .vip-label.gold {
                        background: linear-gradient(135deg, #facc15, #ca8a04);
                        color: #000000;
                        box-shadow: 0 4px 12px rgba(234, 179, 8, 0.35);
                    }
                    
                    @keyframes bounceSoft {
                        0% { transform: translateY(0); }
                        100% { transform: translateY(-4px); }
                    }

                    /* =========================================
                       SILVER PREMIUM CARD
                       ========================================= */
                    .user-profile-card.premium-silver {
                        background: linear-gradient(135deg, rgba(30, 30, 35, 0.9), rgba(15, 15, 20, 0.94)) !important;
                        backdrop-filter: blur(20px) !important;
                        -webkit-backdrop-filter: blur(20px) !important;
                        border: 1.5px solid rgba(255, 255, 255, 0.12) !important;
                        box-shadow: 0 -12px 45px rgba(255, 255, 255, 0.04), 0 -12px 30px rgba(0, 0, 0, 0.6) !important;
                        animation: silverFadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) !important;
                        border-bottom: none !important;
                    }
                    @keyframes silverFadeUp {
                        0% { opacity: 0; transform: translateY(80px) scale(0.98); }
                        100% { opacity: 1; transform: translateY(0) scale(1); }
                    }
                    .premium-silver .avatar-large-container img {
                        border: 3px solid #cbd5e1 !important;
                        box-shadow: 0 0 18px rgba(203, 213, 225, 0.45), 0 0 0 3px rgba(203, 213, 225, 0.1) !important;
                    }
                    .premium-silver .action-btn.primary-action {
                        background: linear-gradient(135deg, #cbd5e1, #94a3b8) !important;
                        color: #0f172a !important;
                        font-weight: 700 !important;
                        border: none !important;
                        box-shadow: 0 4px 12px rgba(203, 213, 225, 0.25) !important;
                    }
                    .premium-silver .action-btn.primary-action:hover {
                        background: linear-gradient(135deg, #e2e8f0, #cbd5e1) !important;
                        transform: translateY(-2px);
                        box-shadow: 0 6px 18px rgba(203, 213, 225, 0.4) !important;
                    }
                    .premium-silver .action-btn:not(.primary-action) {
                        background: rgba(255,255,255,0.05) !important;
                        border: 1px solid rgba(209, 213, 219, 0.2) !important;
                        color: #e2e8f0 !important;
                    }
                    .premium-silver .action-btn:not(.primary-action):hover {
                        background: rgba(255,255,255,0.1) !important;
                        border-color: rgba(209, 213, 219, 0.35) !important;
                        transform: translateY(-2px);
                    }

                    /* =========================================
                       GOLD PREMIUM CARD
                       ========================================= */
                    .user-profile-card.premium-gold {
                        background: linear-gradient(135deg, rgba(25, 22, 15, 0.94), rgba(12, 10, 8, 0.96)) !important;
                        backdrop-filter: blur(25px) !important;
                        -webkit-backdrop-filter: blur(25px) !important;
                        border: 1px solid transparent !important;
                        position: relative;
                        box-shadow: 0 -12px 50px rgba(250, 204, 21, 0.12), 0 -12px 40px rgba(0, 0, 0, 0.7) !important;
                        animation: goldPopIn 0.7s cubic-bezier(0.19, 1, 0.22, 1) !important;
                        border-bottom: none !important;
                    }
                    @keyframes goldPopIn {
                        0% { transform: translateY(100%) scale(0.97); opacity: 0; }
                        100% { transform: translateY(0) scale(1); opacity: 1; }
                    }
                    /* Gold animated border */
                    .user-profile-card.premium-gold::before {
                        content: '';
                        position: absolute;
                        top: 0; left: 0; right: 0; bottom: 0;
                        border-radius: inherit;
                        padding: 1.5px;
                        background: linear-gradient(135deg, #fef08a, #ca8a04, #b45309, #fef08a);
                        background-size: 300% 300%;
                        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
                        -webkit-mask-composite: xor;
                        mask-composite: exclude;
                        pointer-events: none;
                        z-index: 10;
                        animation: goldBorderAnim 6s linear infinite;
                    }
                    @keyframes goldBorderAnim {
                        0% { background-position: 0% 50%; }
                        50% { background-position: 100% 50%; }
                        100% { background-position: 0% 50%; }
                    }
                    /* Gold shine sweep */
                    .user-profile-card.premium-gold::after {
                        content: '';
                        position: absolute;
                        top: 0; left: -150%; width: 60%; height: 100%;
                        background: linear-gradient(90deg, transparent, rgba(254, 240, 138, 0.18), transparent);
                        transform: skewX(-25deg);
                        pointer-events: none;
                        z-index: 2;
                        animation: goldShineSweep 3.5s ease-in-out infinite;
                    }
                    @keyframes goldShineSweep {
                        0% { left: -150%; }
                        30% { left: 150%; }
                        100% { left: 150%; }
                    }
                    .premium-gold .avatar-large-container img {
                        border: 3.5px solid #facc15 !important;
                        box-shadow: 0 0 22px rgba(250, 204, 21, 0.55), 0 0 0 4px rgba(250, 204, 21, 0.1) !important;
                        animation: goldGlow 3s ease-in-out infinite alternate;
                    }
                    @keyframes goldGlow {
                        0% { box-shadow: 0 0 15px rgba(250, 204, 21, 0.4), 0 0 0 2px rgba(250, 204, 21, 0.05); }
                        100% { box-shadow: 0 0 32px rgba(250, 204, 21, 0.78), 0 0 0 6px rgba(250, 204, 21, 0.15); }
                    }
                    .premium-gold .action-btn.primary-action {
                        background: linear-gradient(135deg, #facc15, #eab308) !important;
                        color: #000000 !important;
                        font-weight: 750 !important;
                        box-shadow: 0 4px 16px rgba(234, 179, 8, 0.45) !important;
                        border: none !important;
                    }
                    .premium-gold .action-btn.primary-action:hover {
                        background: linear-gradient(135deg, #fef08a, #facc15) !important;
                        box-shadow: 0 6px 22px rgba(234, 179, 8, 0.65) !important;
                        transform: translateY(-2px);
                    }
                    .premium-gold .action-btn:not(.primary-action) {
                        background: rgba(250, 204, 21, 0.06) !important;
                        border: 1px solid rgba(250, 204, 21, 0.25) !important;
                        color: #fef08a !important;
                    }
                    .premium-gold .action-btn:not(.primary-action):hover {
                        background: rgba(250, 204, 21, 0.12) !important;
                        border-color: rgba(250, 204, 21, 0.4) !important;
                        transform: translateY(-2px);
                    }

                    /* =========================================
                       DIAMOND VIP PREMIUM CARD
                       ========================================= */
                    .user-profile-card.premium-diamond {
                        background: linear-gradient(135deg, rgba(8, 10, 15, 0.99), rgba(3, 4, 6, 1)) !important;
                        border: 1px solid transparent !important;
                        position: relative;
                        box-shadow: 0 -12px 60px rgba(6, 182, 212, 0.15), 0 -12px 40px rgba(0, 0, 0, 0.8) !important;
                        animation: diamondVIPOpening 0.8s cubic-bezier(0.19, 1, 0.22, 1) !important;
                    }
                    @keyframes diamondVIPOpening {
                        0% { transform: translateY(100%) scale(0.95); opacity: 0; }
                        100% { transform: translateY(0) scale(1); opacity: 1; }
                    }
                    /* Diamond animated border */
                    .user-profile-card.premium-diamond::before {
                        content: '';
                        position: absolute;
                        top: 0; left: 0; right: 0; bottom: 0;
                        border-radius: inherit;
                        padding: 2px;
                        background: linear-gradient(135deg, #06b6d4, #3b82f6, #8b5cf6, #06b6d4);
                        background-size: 300% 300%;
                        -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
                        -webkit-mask-composite: xor;
                        mask-composite: exclude;
                        pointer-events: none;
                        z-index: 10;
                        animation: diamondBorderAnim 5s linear infinite;
                    }
                    @keyframes diamondBorderAnim {
                        0% { background-position: 0% 50%; }
                        50% { background-position: 100% 50%; }
                        100% { background-position: 0% 50%; }
                    }
                    /* Diamond crystalline reflection shine sweep */
                    .user-profile-card.premium-diamond::after {
                        content: '';
                        position: absolute;
                        top: 0; left: -180%; width: 70%; height: 100%;
                        background: linear-gradient(90deg, transparent, rgba(6, 182, 212, 0.25), rgba(139, 92, 246, 0.15), transparent);
                        transform: skewX(-30deg);
                        pointer-events: none;
                        z-index: 2;
                        animation: diamondShineSweep 4s ease-in-out infinite;
                    }
                    @keyframes diamondShineSweep {
                        0% { left: -180%; }
                        40% { left: 180%; }
                        100% { left: 180%; }
                    }
                    /* Floating particles */
                    .diamond-particles {
                        position: absolute;
                        top: 0; left: 0; width: 100%; height: 100%;
                        overflow: hidden;
                        pointer-events: none;
                        z-index: 0;
                    }
                    .diamond-particles span {
                        position: absolute;
                        bottom: -10px;
                        width: 4px; height: 4px;
                        background: #06b6d4;
                        border-radius: 50%;
                        box-shadow: 0 0 8px #06b6d4;
                        opacity: 0.5;
                        animation: floatUp 6s linear infinite;
                    }
                    @keyframes floatUp {
                        0% { transform: translateY(0) scale(1); opacity: 0; }
                        10% { opacity: 0.55; }
                        90% { opacity: 0.55; }
                        100% { transform: translateY(-320px) scale(0.6); opacity: 0; }
                    }
                    .premium-diamond .avatar-large-container img {
                        border: 3px solid #06b6d4 !important;
                        box-shadow: 0 0 25px rgba(6, 182, 212, 0.6), 0 0 0 4px rgba(6, 182, 212, 0.1) !important;
                        animation: diamondGlow 3s ease-in-out infinite alternate;
                    }
                    @keyframes diamondGlow {
                        0% { box-shadow: 0 0 15px rgba(6, 182, 212, 0.4), 0 0 0 2px rgba(6, 182, 212, 0.05); }
                        100% { box-shadow: 0 0 35px rgba(6, 182, 212, 0.8), 0 0 0 7px rgba(139, 92, 246, 0.2); }
                    }
                    .premium-diamond .action-btn.primary-action {
                        background: linear-gradient(135deg, #06b6d4, #7c3aed) !important;
                        color: #ffffff !important;
                        font-weight: 750 !important;
                        box-shadow: 0 4px 20px rgba(6, 182, 212, 0.45) !important;
                        border: none !important;
                        text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                    }
                    .premium-diamond .action-btn.primary-action:hover {
                        background: linear-gradient(135deg, #22d3ee, #8b5cf6) !important;
                        box-shadow: 0 6px 28px rgba(6, 182, 212, 0.7) !important;
                        transform: translateY(-2.5px);
                    }
                    .premium-diamond .action-btn:not(.primary-action) {
                        background: rgba(6, 182, 212, 0.05) !important;
                        border: 1px solid rgba(6, 182, 212, 0.3) !important;
                        color: #a5f3fc !important;
                    }
                    .premium-diamond .action-btn:not(.primary-action):hover {
                        background: rgba(6, 182, 212, 0.12) !important;
                        border-color: rgba(6, 182, 212, 0.5) !important;
                        transform: translateY(-2px);
                    }
                    
                `}</style>
            </motion.div>
        </AnimatePresence>
    );
}
