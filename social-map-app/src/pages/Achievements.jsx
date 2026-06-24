import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { ACHIEVEMENTS, checkUnlockedAchievements } from '../utils/premiumUtils';
import './Achievements.css';

export default function Achievements() {
    const navigate = useNavigate();
    const [user, setUser] = useState(() => {
        try { return JSON.parse(localStorage.getItem('currentUser') || 'null'); } catch { return null; }
    });
    const [unlocked, setUnlocked] = useState([]);
    const [stats, setStats] = useState({ friends: 0, thoughts: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.id) {
            navigate('/login');
            return;
        }

        const fetchStatsAndAchievements = async () => {
            try {
                // 1. Fetch friends count
                const { count: friendsCount } = await supabase
                    .from('friendships')
                    .select('id', { count: 'exact', head: true })
                    .eq('status', 'accepted')
                    .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

                // 2. Fetch thoughts count
                const { count: thoughtsCount } = await supabase
                    .from('stories')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', user.id);

                const currentFriends = friendsCount || 0;
                const currentThoughts = thoughtsCount || 0;
                setStats({ friends: currentFriends, thoughts: currentThoughts });

                // 3. Compute achievements
                const unlockedIds = checkUnlockedAchievements(user, currentFriends, currentThoughts);
                setUnlocked(unlockedIds);
            } catch (err) {
                console.error("Failed to load achievements stats:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchStatsAndAchievements();
    }, [user?.id, navigate]);

    if (loading) {
        return (
            <div className="achievements-page loading">
                <div className="spinner"></div>
                <p>Loading achievements...</p>
            </div>
        );
    }

    const percent = Math.round((unlocked.length / ACHIEVEMENTS.length) * 100);

    return (
        <div className="achievements-page">
            <header className="achievements-page-header">
                <button className="back-btn" onClick={() => navigate('/profile')}>&larr;</button>
                <h2>🏆 Achievements</h2>
                <span className="subtitle">Earn badges by engaging on Nearo</span>
            </header>

            <div className="progress-card">
                <div className="progress-info">
                    <span className="progress-label">Completion Progress</span>
                    <span className="progress-value">{unlocked.length} of {ACHIEVEMENTS.length} unlocked</span>
                </div>
                <div className="progress-bar-bg">
                    <div className="progress-bar-fill" style={{ width: `${percent}%` }}></div>
                </div>
                <span className="progress-percentage">{percent}% Complete</span>
            </div>

            <div className="achievements-grid-list">
                {ACHIEVEMENTS.map(ach => {
                    const isUnlocked = unlocked.includes(ach.id);
                    return (
                        <div key={ach.id} className={`ach-card ${isUnlocked ? 'unlocked' : 'locked'}`}>
                            <div className="ach-icon-wrapper">
                                <span className="ach-icon">{isUnlocked ? ach.icon : '🔒'}</span>
                            </div>
                            <div className="ach-card-content">
                                <div className="ach-card-header-row">
                                    <span className="ach-title">{ach.title}</span>
                                    <span className={`ach-status-badge ${isUnlocked ? 'status-unlocked' : 'status-locked'}`}>
                                        {isUnlocked ? 'Unlocked' : 'Locked'}
                                    </span>
                                </div>
                                <p className="ach-desc">{ach.desc}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
