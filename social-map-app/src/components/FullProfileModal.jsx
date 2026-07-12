import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { getAvatar2D } from '../utils/avatarUtils';
import { canViewStatus, getStatusRingClass, getAvatarTapAction } from '../utils/statusUtils';
import { VerifiedBadgeInline } from '../utils/verifiedBadge.jsx';

// Helper to safely format dates, particularly for mobile Safari/WebViews
const formatSafeDate = (dateStr) => {
    if (!dateStr) return null;
    try {
        if (typeof dateStr === 'string' && dateStr.length >= 10 && dateStr.includes('-')) {
            const [y, m, d] = dateStr.substring(0, 10).split('-');
            const dateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
            if (!isNaN(dateObj.getTime())) {
                return dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            }
        }
        const dateObj = new Date(dateStr);
        if (isNaN(dateObj.getTime())) return null;
        return dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) {
        return null;
    }
};

export default function FullProfileModal({ user, currentUser, onClose, onAction }) {
    const [stats, setStats] = useState({
        mutuals: 0,
        joinedDate: 'Loading...',
        bio: '',
        birthDate: null,
        interests: [],
        username: '',
        is_verified: false,
        verified_at: null,
        streakCount: 0,
        relationshipStatus: 'Single'
    });
    const [sharedMedia, setSharedMedia] = useState([]);
    const [viewingMedia, setViewingMedia] = useState(null);
    const [isFullPhoto, setIsFullPhoto] = useState(false);
    const [showContextMenu, setShowContextMenu] = useState(false);
    
    const longPressTimer = useRef(null);
    const isLongPress = useRef(false);

    const isFriend = user.friendshipStatus === 'accepted';
    const isOwner = currentUser?.id === user.id;
    const isPublic = user.is_public !== false;
    const canViewDetails = isOwner || isFriend || isPublic;
    
    const startPress = useCallback((e) => {
        isLongPress.current = false;
        longPressTimer.current = setTimeout(() => {
            isLongPress.current = true;
            setShowContextMenu(true);
            if (window.navigator?.vibrate) window.navigator.vibrate(50);
        }, 1000);
    }, []);

    const endPress = useCallback((e) => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
        
        if (isLongPress.current) {
            isLongPress.current = false;
            return;
        }

        const tapAction = getAvatarTapAction(user, currentUser);
        if (tapAction === 'view-status') {
            onAction('view-story', user);
        } else {
            setIsFullPhoto(true);
        }
    }, [user, currentUser, onAction]);

    const cancelPress = useCallback(() => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }, []);

    useEffect(() => {
        const fetchDetails = async () => {
            if (!user || !currentUser) return;
            
            if (!canViewDetails) {
                setStats({
                    mutuals: 0,
                    joinedDate: 'Private',
                    bio: 'This profile is private.',
                    birthDate: null,
                    interests: [],
                    username: user.username,
                    is_verified: user.is_verified,
                    verified_at: user.verified_at,
                    streakCount: 0,
                    relationshipStatus: 'Private'
                });
                return;
            }

            // 1. Fetch Profile Details
            const { data: profile } = await supabase
                .from('profiles')
                .select('bio, created_at, birth_date, interests, username, hide_birthday, is_verified, verified_at, streak_count, current_streak, relationship_status')
                .eq('id', user.id)
                .maybeSingle();

            // 2. Fetch Shared Media
            if (currentUser && user) {
                const { data: mediaMessages } = await supabase
                    .from('messages')
                    .select('id, image_url, content, message_type, created_at')
                    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${user.id}),and(sender_id.eq.${user.id},receiver_id.eq.${currentUser.id})`)
                    .in('message_type', ['image', 'attachment'])
                    .order('created_at', { ascending: false })
                    .limit(9);
                
                if (mediaMessages) {
                    setSharedMedia(mediaMessages);
                }
            }

            // 3. Fetch Mutual Friends Count
            const { data: myFriends } = await supabase.from('friendships')
                .select('receiver_id, requester_id')
                .or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
                .eq('status', 'accepted');

            const myFriendIds = myFriends?.map(f => 
                f.requester_id === currentUser.id ? f.receiver_id : f.requester_id
            ) || [];

            const { data: theirFriends } = await supabase.from('friendships')
                .select('receiver_id, requester_id')
                .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)
                .eq('status', 'accepted');

            const theirFriendIds = theirFriends?.map(f => 
                f.requester_id === user.id ? f.receiver_id : f.requester_id
            ) || [];

            const mutualCount = myFriendIds.filter(id => theirFriendIds.includes(id)).length;

            setStats({
                mutuals: mutualCount,
                joinedDate: profile?.created_at ? formatSafeDate(profile.created_at) : 'Unknown',
                bio: profile?.bio || 'No bio set.',
                birthDate: profile?.hide_birthday ? null : formatSafeDate(profile?.birth_date),
                interests: profile?.interests || [],
                username: profile?.username || user.username,
                is_verified: profile?.is_verified || user.is_verified || false,
                verified_at: profile?.verified_at || user.verified_at || null,
                streakCount: profile?.streak_count || profile?.current_streak || user.streak_count || user.current_streak || 0,
                relationshipStatus: profile?.relationship_status || user.relationshipStatus || user.relationship_status || 'Single'
            });
        };

        fetchDetails();
    }, [user, currentUser]);

    if (!user) return null;

    return (
        <AnimatePresence>
            <motion.div 
                className="full-profile-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
            >
                <motion.div 
                    className="full-profile-modal"
                    initial={{ scale: 0.9, opacity: 0, y: 30 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 30 }}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Top Action Header bar */}
                    <div className="fp-top-actions">
                        <button className="fp-action-circle-btn" onClick={onClose} title="Go Back">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="19" y1="12" x2="5" y2="12"></line>
                                <polyline points="12 19 5 12 12 5"></polyline>
                            </svg>
                        </button>
                        
                        <button className="fp-action-dots-btn" onClick={() => setShowContextMenu(prev => !prev)} title="More Options">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="1.5" fill="currentColor"></circle>
                                <circle cx="12" cy="5" r="1.5" fill="currentColor"></circle>
                                <circle cx="12" cy="19" r="1.5" fill="currentColor"></circle>
                            </svg>
                        </button>
                    </div>
                    
                    {/* Avatar Container with glowing active status ring */}
                    <div 
                        className={`fp-avatar-container-new ${getStatusRingClass(user, currentUser)}`}
                        onMouseDown={startPress}
                        onMouseUp={endPress}
                        onMouseLeave={cancelPress}
                        onTouchStart={startPress}
                        onTouchEnd={(e) => {
                            e.preventDefault();
                            endPress(e);
                        }}
                        onTouchMove={cancelPress}
                    >
                        <img 
                            src={getAvatar2D(user.avatar || user.avatar_url)} 
                            alt={user.name} 
                            className="fp-avatar-img"
                        />
                        <div className={`fp-status-dot-new ${user.isLocationOn ? 'online' : 'offline'}`} />
                        
                        {/* Context Dropdown Menu */}
                        <AnimatePresence>
                            {showContextMenu && (
                                <motion.div 
                                    className="fp-context-dropdown"
                                    initial={{ opacity: 0, scale: 0.95, y: 5 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: 5 }}
                                    onClick={e => e.stopPropagation()}
                                >
                                    {canViewStatus(currentUser, user) && (
                                        <>
                                            <button onClick={() => { onAction('view-story', user); setShowContextMenu(false); }}>
                                                See Status
                                            </button>
                                            <div className="menu-divider" />
                                        </>
                                    )}
                                    <button onClick={() => { setIsFullPhoto(true); setShowContextMenu(false); }}>
                                        See Full Photo
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                    
                    <h2 className="fp-display-name">
                        {user.username || user.name}
                        <VerifiedBadgeInline user={{ is_verified: stats.is_verified || user.is_verified, verified_at: stats.verified_at || user.verified_at }} size={18} />
                    </h2>
                    
                    {/* Relationship and Status Pills */}
                    <div className="fp-pills-row">
                        <span className="fp-pill-badge relationship">
                            💕 {stats.relationshipStatus}
                        </span>
                        
                        {isFriend && (
                            <span className="fp-pill-badge friend">
                                🤝 Friend
                            </span>
                        )}
                        
                        {!isFriend && !isOwner && (
                            <button 
                                className="fp-pill-badge poke-action"
                                onClick={() => {
                                    if (user.friendshipStatus === 'pending' && user.requesterId === currentUser?.id) {
                                        onAction('cancel-poke', user);
                                    } else {
                                        onAction('poke', user);
                                    }
                                }}
                            >
                                {user.friendshipStatus === 'pending' && user.requesterId === currentUser?.id ? '⏳ Requested' : '👋 Poke'}
                            </button>
                        )}
                    </div>
                    
                    {/* Stats Grid Container (Joined, Mutuals, Streak) */}
                    <div className="fp-stats-card">
                        <div className="fp-stat-col">
                            <div className="fp-stat-circle mutuals">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="9" cy="7" r="4"></circle>
                                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                                </svg>
                            </div>
                            <span className="fp-stat-number">{stats.mutuals}</span>
                            <span className="fp-stat-desc">Mutuals</span>
                        </div>
                        
                        <div className="fp-stat-col">
                            <div className="fp-stat-circle joined">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                    <line x1="16" y1="2" x2="16" y2="6"></line>
                                    <line x1="8" y1="2" x2="8" y2="6"></line>
                                    <line x1="3" y1="10" x2="21" y2="10"></line>
                                </svg>
                            </div>
                            <span className="fp-stat-number date">{stats.joinedDate}</span>
                            <span className="fp-stat-desc">Joined</span>
                        </div>
                        
                        <div className="fp-stat-col">
                            <div className="fp-stat-circle streak">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>
                                </svg>
                            </div>
                            <span className="fp-stat-number">{stats.streakCount}</span>
                            <span className="fp-stat-desc">Day Streak</span>
                        </div>
                    </div>
                    
                    {/* Smart Icebreakers Premium Nudge (Diamond Feature) */}
                    <div className="fp-icebreaker-card" onClick={() => onAction('message', user)}>
                        <div className="fp-icebreaker-diamond-box">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="6 2 18 2 22 8 12 22 2 8 6 2"></polygon>
                            </svg>
                        </div>
                        <div className="fp-icebreaker-text-content">
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <span className="fp-icebreaker-title">SMART ICEBREAKERS</span>
                                <span className="fp-icebreaker-badge">DIAMOND</span>
                            </div>
                            <p className="fp-icebreaker-subtitle">📍 You are practically next to each other right now!</p>
                        </div>
                        <span className="fp-icebreaker-chevron">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </span>
                    </div>
                    
                    {/* About section with Feather SVG illustration */}
                    <div className="fp-about-card">
                        <div className="fp-about-content">
                            <span className="fp-about-heading">About</span>
                            <p className="fp-about-text">{stats.bio}</p>
                        </div>
                        <div className="fp-about-illustration">
                            <svg width="48" height="48" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="8" y="12" width="36" height="44" rx="6" fill="#F4EFFF" stroke="#E2D5FF" strokeWidth="2" />
                                <line x1="16" y1="24" x2="36" y2="24" stroke="#D1BEFF" strokeWidth="2.5" strokeLinecap="round" />
                                <line x1="16" y1="32" x2="36" y2="32" stroke="#D1BEFF" strokeWidth="2.5" strokeLinecap="round" />
                                <line x1="16" y1="40" x2="28" y2="40" stroke="#D1BEFF" strokeWidth="2.5" strokeLinecap="round" />
                                <path d="M48 10C42.5 15.5 38 24.5 36 34C38.5 32.5 45.5 31.5 50 26.5C52.5 23.5 53.5 17.5 54 12C52 11.5 50 10.5 48 10Z" fill="#C084FC" stroke="#A855F7" strokeWidth="2" strokeLinejoin="round" />
                                <path d="M36 34L32 44L38 41" stroke="#A855F7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                    </div>
                    
                    {/* Action Cards (Message, Voice Call, Video Call) */}
                    {canViewDetails && isFriend && (
                        <div className="fp-quick-actions-row">
                            <div className="fp-action-item-card" onClick={() => onAction('message', user)}>
                                <div className="fp-action-icon-circle msg">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                    </svg>
                                </div>
                                <span className="fp-action-label">Message</span>
                            </div>
                            
                            <div className="fp-action-item-card" onClick={() => onAction('call-audio', user)}>
                                <div className="fp-action-icon-circle voice">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                                    </svg>
                                </div>
                                <span className="fp-action-label">Voice Call</span>
                            </div>
                            
                            <div className="fp-action-item-card" onClick={() => onAction('call-video', user)}>
                                <div className="fp-action-icon-circle video">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polygon points="23 7 16 12 23 17 23 7"></polygon>
                                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                                    </svg>
                                </div>
                                <span className="fp-action-label">Video Call</span>
                            </div>
                        </div>
                    )}
                    
                    {/* Bottom Security / Management Row */}
                    {!isOwner && (
                        <div className="fp-footer-danger-actions">
                            {isFriend && (
                                <button className="fp-danger-link" onClick={() => onAction('unfriend', user)}>
                                    💔 Unfriend
                                </button>
                            )}
                            <button className="fp-danger-link" onClick={() => onAction('block', user)}>
                                🚫 Block User
                            </button>
                            <button className="fp-danger-link" onClick={() => onAction('report', user)}>
                                🚩 Report User
                            </button>
                        </div>
                    )}
                </motion.div>
                
                {/* Full-Screen Avatar Photo Zoom */}
                {isFullPhoto && (
                    <div className="full-photo-zoom-overlay" onClick={() => setIsFullPhoto(false)}>
                        <img 
                            src={getAvatar2D(user.avatar || user.avatar_url)} 
                            alt={user.username || user.name}
                            className="full-photo-zoom-image"
                        />
                    </div>
                )}
                
                <style>{`
                    .full-profile-backdrop {
                        position: fixed;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(244, 245, 247, 0.4);
                        backdrop-filter: blur(25px);
                        -webkit-backdrop-filter: blur(25px);
                        z-index: 9999;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        padding: 16px;
                    }

                    .full-profile-modal {
                        background: #ffffff;
                        width: 100%;
                        max-width: 375px;
                        border-radius: 36px;
                        border: 1px solid rgba(0, 0, 0, 0.04);
                        padding: 20px;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        position: relative;
                        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.06), 0 4px 14px rgba(0, 0, 0, 0.02);
                        max-height: 94vh;
                        overflow-y: auto;
                        scrollbar-width: none;
                    }
                    .full-profile-modal::-webkit-scrollbar {
                        display: none;
                    }

                    /* Top Header Nav Buttons */
                    .fp-top-actions {
                        display: flex;
                        justify-content: space-between;
                        width: 100%;
                        margin-bottom: 4px;
                    }
                    .fp-action-circle-btn {
                        width: 36px;
                        height: 36px;
                        border-radius: 50%;
                        background: #ffffff;
                        border: none;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
                        color: #1f2937;
                        transition: transform 0.2s;
                    }
                    .fp-action-circle-btn:active {
                        transform: scale(0.92);
                    }
                    .fp-action-dots-btn {
                        width: 36px;
                        height: 36px;
                        border-radius: 50%;
                        background: transparent;
                        border: none;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        color: #1f2937;
                        transition: transform 0.2s;
                    }
                    .fp-action-dots-btn:active {
                        transform: scale(0.92);
                    }

                    /* Circular avatar container with status rings */
                    .fp-avatar-container-new {
                        position: relative;
                        width: 110px;
                        height: 110px;
                        border-radius: 50%;
                        cursor: pointer;
                        margin-top: 8px;
                    }
                    .fp-avatar-container-new::after {
                        content: '';
                        position: absolute;
                        inset: -5px;
                        border-radius: 50%;
                        border: 3px solid #7C3AED;
                        pointer-events: none;
                        box-sizing: border-box;
                    }
                    .fp-avatar-container-new.status-ring-active::after {
                        border-color: #3b82f6;
                        animation: pulse-ring-new 2s infinite;
                    }
                    .fp-avatar-container-new.status-ring-viewed::after {
                        border-color: #d1d5db;
                    }
                    .fp-avatar-img {
                        width: 100%;
                        height: 100%;
                        border-radius: 50%;
                        object-fit: cover;
                        border: 4px solid #ffffff;
                        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
                    }
                    .fp-status-dot-new {
                        position: absolute;
                        bottom: 4px;
                        right: 4px;
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        border: 3px solid #ffffff;
                        z-index: 2;
                    }
                    .fp-status-dot-new.online {
                        background: #30d158;
                        box-shadow: 0 0 10px rgba(48, 209, 88, 0.5);
                    }
                    .fp-status-dot-new.offline {
                        background: #9ca3af;
                    }

                    @keyframes pulse-ring-new {
                        0% { transform: scale(0.98); opacity: 0.8; }
                        50% { transform: scale(1.02); opacity: 1; }
                        100% { transform: scale(0.98); opacity: 0.8; }
                    }

                    .fp-display-name {
                        font-size: 1.45rem;
                        font-weight: 800;
                        color: #1f2937;
                        margin: 14px 0 0 0;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    }

                    /* Tag Pills Row */
                    .fp-pills-row {
                        display: flex;
                        gap: 8px;
                        margin-top: 12px;
                        justify-content: center;
                        align-items: center;
                    }
                    .fp-pill-badge {
                        padding: 6px 14px;
                        border-radius: 100px;
                        font-size: 0.82rem;
                        font-weight: 700;
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        border: none;
                    }
                    .fp-pill-badge.relationship {
                        background: #ffe4e6;
                        color: #f43f5e;
                    }
                    .fp-pill-badge.friend {
                        background: #eff6ff;
                        color: #3b82f6;
                    }
                    .fp-pill-badge.poke-action {
                        background: #f3e8ff;
                        color: #7C3AED;
                        cursor: pointer;
                        box-shadow: 0 2px 6px rgba(124, 58, 237, 0.1);
                        transition: all 0.18s;
                    }
                    .fp-pill-badge.poke-action:active {
                        transform: scale(0.95);
                    }

                    /* 3-Column Stats Card Box */
                    .fp-stats-card {
                        background: #ffffff;
                        border: 1px solid rgba(0, 0, 0, 0.05);
                        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.03);
                        border-radius: 20px;
                        padding: 14px;
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        width: 100%;
                        margin-top: 20px;
                        box-sizing: border-box;
                    }
                    .fp-stat-col {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                    }
                    .fp-stat-col:not(:last-child) {
                        border-right: 1px solid rgba(0, 0, 0, 0.04);
                    }
                    .fp-stat-circle {
                        width: 32px;
                        height: 32px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin-bottom: 6px;
                    }
                    .fp-stat-circle.mutuals {
                        background: #f3e8ff;
                        color: #a855f7;
                    }
                    .fp-stat-circle.joined {
                        background: #e0f2fe;
                        color: #0284c7;
                    }
                    .fp-stat-circle.streak {
                        background: #ffe4e6;
                        color: #f43f5e;
                    }
                    .fp-stat-number {
                        font-size: 0.95rem;
                        font-weight: 800;
                        color: #1f2937;
                    }
                    .fp-stat-number.date {
                        font-size: 0.72rem;
                        text-align: center;
                        white-space: nowrap;
                    }
                    .fp-stat-desc {
                        font-size: 0.72rem;
                        color: #888888;
                        font-weight: 600;
                        margin-top: 2px;
                    }

                    /* Premium Icebreakers Card Section */
                    .fp-icebreaker-card {
                        background: linear-gradient(135deg, #fff1f2 0%, #fae8ff 100%);
                        border: 1px solid rgba(244, 63, 94, 0.08);
                        border-radius: 20px;
                        padding: 12px 14px;
                        margin-top: 14px;
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        width: 100%;
                        box-sizing: border-box;
                        cursor: pointer;
                        transition: transform 0.2s;
                    }
                    .fp-icebreaker-card:active {
                        transform: scale(0.98);
                    }
                    .fp-icebreaker-diamond-box {
                        width: 36px;
                        height: 36px;
                        border-radius: 10px;
                        background: #ffffff;
                        border: 1px solid rgba(0, 0, 0, 0.04);
                        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        flex-shrink: 0;
                    }
                    .fp-icebreaker-text-content {
                        display: flex;
                        flex-direction: column;
                        flex: 1;
                        min-width: 0;
                    }
                    .fp-icebreaker-title {
                        font-size: 0.72rem;
                        font-weight: 800;
                        color: #7c3aed;
                        letter-spacing: 0.2px;
                    }
                    .fp-icebreaker-badge {
                        font-size: 0.58rem;
                        font-weight: 800;
                        background: #d946ef;
                        color: #ffffff;
                        padding: 1.5px 5px;
                        border-radius: 4px;
                        margin-left: 6px;
                        letter-spacing: 0.4px;
                    }
                    .fp-icebreaker-subtitle {
                        font-size: 0.78rem;
                        color: #4b5563;
                        margin: 4px 0 0 0;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        font-weight: 500;
                    }
                    .fp-icebreaker-chevron {
                        color: #9ca3af;
                        display: flex;
                        align-items: center;
                    }

                    /* About Content Card Box */
                    .fp-about-card {
                        background: #ffffff;
                        border: 1px solid rgba(0, 0, 0, 0.04);
                        border-radius: 20px;
                        padding: 14px 16px;
                        margin-top: 14px;
                        width: 100%;
                        box-sizing: border-box;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        gap: 12px;
                    }
                    .fp-about-content {
                        flex: 1;
                        min-width: 0;
                    }
                    .fp-about-heading {
                        font-size: 0.85rem;
                        font-weight: 800;
                        color: #7c3aed;
                        display: block;
                        margin-bottom: 6px;
                    }
                    .fp-about-text {
                        font-size: 0.85rem;
                        color: #4b5563;
                        margin: 0;
                        line-height: 1.45;
                        font-weight: 500;
                    }
                    .fp-about-illustration {
                        flex-shrink: 0;
                    }

                    /* Bottom Navigation Action Cards (Message, Calls) */
                    .fp-quick-actions-row {
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        gap: 12px;
                        width: 100%;
                        margin-top: 16px;
                    }
                    .fp-action-item-card {
                        background: #ffffff;
                        border: 1px solid rgba(0, 0, 0, 0.04);
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
                        border-radius: 20px;
                        padding: 14px 8px;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        transition: transform 0.15s, box-shadow 0.15s;
                    }
                    .fp-action-item-card:active {
                        transform: scale(0.96);
                    }
                    .fp-action-icon-circle {
                        width: 34px;
                        height: 34px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin-bottom: 8px;
                    }
                    .fp-action-icon-circle.msg {
                        background: #f3e8ff;
                        color: #a855f7;
                    }
                    .fp-action-icon-circle.voice {
                        background: #dcfce7;
                        color: #16a34a;
                    }
                    .fp-action-icon-circle.video {
                        background: #dbeafe;
                        color: #2563eb;
                    }
                    .fp-action-label {
                        font-size: 0.78rem;
                        font-weight: 700;
                        color: #374151;
                    }

                    /* Footer Danger Actions Row */
                    .fp-footer-danger-actions {
                        display: flex;
                        justify-content: space-around;
                        align-items: center;
                        width: 100%;
                        margin-top: 20px;
                        padding-top: 16px;
                        border-top: 1px solid rgba(0, 0, 0, 0.04);
                    }
                    .fp-danger-link {
                        background: none;
                        border: none;
                        font-size: 0.8rem;
                        font-weight: 700;
                        color: #ef4444;
                        cursor: pointer;
                        transition: opacity 0.15s;
                    }
                    .fp-danger-link:active {
                        opacity: 0.6;
                    }

                    /* Dropdown Context Menu */
                    .fp-context-dropdown {
                        position: absolute;
                        top: calc(100% + 8px);
                        left: 50%;
                        transform: translateX(-50%);
                        background: #ffffff;
                        border: 1px solid rgba(0, 0, 0, 0.06);
                        border-radius: 14px;
                        padding: 4px;
                        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
                        z-index: 10;
                        min-width: 120px;
                    }
                    .fp-context-dropdown button {
                        width: 100%;
                        padding: 9px 12px;
                        background: transparent;
                        border: none;
                        color: #374151;
                        font-size: 0.82rem;
                        font-weight: 600;
                        cursor: pointer;
                        border-radius: 8px;
                        text-align: left;
                        transition: background 0.15s;
                    }
                    .fp-context-dropdown button:hover {
                        background: rgba(0, 0, 0, 0.04);
                    }
                    .menu-divider {
                        height: 1px;
                        background: rgba(0, 0, 0, 0.05);
                        margin: 3px 6px;
                    }

                    /* Dark Mode Theme Adaptations */
                    html[data-theme="dark"] .full-profile-backdrop {
                        background: rgba(18, 18, 20, 0.65);
                    }
                    html[data-theme="dark"] .full-profile-modal {
                        background: #1c1c1e;
                        border-color: rgba(255, 255, 255, 0.08);
                        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
                    }
                    html[data-theme="dark"] .fp-action-circle-btn {
                        background: #2c2c2e;
                        color: #ffffff;
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                    }
                    html[data-theme="dark"] .fp-action-dots-btn {
                        color: #ffffff;
                    }
                    html[data-theme="dark"] .fp-avatar-container-new::after {
                        border-color: #9B6FE3;
                    }
                    html[data-theme="dark"] .fp-avatar-img {
                        border-color: #1c1c1e;
                    }
                    html[data-theme="dark"] .fp-status-dot-new {
                        border-color: #1c1c1e;
                    }
                    html[data-theme="dark"] .fp-display-name {
                        color: #ffffff;
                    }
                    html[data-theme="dark"] .fp-stats-card {
                        background: #2c2c2e;
                        border-color: rgba(255, 255, 255, 0.05);
                        box-shadow: none;
                    }
                    html[data-theme="dark"] .fp-stat-number {
                        color: #ffffff;
                    }
                    html[data-theme="dark"] .fp-stat-col:not(:last-child) {
                        border-right-color: rgba(255, 255, 255, 0.05);
                    }
                    html[data-theme="dark"] .fp-icebreaker-card {
                        background: linear-gradient(135deg, rgba(253, 244, 245, 0.06) 0%, rgba(253, 242, 255, 0.06) 100%);
                        border-color: rgba(244, 63, 94, 0.15);
                    }
                    html[data-theme="dark"] .fp-icebreaker-diamond-box {
                        background: #2c2c2e;
                        border-color: rgba(255, 255, 255, 0.05);
                    }
                    html[data-theme="dark"] .fp-icebreaker-subtitle {
                        color: #a1a1aa;
                    }
                    html[data-theme="dark"] .fp-about-card {
                        background: #2c2c2e;
                        border-color: rgba(255, 255, 255, 0.05);
                    }
                    html[data-theme="dark"] .fp-about-text {
                        color: #a1a1aa;
                    }
                    html[data-theme="dark"] .fp-about-illustration rect {
                        fill: #2c2c2e;
                        stroke: #443e5c;
                    }
                    html[data-theme="dark"] .fp-about-illustration line {
                        stroke: #5d537d;
                    }
                    html[data-theme="dark"] .fp-action-item-card {
                        background: #2c2c2e;
                        border-color: rgba(255, 255, 255, 0.05);
                        box-shadow: none;
                    }
                    html[data-theme="dark"] .fp-action-label {
                        color: #e5e7eb;
                    }
                    html[data-theme="dark"] .fp-context-dropdown {
                        background: #2c2c2e;
                        border-color: rgba(255, 255, 255, 0.08);
                        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
                    }
                    html[data-theme="dark"] .fp-context-dropdown button {
                        color: #ffffff;
                    }
                    html[data-theme="dark"] .fp-context-dropdown button:hover {
                        background: rgba(255, 255, 255, 0.05);
                    }
                    html[data-theme="dark"] .fp-footer-danger-actions {
                        border-top-color: rgba(255, 255, 255, 0.05);
                    }

                    /* Image Zoom Frame Overlay */
                    .full-photo-zoom-overlay {
                        position: fixed;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(0, 0, 0, 0.95);
                        z-index: 10000;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        animation: fadeIn 0.2s ease-out;
                    }
                    .full-photo-zoom-image {
                        max-width: 90%;
                        max-height: 90%;
                        border-radius: 16px;
                        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                `}</style>
            </motion.div>
        </AnimatePresence>
    );
}
