import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { isOnline, setupNetworkListeners } from '../utils/networkUtils';
import { markCallAsMissed } from '../services/callSignalingService';

/**
 * Custom hook to handle incoming calls based on internet connectivity
 * @param {string} userId - Current user's ID
 * @returns {object} { incomingCall, isConnected, dismissCall }
 */
export const useIncomingCall = (userId) => {
  const [incomingCall, setIncomingCall] = useState(null);
  const [isConnected, setIsConnected] = useState(isOnline());

  useEffect(() => {
    if (!userId) return;

    // Track network status
    const cleanup = setupNetworkListeners(
      () => setIsConnected(true),
      () => {
        setIsConnected(false);
        // If we go offline while a call is ringing, dismiss it
        if (incomingCall) {
          markCallAsMissed(incomingCall.session_id);
          setIncomingCall(null);
        }
      }
    );

    // Subscribe to call signals
    const channel = supabase
      .channel(`call-signal-${userId}`)
      .on('broadcast', { event: 'incoming_call' }, async (payload) => {
        console.log('📞 Incoming call signal received:', payload);

        // Only show popup if connected to internet
        if (isConnected) {
          // Fetch caller details
          const { data: caller } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .eq('id', payload.payload.caller_id)
            .maybeSingle();

          setIncomingCall({
            ...payload.payload,
            caller
          });
        } else {
          // Mark as missed immediately if offline
          console.log('📵 User offline, marking call as missed');
          await markCallAsMissed(payload.payload.session_id);
        }
      })
      .subscribe();

    return () => {
      cleanup();
      channel.unsubscribe();
    };
  }, [userId, isConnected, incomingCall]);

  const dismissCall = () => {
    setIncomingCall(null);
  };

  return { incomingCall, isConnected, dismissCall };
};
