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
        const fetchUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                setCurrentUser(session.user);
            }
        };
        fetchUser();

        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user) setCurrentUser(session.user);
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
                event: 'INSERT', 
                schema: 'public', 
                table: 'calls', 
 
                filter: `receiver_id=eq.${currentUser.id}` 
            }, async (payload) => {
                console.log('🔔 [CallContext] REALTIME EVENT RECEIVED:', payload);
                // Check status is pending
                if (payload.new.status === 'pending') {
                    // Check if we are already busy
                    if (isCalling || incomingCall) {
                        // Auto-reject with busy status if already on a call
                        console.log("User is busy, auto-rejecting call:", payload.new.id);
                        await supabase.from('calls').update({ status: 'busy' }).eq('id', payload.new.id);
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

                        // Start Auto-Decline Timer (30s timeout for "No Answer")
                        const timer = setTimeout(() => {
                            rejectCall(callInfo.id, 'missed');
                        }, 30000);
                        setAutoDeclineTimer(timer);
                    }
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
    const startCall = (partner, type) => {
        if (!currentUser) return;
        setCallData({
            partner,
            type,
            isIncoming: false
        });
        setIsCalling(true);
    };

    const answerCall = async () => {
        if (processingAction.current) return;
        processingAction.current = true;

        try {
            if (autoDeclineTimer) clearTimeout(autoDeclineTimer);
            
            if (incomingCall) {
                // Update status to active
                await supabase.from('calls').update({ status: 'active' }).eq('id', incomingCall.id);
                
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

    // Helper to log call messages to Chat
    const logCallMessage = async (callId, status, partnerId, callType = 'audio', duration = 0) => {
        if (!callId || !currentUser || !partnerId) return;

        // Structured content for UI rendering
        const contentPayload = {
            status,
            call_type: callType,
            duration
        };

        const { error } = await supabase.from('messages').insert({
            sender_id: currentUser.id,
            receiver_id: partnerId,
            content: JSON.stringify(contentPayload),
            message_type: 'call_log', // Special type for Chat.jsx
            is_read: true // System messages read by default
        });

        if (error) console.error("Error logging call message:", error);
    };

    const rejectCall = async (callId = null, reason = 'rejected') => {
        if (processingAction.current) return;
        processingAction.current = true;

        try {
            if (autoDeclineTimer) clearTimeout(autoDeclineTimer);
            
            const idToReject = callId || (incomingCall ? incomingCall.id : null);
            const partnerId = incomingCall ? incomingCall.caller_id : null;
            const type = incomingCall ? incomingCall.type : 'audio';

            if (idToReject) {
                await supabase.from('calls').update({ status: reason }).eq('id', idToReject);
                
                // Log missed call to chat (only if missed/timeout, or declined)
                if (partnerId) {
                    // If I am the receiver rejecting -> It creates a log "Declined" or "Missed"
                    // Usually "Missed" is logged when timeout occurs.
                    // "Declined" is when I manually click decline.
                    await logCallMessage(idToReject, reason, partnerId, type);
                }
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
            await logCallMessage(idToReject, 'declined', partnerId, type);
            
            setIncomingCall(null);

        } finally {
            processingAction.current = false;
        }
    };

    const endCallSession = async (duration = 0, status = 'ended') => {
        if (processingAction.current) return;
        processingAction.current = true;

        try {
            // Log the ended call
            if (callData && callData.partner) {
                 // Prevent duplicate logs: Only Caller logs the session end
                 // And only if the call was actually connected/ended (not rejected/missed)
                 if (!callData.isIncoming && status === 'ended') {
                     const partnerId = callData.partner.id;
                     const type = callData.type;
                     
                     await logCallMessage('session_end', 'ended', partnerId, type, duration);
                 }
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
