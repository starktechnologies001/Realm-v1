import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getAvatar2D, DEFAULT_MALE_AVATAR, DEFAULT_FEMALE_AVATAR } from '../utils/avatarUtils';
import { calculateDistance } from '../utils/distanceUtils';
import { canViewStatus, hasActiveStatus, getStatusRingClass, getAvatarTapAction } from '../utils/statusUtils';
import { nearbyLabel, parseThought } from '../utils/locationPrivacy';


export default function MapProfileCard({ user, onClose, onAction, currentUser, userLocation, showToast, reactions = [], onToggleReaction }) {
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
    const rawThoughtText = user.thought || user.status_message;
    const parsedThought = parseThought(rawThoughtText);
    const thoughtText = parsedThought.text;
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
    const [isReplyingToThought, setIsReplyingToThought] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [isSendingReply, setIsSendingReply] = useState(false);

    // Thought Reactions States
    const [showReactorsList, setShowReactorsList] = useState(false);
    const [selectedReactorTab, setSelectedReactorTab] = useState('all');

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
                            {distanceStr && (
                                <div className="avatar-distance-badge">
                                    📍 {distanceStr}
                                </div>
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
                                <span className="username-text">{user.username || user.name}</span>
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
                        <div className="thought-section">
                            <div className="thought-bubble-large">
                                {displayThought}
                                {!isOwner && (
                                    <button 
                                        className="reply-thought-btn"
                                        onClick={() => setIsReplyingToThought(!isReplyingToThought)}
                                    >
                                        Reply
                                    </button>
                                )}
                            </div>

                            {/* Reaction Counts Row */}
                            {reactions.length > 0 && (
                                <div className="thought-reactions-summary" onClick={() => setShowReactorsList(true)}>
                                    {Object.entries(
                                        reactions.reduce((acc, r) => {
                                            acc[r.reaction_type] = (acc[r.reaction_type] || 0) + 1;
                                            return acc;
                                        }, {})
                                    ).map(([type, count]) => {
                                        const emojiMap = { love: '❤️', fire: '🔥', laugh: '😂', clap: '👏' };
                                        return (
                                            <span key={type} className="reaction-summary-pill">
                                                {emojiMap[type] || '❤️'} {count}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Reaction Bar */}
                            <div className="thought-reaction-bar">
                                {[
                                    { type: 'love', emoji: '❤️', label: 'Love' },
                                    { type: 'fire', emoji: '🔥', label: 'Fire' },
                                    { type: 'laugh', emoji: '😂', label: 'Laugh' },
                                    { type: 'clap', emoji: '👏', label: 'Clap' }
                                ].map(({ type, emoji, label }) => {
                                    const hasReacted = reactions.some(r => r.user_id === currentUser?.id && r.reaction_type === type);
                                    return (
                                        <button
                                            key={type}
                                            className={`reaction-pill-btn ${hasReacted ? 'active' : ''}`}
                                            onClick={() => onToggleReaction && onToggleReaction(user.id, type)}
                                        >
                                            <span className="reaction-emoji">{emoji}</span>
                                            <span className="reaction-label">{label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            
                            <AnimatePresence>
                                {isReplyingToThought && (
                                    <motion.form 
                                        className="thought-reply-form"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        onSubmit={handleReplySubmit}
                                    >
                                        <input 
                                            type="text" 
                                            placeholder="Type a reply..." 
                                            value={replyText}
                                            onChange={(e) => setReplyText(e.target.value)}
                                            disabled={isSendingReply}
                                            autoFocus
                                        />
                                        <button 
                                            type="submit" 
                                            disabled={!replyText.trim() || isSendingReply}
                                        >
                                            {isSendingReply ? '...' : 'Send'}
                                        </button>
                                    </motion.form>
                                )}
                            </AnimatePresence>
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
                                {['all', 'love', 'fire', 'laugh', 'clap'].map(tab => {
                                    const emojiMap = { all: 'All', love: '❤️', fire: '🔥', laugh: '😂', clap: '👏' };
                                    const tabCount = tab === 'all' 
                                        ? reactions.length 
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
                                })}
                            </div>

                            {/* Reactors List */}
                            <div className="reactors-list">
                                {filteredReactors.length === 0 ? (
                                    <div className="empty-reactors">No reactions yet</div>
                                ) : (
                                    filteredReactors.map(reactor => {
                                        const emojiMap = { love: '❤️', fire: '🔥', laugh: '😂', clap: '👏' };
                                        const emoji = emojiMap[reactor.reaction_type] || '❤️';
                                        const reactorProfile = reactor.user || {};
                                        const reactorAvatar = getAvatar2D(reactorProfile.avatar_url || (reactorProfile.gender === 'Male' ? DEFAULT_MALE_AVATAR : DEFAULT_FEMALE_AVATAR));
                                        const name = reactorProfile.full_name || reactorProfile.username || 'Unknown User';
                                        
                                        // Calculate time elapsed
                                        const timeElapsedStr = (() => {
                                            if (!reactor.created_at) return '';
                                            const diff = Date.now() - new Date(reactor.created_at).getTime();
                                            const mins = Math.floor(diff / 60000);
                                            if (mins < 1) return 'just now';
                                            if (mins < 60) return `${mins}m ago`;
                                            const hours = Math.floor(mins / 60);
                                            if (hours < 24) return `${hours}h ago`;
                                            return `${Math.floor(hours / 24)}d ago`;
                                        })();

                                        const isSelfReactor = reactorProfile.id === currentUser?.id;

                                        return (
                                            <div key={reactor.id} className="reactor-item">
                                                <img src={reactorAvatar} alt={name} className="reactor-avatar" />
                                                <div className="reactor-info">
                                                    <div className="reactor-name-row">
                                                        <span className="reactor-name">{name}</span>
                                                        <span className="reactor-emoji-badge">{emoji}</span>
                                                    </div>
                                                    <span className="reactor-time">{timeElapsedStr}</span>
                                                </div>
                                                {!isSelfReactor && (
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
                                                )}
                                            </div>
                                        );
                                    })
                                )}
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
                        display: flex; justify-content: center; gap: 8px; margin-top: 24px;
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
                        background: linear-gradient(135deg, rgba(30, 30, 40, 0.98), rgba(15, 15, 20, 0.99));
                        border-radius: 24px 24px 0 0;
                        border-top: 1px solid rgba(255, 255, 255, 0.1);
                        box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.5);
                        z-index: 3100;
                        max-height: 75vh;
                        display: flex;
                        flex-direction: column;
                        padding: 16px 20px calc(16px + env(safe-area-inset-bottom));
                    }

                    .sheet-drag-handle {
                        width: 32px;
                        height: 4px;
                        background: rgba(255, 255, 255, 0.2);
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
                        color: var(--text-primary);
                    }

                    .sheet-close-btn {
                        background: none;
                        border: none;
                        color: var(--text-secondary);
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
                        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                    }

                    .sheet-tab-btn {
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.08);
                        color: var(--text-secondary);
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
                    }

                    .sheet-tab-btn.active {
                        background: #8a2be2;
                        border-color: #8a2be2;
                        color: white;
                    }

                    .tab-count {
                        opacity: 0.6;
                        font-size: 0.75rem;
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
                        color: var(--text-secondary);
                        padding: 20px;
                        font-size: 0.9rem;
                    }

                    .reactor-item {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        padding: 8px 0;
                        border-bottom: 1px solid rgba(255, 255, 255, 0.04);
                    }

                    .reactor-avatar {
                        width: 44px;
                        height: 44px;
                        border-radius: 50%;
                        object-fit: cover;
                        border: 1.5px solid rgba(255, 255, 255, 0.1);
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
                        color: var(--text-primary);
                    }

                    .reactor-emoji-badge {
                        font-size: 0.95rem;
                    }

                    .reactor-time {
                        font-size: 0.75rem;
                        color: var(--text-secondary);
                    }

                    .reactor-msg-btn {
                        background: #8a2be2;
                        color: white;
                        border: none;
                        border-radius: 12px;
                        padding: 6px 12px;
                        font-size: 0.8rem;
                        font-weight: 600;
                        cursor: pointer;
                        transition: background 0.2s;
                    }

                    .reactor-msg-btn:hover {
                        background: #9b42f5;
                    }
                    
                `}</style>
            </motion.div>
        </AnimatePresence>
    );
}
