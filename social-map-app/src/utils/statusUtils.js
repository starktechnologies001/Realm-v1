/**
 * Status Visibility Utilities
 * Handles privacy-aware status visibility logic for profile interactions
 */

/**
 * Check if viewer can see target user's status
 * @param {Object} viewer - Current user viewing the profile
 * @param {Object} targetUser - User whose status is being checked
 * @returns {boolean} - True if viewer can see status
 */
export function canViewStatus(viewer, targetUser) {
    if (!viewer || !targetUser) return false;
    
    // Owner can always see their own status
    const isOwner = viewer.id === targetUser.id;
    if (isOwner) return true;
    
    // Check if user has active status
    if (!hasActiveStatus(targetUser)) return false;
    
    // Check friendship status
    const isFriend = targetUser.friendshipStatus === 'accepted';
    
    // Check if profile is public (default to public if undefined)
    const isPublic = targetUser.is_public !== false;
    
    // Can view if friend OR public profile
    return isFriend || isPublic;
}

/**
 * Check if user has an active status uploaded
 * @param {Object} user - User to check
 * @returns {boolean} - True if user has active status
 */
export function hasActiveStatus(user) {
    if (!user) return false;
    
    // Check if user has story (media status) OR thought (text status)
    const hasStory = user.hasStory === true;
    const hasThought = user.thought && user.thought.trim().length > 0;
    
    console.log('🔍 [hasActiveStatus] Checking user:', user.name);
    console.log('🔍 [hasActiveStatus] hasStory:', hasStory);
    console.log('🔍 [hasActiveStatus] hasThought:', hasThought);
    console.log('🔍 [hasActiveStatus] user.thought:', user.thought);
    
    if (!hasStory && !hasThought) return false;
    
    // Optional: Check if status is not expired (if timestamp available)
    // Stories typically expire after 24 hours
    if (user.storyTimestamp) {
        const now = Date.now();
        const storyAge = now - new Date(user.storyTimestamp).getTime();
        const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
        
        if (storyAge > TWENTY_FOUR_HOURS) {
            console.log('🔍 [hasActiveStatus] Story expired');
            return false;
        }
    }
    
    console.log('🔍 [hasActiveStatus] Result: true');
    return true;
}

/**
 * Get appropriate CSS class for status ring indicator
 * @param {Object} user - User to check
 * @param {Object} viewer - Current user viewing
 * @returns {string} - CSS class name for ring
 */
export function getStatusRingClass(user, viewer) {
    if (!user) return 'status-ring-default';
    
    // Owner ALWAYS sees specific ring status (Active Blue) to confirm UI availability
    // or to indicate "You"
    // Owner ring logic:
    // Blue if they have a story they haven't viewed.
    // Grey if they have a story and have viewed it.
    // Default (no ring) if no story.
    const isOwner = viewer && viewer.id === user.id;
    if (isOwner) {
        if (user.hasUnseenStory) return 'status-ring-active'; // Blue
        if (user.hasStory) return 'status-ring-viewed';       // Grey
        return 'status-ring-default';                        // No ring
    }
    
    // Check if viewer can see status
    const canView = canViewStatus(viewer, user);
    const hasStatus = hasActiveStatus(user);
    
    console.log('💍 [getStatusRingClass] User:', user.name);
    console.log('💍 [getStatusRingClass] canView:', canView);
    console.log('💍 [getStatusRingClass] hasStatus:', hasStatus);
    
    if (hasStatus && canView) {
        // Show active ring with indicator
        return user.hasUnseenStory ? 'status-ring-active' : 'status-ring-viewed';
    }
    
    // Default ring (no status or not accessible)
    return 'status-ring-default';
}

/**
 * Determine what action should happen on avatar tap
 * @param {Object} user - User whose avatar was tapped
 * @param {Object} viewer - Current user
 * @returns {string} - Action type: 'view-status' or 'view-photo'
 */
export function getAvatarTapAction(user, viewer) {
    if (canViewStatus(viewer, user)) {
        return 'view-status';
    }
    return 'view-photo';
}
