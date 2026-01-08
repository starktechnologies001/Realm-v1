import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { formatLastSeen } from '../utils/presenceUtils';

/**
 * Custom hook to track real-time presence for a user
 */
export const usePresence = (userId, viewerId) => {
  const [presence, setPresence] = useState({
    isOnline: false,
    lastSeen: null,
    displayStatus: '',
    canViewOnline: false,
    canViewLastSeen: false
  });

  useEffect(() => {
    if (!userId) return;

    // Initial fetch
    const fetchPresence = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('is_online, last_active_at, show_online_status, last_seen_privacy')
          .eq('id', userId)
          .single();

        if (error) throw error;

        // Check privacy
        const canViewOnline = data.show_online_status;
        let canViewLastSeen = true;

        if (data.last_seen_privacy === 'nobody') {
          canViewLastSeen = false;
        } else if (data.last_seen_privacy === 'friends' && viewerId) {
          // Check friendship
          const { data: friendship } = await supabase
            .from('friends')
            .select('id')
            .or(`and(user_id.eq.${viewerId},friend_id.eq.${userId}),and(user_id.eq.${userId},friend_id.eq.${viewerId})`)
            .eq('status', 'accepted')
            .maybeSingle();

          canViewLastSeen = !!friendship;
        }

        // Calculate display status
        let displayStatus = '';
        if (canViewOnline) {
          if (data.is_online) {
            displayStatus = 'Online';
          } else if (canViewLastSeen) {
            displayStatus = formatLastSeen(data.last_active_at);
          } else {
            displayStatus = 'Last seen recently';
          }
        }

        setPresence({
          isOnline: data.is_online,
          lastSeen: data.last_active_at,
          displayStatus,
          canViewOnline,
          canViewLastSeen
        });
      } catch (error) {
        console.error('Error fetching presence:', error);
      }
    };

    fetchPresence();

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`presence-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`
        },
        (payload) => {
          const newData = payload.new;
          
          setPresence(prev => {
            let displayStatus = '';
            if (prev.canViewOnline) {
              if (newData.is_online) {
                displayStatus = 'Online';
              } else if (prev.canViewLastSeen) {
                displayStatus = formatLastSeen(newData.last_active_at);
              } else {
                displayStatus = 'Last seen recently';
              }
            }

            return {
              ...prev,
              isOnline: newData.is_online,
              lastSeen: newData.last_active_at,
              displayStatus
            };
          });
        }
      )
      .subscribe();

    // Update display status every minute for relative time
    const interval = setInterval(() => {
      setPresence(prev => {
        if (!prev.canViewOnline) return prev;
        
        let displayStatus = '';
        if (prev.isOnline) {
          displayStatus = 'Online';
        } else if (prev.canViewLastSeen) {
          displayStatus = formatLastSeen(prev.lastSeen);
        } else {
          displayStatus = 'Last seen recently';
        }

        return { ...prev, displayStatus };
      });
    }, 60000); // Update every minute

    return () => {
      channel.unsubscribe();
      clearInterval(interval);
    };
  }, [userId, viewerId]);

  return presence;
};
