import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import CallOverlay from '../components/CallOverlay';
import IncomingCallModal from '../components/IncomingCallModal';

const CallContext = createContext();

export const useCall = () => useContext(CallContext);

export const CallProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [isCalling, setIsCalling] = useState(false);
    const [callData, setCallData] = useState(null); // { partner, type, isIncoming }
    const [incomingCall, setIncomingCall] = useState(null); // Payload from DB
    const [autoDeclineTimer, setAutoDeclineTimer] = useState(null);

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
                // Check status is pending
                if (payload.new.status === 'pending') {
                    // Check if we are already busy
                    if (isCalling || incomingCall) {
                        // Auto-reject with busy status if already on a call
                        console.log("User is busy, auto-rejecting call:", payload.new.id);
                        await supabase.from('calls').update({ status: 'busy' }).eq('id', payload.new.id);
                        return;
                    }

                    // Fetch caller details
                    const { data: callerProfile } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', payload.new.caller_id)
                        .single();

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
            .subscribe();

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
    };

    // Helper to log call messages to Chat
    const logCallMessage = async (callId, status, partnerId) => {
        if (!callId || !currentUser || !partnerId) return;

        let content = '';
        if (status === 'ended') content = 'Call ended';
        else if (status === 'rejected') content = 'Call declined';
        else if (status === 'missed') content = 'Missed call';
        else if (status === 'busy') content = 'Line busy';
        else content = `Call ${status}`;

        await supabase.from('messages').insert({
            sender_id: currentUser.id,
            receiver_id: partnerId,
            content: content,
            message_type: 'call_log', // Special type for UI rendering
            is_read: true // System messages read by default
        });
    };

    const rejectCall = async (callId = null, reason = 'rejected') => {
        if (autoDeclineTimer) clearTimeout(autoDeclineTimer);
        
        const idToReject = callId || (incomingCall ? incomingCall.id : null);
        const partnerId = incomingCall ? incomingCall.caller_id : null;

        if (idToReject) {
            await supabase.from('calls').update({ status: reason }).eq('id', idToReject);
            
            // Log missed/rejected call to chat
            if (partnerId) {
                // If it was a missed call (timeout), log it. If rejected manually, log it.
                // We log from our perspective (Receiver) -> "Missed call"
                // Actually, typically "Missed Call" is logged by the system or the caller sees "Declined".
                // Let's settle on: Receiver logs nothing if they reject? 
                // Better: Log a system message that "You missed a call" or "Call from [User]"
                // For simplicity, let's insert a 'call_log' message.
                await logCallMessage(idToReject, reason, partnerId);
            }
        }
        setIncomingCall(null);
    };

    const rejectWithMessage = async () => {
        if (!incomingCall) return;
        
        // 1. Send Message
        const { error } = await supabase.from('messages').insert({
            sender_id: currentUser.id,
            receiver_id: incomingCall.caller_id,
            content: "I am busy right now, can’t talk. I’ll call you later.",
            type: 'text'
        });
        
        if (error) console.error("Quick reply error:", error);

        // 2. Reject Call
        rejectCall(null, 'rejected'); // Treat as rejected
    };

    const endCallSession = async () => {
        // Log the ended call
        if (callData && callData.partner) {
             // We just insert a message into the chat saying "Call ended"
             await supabase.from('messages').insert({
                sender_id: currentUser.id,
                receiver_id: callData.partner.id,
                content: 'Call ended',
                message_type: 'call_log',
                is_read: true
            });
        }

        setIsCalling(false);
        setCallData(null);
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
