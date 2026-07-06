import { supabase } from '../supabaseClient';

export const premiumTiers = {
    FREE: 'free',
    SILVER: 'silver',
    GOLD: 'gold',
    DIAMOND: 'diamond'
};

// Record profile view safely, respecting Diamond's invisible browsing
export const recordProfileView = async (profileOwnerId, viewerId) => {
    if (!profileOwnerId || !viewerId || profileOwnerId === viewerId) return;
    try {
        // Fetch viewer's privacy settings
        const { data: viewerProfile } = await supabase
            .from('profiles')
            .select('subscription_tier, invisible_browsing')
            .eq('id', viewerId)
            .maybeSingle();

        // Diamond members can browse invisibly
        if (viewerProfile?.subscription_tier === 'diamond' && viewerProfile?.invisible_browsing) {
            console.log("🕶️ Invisible browsing active, not logging visit.");
            return;
        }

        // Log the view in database
        const { error } = await supabase
            .from('profile_views')
            .insert({
                profile_owner_id: profileOwnerId,
                viewer_id: viewerId
            });

        if (error) throw error;
        console.log("👀 Recorded profile visit successfully!");
    } catch (err) {
        console.warn("Failed to record profile view:", err);
    }
};

// Achievement rarity tiers: common, rare, epic, legendary
// Achievement categories: social, explorer, activity, special
export const ACHIEVEMENTS = [
    // ── Social ──────────────────────────────────────────────────────────────
    { id: 'first_friend', title: 'First Friend', icon: '🤝', desc: 'Add your first friend on Nearo', rarity: 'common', category: 'social', hint: 'Connect with someone near you' },
    { id: 'butterfly', title: 'Social Butterfly', icon: '🦋', desc: 'Have 5 or more friends', rarity: 'rare', category: 'social', hint: 'Make 5 friends on Nearo' },
    { id: 'community', title: 'Community Builder', icon: '🏢', desc: 'Have 10 or more friends', rarity: 'epic', category: 'social', hint: 'Grow your circle to 10 friends' },
    { id: 'social_star', title: 'Social Star', icon: '⭐', desc: 'Have 15 or more friends', rarity: 'legendary', category: 'social', hint: 'Reach 15 friends to become a Social Star' },
    { id: 'msg_100', title: '100 Messages', icon: '💬', desc: 'Send 100 messages to friends', rarity: 'rare', category: 'activity', hint: 'Chat more with your friends' },
    { id: 'chat_champion', title: 'Chat Champion', icon: '🏆', desc: 'Send 500 messages', rarity: 'epic', category: 'activity', hint: 'Send 500 messages total' },

    // ── Explorer ─────────────────────────────────────────────────────────────
    { id: 'first_thought', title: 'First Thought', icon: '💭', desc: 'Share your first map thought', rarity: 'common', category: 'explorer', hint: 'Post a thought on the map' },
    { id: 'thought_creator', title: 'Thought Creator', icon: '🎨', desc: 'Share 3 or more map thoughts', rarity: 'rare', category: 'explorer', hint: 'Post 3 thoughts on the map' },
    { id: 'thought_leader', title: 'Thought Leader', icon: '🧠', desc: 'Post 10 or more thoughts', rarity: 'epic', category: 'explorer', hint: 'Share 10 thoughts with the community' },
    { id: 'nearby_explorer', title: 'Nearby Explorer', icon: '🗺️', desc: 'Viewed 20+ profiles on the map', rarity: 'rare', category: 'explorer', hint: 'Explore 20 profiles near you on the map' },
    { id: 'explorer', title: 'Explorer', icon: '🧭', desc: 'Opened the map 10+ times', rarity: 'common', category: 'explorer', hint: 'Keep exploring the map around you' },

    // ── Special ──────────────────────────────────────────────────────────────
    { id: 'early_supporter', title: 'Early Supporter', icon: '🚀', desc: 'Joined Nearo as an early supporter', rarity: 'legendary', category: 'special', hint: 'Join Nearo early to earn this badge' },
];

// Rarity display metadata
export const RARITY_META = {
    common:    { label: 'Common',    color: '#9ca3af', glow: 'rgba(156,163,175,0.3)',   ring: 'rgba(156,163,175,0.5)' },
    rare:      { label: 'Rare',      color: '#3b82f6', glow: 'rgba(59,130,246,0.35)',   ring: 'rgba(59,130,246,0.6)' },
    epic:      { label: 'Epic',      color: '#a855f7', glow: 'rgba(168,85,247,0.35)',   ring: 'rgba(168,85,247,0.6)' },
    legendary: { label: 'Legendary', color: '#f59e0b', glow: 'rgba(245,158,11,0.4)',   ring: 'rgba(245,158,11,0.7)' },
};

