import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';

export default function FullProfileModal({ user, currentUser, onClose, onAction }) {
    const [stats, setStats] = useState({
        mutuals: 0,
        joinedDate: 'Loading...',
        bio: '',
        birthDate: null
    });

    useEffect(() => {
        const fetchDetails = async () => {
            if (!user || !currentUser) return;

            // 1. Fetch Profile Details (Bio, Joined, etc)
            const { data: profile } = await supabase
                .from('profiles')
                .select('bio, created_at, birth_date')
                .eq('id', user.id)
                .maybeSingle();

            // 2. Fetch Mutual Friends Count (Mock logic or complex query)
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
                birthDate: profile?.birth_date ? new Date(profile.birth_date).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : null
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
                            <img src={user.avatar?.replace('size=96', 'size=200')} alt={user.name} className="fp-avatar" />
                            <div className={`fp-status ${user.isLocationOn ? 'online' : 'offline'}`} />
                        </div>
                        <h2>{user.name}</h2>
                        <span className="fp-username">@{user.username || user.name.toLowerCase().replace(/\s/g, '')}</span>
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
                        <h3>About</h3>
                        <p>{stats.bio}</p>
                    </div>

                    {/* Action Grid */}
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

                    {/* Footer Actions */}
                    <div className="fp-footer-actions">
                         <button className="fp-text-btn danger" onClick={() => onAction('block', user)}>Block User</button>
                         <button className="fp-text-btn danger" onClick={() => onAction('report', user)}>Report User</button>
                    </div>

                </motion.div>

                <style>{`
                    .full-profile-backdrop {
                        position: fixed;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(0,0,0,0.7);
                        backdrop-filter: blur(8px);
                        z-index: 3000; /* Above everything */
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        padding: 20px;
                    }

                    .full-profile-modal {
                        background: #1a1a1a;
                        width: 100%;
                        max-width: 400px;
                        border-radius: 24px;
                        border: 1px solid rgba(255,255,255,0.1);
                        padding: 30px;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        position: relative;
                        box-shadow: 0 20px 50px rgba(0,0,0,0.5);
                        max-height: 90vh;
                        overflow-y: auto;
                    }

                    .close-btn {
                        position: absolute;
                        top: 15px; right: 15px;
                        background: none; border: none;
                        color: #666; font-size: 1.5rem;
                        cursor: pointer;
                        padding: 5px;
                    }
                    .close-btn:hover { color: white; }

                    .fp-header {
                        display: flex; flex-direction: column; align-items: center;
                        width: 100%;
                    }

                    .fp-avatar-container { position: relative; margin-bottom: 15px; }
                    .fp-avatar {
                        width: 110px; height: 110px;
                        border-radius: 50%;
                        border: 4px solid #111;
                        object-fit: cover;
                    }
                    .fp-status {
                        position: absolute; bottom: 5px; right: 5px;
                        width: 20px; height: 20px;
                        border-radius: 50%; border: 3px solid #1a1a1a;
                    }
                    .fp-status.online { background: #00ff88; box-shadow: 0 0 10px #00ff88; }
                    .fp-status.offline { background: #666; }

                    .fp-header h2 { margin: 0; color: white; font-size: 1.4rem; }
                    .fp-username { color: #888; font-size: 0.9rem; margin-top: 4px; }
                    .fp-status-tag {
                        background: rgba(255,255,255,0.1);
                        padding: 4px 12px;
                        border-radius: 20px;
                        font-size: 0.8rem;
                        color: #ccc;
                        margin-top: 10px;
                    }

                    .fp-stats-row {
                        display: flex; justify-content: space-around;
                        width: 100%;
                        margin: 25px 0;
                        padding: 15px 0;
                        border-top: 1px solid rgba(255,255,255,0.05);
                        border-bottom: 1px solid rgba(255,255,255,0.05);
                    }
                    .fp-stat { display: flex; flex-direction: column; align-items: center; }
                    .fp-stat-val { color: white; font-weight: 700; font-size: 1.1rem; }
                    .fp-stat-label { color: #666; font-size: 0.75rem; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }

                    .fp-bio-section { text-align: center; width: 100%; margin-bottom: 25px; }
                    .fp-bio-section h3 { color: #888; font-size: 0.8rem; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 1px; }
                    .fp-bio-section p { color: #ddd; font-size: 0.95rem; line-height: 1.5; margin: 0; font-style: italic; }

                    .fp-actions {
                        display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
                        width: 100%;
                        margin-bottom: 20px;
                    }
                    .fp-btn {
                        padding: 12px; border-radius: 12px; border: none;
                        font-weight: 600; cursor: pointer;
                        display: flex; align-items: center; justify-content: center; gap: 8px;
                        transition: transform 0.2s;
                    }
                    .fp-btn:active { transform: scale(0.96); }
                    .fp-btn.primary { 
                        background: var(--brand-gradient, linear-gradient(135deg, #00C6FF, #0072FF));
                        color: white;
                        grid-column: span 2;
                    }
                    .fp-btn.secondary { background: rgba(255,255,255,0.08); color: white; }

                    .fp-footer-actions { display: flex; gap: 20px; }
                    .fp-text-btn {
                        background: none; border: none;
                        font-size: 0.85rem; cursor: pointer;
                        opacity: 0.6; transition: opacity 0.2s;
                    }
                    .fp-text-btn.danger { color: #ff453a; }
                    .fp-text-btn:hover { opacity: 1; }

                `}</style>
            </motion.div>
        </AnimatePresence>
    );
}
