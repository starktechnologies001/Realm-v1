/**
 * Format last seen timestamp into human-readable text
 */
export const formatLastSeen = (lastActiveAt) => {
  if (!lastActiveAt) return 'Offline';
  
  const now = new Date();
  const lastActive = new Date(lastActiveAt);
  const diffMs = now - lastActive;
  const diffMins = Math.floor(diffMs / 60000);
  
  // If active within 30 minutes
  if (diffMins <= 30) {
    if (diffMins < 1) return 'just now'; // User friendly addition
    return `${diffMins} min ago`;
  }
  
  // If more than 30 minutes, show Last seen at time
  const timeOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
  const timeStr = lastActive.toLocaleTimeString('en-US', timeOptions);
  
  // Optional enhancement: show "Last seen at [time]" for today, and add date if older
  const isToday = now.toDateString() === lastActive.toDateString();
  
  if (isToday) {
    return `Last seen at ${timeStr}`;
  } else {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (yesterday.toDateString() === lastActive.toDateString()) {
      return `Last seen yesterday at ${timeStr}`;
    } else {
      const dateOptions = { month: 'short', day: 'numeric' };
      const dateStr = lastActive.toLocaleDateString('en-US', dateOptions);
      return `Last seen ${dateStr} at ${timeStr}`;
    }
  }
};

/**
 * Check if viewer can see target user's presence based on privacy settings
 */
export const canViewPresence = (targetUser, viewerId, isFriend = false) => {
  if (!targetUser) return { online: false, lastSeen: false };
  
  // If user has hidden online status completely
  if (!targetUser.show_online_status) {
    return { online: false, lastSeen: false };
  }
  
  const privacy = targetUser.last_seen_privacy || 'everyone';
  
  // Nobody can see last seen
  if (privacy === 'nobody') {
    return { online: true, lastSeen: false };
  }
  
  // Only friends can see last seen
  if (privacy === 'friends' && !isFriend) {
    return { online: true, lastSeen: false };
  }
  
  // Everyone can see
  return { online: true, lastSeen: true };
};

/**
 * Get display status text based on presence and privacy
 */
export const getDisplayStatus = (presence, canView) => {
  if (!canView.online) {
    return '';
  }
  
  if (presence.isOnline) {
    return 'Online';
  }
  
  if (!canView.lastSeen) {
    return 'Last seen recently';
  }
  
  return formatLastSeen(presence.lastSeen);
};
