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
    canViewLastSeen: false,
    viewerShowsLastSeen: true // Default true
  });

  useEffect(() => {
    if (!userId) return;

    // Initial fetch
    const fetchPresence = async () => {
      try {
        // 1. Fetch Target Profile (status + privacy)
        const { data: targetData, error: targetError } = await supabase
          .from('profiles')
          .select('is_online, last_active, show_last_seen')
          .eq('id', userId)
          .maybeSingle();

        if (targetError) throw targetError;

        // 2. Fetch Viewer Profile (privacy only) - Needed for bidirectional check
        let viewerShows = true;
        if (viewerId) {
            const { data: viewerData, error: viewerError } = await supabase
            .from('profiles')
            .select('show_last_seen')
            .eq('id', viewerId)
            .maybeSingle();
            
            if (!viewerError && viewerData) {
                viewerShows = viewerData.show_last_seen !== false;
            }
        }

        // 3. Determine Visibility
        // Default to true if null (undefined)
        const targetShows = targetData.show_last_seen !== false;
        
        const canView = targetShows && viewerShows;

        // 4. Calculate display status
        let displayStatus = '';
        if (canView) {
          if (targetData.is_online) {
            displayStatus = 'Online';
          } else if (targetData.last_active) {
            displayStatus = formatLastSeen(targetData.last_active);
          } else {
            displayStatus = 'Offline';
          }
        } else {
          displayStatus = ''; // Hidden
        }

        setPresence({
          isOnline: canView ? targetData.is_online : false,
          lastSeen: canView ? targetData.last_active : null,
          displayStatus,
          canViewOnline: canView,
          canViewLastSeen: canView,
          viewerShowsLastSeen: viewerShows
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
            // Re-calculate visibility using new target data and cached viewer privacy
            const targetShows = newData.show_last_seen !== false;
            const viewerShows = prev.viewerShowsLastSeen; // Use cached value
            
            const canView = targetShows && viewerShows;

            let displayStatus = '';
            if (canView) {
              if (newData.is_online) {
                displayStatus = 'Online';
              } else if (newData.last_active) {
                displayStatus = formatLastSeen(newData.last_active);
              } else {
                displayStatus = 'Offline';
              }
            } else {
              displayStatus = ''; // Hidden
            }

            return {
              ...prev,
              isOnline: canView ? newData.is_online : false,
              lastSeen: canView ? newData.last_active : null,
              displayStatus,
              canViewOnline: canView,
              canViewLastSeen: canView
            };
          });
        }
      )
      .subscribe();

    // Update display status every minute for relative time
    const interval = setInterval(() => {
      setPresence(prev => {
        if (!prev.canViewOnline || !prev.displayStatus) return prev;
        
        let displayStatus = '';
        if (prev.isOnline) {
          displayStatus = 'Online';
        } else if (prev.lastSeen) {
           // Re-format time
          displayStatus = formatLastSeen(prev.lastSeen);
        } else {
          displayStatus = 'Offline';
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
