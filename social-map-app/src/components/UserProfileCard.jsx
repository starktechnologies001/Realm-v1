import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAvatar2D, DEFAULT_MALE_AVATAR, DEFAULT_FEMALE_AVATAR, DEFAULT_GENERIC_AVATAR } from '../utils/avatarUtils';
import { supabase } from '../supabaseClient';

// Helper to format date
const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); // 3 Feb
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
        username: user.username || user.name // fallback
    });

    // Fetch Details & Mutuals
    React.useEffect(() => {
        if (!user || !currentUser) return;

        const fetchExtendedDetails = async () => {
             // 1. Fetch Profile Columns
             const { data: profile } = await supabase
                .from('profiles')
                .select('bio, interests, birth_date, created_at, username, full_name')
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
                     bio: profile.bio || "No bio available.",
                     interests: profile.interests || [],
                     birthDate: profile.birth_date,
                     joinedAt: profile.created_at,
                     mutuals: mutualCount,
                     username: profile.username || user.name
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
                            <div className="status-pill">
                                {user.relationship_status || 'Single'}
                            </div>

                            {user.friendshipStatus === 'accepted' && (
                                <span className="badge-pill friend-premium">
                                    🤝 Friend
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Stats Row */}
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

                    {/* About Section */}
                    <div className="info-section">
                        <h4 className="section-title">ABOUT</h4>
                        <p className="bio-text">{bio}</p>
                    </div>

                    {/* Interests Section */}
                    {interests.length > 0 && (
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
                                <button className="btn-icon-action primary" onClick={() => onAction('message', user)}>
                                    <span style={{ fontSize: '1.5rem' }}>💬</span>
                                </button>
                                <button className="btn-icon-action secondary" onClick={() => onAction('call-audio', user)}>
                                    <span style={{ fontSize: '1.5rem' }}>📞</span>
                                </button>
                                <button className="btn-icon-action secondary" onClick={() => onAction('call-video', user)}>
                                    <span style={{ fontSize: '1.5rem' }}>📹</span>
                                </button>
                            </div>
                        ) : (
                            <button 
                                className="btn-message-large"
                                style={{ background: 'linear-gradient(135deg, #00d4ff 0%, #0084ff 100%)' }}
                                onClick={() => onAction('poke', user)}
                            >
                                👋 Poke
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
                        background: rgba(0,0,0,0.6);
                        backdrop-filter: blur(8px);
                        -webkit-backdrop-filter: blur(8px);
                        z-index: 2000;
                        display: flex; justify-content: center; align-items: center;
                    }

                    .glass-panel {
                        background: radial-gradient(circle at top right, #2a2a2e 0%, #1c1c1e 100%);
                        border: 1px solid rgba(255, 255, 255, 0.08);
                        box-shadow: 0 40px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1);
                    }

                    .user-profile-card {
                        width: 90%; max-width: 400px;
                        border-radius: 32px;
                        padding: 32px 24px;
                        display: flex; flex-direction: column; align-items: center;
                        position: relative;
                        color: white;
                        max-height: 85vh;
                        overflow-y: auto;
                    }
                    
                    /* Custom Scrollbar */
                    .user-profile-card::-webkit-scrollbar { width: 4px; }
                    .user-profile-card::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }

                    .close-btn-floating {
                        position: absolute; top: 20px; right: 20px;
                        width: 36px; height: 36px;
                        border-radius: 50%; background: rgba(255,255,255,0.08);
                        border: none; color: rgba(255,255,255,0.6); 
                        display: flex; align-items: center; justify-content: center;
                        cursor: pointer; font-size: 1.2rem;
                        transition: all 0.2s;
                    }
                    .close-btn-floating:hover { background: rgba(255,255,255,0.15); color: white; transform: rotate(90deg); }

                    .card-header-centered {
                        display: flex; flex-direction: column; align-items: center; gap: 12px;
                        margin-bottom: 30px;
                        width: 100%;
                    }

                    .avatar-ring-container {
                        position: relative; width: 110px; height: 110px;
                        padding: 4px;
                        border-radius: 50%;
                        background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02));
                        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                    }

                    .avatar-main {
                        width: 100%; height: 100%; border-radius: 50%; object-fit: cover;
                        border: 3px solid #1c1c1e;
                    }

                    .status-dot-large {
                        position: absolute; bottom: 8px; right: 8px;
                        width: 20px; height: 20px; border-radius: 50%;
                        border: 3px solid #1c1c1e;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    }
                    .status-dot-large.online { background: #00ff88; box-shadow: 0 0 12px rgba(0, 255, 136, 0.6); }
                    .status-dot-large.offline { background: #666; }

                    .user-name { 
                        font-size: 1.75rem; font-weight: 800; margin: 8px 0 2px 0; 
                        letter-spacing: -0.5px;
                        background: linear-gradient(180deg, #fff 0%, #ddd 100%);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                    }
                    .user-handle {
                        font-size: 0.95rem; color: rgba(255,255,255,0.5); 
                        font-weight: 500; margin-bottom: 8px;
                    }
                    
                    .header-badges {
                        display: flex; flex-direction: column; align-items: center; gap: 8px;
                    }

                    .status-pill {
                        background: rgba(255,255,255,0.06);
                        padding: 6px 16px; border-radius: 20px;
                        font-size: 0.85rem; color: rgba(255,255,255,0.6);
                        font-weight: 500;
                        backdrop-filter: blur(4px);
                    }

                    .badge-pill.friend-premium {
                        background: linear-gradient(90deg, #00d4ff 0%, #0084ff 100%);
                        color: white;
                        border: none;
                        box-shadow: 0 4px 12px rgba(0, 132, 255, 0.3);
                        font-weight: 700;
                        font-size: 0.85rem;
                        padding: 6px 20px;
                        border-radius: 100px;
                        display: flex; align-items: center; gap: 6px;
                        margin-top: 6px;
                        letter-spacing: 0.5px;
                    }

                    .stats-container {
                        display: flex; justify-content: space-evenly; width: 100%;
                        padding: 20px 0; border-top: 1px solid rgba(255,255,255,0.06);
                        border-bottom: 1px solid rgba(255,255,255,0.06);
                        margin-bottom: 24px;
                    }
                    .stat-item { display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 1; }
                    .stat-value { font-size: 1.15rem; font-weight: 700; color: white; }
                    .stat-label { font-size: 0.65rem; color: rgba(255,255,255,0.4); font-weight: 700; letter-spacing: 1px; }
                    .stat-item:not(:last-child) { border-right: 1px solid rgba(255,255,255,0.06); }

                    .info-section {
                         width: 100%; text-align: left; margin-bottom: 24px;
                    }
                    .section-title { 
                        font-size: 0.75rem; color: rgba(255,255,255,0.4); 
                        letter-spacing: 1.5px; margin-bottom: 12px; font-weight: 700; 
                        text-transform: uppercase;
                        padding-left: 4px;
                    }
                    .bio-text { 
                        color: rgba(255,255,255,0.9); font-size: 0.95rem; 
                        line-height: 1.6; font-weight: 400; opacity: 1; margin: 0; 
                        background: rgba(255,255,255,0.03); padding: 16px; border-radius: 16px;
                    }

                    .tags-row { display: flex; gap: 8px; flex-wrap: wrap; }
                    .interest-tag {
                        background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.9);
                        padding: 8px 16px; border-radius: 12px; font-size: 0.85rem; font-weight: 500;
                        transition: all 0.2s; border: 1px solid rgba(255,255,255,0.05);
                    }
                    .interest-tag:hover {
                         background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2);
                    }

                    .action-buttons-container { width: 100%; display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; }
                    
                    .btn-message-large {
                        width: 100%; padding: 16px; border-radius: 18px; border: none;
                        background: linear-gradient(135deg, #00d4ff 0%, #0084ff 100%);
                        color: white; font-weight: 700; font-size: 1rem;
                        cursor: pointer; box-shadow: 0 8px 20px rgba(0, 132, 255, 0.3);
                        transition: all 0.2s; position: relative; overflow: hidden;
                    }
                    .btn-message-large:hover { transform: translateY(-2px); box-shadow: 0 12px 24px rgba(0, 132, 255, 0.4); }
                    .btn-message-large:active { transform: scale(0.98); }
                    
                    .call-buttons-row { display: flex; gap: 12px; }
                    .btn-call {
                        flex: 1; padding: 16px; border-radius: 18px; border: none;
                        background: rgba(255,255,255,0.05); color: white; font-weight: 600;
                        cursor: pointer; transition: all 0.2s; border: 1px solid rgba(255,255,255,0.05);
                    }
                    .btn-call:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.15); transform: translateY(-2px); }

                    .footer-links { 
                        display: flex; gap: 20px; font-size: 0.85rem; color: #666; 
                        margin-top: 10px; width: 100%; justify-content: center;
                    }
                    .text-link { background: none; border: none; color: #888; cursor: pointer; padding: 8px; transition: color 0.2s; font-weight: 500; }
                    .text-link.danger { color: #ff453a; opacity: 0.6; }
                    .text-link.danger:hover { opacity: 1; }
                    .text-link:hover { color: white; }
                    .divider { color: #444; }

                    .media-grid {
                        display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
                        margin-top: 10px;
                    }
                    .media-item {
                        position: relative; aspect-ratio: 1; border-radius: 16px; overflow: hidden;
                        cursor: pointer; background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.05);
                        transition: all 0.2s;
                    }
                    .media-item img {
                        width: 100%; height: 100%; object-fit: cover; transition: transform 0.4s;
                    }
                    .media-item:hover { transform: translateY(-2px); box-shadow: 0 8px 16px rgba(0,0,0,0.3); border-color: rgba(255,255,255,0.2); }
                    .media-item:hover img { transform: scale(1.1); }
                    .media-overlay {
                        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                        background: rgba(0,0,0,0.6);
                        backdrop-filter: blur(2px);
                        display: flex; align-items: center; justify-content: center;
                        color: white; font-size: 0.8rem; font-weight: 700;
                    }

                    .action-buttons-container { width: 100%; margin-bottom: 20px; }
                    .action-row-icons {
                        display: grid;
                        grid-template-columns: repeat(3, 1fr);
                        gap: 12px;
                        width: 100%;
                    }
                    .btn-icon-action {
                        padding: 16px;
                        border-radius: 20px;
                        border: none;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
                        aspect-ratio: 1.25;
                    }
                    .btn-icon-action:active { transform: scale(0.92); }
                    .btn-icon-action.primary {
                        background: linear-gradient(135deg, #00C6FF 0%, #0072FF 100%);
                        box-shadow: 0 8px 20px rgba(0, 114, 255, 0.3);
                    }
                    .btn-icon-action.secondary {
                        background: rgba(255,255,255,0.08);
                        border: 1px solid rgba(255,255,255,0.1);
                        color: white;
                    }
                `}</style>
            </motion.div>
        </AnimatePresence>
    );
}