// Helper to check which achievements are unlocked
export const checkUnlockedAchievements = (profile, friendsCount, thoughtsCount = 0) => {
    const unlocked = [];
    
    // Social
    if (friendsCount > 0) unlocked.push('first_friend');
    if (friendsCount >= 5) unlocked.push('butterfly');
    if (friendsCount >= 10) unlocked.push('community');
    if (friendsCount >= 15) unlocked.push('social_star');

    // Thoughts / activity
    if (profile?.status_message || thoughtsCount > 0) unlocked.push('first_thought');
    if (thoughtsCount >= 3) unlocked.push('thought_creator');
    if (thoughtsCount >= 10) unlocked.push('thought_leader');
    
    // Messages
    const simulatedMsgCount = parseInt(localStorage.getItem(`msg_count_${profile?.id}`) || '0', 10);
    if (simulatedMsgCount >= 100 || profile?.message_count >= 100) unlocked.push('msg_100');
    if (simulatedMsgCount >= 500 || profile?.message_count >= 500) unlocked.push('chat_champion');
    
    // Explorer (map opens tracked via localStorage by MapHome)
    const mapOpenCount = parseInt(localStorage.getItem(`map_opens_${profile?.id}`) || '0', 10);
    if (mapOpenCount >= 10) unlocked.push('explorer');

    // Nearby explorer (profile views from map tracked via localStorage)
    const mapProfileViews = parseInt(localStorage.getItem(`map_profile_views_${profile?.id}`) || '0', 10);
    if (mapProfileViews >= 20) unlocked.push('nearby_explorer');

    // Early Supporter — joined before Jan 1 2026
    if (profile?.created_at) {
        const joinDate = new Date(profile.created_at);
        const cutoff = new Date('2026-01-01T00:00:00Z');
        if (joinDate < cutoff) unlocked.push('early_supporter');
    }
    
    return unlocked;
};


// Calculate deterministic match score for Diamond Elite members
export const calculateSmartMatchScore = (profileA, profileB) => {
    if (!profileA || !profileB || !profileA.id || !profileB.id) return null;
    if (profileA.id === profileB.id) return null;

    // Interests list overlap
    const interestsA = profileA.interests || [];
    const interestsB = profileB.interests || [];
    
    // Normalize interests to lowercase trim
    const cleanA = interestsA.map(i => i.toLowerCase().trim());
    const cleanB = interestsB.map(i => i.toLowerCase().trim());
    
    // Find intersection
    const commonInterests = cleanA.filter(i => cleanB.includes(i));
    
    let score = 65; // base compatibility

    // 1. Interests Overlap (Up to +20 points, +6 per common interest)
    if (commonInterests.length > 0) {
        score += Math.min(20, commonInterests.length * 6);
    }

    // 2. Age Range overlap (Up to +10 points)
    if (profileA.birth_date && profileB.birth_date) {
        const ageA = new Date().getFullYear() - new Date(profileA.birth_date).getFullYear();
        const ageB = new Date().getFullYear() - new Date(profileB.birth_date).getFullYear();
        const diff = Math.abs(ageA - ageB);
        if (diff <= 2) score += 10;
        else if (diff <= 5) score += 7;
        else if (diff <= 8) score += 4;
    } else {
        score += 5; // default average similarity
    }

    // 3. Same relationship status (Up to +5 points)
    const relA = profileA.relationship_status || profileA.relationshipStatus;
    const relB = profileB.relationship_status || profileB.relationshipStatus;
    if (relA && relB && relA === relB) {
        score += 5;
    }

    // 4. Deterministic noise/variance based on UUID hash (Up to +4 points)
    const combinedStr = [profileA.id, profileB.id].sort().join('');
    let hash = 0;
    for (let i = 0; i < combinedStr.length; i++) {
        hash = (hash + combinedStr.charCodeAt(i)) % 100;
    }
    score += (hash % 5);

    // Keep score within premium range (60% to 99%)
    const finalScore = Math.min(99, Math.max(60, score));

    return {
        score: finalScore,
        commonInterests: commonInterests.slice(0, 3)
    };
};

// Record safe crossing path event (proximity <= 50m) with 1-hour anti-spam guard
export const recordCrossingPath = async (userId, otherUserId) => {
    if (!userId || !otherUserId || userId === otherUserId) return;
    try {
        const userA = userId < otherUserId ? userId : otherUserId;
        const userB = userId < otherUserId ? otherUserId : userId;

        // 1. Check if there is an existing crossing path record
        const { data: existing, error: fetchError } = await supabase
            .from('crossing_paths')
            .select('*')
            .eq('user_a_id', userA)
            .eq('user_b_id', userB)
            .maybeSingle();

        if (fetchError) throw fetchError;

        const now = new Date();

        if (existing) {
            // Anti-spam: check if last crossed was more than 1 hour ago
            const lastCrossed = new Date(existing.last_crossed_at);
            const diffMs = now.getTime() - lastCrossed.getTime();
            
            if (diffMs > 60 * 60 * 1000) {
                const { error: updateError } = await supabase
                    .from('crossing_paths')
                    .update({
                        count: (existing.count || 0) + 1,
                        last_crossed_at: now.toISOString()
                    })
                    .eq('id', existing.id);

                if (updateError) throw updateError;
                console.log(`📍 Crossing paths count incremented for ${userA} and ${userB}!`);
            }
        } else {
            // First time crossing paths, insert new row
            const { error: insertError } = await supabase
                .from('crossing_paths')
                .insert({
                    user_a_id: userA,
                    user_b_id: userB,
                    count: 1,
                    last_crossed_at: now.toISOString()
                });

            if (insertError) throw insertError;
            console.log(`📍 New crossing path recorded for ${userA} and ${userB}!`);
        }
    } catch (err) {
        console.warn("Failed to record crossing path:", err);
    }
};


