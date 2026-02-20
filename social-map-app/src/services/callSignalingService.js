import { supabase } from '../supabaseClient';

/**
 * Initiate a call to another user
 * @param {string} callerId - ID of the caller
 * @param {string} receiverId - ID of the receiver
 * @param {string} callType - 'audio' or 'video'
 * @returns {Promise<object>} Call session object
 */
export const initiateCall = async (callerId, receiverId, callType) => {
  try {
    // 1. Create call session in database
    const { data: session, error } = await supabase
      .from('call_sessions')
      .insert({
        caller_id: callerId,
        receiver_id: receiverId,
        call_type: callType,
        status: 'ringing'
      })
      .select()
      .maybeSingle();

    if (error) throw error;

    // 2. Send real-time signal to receiver
    const channel = supabase.channel(`call-signal-${receiverId}`);
    
    await channel.send({
      type: 'broadcast',
      event: 'incoming_call',
      payload: {
        session_id: session.id,
        caller_id: callerId,
        call_type: callType,
        timestamp: new Date().toISOString()
      }
    });

    console.log('📞 Call initiated:', session);
    return session;
  } catch (error) {
    console.error('Error initiating call:', error);
    throw error;
  }
};

/**
 * Accept an incoming call
 * @param {string} sessionId - Call session ID
 */
export const acceptCall = async (sessionId) => {
  try {
    const { error } = await supabase
      .from('call_sessions')
      .update({
        status: 'accepted',
        answered_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    if (error) throw error;

    console.log('✅ Call accepted:', sessionId);
  } catch (error) {
    console.error('Error accepting call:', error);
    throw error;
  }
};

/**
 * Decline an incoming call
 * @param {string} sessionId - Call session ID
 * @param {string} reason - Optional decline reason
 */
export const declineCall = async (sessionId, reason = null) => {
  try {
    const { error } = await supabase
      .from('call_sessions')
      .update({
        status: 'declined',
        decline_reason: reason,
        ended_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    if (error) throw error;

    console.log('❌ Call declined:', sessionId, reason);
  } catch (error) {
    console.error('Error declining call:', error);
    throw error;
  }
};

/**
 * Mark a call as missed
 * @param {string} sessionId - Call session ID
 */
export const markCallAsMissed = async (sessionId) => {
  try {
    const { error } = await supabase
      .from('call_sessions')
      .update({
        status: 'missed',
        ended_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    if (error) throw error;

    console.log('📵 Call marked as missed:', sessionId);
  } catch (error) {
    console.error('Error marking call as missed:', error);
    throw error;
  }
};

/**
 * End an active call
 * @param {string} sessionId - Call session ID
 * @param {number} duration - Call duration in seconds
 */
export const endCall = async (sessionId, duration) => {
  try {
    const { error } = await supabase
      .from('call_sessions')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
        duration: duration
      })
      .eq('id', sessionId);

    if (error) throw error;

    console.log('🔚 Call ended:', sessionId, `Duration: ${duration}s`);
  } catch (error) {
    console.error('Error ending call:', error);
    throw error;
  }
};

/**
 * Cancel a ringing call (timeout)
 * @param {string} sessionId - Call session ID
 */
export const cancelCall = async (sessionId) => {
  try {
    const { error} = await supabase
      .from('call_sessions')
      .update({
        status: 'missed',
        ended_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .eq('status', 'ringing'); // Only cancel if still ringing

    if (error) throw error;

    console.log('⏱️ Call cancelled (timeout):', sessionId);
  } catch (error) {
    console.error('Error cancelling call:', error);
    throw error;
  }
};
