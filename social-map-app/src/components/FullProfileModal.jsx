import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { getAvatar2D } from '../utils/avatarUtils';

export default function FullProfileModal({ user, currentUser, onClose, onAction }) {
    const [stats, setStats] = useState({
        mutuals: 0,
        joinedDate: 'Loading...',
        bio: '',
        birthDate: null,
        interests: []
    });
    const [sharedMedia, setSharedMedia] = useState([]);
    const [viewingMedia, setViewingMedia] = useState(null);

    const isFriend = user.friendshipStatus === 'accepted';
    const isOwner = currentUser?.id === user.id;
    const isPublic = user.is_public !== false;
    const canViewDetails = isOwner || isFriend || isPublic;

    useEffect(() => {
        const fetchDetails = async () => {
            if (!user || !currentUser) return;
            
            if (!canViewDetails) {
                setStats({
                    mutuals: 0,
                    joinedDate: 'Private',
                    bio: 'This profile is private.',
                    birthDate: null,
                    interests: []
                });
                return;
            }

            // 1. Fetch Profile Details (Bio, Joined, Interests, etc)
            const { data: profile } = await supabase
                .from('profiles')
                .select('bio, created_at, birth_date, interests')
                .eq('id', user.id)
                .maybeSingle();

            // 2. Fetch Shared Media (Images)
            // Only if we are friends or owner (don't show for public strangers usually, but user asked for "shared" so presumably implies interaction)
            if (isFriend || isOwner) {
                const { data: mediaMessages } = await supabase
                    .from('messages')
                    .select('id, image_url, created_at')
                    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${user.id}),and(sender_id.eq.${user.id},receiver_id.eq.${currentUser.id})`)
                    .eq('message_type', 'image')
                    .order('created_at', { ascending: false })
                    .limit(9); // Show last 9 images
                
                if (mediaMessages) {
                    setSharedMedia(mediaMessages);
                }
            }

            // 3. Fetch Mutual Friends Count (Mock logic or complex query)
            // For now, simpler approximation or just 0 if too complex for single query
            // Let's approximate by checking shared accepted friendships
            // This is expensive in SQL without a function, so we might mock/randomize for demo 
            // OR perform two queries.
            
            // Real implementation: Get my friends, get their friends, intersection.
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
                joinedDate: profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : 'Unknown',
                bio: profile?.bio || 'No bio available.',
                birthDate: profile?.birth_date ? new Date(profile.birth_date).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : null,
                interests: profile?.interests || []
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
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    onClick={e => e.stopPropagation()}
                >
                    <button className="close-btn" onClick={onClose}>×</button>
                    
                    {/* Header with Avatar */}
                    <div className="fp-header">
                        <div className="fp-avatar-container">
                            <img 
                                src={getAvatar2D(user.avatar || user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.name)}`)} 
                                alt={user.name} 
                                className="fp-avatar" 
                            />
                            <div className={`fp-status ${user.isLocationOn ? 'online' : 'offline'}`} />
                        </div>
                        <h2>{user.name}</h2>

                        {user.status && <div className="fp-status-tag">{user.status}</div>}
                    </div>

                    {/* Stats Row */}
                    <div className="fp-stats-row">
                        <div className="fp-stat">
                            <span className="fp-stat-val">{stats.mutuals}</span>
                            <span className="fp-stat-label">Mutuals</span>
                        </div>
                        <div className="fp-stat">
                            <span className="fp-stat-val">{stats.joinedDate}</span>
                            <span className="fp-stat-label">Joined</span>
                        </div>
                        {stats.birthDate && (
                            <div className="fp-stat">
                                <span className="fp-stat-val">🎂 {stats.birthDate}</span>
                                <span className="fp-stat-label">Birthday</span>
                            </div>
                        )}
                    </div>

                    {/* Bio Section */}
                    <div className="fp-bio-section">
                        <h3>ABOUT</h3>
                        <p>{stats.bio}</p>
                    </div>

                    {/* Shared Media Section */}
                    {sharedMedia.length > 0 && (
                        <div className="fp-media-section">
                             <div className="fp-media-header">
                                <h3>SHARED MEDIA</h3>
                                <span className="fp-media-count">{sharedMedia.length} Recent</span>
                            </div>
                            <div className="fp-media-grid">
                                {sharedMedia.map((media) => (
                                    <div 
                                        key={media.id} 
                                        className="fp-media-item"
                                        onClick={() => setViewingMedia(media.image_url)}
                                    >
                                        <img src={media.image_url} alt="Shared" loading="lazy" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Interests Section */}
                    {stats.interests && stats.interests.length > 0 && (
                        <div className="fp-interests-section">
                            <h3>INTERESTS</h3>
                            <div className="fp-interests-chips">
                                {stats.interests.map((interest, idx) => (
                                    <span key={idx} className="fp-interest-chip">{interest}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Action Grid */}
                    {canViewDetails && isFriend && (
                        <div className="fp-actions">
                            <button className="fp-btn primary" onClick={() => onAction('message', user)}>
                                <span>💬</span> Message
                            </button>
                            <button className="fp-btn secondary" onClick={() => onAction('call-audio', user)}>
                                <span>📞</span> Audio Call
                            </button>
                            <button className="fp-btn secondary" onClick={() => onAction('call-video', user)}>
                                <span>📹</span> Video Call
                            </button>
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div className="fp-footer-actions">
                         <button className="fp-text-btn danger" onClick={() => onAction('block', user)}>Block User</button>
                         <span className="separator">•</span>
                         <button className="fp-text-btn danger" onClick={() => onAction('report', user)}>Report User</button>
                    </div>

                </motion.div>

                {/* Simple Image Viewer Overlay */}
                {viewingMedia && (
                    <div className="fp-media-viewer" onClick={() => setViewingMedia(null)}>
                        <img src={viewingMedia} alt="Full size" onClick={e => e.stopPropagation()} />
                        <button className="fp-viewer-close" onClick={() => setViewingMedia(null)}>×</button>
                    </div>
                )}

                <style>{`
                    .full-profile-backdrop {
                        position: fixed;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(0,0,0,0.85);
                        backdrop-filter: blur(12px);
                        -webkit-backdrop-filter: blur(12px);
                        z-index: 3000;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        padding: 20px;
                    }

                    .full-profile-modal {
                        background: linear-gradient(135deg, rgba(30, 30, 35, 0.98) 0%, rgba(20, 20, 25, 0.98) 100%);
                        width: 100%;
                        max-width: 420px;
                        border-radius: 28px;
                        border: 1px solid rgba(255,255,255,0.08);
                        padding: 32px 28px;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        position: relative;
                        box-shadow: 0 24px 60px rgba(0,0,0,0.6), 0 8px 20px rgba(0,0,0,0.4);
                        max-height: 90vh;
                        overflow-y: auto;
                    }

                    .close-btn {
                        position: absolute;
                        top: 16px; right: 16px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.1);
                        width: 36px;
                        height: 36px;
                        border-radius: 50%;
                        color: rgba(255,255,255,0.6);
                        font-size: 1.4rem;
                        cursor: pointer;
                        padding: 0;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.2s;
                    }
                    .close-btn:hover { 
                        background: rgba(255,255,255,0.1);
                        color: white;
                        transform: scale(1.1);
                    }

                    .fp-header {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        width: 100%;
                        margin-bottom: 8px;
                    }

                    .fp-avatar-container {
                        position: relative;
                        margin-bottom: 16px;
                    }
                    
                    .fp-avatar {
                        width: 120px;
                        height: 120px;
                        border-radius: 50%;
                        border: 4px solid rgba(255,255,255,0.08);
                        object-fit: cover;
                        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
                    }
                    
                    .fp-status {
                        position: absolute;
                        bottom: 8px;
                        right: 8px;
                        width: 22px;
                        height: 22px;
                        border-radius: 50%;
                        border: 4px solid rgba(20, 20, 25, 1);
                    }
                    .fp-status.online {
                        background: #00ff88;
                        box-shadow: 0 0 16px rgba(0, 255, 136, 0.6);
                    }
                    .fp-status.offline {
                        background: #666;
                    }

                    .fp-header h2 {
                        margin: 0;
                        color: white;
                        font-size: 1.6rem;
                        font-weight: 700;
                        letter-spacing: -0.02em;
                    }
                    
                    .fp-username {
                        color: rgba(255,255,255,0.5);
                        font-size: 0.95rem;
                        margin-top: 6px;
                        font-weight: 500;
                    }
                    
                    .fp-status-tag {
                        background: rgba(255,255,255,0.08);
                        padding: 6px 16px;
                        border-radius: 20px;
                        font-size: 0.85rem;
                        color: rgba(255,255,255,0.8);
                        margin-top: 12px;
                        font-weight: 600;
                        border: 1px solid rgba(255,255,255,0.06);
                    }

                    .fp-stats-row {
                        display: flex;
                        justify-content: space-around;
                        width: 100%;
                        margin: 24px 0;
                        padding: 20px 0;
                        border-top: 1px solid rgba(255,255,255,0.06);
                        border-bottom: 1px solid rgba(255,255,255,0.06);
                        background: rgba(255,255,255,0.02);
                        border-radius: 16px;
                    }
                    
                    .fp-stat {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 6px;
                    }
                    
                    .fp-stat-val {
                        color: white;
                        font-weight: 700;
                        font-size: 1.15rem;
                        letter-spacing: -0.01em;
                    }
                    
                    .fp-stat-label {
                        color: rgba(255,255,255,0.4);
                        font-size: 0.7rem;
                        margin-top: 2px;
                        text-transform: uppercase;
                        letter-spacing: 0.8px;
                        font-weight: 700;
                    }

                    .fp-bio-section {
                        text-align: center;
                        width: 100%;
                        margin-bottom: 20px;
                        padding: 20px;
                        background: rgba(255,255,255,0.02);
                        border-radius: 16px;
                        border: 1px solid rgba(255,255,255,0.04);
                    }
                    
                    .fp-bio-section h3 {
                        color: rgba(255,255,255,0.4);
                        font-size: 0.75rem;
                        text-transform: uppercase;
                        margin-bottom: 12px;
                        letter-spacing: 1.2px;
                        font-weight: 700;
                    }
                    
                    .fp-bio-section p {
                        color: rgba(255,255,255,0.8);
                        font-size: 0.95rem;
                        line-height: 1.6;
                        margin: 0;
                        font-style: italic;
                    }

                    /* Media Section Styles */
                    .fp-media-section {
                        width: 100%;
                        margin-bottom: 24px;
                    }
                    .fp-media-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: baseline;
                        margin-bottom: 12px;
                        padding: 0 4px;
                    }
                    .fp-media-header h3 {
                        color: rgba(255,255,255,0.4);
                        font-size: 0.75rem;
                        text-transform: uppercase;
                        letter-spacing: 1.2px;
                        font-weight: 700;
                        margin: 0;
                    }
                    .fp-media-count {
                        color: rgba(255,255,255,0.3);
                        font-size: 0.75rem;
                    }
                    .fp-media-grid {
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        gap: 8px;
                    }
                    .fp-media-item {
                        aspect-ratio: 1;
                        border-radius: 12px;
                        overflow: hidden;
                        cursor: pointer;
                        position: relative;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.1);
                        transition: transform 0.2s;
                    }
                    .fp-media-item:hover {
                        transform: scale(1.03);
                        border-color: rgba(255,255,255,0.3);
                    }
                    .fp-media-item img {
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                    }

                    /* Media Viewer Overlay */
                    .fp-media-viewer {
                        position: fixed;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(0,0,0,0.95);
                        z-index: 3100;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        animation: fadeIn 0.2s;
                    }
                    .fp-media-viewer img {
                        max-width: 95%;
                        max-height: 95vh;
                        border-radius: 8px;
                        box-shadow: 0 0 50px rgba(0,0,0,0.5);
                    }
                    .fp-viewer-close {
                        position: absolute;
                        top: 20px;
                        right: 20px;
                        background: rgba(255,255,255,0.2);
                        border: none;
                        width: 40px;
                        height: 40px;
                        border-radius: 50%;
                        color: white;
                        font-size: 24px;
                        cursor: pointer;
                        display: flex; align-items: center; justify-content: center;
                    }
                    .fp-viewer-close:hover {
                        background: rgba(255,255,255,0.3);
                    }

                    .fp-interests-section {
                        width: 100%;
                        margin-bottom: 28px;
                    }

                    .fp-interests-section h3 {
                        color: rgba(255,255,255,0.4);
                        font-size: 0.75rem;
                        text-transform: uppercase;
                        margin-bottom: 12px;
                        letter-spacing: 1.2px;
                        font-weight: 700;
                        text-align: center;
                    }

                    .fp-interests-chips {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 8px;
                        justify-content: center;
                    }

                    .fp-interest-chip {
                        background: rgba(0, 132, 255, 0.15);
                        color: #00d4ff;
                        padding: 8px 16px;
                        border-radius: 18px;
                        font-size: 0.85rem;
                        font-weight: 500;
                        border: 1px solid rgba(0, 132, 255, 0.25);
                        transition: all 0.2s;
                    }

                    .fp-interest-chip:hover {
                        background: rgba(0, 132, 255, 0.25);
                        transform: scale(1.05);
                    }

                    .fp-actions {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 12px;
                        width: 100%;
                        margin-bottom: 24px;
                    }
                    
                    .fp-btn {
                        padding: 14px 16px;
                        border-radius: 14px;
                        border: none;
                        font-weight: 600;
                        font-size: 0.95rem;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    }
                    
                    .fp-btn:active {
                        transform: scale(0.96);
                    }
                    
                    .fp-btn.primary {
                        background: linear-gradient(135deg, #00C6FF 0%, #0072FF 100%);
                        color: white;
                        grid-column: span 2;
                        box-shadow: 0 8px 20px rgba(0, 114, 255, 0.3);
                    }
                    
                    .fp-btn.primary:hover {
                        box-shadow: 0 12px 28px rgba(0, 114, 255, 0.4);
                        transform: translateY(-2px);
                    }
                    
                    .fp-btn.secondary {
                        background: rgba(255,255,255,0.06);
                        color: white;
                        border: 1px solid rgba(255,255,255,0.08);
                    }
                    
                    .fp-btn.secondary:hover {
                        background: rgba(255,255,255,0.1);
                        transform: translateY(-2px);
                    }

                    .fp-footer-actions {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 16px;
                        padding-top: 16px;
                        border-top: 1px solid rgba(255,255,255,0.06);
                    }

                    .separator {
                        color: rgba(255,255,255,0.2);
                        font-size: 0.8rem;
                    }
                    
                    .fp-text-btn {
                        background: none;
                        border: none;
                        font-size: 0.875rem;
                        cursor: pointer;
                        opacity: 0.5;
                        transition: all 0.2s;
                        font-weight: 600;
                    }
                    
                    .fp-text-btn.danger {
                        color: #ff453a;
                    }
                    
                    .fp-text-btn:hover {
                        opacity: 1;
                        transform: scale(1.05);
                    }

                `}</style>
            </motion.div>
        </AnimatePresence>
    );
}
