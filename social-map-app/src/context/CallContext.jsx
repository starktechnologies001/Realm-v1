import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import CallOverlay from '../components/CallOverlay';
import IncomingCallModal from '../components/IncomingCallModal';

import { useNavigate } from 'react-router-dom';

const CallContext = createContext();

export const useCall = () => useContext(CallContext);

export const CallProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [isCalling, setIsCalling] = useState(false);
    const [callData, setCallData] = useState(null); // { partner, type, isIncoming }
    const [incomingCall, setIncomingCall] = useState(null); // Payload from DB
    const [autoDeclineTimer, setAutoDeclineTimer] = useState(null);
    const navigate = useNavigate();
    
    // Guard to prevent double-invocations (e.g. double clicks)
    const processingAction = useRef(false);

    // Fetch Current User on Mount
    useEffect(() => {
        const fetchUser = async (userId) => {
            if (!userId) {
                setCurrentUser(null);
                return;
            }
            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();
            
            if (profile) setCurrentUser(profile);
        };

        const getSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                fetchUser(session.user.id);
            }
        };
        getSession();

        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user) fetchUser(session.user.id);
            else setCurrentUser(null);
        });

        return () => authListener.subscription.unsubscribe();
    }, []);

    // Global Incoming Call Listener
    useEffect(() => {
        if (!currentUser) return;

        console.log('Call System Active for:', currentUser.id);

        const channel = supabase.channel('global_calls_system')
            .on('postgres_changes', { 
                event: '*', // Listen to INSERT and UPDATE
                schema: 'public', 
                table: 'calls'
                // REMOVED FILTER to ensure we catch the event. We filter manually below.
            }, async (payload) => {
                console.log('🔔 [CallContext] REALTIME EVENT RECEIVED:', payload);
                
                // CASE 1: New Incoming Call
                // Manual Filter: strictly check receiver_id
                if (payload.eventType === 'INSERT' && payload.new.status === 'pending' && payload.new.receiver_id === currentUser.id) {
                    // Check if we are already busy
                    if (isCalling || incomingCall) {
                        console.log("User is busy, auto-rejecting call:", payload.new.id);
                        await supabase.from('calls').update({ status: 'busy' }).eq('id', payload.new.id);
                        return;
                    }

                    // CHECK MUTE SETTINGS
                    const { data: muteData } = await supabase
                        .from('chat_settings')
                        .select('muted_until')
                        .eq('user_id', currentUser.id)
                        .eq('partner_id', payload.new.caller_id)
                        .maybeSingle();

                    if (muteData?.muted_until && new Date(muteData.muted_until) > new Date()) {
                        console.log(`🔕 Call from ${payload.new.caller_id} is muted. suppressing.`);
                        // Optional: Does silence mean we silently reject or just let it ring out?
                        // Usually let it ring out (missed) or effectively ignore locally.
                        // We will just return here, so for the sender it stays 'pending' until timeout.
                        return;
                    }

                    console.log('🔔 [CallContext] Processing Incoming Call from:', payload.new.caller_id);

                    // Fetch caller details
                    const { data: callerProfile, error: profileError } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', payload.new.caller_id)
                        .single();

                    if (profileError) console.error("Error fetching caller profile:", profileError);

                    if (callerProfile) {
                        const callInfo = { ...payload.new, caller: callerProfile };
                        setIncomingCall(callInfo);
                        
                        // Notify sender that we received the signal (Update status to ringing)
                        await supabase.from('calls').update({ status: 'ringing' }).eq('id', payload.new.id);

                        // Start Auto-Decline Timer
                        const timer = setTimeout(() => {
                            rejectCall(callInfo.id, 'missed');
                        }, 30000);
                        setAutoDeclineTimer(timer);
                    }
                }

                // CASE 2: Call Cancelled/Ended remotely
                if (payload.eventType === 'UPDATE') {
                   // A. Incoming Call Update (Ringing -> Cancelled/Missed)
                   if (incomingCall && payload.new.id === incomingCall.id) {
                       const newStatus = payload.new.status;
                       if (['ended', 'cancelled', 'missed', 'rejected'].includes(newStatus)) {
                           console.log(`🔕 Call ${newStatus} remotely. Dismissing popup.`);
                           if (autoDeclineTimer) clearTimeout(autoDeclineTimer);
                           setIncomingCall(null);
                       }
                   }

                   // B. Outgoing Call Update (Ringing -> Declined/Active/Missed)
                   // Safety Net: If CallOverlay fails to catch the update (e.g. unmounted), we catch it here.
                   // We trust 'activeCallMessageId' to prevent double-logging (logCallMessage clears it).
                   // DISABLED to prevent race condition
                   /*
                   if (activeCallMessageId.current && payload.new.caller_id === currentUser.id) {
                       const newStatus = payload.new.status;
                       
                       if (['declined', 'missed', 'busy', 'rejected'].includes(newStatus)) {
                           console.log(`📞 [Global] Outgoing call was ${newStatus}. Updating log via Safety Net.`);
                           // Trigger log update
                           // We pass 'null' as partnerId because activeCallMessageId logic handles the update target
                           await logCallMessage(null, newStatus, null, payload.new.type);
                       }
                   }
                   */
                }
            })
            .subscribe((status, err) => {
                console.log(`📡 [CallContext] Subscription Status for ${currentUser.id}:`, status);
                if (err) console.error("Subscription Error:", err);
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUser, isCalling, incomingCall]);

    // Handle Call Actions
    // Track the current call log message ID to prevent duplicates
    const activeCallMessageId = useRef(null);

    // Helper to log call messages to Chat
    const logCallMessage = async (callId, status, partnerId, callType = 'audio', duration = 0) => {
        // If updating active log, partnerId is optional. If new log, partnerId is required.
        if (!currentUser || (!activeCallMessageId.current && !partnerId)) return;

        // Structured content for UI rendering
        const contentPayload = {
            status,
            call_type: callType,
            duration
        };

        // If we already have a log for this session and we are ending/updating it
        if (activeCallMessageId.current && (status === 'ended' || status === 'declined' || status === 'missed' || status === 'rejected' || status === 'busy')) {
             console.log(`📝 Updating existing call log ${activeCallMessageId.current} to: ${status}`);
             const { error } = await supabase.from('messages')
                .update({ content: JSON.stringify(contentPayload) })
                .eq('id', activeCallMessageId.current);
             
             if (error) console.error("Error updating call log:", error);
             
             // Clear ref after final update
             if (status === 'ended' || status === 'declined' || status === 'missed' || status === 'rejected' || status === 'busy') {
                 activeCallMessageId.current = null;
             }
        } else {
            // New Log (Start of call or standalone event)
            console.log(`📝 Creating NEW call log for: ${status}`);
            const { data, error } = await supabase.from('messages').insert({
                sender_id: currentUser.id,
                receiver_id: partnerId,
                content: JSON.stringify(contentPayload),
                message_type: 'call_log', // Special type for Chat.jsx
                is_read: true // System messages read by default
            }).select().single();

            if (error) {
                console.error("Error logging call message:", error);
            } else if (data) {
                // If this is a "starting" status, save the ID for future updates
                if (status === 'ringing' || status === 'active' || status === 'calling') {
                    activeCallMessageId.current = data.id;
                }
            }
        }
    };

    const startCall = (partner, type) => {
        if (!currentUser) return;
        setCallData({
            partner,
            type,
            isIncoming: false
        });
        setIsCalling(true);
        // Start log immediately
        logCallMessage(null, 'calling', partner.id, type);
    };

    const answerCall = async () => {
        if (processingAction.current) return;
        processingAction.current = true;

        try {
            if (autoDeclineTimer) clearTimeout(autoDeclineTimer);
            
            if (incomingCall) {
                // Update status to active and set start time
                await supabase.from('calls').update({ 
                    status: 'active',
                    started_at: new Date().toISOString()
                }).eq('id', incomingCall.id);
                
                setCallData({
                    partner: incomingCall.caller,
                    type: incomingCall.type,
                    isIncoming: true
                });
                setIsCalling(true);
                setIncomingCall(null);
            }
        } finally {
            processingAction.current = false;
        }
    };

    const rejectCall = async (callId = null, reason = 'rejected') => {
        if (processingAction.current) return;
        processingAction.current = true;

        try {
            if (autoDeclineTimer) clearTimeout(autoDeclineTimer);
            
            const idToReject = callId || (incomingCall ? incomingCall.id : null);
            const partnerId = incomingCall ? incomingCall.caller_id : null;
            const type = incomingCall ? incomingCall.type : 'audio';

            console.log(`❌ [rejectCall] Rejecting call ${idToReject} with reason: ${reason}`);

            if (idToReject) {
                const { error } = await supabase.from('calls').update({ status: reason }).eq('id', idToReject);
                
                if (error) {
                    console.error(`❌ [rejectCall] Error updating call status:`, error);
                } else {
                    console.log(`✅ [rejectCall] Successfully updated call ${idToReject} to status: ${reason}`);
                }
                
                // Log missed call to chat (only if missed/timeout, or declined)
                // Log missed call logic removed for Receiver. Caller handles it via Realtime to preventing dupes.
                // if (partnerId) {
                //    await logCallMessage(idToReject, reason, partnerId, type);
                // }
            }
            setIncomingCall(null);
        } finally {
            processingAction.current = false;
        }
    };

    const rejectWithMessage = async () => {
        if (!incomingCall) return;
        if (processingAction.current) return;
        processingAction.current = true;
        
        try {
            // 1. Send Message
            const { error } = await supabase.from('messages').insert({
                sender_id: currentUser.id,
                receiver_id: incomingCall.caller_id,
                content: "I am busy right now, can’t talk. I’ll call you later.",
                message_type: 'text'
            });
            
            if (error) console.error("Quick reply error:", error);

            // 2. Navigate to Chat
            navigate('/chat', { state: { selectedUser: incomingCall.caller } });

            // 3. Reject Call (This will also log the Declined call)
            // Note: we need to manually call the logic of rejectCall here to avoid double-locking ref
            if (autoDeclineTimer) clearTimeout(autoDeclineTimer);
            
            const idToReject = incomingCall.id;
            const partnerId = incomingCall.caller_id;
            const type = incomingCall.type;

            await supabase.from('calls').update({ status: 'declined' }).eq('id', idToReject);
            // await logCallMessage(idToReject, 'declined', partnerId, type); // Dedupe
            
            setIncomingCall(null);

        } finally {
            processingAction.current = false;
        }
    };

    const endCallSession = async (duration = 0, status = 'ended') => {
        if (processingAction.current) return;
        processingAction.current = true;

        try {
            console.log(`🔚 [endCallSession] Called with duration: ${duration}, status: ${status}`);
            
            // Log the ended/rejected/declined call
            if (callData && callData.partner) {
                 console.log(`🔚 [endCallSession] CallData exists. isIncoming: ${callData.isIncoming}`);
                 
                 // Prevent duplicate logs: Only Caller logs the session end/result
                 if (!callData.isIncoming) {
                     const partnerId = callData.partner.id;
                     const type = callData.type;
                     
                     console.log(`🔚 [endCallSession] Caller logging status: ${status} to partner: ${partnerId}`);
                     console.log(`🔚 [endCallSession] activeCallMessageId.current: ${activeCallMessageId.current}`);
                     
                     // Handle all terminal states
                     if (['ended', 'declined', 'rejected', 'missed', 'busy'].includes(status)) {
                        await logCallMessage('session_end', status, partnerId, type, duration);
                     }
                 } else {
                     console.log(`🔚 [endCallSession] Skipping log (receiver side)`);
                 }
            } else {
                console.log(`🔚 [endCallSession] No callData or partner found`);
            }

            setIsCalling(false);
            setCallData(null);
        } finally {
            processingAction.current = false;
        }
    };

    return (
        <CallContext.Provider value={{ startCall, isCalling }}>
            {children}
            
            {/* Incoming Call Modal */}
            {incomingCall && !isCalling && (
                <IncomingCallModal 
                    incomingCall={incomingCall}
                    onAnswer={answerCall}
                    onReject={() => rejectCall()}
                    onRejectWithMessage={rejectWithMessage}
                />
            )}

            {/* Active Call Overlay */}
            {isCalling && callData && currentUser && (
                <CallOverlay
                    callData={callData}
                    currentUser={currentUser}
                    onEnd={endCallSession}
                />
            )}
        </CallContext.Provider>
    );
};
