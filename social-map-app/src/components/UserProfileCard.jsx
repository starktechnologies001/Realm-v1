import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAvatar2D, DEFAULT_MALE_AVATAR, DEFAULT_FEMALE_AVATAR, DEFAULT_GENERIC_AVATAR } from '../utils/avatarUtils';
import { supabase } from '../supabaseClient';

// Helper to format date
// Helper to format date safely for mobile Safari
const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
        if (typeof dateStr === 'string' && dateStr.length >= 10 && dateStr.includes('-')) {
            const [y, m, d] = dateStr.substring(0, 10).split('-');
            const dateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
            if (!isNaN(dateObj.getTime())) {
                return dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            }
        }
        const dateObj = new Date(dateStr);
        if (isNaN(dateObj.getTime())) return 'N/A';
        return dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    } catch (e) {
        return 'N/A';
    }
};

const formatJoinDate = (dateStr) => {
     if (!dateStr) return 'N/A';
     const date = new Date(dateStr);
     return date.toLocaleDateString(undefined, { day: 'numeric', month: 'numeric', year: '2-digit' }); // 3/6/26
};


export default function UserProfileCard({ user, onClose, onAction, currentUser }) {
    if (!user) return null;

    const [sharedMedia, setSharedMedia] = React.useState([]);
    const [previewImage, setPreviewImage] = React.useState(null);
    const [details, setDetails] = React.useState({
        bio: user.bio || "Loading...",
        interests: user.interests || [],
        birthDate: user.birthday || null,
        joinedAt: user.created_at || null,
        mutuals: 0,
        username: user.username || user.name, // fallback
        isPublic: false
    });

    // Fetch Details & Mutuals
    React.useEffect(() => {
        if (!user || !currentUser) return;

        const fetchExtendedDetails = async () => {
             // 1. Fetch Profile Columns
             const { data: profile } = await supabase
                .from('profiles')
                .select('bio, interests, birth_date, created_at, username, full_name, is_public')
                .eq('id', user.id)
                .maybeSingle();
            
             if (profile) {
                 // 2. Calculate Mutuals (Mockable or expensive query)
                 // Lightweight approach: Intersection of accepted friends
                 // Note: Ideally this should be an RPC function.
                 // For now, we'll do the client-side intersection if friend lists aren't too huge
                 
                 // Get MY friends
                 const { data: myFriends } = await supabase.from('friendships')
                    .select('receiver_id, requester_id')
                    .or(`requester_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
                    .eq('status', 'accepted');

                 const myFriendIds = new Set(myFriends?.map(f => f.requester_id === currentUser.id ? f.receiver_id : f.requester_id) || []);

                 // Get THEIR friends
                 const { data: theirFriends } = await supabase.from('friendships')
                    .select('receiver_id, requester_id')
                    .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)
                    .eq('status', 'accepted');
                 
                 const theirFriendIds = theirFriends?.map(f => f.requester_id === user.id ? f.receiver_id : f.requester_id) || [];
                 
                 const mutualCount = theirFriendIds.filter(id => myFriendIds.has(id)).length;

                 setDetails({
                     bio: profile.bio || "No bio set.",
                     interests: profile.interests || [],
                     birthDate: profile.birth_date,
                     joinedAt: profile.created_at,
                     mutuals: mutualCount,
                     username: profile.username || user.name,
                     isPublic: profile.is_public !== false
                 });
             }
        };

        fetchExtendedDetails();

        // 3. Fetch Media (Existing Logic)
        if (user.friendshipStatus === 'accepted') {
            const fetchMedia = async () => {
                const { data } = await supabase
                    .from('messages')
                    .select('content, image_url, created_at')
                    .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${user.id}),and(sender_id.eq.${user.id},receiver_id.eq.${currentUser.id})`)
                    .eq('message_type', 'image')
                    .not('image_url', 'is', null)
                    .order('created_at', { ascending: false })
                    .limit(5); 
                if (data) setSharedMedia(data);
            };
            fetchMedia();
        }
    }, [user, currentUser]);

    const handleMediaClick = (media, index) => {
        if (index === 3 && sharedMedia.length > 4) {
            onAction('message', user); // Go to chat to see all
        } else {
            setPreviewImage(media.image_url);
        }
    };

    const avatarUrl = user.avatar || user.avatar_url || (user.gender === 'Male' ? DEFAULT_MALE_AVATAR : user.gender === 'Female' ? DEFAULT_FEMALE_AVATAR : DEFAULT_GENERIC_AVATAR);
    const displayAvatar = getAvatar2D(avatarUrl);

    // Fields from State
    const bio = details.bio;
    const interests = details.interests; 
    const mutuals = details.mutuals; 
    const joinedDate = formatJoinDate(details.joinedAt); 
    const birthday = details.birthDate ? formatDate(details.birthDate) : null;
    const isPublic = details.isPublic;
    const isFriend = user.friendshipStatus === 'accepted';
    const canSeeFullProfile = isFriend || isPublic;

    return (
        <AnimatePresence>
            {/* Lightbox */}
            {previewImage && (
                <motion.div 
                    className="lightbox-overlay"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => setPreviewImage(null)}
                >
                    <img src={previewImage} alt="Full view" className="lightbox-img" />
                    <button className="lightbox-close">✕</button>
                    <style>{`
                        .lightbox-overlay {
                            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                            background: rgba(0,0,0,0.9); z-index: 3000;
                            display: flex; justify-content: center; align-items: center;
                        }
                        .lightbox-img {
                            max-width: 90%; max-height: 90%; border-radius: 8px;
                            box-shadow: 0 0 20px rgba(0,0,0,0.5);
                        }
                        .lightbox-close {
                            position: absolute; top: 20px; right: 20px;
                            background: rgba(255,255,255,0.1); border: none; color: white;
                            width: 40px; height: 40px; border-radius: 50%; font-size: 1.5rem;
                            cursor: pointer; display: flex; align-items: center; justify-content: center;
                        }
                    `}</style>
                </motion.div>
            )}

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
                    {/* Close Button */}
                    <button className="close-btn-floating" onClick={onClose}>✕</button>

                    <div className="card-header-centered">
                        <div className="avatar-ring-container">
                             <img 
                                src={displayAvatar} 
                                alt={user.name} 
                                className="avatar-main"
                            />
                             <div className={`status-dot-large ${user.isLocationOn ? 'online' : 'offline'}`} />
                        </div>
                        
                        <h2 className="user-name">{user.name}</h2>
                        <span className="user-handle">@{details.username}</span>
                        
                        <div className="header-badges">
                            {details.relationship_status && (
                                <div className="status-pill">
                                    {details.relationship_status}
                                </div>
                            )}

                            {isFriend && (
                                <span className="badge-pill friend-premium">
                                    🤝 Friend
                                </span>
                            )}
                            
                            {!isFriend && isPublic && (
                                <span className="badge-pill public-profile">
                                    🌍 Public
                                </span>
                            )}
                            
                            {!isFriend && !isPublic && (
                                <span className="badge-pill private-profile">
                                    🔒 Private
                                </span>
                            )}
                        </div>

                        {/* Uploaded Status / Thought */}
                        {(isPublic || isFriend) && user.thought && (
                            <div className="thought-bubble-container">
                                <span className="thought-bubble">{user.thought}</span>
                            </div>
                        )}
                    </div>

                    {/* Stats Row */}
                    {canSeeFullProfile && (
                        <div className="stats-container">
                            <div className="stat-item">
                                <span className="stat-value">{mutuals}</span>
                                <span className="stat-label">MUTUALS</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-value">{joinedDate}</span>
                                <span className="stat-label">JOINED</span>
                            </div>
                            {birthday && (
                                <div className="stat-item">
                                    <span className="stat-value">🎂 {birthday.split(' ').slice(0, 2).join(' ')}</span>
                                    <span className="stat-label">BIRTHDAY</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* About Section */}
                    {canSeeFullProfile && (
                        <div className="info-section">
                            <h4 className="section-title">ABOUT</h4>
                            <p className="bio-text">{bio}</p>
                        </div>
                    )}

                    {/* Interests Section */}
                    {canSeeFullProfile && interests.length > 0 && (
                        <div className="info-section">
                            <h4 className="section-title">INTERESTS</h4>
                            <div className="tags-row">
                                {interests.map((tag, i) => (
                                    <span key={i} className="interest-tag">{tag}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Shared Media Section */}
                    {user.friendshipStatus === 'accepted' && sharedMedia.length > 0 && (
                        <div className="info-section">
                            <h4 className="section-title">SHARED MEDIA</h4>
                            <div className="media-grid">
                                {sharedMedia.slice(0, 4).map((media, i) => (
                                    <div key={i} className="media-item" onClick={() => handleMediaClick(media, i)}>
                                        <img src={media.image_url} alt="Shared" />
                                        {i === 3 && sharedMedia.length > 4 && (
                                            <div className="media-overlay">
                                                <span>+More</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="action-buttons-container">
                        {user.friendshipStatus === 'accepted' ? (
                            <div className="action-row-icons">
                                <button className="btn-icon-action primary" onClick={() => onAction('message', user)} title="Message">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                </button>
                                <button className="btn-icon-action secondary" onClick={() => onAction('call-audio', user)} title="Voice Call">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                </button>
                                <button className="btn-icon-action secondary" onClick={() => onAction('call-video', user)} title="Video Call">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                                </button>
                            </div>
                        ) : (
                            <button 
                                className={`btn-message-large ${user.friendshipStatus === 'pending' && user.requesterId === currentUser?.id ? 'requested' : ''}`}
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

                    {/* Footer Actions */}
                    <div className="footer-links">
                        <button className="text-link danger" onClick={() => onAction('block', user)}>Block User</button>
                        <span className="divider">•</span>
                        <button className="text-link danger" onClick={() => onAction('report', user)}>Report User</button>
                    </div>

                </motion.div>

                <style>{`
                    .user-profile-overlay {
                        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(0,0,0,0.4);
                        backdrop-filter: blur(12px);
                        -webkit-backdrop-filter: blur(12px);
                        z-index: 2000;
                        display: flex; justify-content: center; align-items: flex-end;
                        padding-bottom: 20px;
                    }

                    .glass-panel {
                        background: var(--glass-bg);
                        backdrop-filter: blur(25px);
                        -webkit-backdrop-filter: blur(25px);
                        border: 1px solid var(--glass-border);
                        box-shadow: 0 40px 80px rgba(0,0,0,0.4);
                    }

                    .user-profile-card {
                        width: 92%; max-width: 420px;
                        border-radius: 40px;
                        padding: 32px 24px 40px 24px;
                        display: flex; flex-direction: column; align-items: center;
                        position: relative;
                        color: var(--text-primary);
                        max-height: 90vh;
                        overflow-y: auto;
                        scrollbar-width: none;
                    }
                    
                    .user-profile-card::-webkit-scrollbar { display: none; }

                    .close-btn-floating {
                        position: absolute; top: 20px; right: 20px;
                        width: 32px; height: 32px;
                        border-radius: 50%; background: var(--glass-border);
                        border: none; color: var(--text-primary); 
                        display: flex; align-items: center; justify-content: center;
                        cursor: pointer; font-size: 1rem;
                        transition: all 0.2s;
                        z-index: 10;
                    }
                    .close-btn-floating:hover { background: var(--text-primary); color: var(--bg-color); }

                    .card-header-centered {
                        display: flex; flex-direction: column; align-items: center; gap: 8px;
                        margin-bottom: 24px;
                        width: 100%;
                    }

                    .avatar-ring-container {
                        position: relative; width: 120px; height: 120px;
                        padding: 4px;
                        border-radius: 50%;
                        background: linear-gradient(135deg, var(--brand-primary), var(--brand-secondary));
                        box-shadow: 0 15px 35px rgba(0, 132, 255, 0.2);
                        margin-bottom: 8px;
                    }

                    .avatar-main {
                        width: 100%; height: 100%; border-radius: 50%; object-fit: cover;
                        border: 4px solid var(--bg-color);
                    }

                    .status-dot-large {
                        position: absolute; bottom: 8px; right: 8px;
                        width: 18px; height: 18px; border-radius: 50%;
                        border: 3px solid var(--bg-color);
                        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                    }
                    .status-dot-large.online { background: #34c759; }
                    .status-dot-large.offline { background: #8e8e93; }

                    .user-name { 
                        font-family: 'Outfit', 'Inter', sans-serif;
                        font-size: 1.85rem; font-weight: 700; margin: 0; 
                        letter-spacing: -0.5px;
                        color: var(--text-primary);
                    }
                    .user-handle {
                        font-size: 1rem; color: var(--text-secondary); 
                        font-weight: 500; margin-bottom: 4px;
                    }
                    
                    .btn-message-large.requested {
                        background: rgba(255, 149, 0, 0.1);
                        color: #ff9500;
                        border: 1px solid rgba(255, 149, 0, 0.3);
                    }
                    
                    .header-badges {
                        display: flex; flex-direction: row; justify-content: center; gap: 10px;
                        margin-top: 4px;
                    }

                    .status-pill {
                        background: var(--glass-border);
                        padding: 6px 14px; border-radius: 100px;
                        font-size: 0.8rem; color: var(--text-secondary);
                        font-weight: 600;
                    }

                    .badge-pill.friend-premium {
                        background: var(--brand-gradient);
                        color: white;
                        font-weight: 700;
                        font-size: 0.8rem;
                        padding: 6px 14px;
                        border-radius: 100px;
                        display: flex; align-items: center; gap: 4px;
                        box-shadow: 0 4px 12px rgba(0, 132, 255, 0.2);
                    }
                    
                    .badge-pill.public-profile {
                        background: rgba(52, 199, 89, 0.1);
                        color: #34c759;
                        border: 1px solid rgba(52, 199, 89, 0.2);
                        font-weight: 700;
                        font-size: 0.75rem;
                        padding: 6px 14px;
                        border-radius: 100px;
                    }
                    
                    .badge-pill.private-profile {
                        background: rgba(255, 255, 255, 0.05);
                        color: var(--text-secondary);
                        border: 1px solid var(--glass-border);
                        font-weight: 600;
                        font-size: 0.75rem;
                        padding: 6px 14px;
                        border-radius: 100px;
                    }

                    .thought-bubble-container {
                        margin-top: 16px;
                        width: 100%;
                        display: flex;
                        justify-content: center;
                    }
                    .thought-bubble {
                        background: white;
                        color: #1c1c1e;
                        padding: 10px 20px;
                        border-radius: 18px;
                        font-weight: 600;
                        font-size: 0.95rem;
                        position: relative;
                        box-shadow: 0 10px 25px rgba(0,0,0,0.1);
                        max-width: 85%;
                        text-align: center;
                    }
                    .thought-bubble::after {
                        content: '';
                        position: absolute;
                        top: -8px;
                        left: 50%;
                        transform: translateX(-50%);
                        border-left: 8px solid transparent;
                        border-right: 8px solid transparent;
                        border-bottom: 8px solid white;
                    }

                    .stats-container {
                        display: grid; grid-template-columns: repeat(3, 1fr); width: 100%;
                        padding: 24px 0; border-top: 1px solid var(--glass-border);
                        border-bottom: 1px solid var(--glass-border);
                        margin-bottom: 28px;
                        background: rgba(255,255,255,0.02);
                        border-radius: 20px;
                    }
                    .stat-item { 
                        display: flex; flex-direction: column; align-items: center; gap: 4px; 
                        border-right: 1px solid var(--glass-border);
                    }
                    .stat-item:last-child { border-right: none; }
                    .stat-value { font-size: 1rem; font-weight: 700; color: var(--text-primary); }
                    .stat-label { font-size: 0.65rem; color: var(--text-secondary); font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; }

                    .info-section {
                         width: 100%; text-align: left; margin-bottom: 28px;
                    }
                    .section-title { 
                        font-size: 0.75rem; color: var(--text-secondary); 
                        letter-spacing: 1.2px; margin-bottom: 12px; font-weight: 700; 
                        text-transform: uppercase;
                    }
                    .bio-text { 
                        color: var(--text-primary); font-size: 1rem; 
                        line-height: 1.6; font-weight: 400; margin: 0; 
                        background: var(--glass-border); padding: 18px; border-radius: 20px;
                    }

                    .tags-row { display: flex; gap: 8px; flex-wrap: wrap; }
                    .interest-tag {
                        background: var(--bg-secondary); color: var(--text-primary);
                        padding: 8px 16px; border-radius: 100px; font-size: 0.85rem; font-weight: 600;
                        border: 1px solid var(--glass-border);
                        transition: all 0.2s;
                    }
                    .interest-tag:hover { background: var(--brand-primary); color: white; border-color: transparent; }

                    .action-buttons-container { width: 100%; margin-bottom: 24px; }
                    
                    .btn-message-large {
                        width: 100%; padding: 18px; border-radius: 20px; border: none;
                        background: var(--brand-gradient);
                        color: white; font-weight: 700; font-size: 1.05rem;
                        cursor: pointer; box-shadow: 0 10px 25px rgba(0, 132, 255, 0.3);
                        transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
                    }
                    .btn-message-large:hover { transform: translateY(-3px); box-shadow: 0 15px 30px rgba(0, 132, 255, 0.4); }
                    .btn-message-large:active { transform: scale(0.98); }
                    
                    .action-row-icons {
                        display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; width: 100%;
                    }
                    .btn-icon-action {
                        height: 60px; border-radius: 20px; border: none;
                        cursor: pointer; display: flex; align-items: center; justify-content: center;
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        color: white;
                    }
                    .btn-icon-action.primary {
                        background: var(--brand-gradient);
                        box-shadow: 0 8px 20px rgba(0, 132, 255, 0.25);
                    }
                    .btn-icon-action.secondary {
                        background: var(--glass-border);
                        color: var(--text-primary);
                    }
                    .btn-icon-action:hover { transform: translateY(-3px); filter: brightness(1.1); }
                    .btn-icon-action:active { transform: scale(0.95); }

                    .media-grid {
                        display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
                    }
                    .media-item {
                        position: relative; aspect-ratio: 1; border-radius: 12px; overflow: hidden;
                        cursor: pointer; background: var(--glass-border);
                        transition: all 0.3s ease;
                    }
                    .media-item img { width: 100%; height: 100%; object-fit: cover; }
                    .media-item:hover { transform: scale(1.05); z-index: 5; box-shadow: 0 10px 20px rgba(0,0,0,0.2); }
                    
                    .footer-links { 
                        display: flex; gap: 16px; font-size: 0.85rem; color: var(--text-secondary); 
                        margin-top: 10px; width: 100%; justify-content: center;
                    }
                    .text-link { background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px 8px; transition: color 0.2s; font-weight: 600; }
                    .text-link.danger:hover { color: #ff3b30; }

                    @media (max-width: 768px) {
                        .user-profile-overlay { align-items: flex-end; padding: 0; }
                        .user-profile-card { width: 100%; border-radius: 35px 35px 0 0; max-height: 92vh; padding-bottom: calc(40px + env(safe-area-inset-bottom)); }
                        .avatar-ring-container { width: 100px; height: 100px; }
                        .user-name { font-size: 1.6rem; }
                        .btn-icon-action { height: 56px; }
                    }

                `}</style>
            </motion.div>
        </AnimatePresence>
    );
}
