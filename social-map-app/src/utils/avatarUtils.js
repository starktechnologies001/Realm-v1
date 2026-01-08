// Generate a fallback avatar URL using DiceBear
export const getFallbackAvatar = (identifier = 'default') => {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(identifier)}`;
};

export const getAvatar2D = (url, fallbackSeed) => {
    console.log('🟡 [avatarUtils] getAvatar2D input:', url);
    
    // Return fallback if no URL provided
    if (!url) {
        return fallbackSeed ? getFallbackAvatar(fallbackSeed) : '';
    }
    
    // Split query params if any
    const [baseUrl, queryString] = url.split('?');
    console.log('🟡 [avatarUtils] Base URL:', baseUrl);
    console.log('🟡 [avatarUtils] Query String:', queryString);
    
    // If it's a Ready Player Me GLB, convert to PNG
    if (baseUrl.includes('models.readyplayer.me') && baseUrl.endsWith('.glb')) {
        // Filter out 3D-only params irrelevant for 2D renders
        const params = new URLSearchParams(queryString);
        params.delete('quality');
        params.delete('textureAtlas');
        params.delete('lod');
        params.delete('morphTargets');

        const cleanQuery = params.toString();
        // RPM PNGs are transparent by default, no need for background param
        const suffix = cleanQuery ? `?${cleanQuery}` : '';
        const result = baseUrl.replace('.glb', '.png') + suffix;
        console.log('🟡 [avatarUtils] Converted PNG URL:', result);
        return result;
    }
    
    console.log('🟡 [avatarUtils] Returning original URL (not RPM GLB)');
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
