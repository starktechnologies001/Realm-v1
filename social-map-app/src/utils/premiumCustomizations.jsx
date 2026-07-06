import React from 'react';

/**
 * Premium Customizations utility to resolve Diamond/Gold custom configurations
 * with local storage fallbacks in case DB columns are not yet created.
 */
export const getPremiumCustomizations = (user, profileDetails = {}) => {
    const userId = user?.id;
    if (!userId) {
        return {
            avatarAccessory: 'none',
            avatarOutfit: 'none',
            usernameEffect: 'none',
            profileMusic: null,
            profileMusicTitle: null,
            profileBackgroundStyle: 'default',
            chatBubbleStyle: 'default',
            appIcon: 'default',
            nearbyMoment: null,
            nearbyMomentExpiresAt: null
        };
    }

    // Try reading from DB object first
    const dbAccessory = profileDetails.avatar_accessory ?? user.avatar_accessory;
    const dbOutfit = profileDetails.avatar_outfit ?? user.avatar_outfit;
    const dbEffect = profileDetails.username_effect ?? user.username_effect;
    const dbMusic = profileDetails.profile_music ?? user.profile_music;
    const dbMusicTitle = profileDetails.profile_music_title ?? user.profile_music_title;
    const dbBg = profileDetails.profile_background_style ?? user.profile_background_style;
    const dbChat = profileDetails.chat_bubble_style ?? user.chat_bubble_style;
    const dbIcon = profileDetails.app_icon ?? user.app_icon;
    const dbMoment = profileDetails.nearby_moment ?? user.nearby_moment;
    const dbMomentExpiry = profileDetails.nearby_moment_expires_at ?? user.nearby_moment_expires_at;

    // Read local cache as fallback
    let cached = {};
    try {
        const cachedRaw = localStorage.getItem(`diamond_custom_${userId}`);
        if (cachedRaw) cached = JSON.parse(cachedRaw);
    } catch (e) {
        console.warn('Error reading local premium customizations:', e);
    }

    return {
        avatarAccessory: dbAccessory || cached.avatarAccessory || 'none',
        avatarOutfit: dbOutfit || cached.avatarOutfit || 'none',
        usernameEffect: dbEffect || cached.usernameEffect || 'none',
        profileMusic: dbMusic || cached.profileMusic || null,
        profileMusicTitle: dbMusicTitle || cached.profileMusicTitle || null,
        profileBackgroundStyle: dbBg || cached.profileBackgroundStyle || 'default',
        chatBubbleStyle: dbChat || cached.chatBubbleStyle || 'default',
        appIcon: dbIcon || cached.appIcon || 'default',
        nearbyMoment: dbMoment || cached.nearbyMoment || null,
        nearbyMomentExpiresAt: dbMomentExpiry || cached.nearbyMomentExpiresAt || null
    };
};

/**
 * Save customizations locally and optionally try to persist to DB.
 */
export const savePremiumCustomizations = async (supabase, userId, customizations) => {
    // Save to local cache first (instant fallback)
    try {
        const cachedRaw = localStorage.getItem(`diamond_custom_${userId}`) || '{}';
        const parsed = JSON.parse(cachedRaw);
        const updated = { ...parsed, ...customizations };
        localStorage.setItem(`diamond_custom_${userId}`, JSON.stringify(updated));
    } catch (e) {
        console.warn('Error saving local premium customizations:', e);
    }

    // Attempt DB save
    try {
        const dbPayload = {};
        if (customizations.avatarAccessory !== undefined) dbPayload.avatar_accessory = customizations.avatarAccessory;
        if (customizations.avatarOutfit !== undefined) dbPayload.avatar_outfit = customizations.avatarOutfit;
        if (customizations.usernameEffect !== undefined) dbPayload.username_effect = customizations.usernameEffect;
        if (customizations.profileMusic !== undefined) dbPayload.profile_music = customizations.profileMusic;
        if (customizations.profileMusicTitle !== undefined) dbPayload.profile_music_title = customizations.profileMusicTitle;
        if (customizations.profileBackgroundStyle !== undefined) dbPayload.profile_background_style = customizations.profileBackgroundStyle;
        if (customizations.chatBubbleStyle !== undefined) dbPayload.chat_bubble_style = customizations.chatBubbleStyle;
        if (customizations.appIcon !== undefined) dbPayload.app_icon = customizations.appIcon;
        if (customizations.nearbyMoment !== undefined) dbPayload.nearby_moment = customizations.nearbyMoment;
        if (customizations.nearbyMomentExpiresAt !== undefined) dbPayload.nearby_moment_expires_at = customizations.nearbyMomentExpiresAt;

        if (Object.keys(dbPayload).length > 0) {
            const { error } = await supabase
                .from('profiles')
                .update(dbPayload)
                .eq('id', userId);
            
            if (error) {
                console.warn('DB update failed, using local storage fallback. Error details:', error);
                return false;
            }
            return true;
        }
    } catch (err) {
        console.warn('Persist premium customizations error:', err);
    }
    return false;
};

/**
 * Render Avatar overlay accessories
 */
export const AvatarAccessories = ({ accessory }) => {
    if (!accessory || accessory === 'none') return null;
    return (
        <div className="avatar-accessory-overlay">
            {/* Diamond accessories */}
            {accessory === 'wings' && <div className="avatar-wings-behind" />}
            {accessory === 'mask' && <div className="avatar-mask-overlay">🎭</div>}
            {accessory === 'jacket' && <div className="avatar-jacket-overlay" />}
            {accessory === 'luxury' && <div className="avatar-luxury-overlay" />}
            
            {/* Gold accessories */}
            {(accessory === 'crown' || accessory === 'gold_crown') && <div className="avatar-crown-above">👑</div>}
            {accessory === 'halo' && <div className="avatar-halo-above" />}
            {accessory === 'sunglasses' && <div className="avatar-sunglasses-overlay">🕶️</div>}
            {accessory === 'headphones' && <div className="avatar-headphones-overlay" />}
            {accessory === 'premium_caps' && <div className="avatar-premium-caps-overlay" />}
        </div>
    );
};

/**
 * Resolve username style CSS classes
 */
export const getUsernameEffectClass = (effect) => {
    if (!effect || effect === 'none') return '';
    // Diamond effects
    if (effect === 'diamond') return 'effect-username-diamond-gradient';
    if (effect === 'shimmer') return 'effect-username-shimmer';
    if (effect === 'neon') return 'effect-username-neon-pulse';
    if (effect === 'crystal') return 'effect-username-crystal-glow';
    // Gold effects
    if (effect === 'gold_gradient') return 'effect-username-gold-gradient';
    if (effect === 'neon_gradient') return 'effect-username-neon-gradient';
    if (effect === 'rainbow') return 'effect-username-rainbow';
    if (effect === 'glow') return 'effect-username-glow';
    return '';
};
