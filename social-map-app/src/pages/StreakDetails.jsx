import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { STREAK_MILESTONES, STREAK_REWARDS, getNextMilestone } from '../utils/streakUtils';
import './StreakDetails.css';

export default function StreakDetails() {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);

    useEffect(() => {
        try {
            const cachedUser = JSON.parse(localStorage.getItem('currentUser'));
            if (cachedUser) setUser(cachedUser);
        } catch (e) {}
    }, []);

    if (!user) return null;

    const currentStreak = user.current_streak || 0;
    const bestStreak = user.best_streak || 0;
    const nextMilestone = getNextMilestone(currentStreak);
    
    // Calculate progress percentage
    let progressPercent = 100;
    if (nextMilestone) {
        // Find previous milestone to calculate relative progress
        let prevMilestone = 0;
        for (let i = STREAK_MILESTONES.length - 1; i >= 0; i--) {
            if (STREAK_MILESTONES[i] <= currentStreak) {
                prevMilestone = STREAK_MILESTONES[i];
                break;
            }
        }
        
        const totalSteps = nextMilestone - prevMilestone;
        const currentSteps = currentStreak - prevMilestone;
        progressPercent = Math.min(100, Math.max(0, (currentSteps / totalSteps) * 100));
        
        // If they have 0 streak, progress is relative to milestone 3
        if (currentStreak === 0) {
            progressPercent = 0;
        }
    }

    return (
        <div className="streak-page">
            {/* Header / Nav */}
            <div className="app-header" style={{ position: 'relative', zIndex: 20, background: 'transparent', color: 'white', border: 'none' }}>
                <button className="back-btn" onClick={() => navigate(-1)} style={{ color: 'white' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="19" y1="12" x2="5" y2="12"></line>
                        <polyline points="12 19 5 12 12 5"></polyline>
                    </svg>
                </button>
                <h2 style={{ color: 'white' }}>Your Streak</h2>
                <div style={{ width: 24 }}></div>
            </div>

            <div className="streak-hero">
                <div className="streak-hero-icon">🔥</div>
                <h1 className="streak-hero-count">{currentStreak}</h1>
                <div className="streak-hero-label">Day Streak</div>
            </div>

            <div className="streak-content">
                <div className="streak-stats-row">
                    <div className="streak-stat-card">
                        <div className="stat-card-icon">🔥</div>
                        <div className="stat-card-value">{currentStreak} Days</div>
                        <div className="stat-card-label">Current</div>
                    </div>
                    <div className="streak-stat-card">
                        <div className="stat-card-icon">🏆</div>
                        <div className="stat-card-value">{bestStreak} Days</div>
                        <div className="stat-card-label">Best</div>
                    </div>
                </div>

                {nextMilestone && (
                    <div className="streak-progress-card">
                        <div className="progress-header">
                            <span className="progress-title">Next Goal</span>
                            <span className="progress-target">{nextMilestone} Days</span>
                        </div>
                        <div className="progress-bar-container">
                            <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }}></div>
                        </div>
                    </div>
                )}

                <div className="milestones-section">
                    <h3 className="milestones-title">Milestones & Rewards</h3>
                    
                    {STREAK_MILESTONES.map((days) => {
                        const reward = STREAK_REWARDS[days];
                        const isUnlocked = currentStreak >= days;
                        
                        return (
                            <div key={days} className={`milestone-item ${isUnlocked ? 'unlocked' : ''}`}>
                                <div className="milestone-icon-box" style={{ 
                                    color: isUnlocked ? reward.color : 'inherit'
                                }}>
                                    {reward.icon}
                                </div>
                                <div className="milestone-info">
                                    <div className="milestone-day">{days} Days</div>
                                    <div className="milestone-name">{reward.title}</div>
                                </div>
                                {isUnlocked && (
                                    <div className="milestone-status">
                                        Unlocked
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
