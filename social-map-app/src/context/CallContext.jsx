import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import CallOverlay from '../components/CallOverlay';
import IncomingCallModal from '../components/IncomingCallModal';
import MinimizedCallWidget from '../components/MinimizedCallWidget';
import { useNavigate } from 'react-router-dom';

import Toast from '../components/Toast';

const CallContext = createContext();

export const useCall = () => useContext(CallContext);

export const CallProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [isCalling, setIsCalling] = useState(false);
    const [callData, setCallData] = useState(null); // { partner, type, isIncoming }
    const [incomingCall, setIncomingCall] = useState(null); // Payload from DB
    const [autoDeclineTimer, setAutoDeclineTimer] = useState(null);
    const [isMinimized, setIsMinimized] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const [toastMessage, setToastMessage] = useState(null); // For global call notifications
    const navigate = useNavigate();
    
    // Guard to prevent double-invocations (e.g. double clicks)
    const processingAction = useRef(false);

    // Refs for Realtime Listener (avoid re-subscription churn)
    const incomingCallRef = useRef(incomingCall);
    const isCallingRef = useRef(isCalling);
    // Helper Refs for Stable Access inside Listener
    const autoDeclineTimerRef = useRef(null);
    const endCallSessionRef = useRef(null);
    const incomingCallIdRef = useRef(null); // Synchronous ID tracking for race conditions
    const ignorableCallIds = useRef(new Set()); // Tombstones for out-of-order events

    useEffect(() => {
        incomingCallRef.current = incomingCall;
        isCallingRef.current = isCalling;
        autoDeclineTimerRef.current = autoDeclineTimer;
        incomingCallIdRef.current = incomingCall ? incomingCall.id : null;
        // endCallSessionRef is synced in separate effect to avoid cyclic deps if we were to put it here (though strictly okay if stable)
    }, [incomingCall, isCalling, autoDeclineTimer]);

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

    // Check for Mute Expiry (Background Cleanup)
    useEffect(() => {
        if (!currentUser?.mute_settings?.mute_all) return;

        const checkExpiry = async () => {
            const expiry = currentUser.mute_settings.muted_until;
            if (expiry && new Date(expiry) <= new Date()) {
                console.log("⏰ Global Mute Expired! Resetting settings...");
                
                // Reset in DB
                const resetSettings = {
                    message: 'Never',
                    muted_until: null,
                    mute_all: false
                };
                
                await supabase.from('profiles').update({ mute_settings: resetSettings }).eq('id', currentUser.id);
            }
        };

        // Check initially
        checkExpiry();

        // Check every minute
        const interval = setInterval(checkExpiry, 60000);
        return () => clearInterval(interval);
    }, [currentUser?.mute_settings, currentUser?.id]);

    // Global Realtime Listeners (Filtered by ID for Robustness)
    useEffect(() => {
        if (!currentUser?.id) return;

        console.log('%c📡 Call System v2.1 (Filtered) Active for:', 'color: green; font-weight: bold; font-size: 14px', currentUser.id);

        // 1. Channel for INCOMING calls (I am receiver)
        // This catches INSERT (new call) and UPDATE (caller cancelled)
        const incomingChannel = supabase.channel(`calls:incoming:${currentUser.id}`)
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'calls',
                filter: `receiver_id=eq.${currentUser.id}`
            }, async (payload) => {
                console.log('🔔 [IncomingChannel] Event:', payload.eventType, payload.new.status);
                
                // Helper to check for terminal status
                const isTerminal = ['ended', 'cancelled', 'missed', 'rejected', 'busy'].includes(payload.new.status);

                // A. UPDATE: Remote Cancellation or End
                if (payload.eventType === 'UPDATE') {
                    // Update state or set tombstone
                    if (isTerminal) {
                         // 0. RACE CONDITION FIX: Mark as tombstone immediately
                         ignorableCallIds.current.add(payload.new.id);

                         // Check against active incoming call
                         const currentIncoming = incomingCallIdRef.current;
                         if (currentIncoming && payload.new.id === currentIncoming) {
                             console.log(`🔕 Call ${payload.new.status} remotely. Dismissing popup.`);
                             if (autoDeclineTimerRef.current) clearTimeout(autoDeclineTimerRef.current);
                             incomingCallIdRef.current = null;
                             setIncomingCall(null);
                             
                             if (payload.new.status === 'cancelled') setToastMessage('Call Cancelled');
                             else if (payload.new.status === 'missed') setToastMessage('Missed Call');
                             
                             // Background Notification
                             if (document.hidden && Notification.permission === 'granted') {
                                 new Notification('Call ended', { body: 'The call was cancelled.', tag: 'call-ended' });
                             }
                         }

                         // Check against active accepted call (Receiver Side)
                         if (isCallingRef.current && endCallSessionRef.current) {
                             // If we are in a call and it ends
                              endCallSessionRef.current(payload.new.duration_seconds || 0, 'ended');
                         }
                    }
                }

                // B. INSERT: New Incoming Call
                if (payload.eventType === 'INSERT' && payload.new.status === 'pending') {
                    // 0. Check Tombstone
                    if (ignorableCallIds.current.has(payload.new.id)) {
                        console.log(`🛡️ [IncomingChannel] Blocking tombstoned call ${payload.new.id}`);
                        ignorableCallIds.current.delete(payload.new.id);
                        return;
                    }

                    // 1. Check Busy
                    if (isCallingRef.current || incomingCallIdRef.current) {
                        console.log("Busy. Auto-rejecting:", payload.new.id);
                        await supabase.from('calls').update({ status: 'busy' }).eq('id', payload.new.id);
                        return;
                    }
                    
                    // 2. Mute Checks
                    // ... (Mute logic simplified for brevity, assuming standard mute allowed)
                    if (currentUser.mute_settings?.mute_all) {
                        const expiry = currentUser.mute_settings.muted_until;
                        if (!expiry || new Date(expiry) > new Date()) {
                           console.log(`🔕 Global Mute. Suppressing.`);
                           return; 
                        }
                    }
                    // Chat mute check requires async fetch, doing minified blocking here to keep sync flow is hard.
                    // Ideally we fetch caller profile first.
                    
                    // Processing continue...
                    const { data: callerProfile } = await supabase.from('profiles').select('*').eq('id', payload.new.caller_id).single();
                    if (callerProfile) {
                        // Double check tombstone after async await (Critical!)
                        if (ignorableCallIds.current.has(payload.new.id)) return;

                        const callInfo = { ...payload.new, caller: callerProfile };
                        incomingCallIdRef.current = callInfo.id;
                        setIncomingCall(callInfo);
                        
                        await supabase.from('calls').update({ status: 'ringing' }).eq('id', payload.new.id);
                        
                        if (document.hidden && Notification.permission === 'granted') {
                             new Notification('Incoming Call', { body: `${callerProfile.username} calling...` });
                        }

                        const timer = setTimeout(() => {
                            supabase.from('calls').update({ status: 'missed' }).eq('id', callInfo.id).then(() => {
                                setIncomingCall(null);
                                setToastMessage('Missed Call');
                            });
                        }, 30000);
                        setAutoDeclineTimer(timer);
                    }
                }
            })
            .subscribe();


        // 2. Channel for OUTGOING calls (I am caller)
        // This catches UPDATE (receiver answered/rejected)
        const outgoingChannel = supabase.channel(`calls:outgoing:${currentUser.id}`)
            .on('postgres_changes', { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'calls',
                filter: `caller_id=eq.${currentUser.id}`
            }, (payload) => {
                 console.log('🔔 [OutgoingChannel] Update:', payload.new.status);
                 // We only care if we are currently in a call state
                 if (isCallingRef.current) {
                      const newStatus = payload.new.status;
                      const isTerminal = ['declined', 'rejected', 'busy', 'ended'].includes(newStatus);
                      
                      if (isTerminal && endCallSessionRef.current) {
                          console.log(`📞 [Outgoing] Call terminated remotely: ${newStatus}`);
                          endCallSessionRef.current(payload.new.duration_seconds || 0, newStatus);
                      }
                 }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(incomingChannel);
            supabase.removeChannel(outgoingChannel);
        };
    }, [currentUser]); // DEPENDENCIES MINIMIZED

    // Helper Refs for Stable Access inside Listener REMOVED (Moved to top)
    
    // Sync Timer Ref
    useEffect(() => {
        autoDeclineTimerRef.current = autoDeclineTimer;
    }, [autoDeclineTimer]);
    
    // We also need to expose endCallSession to the ref, but endCallSession is defined AFTER.
    // So we use a separate effect or move definition up.
    // Moving definition up is cleaner but might touch too many lines.
    // I will use an effect at the bottom to sync the ref.

    // Handle Call Actions
    // Track the current call log message ID to prevent duplicates
    const activeCallMessageId = useRef(null);
    const processingLog = useRef(Promise.resolve()); // Mutex for log operations

    // Helper to log call messages to Chat
    const logCallMessage = async (callId, status, partnerId, callType = null, duration = 0, callerId = null) => {
        // Chain operations to prevent race conditions
        const currentOp = processingLog.current.then(async () => {
        // If updating active log, partnerId is optional. If new log, partnerId is required.
        if (!currentUser || (!activeCallMessageId.current && !partnerId)) return;

        // Structured content for UI rendering
        const contentPayload = {
            status,
            call_type: callType,
            duration,
            caller_id: callerId || currentUser.id // Fallback to current user if not provided (assume creator is caller)
        };

        // If we already have a log for this session and we are ending/updating it
        if (activeCallMessageId.current && (status === 'ended' || status === 'declined' || status === 'missed' || status === 'rejected' || status === 'busy' || status === 'cancelled')) {
             console.log(`📝 Updating existing call log ${activeCallMessageId.current} to: ${status}`);
             const { error } = await supabase.from('messages')
                .update({ content: JSON.stringify(contentPayload) })
                .eq('id', activeCallMessageId.current);
             
             if (error) console.error("Error updating call log:", error);
             
             // Clear ref after final update
             if (status === 'ended' || status === 'declined' || status === 'missed' || status === 'rejected' || status === 'busy' || status === 'cancelled') {
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
        });
        
        processingLog.current = currentOp;
        return currentOp;
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
        // Start log immediately - I am the caller
        logCallMessage(null, 'calling', partner.id, type, 0, currentUser.id);
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
                
                // Log missed call logic removed for Receiver. Caller handles it via Realtime to preventing dupes.
            }

            // Delay clearing the call to allow UI to absorb any trailing click events (Ghost Clicks)
            // verifying "Ghost Video Call" bug fix
            await new Promise(resolve => setTimeout(resolve, 500));
            
            setIncomingCall(null);
            // Note: ringtoneAudio is managed by IncomingCallModal component, not here
        } finally {
            processingAction.current = false;
        }
    };

    const rejectWithMessage = async () => {
        if (!incomingCall) return;
        if (processingAction.current) return;
        processingAction.current = true;
        
        try {
            // 1. Find the Call Log to reply to (Visual Threading) with Retry
            console.log("🔍 [rejectWithMessage] Finding call log to reply to...");
            let replyToId = null;
            let retries = 0;
            const maxRetries = 5; // Retry for ~4 seconds

            while (!replyToId && retries < maxRetries) {
                const { data: recentLogs } = await supabase
                    .from('messages')
                    .select('id')
                    .eq('sender_id', incomingCall.caller_id)
                    .eq('receiver_id', currentUser.id)
                    .eq('message_type', 'call_log')
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (recentLogs && recentLogs.length > 0) {
                    replyToId = recentLogs[0].id;
                } else {
                    retries++;
                    if (retries < maxRetries) {
                        console.log(`⏳ Call log not found, retrying... (${retries}/${maxRetries})`);
                        await new Promise(resolve => setTimeout(resolve, 800)); // Wait 800ms
                    }
                }
            }

            // 2. Send Message (as Reply)
            const { error } = await supabase.from('messages').insert({
                sender_id: currentUser.id,
                receiver_id: incomingCall.caller_id,
                content: "I am busy right now, can’t talk. I’ll call you later.",
                message_type: 'text',
                reply_to_message_id: replyToId // <--- The visual link
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
                     if (['ended', 'declined', 'rejected', 'missed', 'busy', 'cancelled'].includes(status)) {
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
            setIsMinimized(false); // Reset minimize state when call ends
        } finally {
            processingAction.current = false;
        }
    };

    const minimizeCall = () => {
        setIsMinimized(true);
    };

    const maximizeCall = () => {
        setIsMinimized(false);
    };

    // Sync EndCallSession Ref
    useEffect(() => {
        endCallSessionRef.current = endCallSession;
    }, [endCallSession]);

    return (
        <CallContext.Provider value={{ startCall, isCalling, isMinimized, minimizeCall, maximizeCall, incomingCall }}>
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
            {/* Active Call Overlay (Handles both Full and Minimized view to keep state alive) */}
            {isCalling && callData && currentUser && (
                <CallOverlay
                    callData={callData}
                    currentUser={currentUser}
                    onEnd={endCallSession}
                    onMinimize={minimizeCall}
                    onMaximize={maximizeCall}
                    isMinimized={isMinimized}
                    callDuration={callDuration}
                    setCallDuration={setCallDuration}
                />
            )}

            {/* Global Toast for Call System */}
            {toastMessage && (
                <Toast 
                    message={toastMessage} 
                    onClose={() => setToastMessage(null)} 
                    duration={2000} 
                />
            )}
        </CallContext.Provider>
    );
};
