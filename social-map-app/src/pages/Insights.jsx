import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { getAvatar2D, DEFAULT_MALE_AVATAR, DEFAULT_FEMALE_AVATAR, DEFAULT_GENERIC_AVATAR } from '../utils/avatarUtils';
import confetti from 'canvas-confetti';
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
    const [reactors, setReactors] = useState([]);
    const [activeTab, setActiveTab] = useState('visitors'); // 'visitors' or 'reactors'
    
    const [analytics, setAnalytics] = useState({
        profileViews: 0,
        thoughtViews: 0,
        reactorsCount: 0,
        superPokes: 0,
        newVisitors: 0,
        totalChats: 0,
        friendRequests: 0,
        growthRate: 0,
        peakHours: 'Evening 6 PM - 12 AM 🌙',
        weeklyData: []
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.id) {
            navigate('/login');
            return;
        }

        const fetchInsightsData = async () => {
            try {
                // 1. Fetch visitors profile views
                const { data: vData } = await supabase
                    .from('profile_views')
                    .select('created_at, viewer_id, viewer:profiles!viewer_id(id, username, full_name, avatar_url, gender, subscription_tier)')
                    .eq('profile_owner_id', user.id)
                    .order('created_at', { ascending: false });

                // De-duplicate visitors for list but keep all records for growth/views calculations
                let uniqueVisitors = [];
                const seenViewerIds = new Set();
                if (vData) {
                    vData.forEach(v => {
                        if (v.viewer && !seenViewerIds.has(v.viewer.id)) {
                            seenViewerIds.add(v.viewer.id);
                            uniqueVisitors.push({
                                created_at: v.created_at,
                                visitor: v.viewer
                            });
                        }
                    });
                }
                setVisitors(uniqueVisitors);

                // 2. Fetch thought views (Gold/Diamond only)
                const { data: tViews } = await supabase
                    .from('thought_views')
                    .select('created_at')
                    .eq('thought_owner_id', user.id);

                // 3. Fetch reactors (thought_reactions)
                const { data: rxData } = await supabase
                    .from('thought_reactions')
                    .select(`
                        created_at,
                        reaction_type,
                        user:profiles!user_id(id, username, full_name, avatar_url, gender, subscription_tier)
                    `)
                    .eq('thought_id', user.id)
                    .order('created_at', { ascending: false });
                setReactors(rxData || []);

                // 4. Fetch pokes received (pending friendships count)
                const { count: pokesCount } = await supabase
                    .from('friendships')
                    .select('id', { count: 'exact', head: true })
                    .eq('receiver_id', user.id)
                    .eq('status', 'pending');

                // 4b. Fetch actual super pokes count
                const { count: superPokesCount } = await supabase
                    .from('friendships')
                    .select('id', { count: 'exact', head: true })
                    .eq('receiver_id', user.id)
                    .eq('is_super_poke', true);

                // 5. Fetch friends count
                const { count: friendsCount } = await supabase
                    .from('friendships')
                    .select('id', { count: 'exact', head: true })
                    .eq('status', 'accepted')
                    .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

                // 6. Fetch total chat rooms count (distinct messages exchanges)
                const { data: msgData } = await supabase
                    .from('messages')
                    .select('sender_id, receiver_id')
                    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

                const chatPartners = new Set();
                if (msgData) {
                    msgData.forEach(m => {
                        if (m.sender_id !== user.id) chatPartners.add(m.sender_id);
                        if (m.receiver_id !== user.id) chatPartners.add(m.receiver_id);
                    });
                }

                // 7. Calculate calculations (Growth rates & active hours)
                const now = new Date();
                const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

                const recentViews = (vData || []).filter(v => new Date(v.created_at) >= sevenDaysAgo);
                const prevWeekViews = (vData || []).filter(v => {
                    const d = new Date(v.created_at);
                    return d >= fourteenDaysAgo && d < sevenDaysAgo;
                });

                // growth rate calculation
                let growth = 0;
                if (prevWeekViews.length > 0) {
                    growth = Math.round(((recentViews.length - prevWeekViews.length) / prevWeekViews.length) * 100);
                } else if (recentViews.length > 0) {
                    growth = 100;
                }

                // new unique visitors count
                const newVisitorsVal = new Set(recentViews.map(v => v.viewer_id)).size;

                // Active Hours peak
                const hourSlots = { night: 0, morning: 0, afternoon: 0, evening: 0 };
                (vData || []).forEach(v => {
                    const hr = new Date(v.created_at).getHours();
                    if (hr >= 0 && hr < 6) hourSlots.night += 1;
                    else if (hr >= 6 && hr < 12) hourSlots.morning += 1;
                    else if (hr >= 12 && hr < 18) hourSlots.afternoon += 1;
                    else hourSlots.evening += 1;
                });

                let peakStr = 'Evening 6 PM - 12 AM 🌙';
                let maxViews = hourSlots.evening;
                if (hourSlots.afternoon > maxViews) { maxViews = hourSlots.afternoon; peakStr = 'Afternoon 12 PM - 6 PM ☀️'; }
                if (hourSlots.morning > maxViews) { maxViews = hourSlots.morning; peakStr = 'Morning 6 AM - 12 PM 🌅'; }
                if (hourSlots.night > maxViews) { maxViews = hourSlots.night; peakStr = 'Night 12 AM - 6 AM 💤'; }

                // Weekly Chart Data
                const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const weeklyList = Array(7).fill(0).map((_, i) => {
                    const dateObj = new Date();
                    dateObj.setDate(now.getDate() - (6 - i));
                    return {
                        day: days[dateObj.getDay()],
                        dateStr: dateObj.toDateString(),
                        count: 0
                    };
                });
                (vData || []).forEach(v => {
                    const vDate = new Date(v.created_at).toDateString();
                    const dMatch = weeklyList.find(w => w.dateStr === vDate);
                    if (dMatch) dMatch.count += 1;
                });

                setAnalytics({
                    profileViews: vData?.length || 0,
                    thoughtViews: tViews?.length || 0,
                    reactorsCount: rxData?.length || 0,
                    superPokes: superPokesCount || 0,
                    newVisitors: newVisitorsVal,
                    totalChats: chatPartners.size,
                    friendRequests: pokesCount || 0,
                    growthRate: growth,
                    peakHours: peakStr,
                    weeklyData: weeklyList
                });

                // Shimmer confetti on entering if Diamond Elite
                if (user?.subscription_tier === 'diamond') {
                    confetti({
                        particleCount: 50,
                        spread: 50,
                        colors: ['#06b6d4', '#ffffff'],
                        origin: { y: 0.8, x: 0.5 }
                    });
                }

            } catch (err) {
                console.error("Failed to load insights:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchInsightsData();
    }, [user?.id, navigate]);

    if (loading) {
        return (
            <div className="insights-page loading">
                <div className="insights-spinner-glow"></div>
                <p style={{ color: '#aaa', fontWeight: 600 }}>Analyzing profile metrics...</p>
            </div>
        );
    }

    const tier = user?.subscription_tier || 'free';
    const isFree = tier === 'free';
    const isSilver = tier === 'silver' || tier === 'gold' || tier === 'diamond';
    const isGoldOrAbove = tier === 'gold' || tier === 'diamond';

    return (
        <div className="insights-page" data-tier={tier}>
            <header className="insights-page-header">
                <button className="back-btn" onClick={() => navigate('/profile')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                </button>
                <h2>👀 Insights Dashboard</h2>
                <span className="subtitle">Real-time performance of your profile</span>
            </header>

            <div className="insights-content">
                {/* 1. Quick Stats Overview Grid (Visible to all, thoughtViews conditionally locked for Free/Silver) */}
                <div className="analytics-grid">
                    <div className="analytics-card border-glow">
                        <span className="analytics-icon">📊</span>
                        <span className="analytics-value">{analytics.profileViews}</span>
                        <span className="analytics-label">Profile Views</span>
                    </div>
                    
                    <div className="analytics-card border-glow relative-locked">
                        <span className="analytics-icon">💭</span>
                        {!isGoldOrAbove ? (
                            <>
                                <span className="analytics-value blurred-text">999</span>
                                <span className="analytics-label lock-hint">Thought Views 🔒</span>
                            </>
                        ) : (
                            <>
                                <span className="analytics-value">{analytics.thoughtViews}</span>
                                <span className="analytics-label">Thought Views</span>
                            </>
                        )}
                    </div>
                    
                    <div className="analytics-card border-glow">
                        <span className="analytics-icon">❤️</span>
                        <span className="analytics-value">{analytics.reactorsCount}</span>
                        <span className="analytics-label">Reactors</span>
                    </div>

                    <div className="analytics-card border-glow">
                        <span className="analytics-icon">⭐</span>
                        <span className="analytics-value">{analytics.superPokes}</span>
                        <span className="analytics-label">Super Pokes</span>
                    </div>
                </div>

                {/* 2. Advanced Analytics Dashboard (Gold/Diamond Feature) */}
                <div className="advanced-analytics-section">
                    <div className="section-title">
                        <h3>📈 Advanced Profile Analytics</h3>
                    </div>

                    {!isGoldOrAbove ? (
                        <div className="locked-dashboard-wrapper">
                            {/* Masked Preview of Charts */}
                            <div className="masked-dashboard-preview">
                                <div className="growth-preview-row">
                                    <div className="metric-box">
                                        <h4>GROWTH</h4>
                                        <span className="metric-num">+24%</span>
                                    </div>
                                    <div className="metric-box">
                                        <h4>PEAK TIME</h4>
                                        <span className="metric-num">9:00 PM</span>
                                    </div>
                                </div>
                                <div className="bar-chart-preview">
                                    <div className="chart-bar" style={{ height: '30%' }}></div>
                                    <div className="chart-bar" style={{ height: '45%' }}></div>
                                    <div className="chart-bar" style={{ height: '70%' }}></div>
                                    <div className="chart-bar" style={{ height: '55%' }}></div>
                                    <div className="chart-bar" style={{ height: '80%' }}></div>
                                </div>
                            </div>
                            <div className="dashboard-upgrade-overlay">
                                <span className="gold-crown-icon">👑</span>
                                <h3>Unlock Advanced Analytics</h3>
                                <p>Upgrade to Gold Elite to see weekly view trends, peak active hours, profile growth rates, messaging & network counts.</p>
                                <button className="upgrade-dashboard-btn" onClick={() => navigate('/subscription')}>
                                    Upgrade to Gold Elite
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="unlocked-dashboard-container">
                            <div className="analytics-row-double">
                                {/* Growth Card */}
                                <div className="dashboard-subcard growth-card">
                                    <span className="subcard-title">WEEKLY GROWTH</span>
                                    <div className="growth-value-row">
                                        <span className="growth-indicator positive">
                                            {analytics.growthRate >= 0 ? `▲ +${analytics.growthRate}%` : `▼ ${analytics.growthRate}%`}
                                        </span>
                                        <span className="growth-subtext">vs last week</span>
                                    </div>
                                    <div className="dashboard-metric-row">
                                        <div className="metric-item">
                                            <span className="metric-label">New Visitors</span>
                                            <span className="metric-val">{analytics.newVisitors}</span>
                                        </div>
                                        <div className="metric-item">
                                            <span className="metric-label">Active Chats</span>
                                            <span className="metric-val">{analytics.totalChats}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Active Hours */}
                                <div className="dashboard-subcard peak-hours-card">
                                    <span className="subcard-title">PEAK VISITOR HOURS</span>
                                    <div className="peak-hour-badge">
                                        {analytics.peakHours}
                                    </div>
                                    <p className="peak-hour-explanation">
                                        Most users browse your map profile during this time frame. Optimize post timings!
                                    </p>
                                </div>
                            </div>

                            {/* Weekly Chart */}
                            <div className="dashboard-subcard weekly-chart-card">
                                <span className="subcard-title">WEEKLY PROFILE VIEWS</span>
                                <div className="weekly-bar-chart">
                                    {analytics.weeklyData.map((data, i) => {
                                        // Calculate height relative to max views (default fallback max view count 10 for sizing)
                                        const maxCount = Math.max(...analytics.weeklyData.map(d => d.count), 5);
                                        const heightPct = Math.min(100, Math.max(8, (data.count / maxCount) * 100));
                                        return (
                                            <div key={i} className="chart-bar-container">
                                                <span className="bar-count-label">{data.count}</span>
                                                <div 
                                                    className="interactive-chart-bar" 
                                                    style={{ height: `${heightPct}%` }}
                                                    title={`${data.count} views on ${data.day}`}
                                                ></div>
                                                <span className="bar-day-label">{data.day}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* 3. Tabbed Visitors & See Reactors List (Silver & above) */}
                <div className="list-console-section">
                    <div className="tab-header">
                        <button 
                            className={`tab-btn ${activeTab === 'visitors' ? 'active' : ''}`}
                            onClick={() => setActiveTab('visitors')}
                        >
                            👥 Profile Visitors ({visitors.length})
                        </button>
                        <button 
                            className={`tab-btn ${activeTab === 'reactors' ? 'active' : ''}`}
                            onClick={() => setActiveTab('reactors')}
                        >
                            ❤️ See Reactors ({reactors.length})
                        </button>
                    </div>

                    {!isSilver ? (
                        <div className="free-visitors-view border-glow">
                            <div className="masked-visitors-list">
                                {[1, 2, 3].map((_, i) => (
                                    <div key={i} className="visitor-row-masked">
                                        <div className="visitor-avatar-blurred"></div>
                                        <div className="visitor-details">
                                            <span className="visitor-username-blurred">Nearo Member</span>
                                            <span className="visitor-time">viewed you recently</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="upgrade-prompt-card">
                                <span className="lock-icon">🔒</span>
                                <h3>Unlock Visitors & Reactions</h3>
                                <p>Upgrade to Silver Premium to see detailed visitor logs, reaction timestamps, and chat with profile viewers.</p>
                                <button className="upgrade-btn-pri" onClick={() => navigate('/subscription')}>
                                    Upgrade to Silver (₹99)
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="premium-list-container border-glow">
                            {activeTab === 'visitors' ? (
                                visitors.length === 0 ? (
                                    <div className="empty-list-placeholder">
                                        <span>👥</span>
                                        <p>No profile visits logged in the last 30 days.</p>
                                    </div>
                                ) : (
                                    <div className="scrollable-list">
                                        {visitors.map((v, i) => {
                                            const prof = v.visitor || {};
                                            const name = prof.full_name || prof.username || 'Nearo User';
                                            const avatar = getAvatar2D(prof.avatar_url || (prof.gender === 'Male' ? DEFAULT_MALE_AVATAR : prof.gender === 'Female' ? DEFAULT_FEMALE_AVATAR : DEFAULT_GENERIC_AVATAR));
                                            const vTier = prof.subscription_tier || 'free';
                                            return (
                                                <div key={i} className="visitor-row-premium">
                                                    <div className="visitor-avatar-container">
                                                        <img 
                                                            src={avatar} 
                                                            alt={name} 
                                                            className={`visitor-avatar-img ${vTier !== 'free' ? `ring-${vTier}` : ''}`} 
                                                        />
                                                    </div>
                                                    <div className="visitor-details">
                                                        <div className="visitor-username-row">
                                                            <span className="visitor-username">{name}</span>
                                                            {vTier === 'silver' && <span className="badge-inline">🥈</span>}
                                                            {vTier === 'gold' && <span className="badge-inline">🥇</span>}
                                                            {vTier === 'diamond' && <span className="badge-inline">💎</span>}
                                                        </div>
                                                        <span className="visitor-time">Visited {formatRelativeTime(v.created_at)}</span>
                                                    </div>
                                                    <button 
                                                        className="chat-action-btn"
                                                        onClick={() => navigate('/chat', { state: { targetUser: prof } })}
                                                    >
                                                        Message
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )
                            ) : (
                                reactors.length === 0 ? (
                                    <div className="empty-list-placeholder">
                                        <span>❤️</span>
                                        <p>No thought reactions received yet.</p>
                                    </div>
                                ) : (
                                    <div className="scrollable-list">
                                        {reactors.map((r, i) => {
                                            const prof = r.user || {};
                                            const name = prof.full_name || prof.username || 'Nearo User';
                                            const avatar = getAvatar2D(prof.avatar_url || (prof.gender === 'Male' ? DEFAULT_MALE_AVATAR : prof.gender === 'Female' ? DEFAULT_FEMALE_AVATAR : DEFAULT_GENERIC_AVATAR));
                                            const rTier = prof.subscription_tier || 'free';
                                            
                                            // Map reaction type to emoji
                                            const emojiMap = { love: '❤️', fire: '🔥', laugh: '😂', clap: '👏' };
                                            const emoji = emojiMap[r.reaction_type] || '❤️';

                                            return (
                                                <div key={i} className="visitor-row-premium">
                                                    <div className="visitor-avatar-container">
                                                        <img 
                                                            src={avatar} 
                                                            alt={name} 
                                                            className={`visitor-avatar-img ${rTier !== 'free' ? `ring-${rTier}` : ''}`} 
                                                        />
                                                        <span className="reaction-bubble-overlap">{emoji}</span>
                                                    </div>
                                                    <div className="visitor-details">
                                                        <div className="visitor-username-row">
                                                            <span className="visitor-username">{name}</span>
                                                            {rTier === 'silver' && <span className="badge-inline">🥈</span>}
                                                            {rTier === 'gold' && <span className="badge-inline">🥇</span>}
                                                            {rTier === 'diamond' && <span className="badge-inline">💎</span>}
                                                        </div>
                                                        <span className="visitor-time">Reacted {formatRelativeTime(r.created_at)}</span>
                                                    </div>
                                                    <button 
                                                        className="chat-action-btn"
                                                        onClick={() => navigate('/chat', { state: { targetUser: prof } })}
                                                    >
                                                        Message
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

