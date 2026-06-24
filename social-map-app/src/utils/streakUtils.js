import { supabase } from '../supabaseClient';

// Milestone definitions
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 365];

export const STREAK_REWARDS = {
    3: { title: "Getting Started", icon: "🔥", color: "#ff8c00" },
    7: { title: "Consistent", icon: "🔥", color: "#ff5e00" },
    14: { title: "Two Weeks Strong", icon: "🔥", color: "#ff3c00" },
    30: { title: "Dedicated Member", icon: "🏆", color: "#facc15" },
    50: { title: "Half Century", icon: "⭐", color: "#3b82f6" },
    100: { title: "Nearo Veteran", icon: "👑", color: "#9333ea" },
    365: { title: "One Year Legend", icon: "💎", color: "#ec4899" }
};

/**
 * Calculates the difference in days between two date strings (ignoring time).
 */
const getDaysDiff = (date1, date2) => {
    const d1 = new Date(date1);
    d1.setHours(0, 0, 0, 0);
    const d2 = new Date(date2);
    d2.setHours(0, 0, 0, 0);
    const diffTime = Math.abs(d2 - d1);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    return diffDays;
};

/**
 * Gets the current date string formatted as YYYY-MM-DD
 */
const getTodayDateString = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
};

/**
 * Records user activity. Should be called when user performs an active action.
 * @param {Object} user - The current user object.
 * @returns {Object|null} - Returns milestone data if a milestone was hit, else null.
 */
export const recordActivity = async (user) => {
    if (!user || !user.id) return null;

    const todayStr = getTodayDateString();
    
    // If no last_active_date, it's their very first activity ever
    if (!user.last_active_date) {
        const newStreak = 1;
        await updateStreakInDB(user.id, newStreak, newStreak, todayStr);
        updateLocalUser(user, newStreak, newStreak, todayStr);
        return null;
    }

    // If they were active today already, do nothing
    if (user.last_active_date === todayStr) {
        return null;
    }

    const diff = getDaysDiff(user.last_active_date, todayStr);
    
    let currentStreak = user.current_streak || 0;
    let bestStreak = user.best_streak || 0;
    let hitMilestone = null;

    if (diff === 1) {
        // Consecutive day
        currentStreak += 1;
        if (currentStreak > bestStreak) {
            bestStreak = currentStreak;
        }

        // Check for milestone
        if (STREAK_MILESTONES.includes(currentStreak)) {
            hitMilestone = {
                days: currentStreak,
                reward: STREAK_REWARDS[currentStreak]
            };
        }
    } else if (diff > 1) {
        // Streak broken
        currentStreak = 1;
    }

    // Only update DB if the date actually changed
    if (diff > 0) {
        await updateStreakInDB(user.id, currentStreak, bestStreak, todayStr);
        updateLocalUser(user, currentStreak, bestStreak, todayStr);
    }

    if (hitMilestone) {
        window.dispatchEvent(new CustomEvent('streak-milestone', { detail: hitMilestone }));
    }

    return hitMilestone;
};

const updateStreakInDB = async (userId, currentStreak, bestStreak, lastActiveDate) => {
    try {
        await supabase
            .from('profiles')
            .update({
                current_streak: currentStreak,
                best_streak: bestStreak,
                last_active_date: lastActiveDate
            })
            .eq('id', userId);
    } catch (err) {
        console.error("Error updating streak:", err);
    }
};

const updateLocalUser = (user, currentStreak, bestStreak, lastActiveDate) => {
    user.current_streak = currentStreak;
    user.best_streak = bestStreak;
    user.last_active_date = lastActiveDate;
    localStorage.setItem('currentUser', JSON.stringify(user));
};

/**
 * Calculate the next milestone based on current streak
 */
export const getNextMilestone = (currentStreak) => {
    for (const milestone of STREAK_MILESTONES) {
        if (milestone > currentStreak) {
            return milestone;
        }
    }
    return null; // Passed 365!
};
