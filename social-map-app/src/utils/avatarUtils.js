export const DEFAULT_MALE_AVATAR = '/defaults/male_avatar.jpg';
export const DEFAULT_FEMALE_AVATAR = '/defaults/female_avatar.jpg';
export const DEFAULT_GENERIC_AVATAR = '/defaults/male_avatar.jpg'; // Fallback to male for now as generic, or we could add a specific generic one

// OLD: Generate a random avatar URL using DiceBear
// NEW: Return a realistic default. We no longer want random cartoons.
export const generateRandomRPMAvatar = () => {
    return DEFAULT_GENERIC_AVATAR;
};

// Generate a fallback avatar URL
export const getFallbackAvatar = (identifier = 'default') => {
    // Return realistic default instead of cartoon
    return DEFAULT_GENERIC_AVATAR;
};

export const getAvatar2D = (url, fallbackSeed) => {
    // Return fallback if no URL provided
    if (!url) {
        return getFallbackAvatar(fallbackSeed);
    }
    
    // If it's a local default path, return it directly
    if (url.startsWith('/defaults/')) {
        return url;
    }

    // DiceBear and other SVG avatars (legacy support)
    if (url.includes('dicebear.com') || url.includes('avatar.iran.liara.run')) {
        return url;
    }
    
    // For any GLB models, convert to PNG (legacy support)
    const [baseUrl, queryString] = url.split('?');
    if (baseUrl.includes('models.readyplayer.me') && baseUrl.endsWith('.glb')) {
        const params = new URLSearchParams(queryString);
        params.delete('quality');
        params.delete('textureAtlas');
        params.delete('lod');
        params.delete('morphTargets');

        const cleanQuery = params.toString();
        const suffix = cleanQuery ? `?${cleanQuery}` : '';
        return baseUrl.replace('.glb', '.png') + suffix;
    }
    
    return url;
};

export const getAvatarHeadshot = (url, fallbackSeed) => {
    // Return fallback if no URL provided
    if (!url) {
        return getFallbackAvatar(fallbackSeed);
    }

    // If it's a local default path, return it directly
    if (url.startsWith('/defaults/')) {
        return url;
    }
    
    const [baseUrl, queryString] = url.split('?');
    
    if (baseUrl.includes('models.readyplayer.me') && baseUrl.endsWith('.glb')) {
        // Filter out 3D-only params
        const params = new URLSearchParams(queryString);
        params.delete('quality');
        params.delete('textureAtlas');
        params.delete('lod');
        params.delete('morphTargets');

        const cleanQuery = params.toString();
        // Use portrait scene for headshot, no background param needed
        const baseParams = 'scene=fullbody-portrait-v1-transparent';
        const suffix = cleanQuery ? `&${cleanQuery}` : '';
        return baseUrl.replace('.glb', `.png?${baseParams}${suffix}`);
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
