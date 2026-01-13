// Generate a random avatar URL using DiceBear (fast and reliable)
export const generateRandomRPMAvatar = () => {
    // Generate a unique identifier using timestamp and random string
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const uniqueId = `${timestamp}-${randomStr}`;
    
    // Use DiceBear avatars which load instantly (no 404 errors)
    // These are SVG-based and extremely fast
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${uniqueId}`;
};

// Generate a fallback avatar URL using DiceBear
export const getFallbackAvatar = (identifier = 'default') => {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(identifier)}`;
};

export const getAvatar2D = (url, fallbackSeed) => {
    // Return fallback if no URL provided
    if (!url) {
        return fallbackSeed ? getFallbackAvatar(fallbackSeed) : '';
    }
    
    // DiceBear and other SVG avatars can be used directly
    if (url.includes('dicebear.com') || url.includes('avatar.iran.liara.run')) {
        return url;
    }
    
    // For any GLB models, convert to PNG (though we're not using these anymore)
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
        return fallbackSeed ? getFallbackAvatar(fallbackSeed) : '';
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
    if (event.target.src && !event.target.src.includes('dicebear.com')) {
        console.warn('🔴 [avatarUtils] Avatar failed to load, using fallback:', event.target.src);
        event.target.src = getFallbackAvatar(fallbackSeed || 'default');
    }
};
