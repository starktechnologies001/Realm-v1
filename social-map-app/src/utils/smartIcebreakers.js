/**
 * Smart Icebreaker matching utility for Diamond Premium users.
 * Generates context-aware conversational topics.
 */
export const generateSmartIcebreakers = (currentUser, targetUser, mutualsCount = 0) => {
    const suggestions = [];

    if (!currentUser || !targetUser) return suggestions;

    // 1. Shared Interests
    const myInterests = currentUser.interests || [];
    const theirInterests = targetUser.interests || [];
    
    if (Array.isArray(myInterests) && Array.isArray(theirInterests)) {
        const shared = myInterests.filter(i => 
            theirInterests.some(ti => ti.toLowerCase().trim() === i.toLowerCase().trim())
        );
        if (shared.length > 0) {
            suggestions.push(`🎨 You both share an interest in: ${shared.slice(0, 3).join(', ')}.`);
        }
    }

    // 2. Mutual Friends
    if (mutualsCount > 0) {
        suggestions.push(`🤝 You share ${mutualsCount} mutual friend${mutualsCount > 1 ? 's' : ''} in common.`);
    }

    // 3. Same Location (Proximity calculation)
    const myLat = currentUser.latitude ?? currentUser.lat;
    const myLng = currentUser.longitude ?? currentUser.lng;
    const theirLat = targetUser.latitude ?? targetUser.lat;
    const theirLng = targetUser.longitude ?? targetUser.lng;

    if (myLat && myLng && theirLat && theirLng) {
        const rad = (x) => (x * Math.PI) / 180;
        const R = 6378137; // Earth’s mean radius in meters
        const dLat = rad(theirLat - myLat);
        const dLong = rad(theirLng - myLng);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(rad(myLat)) *
                Math.cos(rad(theirLat)) *
                Math.sin(dLong / 2) *
                Math.sin(dLong / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        if (distance <= 150) {
            suggestions.push(`📍 You are practically next to each other right now!`);
        } else if (distance <= 800) {
            suggestions.push(`📍 You are both in the same neighborhood right now.`);
        }
    }

    // 4. Same Mood or User Mood prompt
    const myMood = currentUser.mood;
    const theirMood = targetUser.mood;
    
    // Check mood validity (updated within 6 hours)
    const moodTime = targetUser.moodUpdatedAt || targetUser.mood_updated_at;
    const isMoodValid = moodTime && (new Date(moodTime).getTime() > Date.now() - 6 * 60 * 60 * 1000);

    if (isMoodValid && theirMood) {
        if (myMood && myMood === theirMood) {
            suggestions.push(`✨ You are both in a ${myMood} mood today!`);
        } else {
            suggestions.push(`💭 Start the conversation by asking about their ${theirMood} mood.`);
        }
    }

    // Fallbacks if nothing is matched
    if (suggestions.length === 0) {
        suggestions.push("👋 Say hello and ask what they are up to today!");
        suggestions.push("☕ Invite them to grab a quick coffee nearby.");
    }

    return suggestions;
};
