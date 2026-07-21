export const DEFAULT_MALE_AVATAR = '/defaults/male_avatar.jpg';
export const DEFAULT_FEMALE_AVATAR = '/defaults/female_avatar.jpg';
export const DEFAULT_GENERIC_AVATAR = '/defaults/male_avatar.jpg';

// Generate a fallback avatar URL
export const getFallbackAvatar = (identifier = 'default') => {
    return DEFAULT_GENERIC_AVATAR;
};

// Cache for optimized storage URLs to avoid rebuilding them
const optimizedUrlCache = new Map();

export const getOptimizedStorageUrl = (url, options = {}) => {
    if (!url || typeof url !== 'string') return url;
    
    // If already optimized, return unchanged
    if (url.includes('/storage/v1/render/image/public/')) {
        return url;
    }
    
    // Ignore non-image formats (case-insensitive)
    const lowerUrl = url.toLowerCase();
    const isVideo = lowerUrl.endsWith('.mp4') || lowerUrl.endsWith('.webm') || lowerUrl.endsWith('.ogg') || lowerUrl.endsWith('.mov');
    const isAudio = lowerUrl.endsWith('.mp3') || lowerUrl.endsWith('.wav') || lowerUrl.endsWith('.ogg') || lowerUrl.endsWith('.m4a') || lowerUrl.endsWith('.webm');
    const isPdf = lowerUrl.endsWith('.pdf');
    const isDoc = lowerUrl.endsWith('.doc') || lowerUrl.endsWith('.docx') || lowerUrl.endsWith('.xls') || lowerUrl.endsWith('.xlsx') || lowerUrl.endsWith('.zip') || lowerUrl.endsWith('.txt');
    
    if (isVideo || isAudio || isPdf || isDoc) {
        return url;
    }
    
    // Check if the URL is from Supabase Storage public bucket
    if (url.includes('/storage/v1/object/public/')) {
        const { width, height, quality = 80, resize = 'cover' } = options;
        
        const cacheKey = `${url}_w${width || ''}_h${height || ''}_q${quality}_r${resize}`;
        if (optimizedUrlCache.has(cacheKey)) {
            return optimizedUrlCache.get(cacheKey);
        }
        
        let transformedUrl = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
        
        const params = [];
        if (width) params.push(`width=${width}`);
        if (height) params.push(`height=${height}`);
        if (quality) params.push(`quality=${quality}`);
        if (resize) params.push(`resize=${resize}`);
        
        if (params.length > 0) {
            transformedUrl += (transformedUrl.includes('?') ? '&' : '?') + params.join('&');
        }
        
        optimizedUrlCache.set(cacheKey, transformedUrl);
        return transformedUrl;
    }
    
    return url;
};

export const getAvatar2D = (url, fallbackSeed) => {
    if (!url) {
        return getFallbackAvatar(fallbackSeed);
    }
    return getOptimizedStorageUrl(url, { width: 160, height: 160, quality: 80 });
};

export const getAvatarHeadshot = (url, fallbackSeed) => {
    if (!url) {
        return getFallbackAvatar(fallbackSeed);
    }
    return getOptimizedStorageUrl(url, { width: 96, height: 96, quality: 80 });
};

// Helper to handle image loading errors
export const handleAvatarError = (event, fallbackSeed) => {
    if (event.target.src && !event.target.src.includes('defaults')) {
        console.warn('🔴 [avatarUtils] Avatar failed to load, using fallback:', event.target.src);
        event.target.src = getFallbackAvatar(fallbackSeed || 'default');
    }
};
