import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { getAvatar2D, DEFAULT_MALE_AVATAR, DEFAULT_FEMALE_AVATAR, DEFAULT_GENERIC_AVATAR } from '../utils/avatarUtils';
import './ProfileVisitors.css';

const formatRelativeTime = (dateStr) => {
    if (!dateStr) return 'recently';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) {
        if (diffHours === 1) return '1 hour ago';
        return `${diffHours} hours ago`;
    }
    
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    }
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export default function ProfileVisitors() {
    const navigate = useNavigate();
    const [user, setUser] = useState(() => {
        try { return JSON.parse(localStorage.getItem('currentUser') || 'null'); } catch { return null; }
    });
    const [visitors, setVisitors] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.id) {
            navigate('/login');
            return;
        }

        const fetchVisitors = async () => {
            try {
                const { data: vData, error } = await supabase
                    .from('profile_views')
                    .select('created_at, viewer:profiles!viewer_id(id, username, full_name, avatar_url, gender, subscription_tier)')
                    .eq('profile_owner_id', user.id)
                    .order('created_at', { ascending: false });

                if (error) throw error;

                let unique = [];
                if (vData) {
                    const seen = new Set();
                    vData.forEach(v => {
                        if (v.viewer && !seen.has(v.viewer.id)) {
                            seen.add(v.viewer.id);
                            unique.push({
                                created_at: v.created_at,
                                visitor: v.viewer
                            });
                        }
                    });
                }
                setVisitors(unique);
            } catch (err) {
                console.error("Failed to load profile visitors:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchVisitors();
    }, [user?.id, navigate]);

    if (loading) {
        return (
            <div className="visitors-page loading">
                <div className="spinner"></div>
                <p>Loading visitors...</p>
            </div>
        );
    }

    const isFree = !user?.subscription_tier || user?.subscription_tier === 'free';

    return (
        <div className="visitors-page">
            <header className="visitors-page-header">
                <button className="back-btn" onClick={() => navigate('/profile')}>&larr;</button>
                <h2>👀 Profile Visitors</h2>
                <span className="subtitle">{visitors.length} people visited your profile this week</span>
            </header>

            <div className="visitors-list-container">
                {isFree ? (
                    <div className="free-visitors-view">
                        <div className="masked-visitors-list">
                            {visitors.slice(0, Math.max(3, visitors.length)).map((v, i) => {
                                const placeholderName = `Nearo User ${i + 1}`;
                                const defaultAvatar = DEFAULT_GENERIC_AVATAR;
                                return (
                                    <div key={i} className="visitor-row-masked">
                                        <img src={defaultAvatar} alt="Avatar" className="visitor-avatar-blurred" />
                                        <div className="visitor-details">
                                            <span className="visitor-username-blurred">{placeholderName}</span>
                                            <span className="visitor-time">viewed you recently</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="upgrade-prompt-card">
                            <span className="lock-icon">🔒</span>
                            <h3>Upgrade to Silver to see who viewed you</h3>
                            <p>Unlock the visitor dashboard to see names, view timestamps, and message viewers directly.</p>
                            <button className="upgrade-btn-pri" onClick={() => navigate('/subscription')}>
                                Upgrade to Silver (₹99/mo)
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="premium-visitors-view">
                        {visitors.length === 0 ? (
                            <div className="empty-visitors">No visitors yet this week</div>
                        ) : (
                            visitors.map((v, i) => {
                                const profile = v.visitor || {};
                                const name = profile.full_name || profile.username || 'Visitor';
                                const avatar = getAvatar2D(profile.avatar_url || (profile.gender === 'Male' ? DEFAULT_MALE_AVATAR : profile.gender === 'Female' ? DEFAULT_FEMALE_AVATAR : DEFAULT_GENERIC_AVATAR));
                                const tier = profile.subscription_tier || 'free';
                                return (
                                    <div key={i} className="visitor-row-premium">
                                        <img src={avatar} alt={name} className="visitor-avatar-img" />
                                        <div className="visitor-details">
                                            <div className="visitor-username-row">
                                                <span className="visitor-username">{name}</span>
                                                {tier !== 'free' && (
                                                    <span className={`premium-tier-tag ${tier}`}>
                                                        {tier === 'silver' ? '🥈' : tier === 'gold' ? '🥇' : '💎'}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="visitor-time">{formatRelativeTime(v.created_at)}</span>
                                        </div>
                                        <button 
                                            className="chat-action-btn"
                                            onClick={() => navigate('/chat', { state: { targetUser: profile } })}
                                        >
                                            Message
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
