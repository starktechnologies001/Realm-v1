export const DEFAULT_MALE_AVATAR = '/defaults/male_avatar.jpg';
export const DEFAULT_FEMALE_AVATAR = '/defaults/female_avatar.jpg';
export const DEFAULT_GENERIC_AVATAR = '/defaults/male_avatar.jpg'; // Fallback to male for now as generic, or we could add a specific generic one


// Generate a fallback avatar URL
export const getFallbackAvatar = (identifier = 'default') => {
    // Return realistic default instead of cartoon
    return DEFAULT_GENERIC_AVATAR;
};

export const getAvatar2D = (url, fallbackSeed) => {
    if (!url) {
        return getFallbackAvatar(fallbackSeed);
    }
    return url;
};

export const getAvatarHeadshot = (url, fallbackSeed) => {
    if (!url) {
        return getFallbackAvatar(fallbackSeed);
    }
    return url;
};

// Helper to handle image loading errors
export const handleAvatarError = (event, fallbackSeed) => {
    // Prevent infinite loops if default also fails
    if (event.target.src && !event.target.src.includes('defaults')) {
        console.warn('🔴 [avatarUtils] Avatar failed to load, using fallback:', event.target.src);
        event.target.src = getFallbackAvatar(fallbackSeed || 'default');
    }
};
