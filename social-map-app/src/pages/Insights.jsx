import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { getAvatar2D, DEFAULT_MALE_AVATAR, DEFAULT_FEMALE_AVATAR, DEFAULT_GENERIC_AVATAR } from '../utils/avatarUtils';
import './Insights.css';

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

export default function Insights() {
    const navigate = useNavigate();
    const [user, setUser] = useState(() => {
        try { return JSON.parse(localStorage.getItem('currentUser') || 'null'); } catch { return null; }
    });
    
    const [visitors, setVisitors] = useState([]);
    const [analytics, setAnalytics] = useState({ views: 0, reactions: 0, pokes: 0, friends: 0, clickRate: '0%', activity: '0%' });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.id) {
            navigate('/login');
            return;
        }

        const fetchInsightsData = async () => {
            try {
                // 1. Fetch friends count
                const { count: friendsCount } = await supabase
                    .from('friendships')
                    .select('id', { count: 'exact', head: true })
                    .eq('status', 'accepted')
                    .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

                // 2. Fetch visitors
                const { data: vData } = await supabase
                    .from('profile_views')
                    .select('created_at, viewer:profiles!viewer_id(id, username, full_name, avatar_url, gender, subscription_tier)')
                    .eq('profile_owner_id', user.id)
                    .order('created_at', { ascending: false });

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

                // 3. Fetch thought reactions
                const { count: reactionsCount } = await supabase
                    .from('thought_reactions')
                    .select('id', { count: 'exact', head: true })
                    .eq('thought_id', user.id); // Assuming thought_id logic maps to user for now, or similar logic from Profile

                // 4. Fetch pokes received (pending requests)
                const { count: pokesCount } = await supabase
                    .from('friendships')
                    .select('id', { count: 'exact', head: true })
                    .eq('receiver_id', user.id)
                    .eq('status', 'pending');

                const viewsVal = unique.length;
                const reactionsVal = reactionsCount || 0;
                const pokesVal = pokesCount || 0;
                const friendsVal = friendsCount || 0;
                const clickRateVal = viewsVal > 0 ? Math.min(100, Math.round((viewsVal / (friendsVal + 5)) * 100)) + '%' : '0%';
                const activityVal = user.streak_count > 0 ? Math.min(100, user.streak_count * 14) + '%' : '15%';

                setAnalytics({
                    views: viewsVal,
                    reactions: reactionsVal,
                    pokes: pokesVal,
                    friends: friendsVal,
                    clickRate: clickRateVal,
                    activity: activityVal
                });

            } catch (err) {
                console.error("Failed to load insights data:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchInsightsData();
    }, [user?.id, user?.streak_count, navigate]);

    if (loading) {
        return (
            <div className="insights-page loading">
                <div className="spinner"></div>
                <p>Loading insights...</p>
            </div>
        );
    }

    const isFree = !user?.subscription_tier || user?.subscription_tier === 'free';

    return (
        <div className="insights-page">
            <header className="insights-page-header">
                <button className="back-btn" onClick={() => navigate('/profile')}>&larr;</button>
                <h2>👀 Insights</h2>
                <span className="subtitle">Your profile performance this week</span>
            </header>

            <div className="insights-content">
                {/* Analytics Overview Grid */}
                <div className="analytics-grid">
                    <div className="analytics-card">
                        <span className="analytics-icon">📊</span>
                        <span className="analytics-value">{analytics.views}</span>
                        <span className="analytics-label">Profile Views</span>
                    </div>
                    <div className="analytics-card">
                        <span className="analytics-icon">❤️</span>
                        <span className="analytics-value">{analytics.reactions}</span>
                        <span className="analytics-label">Reactors</span>
                    </div>
                    <div className="analytics-card">
                        <span className="analytics-icon">⭐</span>
                        <span className="analytics-value">{analytics.pokes}</span>
                        <span className="analytics-label">Super Pokes</span>
                    </div>
                    <div className="analytics-card">
                        <span className="analytics-icon">🔥</span>
                        <span className="analytics-value">{analytics.activity}</span>
                        <span className="analytics-label">Activity Rate</span>
                    </div>
                </div>

                {/* Profile Visitors Section */}
                <div className="visitors-section">
                    <div className="section-title">
                        <h3>👀 Profile Visitors</h3>
                    </div>

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
        </div>
    );
}
