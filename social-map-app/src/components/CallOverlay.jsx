import React, { useState, useEffect, useRef } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { supabase } from '../supabaseClient';
import { getAvatar2D, handleAvatarError } from '../utils/avatarUtils';

export default function CallOverlay({ callData, currentUser, onEnd, onMinimize, onMaximize, isMinimized, callDuration, setCallDuration }) {
    const [status, setStatus] = useState('Connecting...');
    const [muted, setMuted] = useState(false);
    const [cameraOff, setCameraOff] = useState(false);
    const [remoteUsers, setRemoteUsers] = useState([]);
    const [localTrackReady, setLocalTrackReady] = useState(false);
    const [cameras, setCameras] = useState([]); // Available camera devices
    
    // --- Draggable & Snapping Logic for Floating Window ---
    const [sizeMode, setSizeMode] = useState('small'); // 'small' | 'medium'
    const [speakerOff, setSpeakerOff] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [showControls, setShowControls] = useState(false);
    const lastTapTimeRef = useRef(0);
    const lastPositionRef = useRef(null);

    const [position, setPosition] = useState(() => {
        if (lastPositionRef.current) return lastPositionRef.current;
        const w = callData.type === 'video' ? 160 : 180;
        return { x: window.innerWidth - w - 16, y: 100 };
    });

    const dragRef = useRef(null);
    const isDragging = useRef(false);
    const hasDragged = useRef(false);
    const offset = useRef({ x: 0, y: 0 });

    const startDrag = (clientX, clientY) => {
        if (!isMinimized) return;
        isDragging.current = true;
        hasDragged.current = false;
        
        const rect = dragRef.current.getBoundingClientRect();
        offset.current = {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
        
        if (dragRef.current) {
            dragRef.current.classList.add('dragging');
        }
    };

    const moveDrag = (clientX, clientY) => {
        if (!isDragging.current) return;
        hasDragged.current = true;
        
        const rect = dragRef.current.getBoundingClientRect();
        const widgetWidth = rect.width;
        const widgetHeight = rect.height;
        
        let newX = clientX - offset.current.x;
        let newY = clientY - offset.current.y;
        
        // Constrain to screen boundaries during dragging
        newX = Math.max(0, Math.min(newX, window.innerWidth - widgetWidth));
        newY = Math.max(0, Math.min(newY, window.innerHeight - widgetHeight));
        
        setPosition({ x: newX, y: newY });
    };

    const endDrag = () => {
        if (!isDragging.current) return;
        isDragging.current = false;
        
        if (dragRef.current) {
            dragRef.current.classList.remove('dragging');
            
            const rect = dragRef.current.getBoundingClientRect();
            const widgetWidth = rect.width;
            const widgetHeight = rect.height;
            const centerX = position.x + widgetWidth / 2;
            
            let finalX = 16;
            if (centerX >= window.innerWidth / 2) {
                finalX = window.innerWidth - widgetWidth - 16;
            }
            
            // Constrain vertical bounds (avoid bottom nav height ~60px + status bar top ~40px)
            const minY = 40;
            const maxY = window.innerHeight - widgetHeight - 80;
            const finalY = Math.max(minY, Math.min(position.y, maxY));
            
            setPosition({ x: finalX, y: finalY });
            lastPositionRef.current = { x: finalX, y: finalY };
        }
    };

    const handleMouseDown = (e) => {
        if (!isMinimized) return;
        if (e.button !== 0) return; // Left click only
        if (e.target.closest('.mini-controls-overlay') || e.target.closest('button')) return;
        
        startDrag(e.clientX, e.clientY);
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e) => {
        moveDrag(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
        endDrag();
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    const handleTouchStart = (e) => {
        if (!isMinimized) return;
        if (e.target.closest('.mini-controls-overlay') || e.target.closest('button')) return;
        
        const touch = e.touches[0];
        startDrag(touch.clientX, touch.clientY);
        
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleTouchEnd);
    };

    const handleTouchMove = (e) => {
        if (e.cancelable) e.preventDefault();
        const touch = e.touches[0];
        moveDrag(touch.clientX, touch.clientY);
    };

    const handleTouchEnd = () => {
        endDrag();
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
    };
    
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const clientRef = useRef(null);
    const localAudioTrackRef = useRef(null);
    const localVideoTrackRef = useRef(null);
    const callStartTimeRef = useRef(null);
    const durationIntervalRef = useRef(null);
    const ringingTimeoutRef = useRef(null); // Timeout for outgoing calls
    const outgoingRingtoneRef = useRef(null);     // Ringtone for caller while waiting
    const outgoingPlayPromiseRef = useRef(null);  // Must await before pausing (browser policy)

    const hasAnsweredRef = useRef(false);
    const hasEndedRef = useRef(false); // Prevent double-fire of onEnd
    const isStoppingRef = useRef(false); // Track if we are in process of stopping (race condition fix)
    const endCallRef = useRef(null); // Access endCall inside useEffect
    const callDbId = useRef(null); // Store DB ID of the current call

    // (Video effects removed from here and consolidated below)

    useEffect(() => {
        let mounted = true;
        const APP_ID = import.meta.env.VITE_AGORA_APP_ID;

        if (!APP_ID) {
            setStatus('⚠️ Agora App ID not configured');
            console.error('Please add VITE_AGORA_APP_ID to your .env file');
            return;
        }

        // 0. Define Timer Helper (Moved up for scope)
        const startTimer = () => {
            if (durationIntervalRef.current) return;
            console.log('⏱️ Starting Call Timer');
            callStartTimeRef.current = Date.now();
            durationIntervalRef.current = setInterval(() => {
                if (callStartTimeRef.current) {
                    const elapsed = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
                    setCallDuration(elapsed);
                }
            }, 1000);
        };

        // 1. Setup Channel Name & Signalling Subscription EARLY
        const sortedIds = [currentUser.id, callData.partner.id].sort();
        const channelName = `call_${sortedIds[0].slice(0, 15)}_${sortedIds[1].slice(0, 15)}`;

        console.log("🔗 Connecting to channel:", channelName);

        // Listen for call status changes immediately
        const channel = supabase.channel('current_call')
            .on('postgres_changes', { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'calls',
                filter: `channel_name=eq.${channelName}`
            }, (payload) => {
                const newStatus = payload.new.status;
                console.log("🔔 [CallOverlay] Status Update:", newStatus);
                
                if (['ended', 'rejected', 'declined', 'missed', 'busy'].includes(newStatus)) {
                    cleanup();
                    // Calculate final duration dynamically
                    const finalDuration = callStartTimeRef.current ? Math.floor((Date.now() - callStartTimeRef.current) / 1000) : 0;
                    
                    if (onEnd && !hasEndedRef.current) {
                        hasEndedRef.current = true;
                        onEnd(finalDuration, newStatus);
                    }
                }
                
                if ((newStatus === 'active' || newStatus === 'accepted') && mounted) {
                    hasAnsweredRef.current = true;
                    if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
                    // Stop outgoing ringtone when call is answered
                    stopOutgoingRingtone();
                    setStatus('Connected');
                    startTimer();
                }
            })
            .subscribe();


        const initializeCall = async () => {
            try {
                const isVideoCall = callData.type === 'video';

                // 2. IMMEDIATE: Initialize Local Tracks
                if (isVideoCall) {
                    try {
                        const videoTrack = await AgoraRTC.createCameraVideoTrack();
                        if (!mounted) { videoTrack.close(); return; } // Cleanup if unmounted during await
                        localVideoTrackRef.current = videoTrack;

                        // Force a small delay to ensure track is ready for UI binding
                        await new Promise(r => setTimeout(r, 100)); 
                        if (!mounted) return;

                        setLocalTrackReady(true);
                        console.log('✅ Local video track ready');
                    } catch (trackErr) {
                        console.error('Failed to create camera track:', trackErr);
                        setStatus('⚠️ Camera Access Denied');
                    }
                }
                
                try {
                    const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
                    if (!mounted) { audioTrack.close(); return; } // Cleanup if unmounted
                    localAudioTrackRef.current = audioTrack;
                } catch (micErr) {
                    console.error('Failed to create mic track:', micErr);
                    setStatus('⚠️ Mic Access Denied');
                }

                if (!mounted) return;

                // 3. Setup Agora Client
                const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
                clientRef.current = client;

                // Handle remote user events
                client.on('user-published', async (user, mediaType) => {
                    // FILTER: Ignore "ghost" sessions of myself
                    // uid format is `${currentUser.id}-${timestamp}`
                    // If user.uid matches my ID prefix, it's me from another tab/stuck session.
                    if (String(user.uid).startsWith(String(currentUser.id))) {
                        console.warn('👻 Ignoring ghost session of self:', user.uid);
                        return;
                    }

                    await client.subscribe(user, mediaType);
                    console.log('Subscribed to remote user:', user.uid, mediaType);

                    // ROBUSTNESS: If we receive media, they definitely answered.
                    // Fallback if Realtime 'active' event was missed.
                    if (!callData.isIncoming && !hasAnsweredRef.current) {
                        console.log("✅ [Agora] Remote user published media. Assuming call Answered.");
                        hasAnsweredRef.current = true;
                        if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
                        
                        // Stop outgoing ringtone
                        if (outgoingRingtoneRef.current) {
                            outgoingRingtoneRef.current.pause();
                            outgoingRingtoneRef.current = null;
                        }
                        
                        setStatus('Connected');
                        startTimer();
                    }

                    if (mediaType === 'video') {
                        setRemoteUsers(prev => {
                            const others = prev.filter(u => u.uid !== user.uid);
                            return [...others, user];
                        });
                    }

                    if (mediaType === 'audio' && user.audioTrack) {
                        user.audioTrack.play();
                        if (speakerOffRef.current) {
                            user.audioTrack.setVolume(0);
                        }
                    }
                });

                client.on('user-unpublished', (user, mediaType) => {
                    console.log('User unpublished:', user.uid, mediaType);
                    if (mediaType === 'video') {
                         setRemoteUsers(prev => prev.map(u => u.uid === user.uid ? user : u));
                    }
                });

                client.on('user-left', (user) => {
                    console.log('User left:', user.uid);
                    setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
                    // STRICT RULE: If remote user leaves, end the call locally.
                    console.log("🚫 Remote user left. Ending call to prevent partial state.");
                    if (endCallRef.current) endCallRef.current();
                });

                // 4. Create Call (If Caller)
                if (!callData.isIncoming) {
                    if (!mounted) return;
                    
                    // Check if there is already an active pending call row for this channel to prevent duplicates
                    const { data: existingCall } = await supabase.from('calls')
                        .select('*')
                        .eq('channel_name', channelName)
                        .eq('status', 'pending')
                        .maybeSingle();

                    if (!mounted) return;

                    if (existingCall) {
                        console.log("🛡️ Found existing pending call, using it instead of inserting new one:", existingCall.id);
                        callDbId.current = existingCall.id;
                    } else {
                        setStatus('Calling...'); // Explicit feedback
                        
                        const { data: insertedCall, error: insertError } = await supabase.from('calls').insert({
                            caller_id: currentUser.id,
                            receiver_id: callData.partner.id,
                            type: callData.type,
                            status: 'pending',
                            channel_name: channelName
                        }).select().maybeSingle();

                        if (!mounted) {
                            // If unmounted while inserting, clean up the row
                            if (insertedCall) {
                                await supabase.from('calls').update({ status: 'cancelled' }).eq('id', insertedCall.id);
                            }
                            return;
                        }

                        if (insertedCall) {
                            callDbId.current = insertedCall.id;

                            // RACE CONDITION FIX: 
                            // If user clicked "Hang Up" while we were awaiting the insert, 
                            // endCall() might have run but missed the row (since it didn't exist).
                            // We must check if we are stopping, and if so, cancel this new row immediately.
                            if (isStoppingRef.current) {
                                console.log("🛑 Call was cancelled during initialization. Marking as cancelled now.");
                                await supabase.from('calls').update({ 
                                    status: 'cancelled',
                                    ended_at: new Date().toISOString(),
                                    duration_seconds: 0
                                }).eq('id', insertedCall.id);
                                return; // Stop init
                            }
                            
                            // Play outgoing ringtone for caller
                            const ringtone = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869.wav');
                            ringtone.loop = true;
                            outgoingRingtoneRef.current = ringtone;
                            // Store promise so we can await it before pausing (browser race fix)
                            outgoingPlayPromiseRef.current = ringtone.play().catch(e => {
                                console.log('Outgoing ringtone blocked:', e);
                                outgoingPlayPromiseRef.current = null;
                            });

                        } else if (insertError) {
                            console.error("Error creating call row:", insertError);
                        }
                    }
                } else {
                    if (callData.id) callDbId.current = callData.id;
                }

                // 5. Join Channel
                // Use a unique UID to prevent collision with ghost sessions from previous tabs
                const uniqueUid = `${currentUser.id}-${Date.now().toString().slice(-6)}`;
                
                if (!mounted) return;
                await client.join(APP_ID, channelName, null, uniqueUid);
                
                // Double check mounted after join before publishing
                if (!mounted) {
                     await client.leave();
                     return;
                }

                // 6. Publish Tracks
                const tracksToPublish = [];
                if (localAudioTrackRef.current) tracksToPublish.push(localAudioTrackRef.current);
                // Only publish video if track exists AND it is enabled (not strictly required as track can be disabled later, but good practice)
                if (localVideoTrackRef.current) tracksToPublish.push(localVideoTrackRef.current);
                
                if (tracksToPublish.length > 0) {
                    await client.publish(tracksToPublish);
                    console.log('Published local tracks');
                }

                // startTimer is now defined in parent scope

                if (mounted) {
                    if (callData.isIncoming) {
                         // Receiver: Connected immediately upon opening this overlay
                         setStatus('Connected');
                         startTimer();
                         hasAnsweredRef.current = true;
                    } else {
                         // Caller: Wait for answer
                         setStatus('Ringing...'); 
                         
                         // Start 30s Timeout for Caller (ONLY IF NOT ANSWERED YET)
                         if (!hasAnsweredRef.current) {
                             ringingTimeoutRef.current = setTimeout(async () => {
                                 console.log('⏱️ No answer after 30s. Ending call as missed.');
                                 if (mounted && !hasAnsweredRef.current) {
                                    setStatus('No Answer');
                                    
                                    // Spec Point 5: Notify Caller if backgrounded
                                    if (document.hidden && Notification.permission === 'granted') {
                                        new Notification('Video call not answered', {
                                            body: `Your call to ${callData.partner.username || 'User'} was not answered.`,
                                            tag: 'call-timeout'
                                        });
                                    }

                                    await new Promise(r => setTimeout(r, 1500)); // Show status briefly
                                    await new Promise(r => setTimeout(r, 1500)); // Show status briefly
                                    await endCall('missed'); // Explicitly mark as missed
                                 }
                             }, 30000);
                         } else {
                             console.log("✅ Call already answered during init, skipping timeout.");
                             setStatus('Connected');
                             startTimer();
                         }
                    }
                }

                // 7. Play Local Video if ready
                if (localVideoTrackRef.current && localVideoRef.current && !cameraOff) {
                    localVideoTrackRef.current.play(localVideoRef.current);
                }

            } catch (error) {
                console.error('Call initialization error:', error);
                
                // Detailed Error Handling
                if (error.code === 'PERMISSION_DENIED' || error.name === 'NotAllowedError') {
                    setStatus('⚠️ Camera/Mic access denied. Please allow perms.');
                } else if (error.code === 'UID_CONFLICT') {
                    setStatus('Connection stuck. Please refresh the page.');
                } else {
                    setStatus(`Failed: ${error.message || JSON.stringify(error)}`);
                }
            }
        };


        const cleanup = async () => {
            if (!mounted) return; // Prevent double cleanup if possible, though refs protect us
            mounted = false;

            // 🔇 Always stop outgoing ringtone on unmount — uses promise-chain so pause()
            // is never ignored (browser policy: must await play() promise first)
            stopOutgoingRingtone();
            
            // Stop duration timer
            if (durationIntervalRef.current) {
                clearInterval(durationIntervalRef.current);
                durationIntervalRef.current = null;
            }
            
            if (ringingTimeoutRef.current) {
                clearTimeout(ringingTimeoutRef.current);
                ringingTimeoutRef.current = null;
            }

            // Close local tracks - CRITICAL for simple hardware release
            try {
                if (localAudioTrackRef.current) {
                    localAudioTrackRef.current.stop();
                    localAudioTrackRef.current.close();
                    localAudioTrackRef.current = null;
                }
                if (localVideoTrackRef.current) {
                    localVideoTrackRef.current.stop();
                    localVideoTrackRef.current.close();
                    localVideoTrackRef.current = null;
                }
            } catch (err) {
                console.error('Error closing local tracks:', err);
            }

            // Leave channel
            if (clientRef.current) {
                try {
                    await clientRef.current.leave();
                } catch (e) {
                    console.log('Already left channel or error leaving:', e);
                }
                clientRef.current = null;
            }
            
            console.log('✅ Call Cleanup Complete: Hardware released.');
        };

        initializeCall();

        return () => {
            cleanup();
        };
    }, []);

    // Fetch accessible cameras once permissions are granted or local track is ready
    useEffect(() => {
        if (localTrackReady) {
            AgoraRTC.getCameras().then(devices => {
                setCameras(devices);
                console.log('📷 Available cameras:', devices.length, devices);
            }).catch(e => console.error('Failed to get cameras', e));
        }
    }, [localTrackReady]);

    // Sync speakerOffRef to access latest state in Agora event listener closure
    const speakerOffRef = useRef(speakerOff);
    useEffect(() => {
        speakerOffRef.current = speakerOff;
    }, [speakerOff]);

    // Effect to play Local Video when ready
    useEffect(() => {
        if (localTrackReady && localVideoRef.current && localVideoTrackRef.current && !cameraOff) {
            localVideoTrackRef.current.play(localVideoRef.current);
        }
    }, [localTrackReady, cameraOff, isMinimized, sizeMode]);

    // Effect to play Remote Video when ready
    useEffect(() => {
        if (remoteUsers.length > 0) {
            remoteUsers.forEach(user => {
                // If user has video track and we have a ref container
                if (user.videoTrack && remoteVideoRef.current) {
                    user.videoTrack.play(remoteVideoRef.current);
                }
            });
        }
    }, [remoteUsers, isMinimized, sizeMode]);

    // Safely stop outgoing ringtone — must await play() promise before pausing
    const stopOutgoingRingtone = () => {
        const audio = outgoingRingtoneRef.current;
        if (!audio) return;
        outgoingRingtoneRef.current = null; // Null immediately to prevent double-stop

        const finish = () => {
            try {
                audio.pause();
                audio.currentTime = 0;
            } catch {}
        };

        if (outgoingPlayPromiseRef.current) {
            outgoingPlayPromiseRef.current.then(finish).catch(finish);
            outgoingPlayPromiseRef.current = null;
        } else {
            finish();
        }
    };

    const toggleMute = async () => {
        if (localAudioTrackRef.current) {
            await localAudioTrackRef.current.setEnabled(muted);
            setMuted(!muted);
        }
    };

    const toggleCamera = async () => {
        if (localVideoTrackRef.current) {
            await localVideoTrackRef.current.setEnabled(cameraOff);
            setCameraOff(!cameraOff);
        }
    };

    const switchCamera = async () => {
        if (!localVideoTrackRef.current || cameras.length < 2) return;
        
        try {
            const currentLabel = localVideoTrackRef.current.getTrackLabel();
            const currentIndex = cameras.findIndex(cam => cam.label === currentLabel);
            // If current not found (e.g. default), start at 0, otherwise next
            const nextIndex = (currentIndex + 1) % cameras.length;
            const nextDevice = cameras[nextIndex];
            
            await localVideoTrackRef.current.setDevice(nextDevice.deviceId);
            console.log('🔄 Switched camera to:', nextDevice.label);
        } catch (e) {
            console.error('Error switching camera:', e);
        }
    };

    const toggleSpeaker = () => {
        const newSpeakerOff = !speakerOff;
        setSpeakerOff(newSpeakerOff);
        remoteUsers.forEach(user => {
            if (user.audioTrack) {
                user.audioTrack.setVolume(newSpeakerOff ? 0 : 100);
            }
        });
    };

    const endCall = async (forcedStatus = null) => {
        console.log('🔴 [endCall] START - forcedStatus:', forcedStatus, 'callDbId:', callDbId.current, 'isIncoming:', callData?.isIncoming);
        
        isStoppingRef.current = true; // Mark as stopping immediately to catch race conditions
        
        // Stop outgoing ringtone if playing (awaits play() promise to avoid browser race)
        stopOutgoingRingtone();
        
        // Explicitly close tracks immediately to turn off camera/mic
        if (localAudioTrackRef.current) {
            localAudioTrackRef.current.close();
            localAudioTrackRef.current = null;
        }
        if (localVideoTrackRef.current) {
            localVideoTrackRef.current.close();
            localVideoTrackRef.current = null;
        }
        if (clientRef.current) {
            await clientRef.current.leave();
            clientRef.current = null;
        }

        // Calculate final duration dynamically to avoid stale closure state
        const finalDuration = callStartTimeRef.current ? Math.floor((Date.now() - callStartTimeRef.current) / 1000) : 0;

        // Determine final status
        // If Caller hung up before answer (duration 0), mark as missed/cancelled
        // We use 'cancelled' to clearly indicate Caller hung up.
        let statusToUse = forcedStatus;
        if (!statusToUse) {
            const isMissed = !callData.isIncoming && finalDuration === 0;
            statusToUse = isMissed ? 'cancelled' : 'ended';
        }

        console.log('🔴 [endCall] Computed status:', statusToUse, 'duration:', finalDuration);

        // Update DB to end call
        const sortedIds = [currentUser.id, callData.partner.id].sort();
        const channelName = `call_${sortedIds[0].slice(0, 15)}_${sortedIds[1].slice(0, 15)}`;
        
        // Use ID if captured, otherwise fallback to channel_name (legacy safe)
        if (callDbId.current) {
            console.log('🔴 [endCall] Updating by ID:', callDbId.current);
            const { data, error } = await supabase.from('calls')
                .update({ 
                    status: statusToUse,
                    ended_at: new Date().toISOString(),
                    duration_seconds: finalDuration
                })
                .eq('id', callDbId.current)
                .select();
            
            if (error) {
                console.error('❌ [endCall] DB Update FAILED:', error);
            } else {
                console.log('✅ [endCall] DB Update SUCCESS:', data);
            }
        } else {
            console.warn("⚠️ [endCall] No callDbId found, falling back to channel_name update");
            const { data, error } = await supabase.from('calls')
                .update({ 
                    status: statusToUse,
                    ended_at: new Date().toISOString(),
                    duration_seconds: finalDuration
                })
                .eq('channel_name', channelName)
                .eq('status', 'pending') // Only update if still pending
                .select();
            
            if (error) {
                console.error('❌ [endCall] Fallback DB Update FAILED:', error);
            } else {
                console.log('✅ [endCall] Fallback DB Update SUCCESS:', data);
            }
        }

        console.log('🔴 [endCall] Calling onEnd callback');
        // Trigger parent callback
        if (onEnd) onEnd(finalDuration, statusToUse);
    };

    // Update ref so listener can access latest endCall logic
    useEffect(() => {
        endCallRef.current = endCall;
    }, [endCall]);

    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const isVideoCall = callData.type === 'video';
    // Check if remote user has active video track
    const hasRemoteVideo = remoteUsers.length > 0 && remoteUsers[0].videoTrack;



    // If Minimized, render the Floating Widget
    if (isMinimized) {
        const showOverlay = isHovered || showControls;
        const hasRemoteVideo = remoteUsers.length > 0 && remoteUsers[0].videoTrack;

        return (
            <div 
                ref={dragRef}
                className={`floating-call-widget call-type-${callData.type} size-${sizeMode}`}
                style={{ top: position.y, left: position.x }}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                {/* Visual Content */}
                <div 
                    className="widget-content" 
                    onClick={(e) => {
                        if (hasDragged.current) return;
                        const now = Date.now();
                        const DOUBLE_TAP_DELAY = 300;
                        if (now - lastTapTimeRef.current < DOUBLE_TAP_DELAY) {
                            onMaximize();
                        } else {
                            setShowControls(prev => !prev);
                        }
                        lastTapTimeRef.current = now;
                    }}
                >
                   {isVideoCall ? (
                       <div className="mini-video-wrapper">
                           {/* Remote Video Stream / Fallback */}
                           {hasRemoteVideo ? (
                               <div ref={remoteVideoRef} className="mini-video-track remote-feed"></div>
                           ) : (
                               <div className="mini-avatar-fallback remote">
                                   <img 
                                       src={getAvatar2D(callData.partner.avatar_url, callData.partner.username)} 
                                       className="mini-avatar-img"
                                       onError={(e) => handleAvatarError(e, callData.partner.username)}
                                       alt="Partner"
                                   />
                               </div>
                           )}
                           
                           {/* Local Video PIP / Fallback */}
                           <div className="mini-video-local-pip">
                               {!cameraOff ? (
                                   <div ref={localVideoRef} className="mini-video-track local-feed local-mirror"></div>
                               ) : (
                                   <img 
                                       src={getAvatar2D(currentUser.avatar_url, currentUser.username)} 
                                       className="mini-avatar-img"
                                       onError={(e) => handleAvatarError(e, currentUser.username)}
                                       alt="Me"
                                   />
                               )}
                           </div>

                           {/* Inline Info Overlay on Bottom of Video */}
                           <div className="mini-video-info">
                               <span className="mini-name">{callData.partner.username}</span>
                               <span className="mini-timer">{formatDuration(callDuration)}</span>
                           </div>
                       </div>
                   ) : (
                       /* Audio Call Minimization View */
                       <div className="mini-audio-container">
                           <div className="mini-audio-header">
                               <div className="mini-audio-avatars">
                                   <img 
                                       src={getAvatar2D(callData.partner.avatar_url, callData.partner.username)} 
                                       className="mini-avatar-ring partner"
                                       onError={(e) => handleAvatarError(e, callData.partner.username)}
                                       alt="Partner"
                                   />
                                   <img 
                                       src={getAvatar2D(currentUser.avatar_url, currentUser.username)} 
                                       className="mini-avatar-ring self"
                                       onError={(e) => handleAvatarError(e, currentUser.username)}
                                       alt="Me"
                                   />
                               </div>
                               <div className="mini-info">
                                   <span className="mini-name">{callData.partner.username}</span>
                                   <span className="mini-status">{status}</span>
                                   <span className="mini-timer">{formatDuration(callDuration)}</span>
                               </div>
                           </div>

                           {/* Audio Status Indicators */}
                           <div className="mini-indicators">
                               {muted ? (
                                   <span className="mini-indicator red" title="Muted">
                                       <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2"></path></svg>
                                   </span>
                               ) : (
                                   <span className="mini-indicator green" title="Microphone Active">
                                       <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path></svg>
                                   </span>
                               )}
                               {speakerOff ? (
                                   <span className="mini-indicator red" title="Speaker Muted">
                                       <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M11 5L6 9H2v6h4l5 4V5z"></path></svg>
                                   </span>
                               ) : (
                                   <span className="mini-indicator green" title="Speaker Active">
                                       <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                                   </span>
                               )}
                           </div>
                       </div>
                   )}
                </div>

                {/* Floating Quick Controls Overlay */}
                {showOverlay && (
                    <div className="mini-controls-overlay">
                        {/* Size toggle */}
                        <button className="mini-ctrl-btn size" onClick={(e) => { e.stopPropagation(); setSizeMode(prev => prev === 'small' ? 'medium' : 'small'); }} title="Toggle Size">
                            {sizeMode === 'small' ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
                            ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
                            )}
                        </button>

                        {/* Mute mic */}
                        <button className={`mini-ctrl-btn ${muted ? 'muted' : ''}`} onClick={(e) => { e.stopPropagation(); toggleMute(); }} title={muted ? 'Unmute microphone' : 'Mute microphone'}>
                            {muted ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2"></path></svg>
                            ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path></svg>
                            )}
                        </button>

                        {/* Toggle camera if video call */}
                        {isVideoCall && (
                            <button className={`mini-ctrl-btn ${cameraOff ? 'camera-off' : ''}`} onClick={(e) => { e.stopPropagation(); toggleCamera(); }} title={cameraOff ? 'Turn camera on' : 'Turn camera off'}>
                                {cameraOff ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M21 21l-3.5-3.5m-2-2l-4.25-4.25-2.25-2.25-4-4"></path><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                                ) : (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                                )}
                            </button>
                        )}

                        {/* Switch camera if video call */}
                        {isVideoCall && cameras.length > 1 && !cameraOff && (
                            <button className="mini-ctrl-btn" onClick={(e) => { e.stopPropagation(); switchCamera(); }} title="Switch camera">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z"></path><circle cx="13" cy="12" r="3"></circle></svg>
                            </button>
                        )}

                        {/* Speaker mute */}
                        <button className={`mini-ctrl-btn ${speakerOff ? 'speaker-off' : ''}`} onClick={(e) => { e.stopPropagation(); toggleSpeaker(); }} title={speakerOff ? 'Speaker active' : 'Speaker muted'}>
                            {speakerOff ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M11 5L6 9H2v6h4l5 4V5z"></path></svg>
                            ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                            )}
                        </button>

                        {/* Maximize */}
                        <button className="mini-ctrl-btn maximize" onClick={(e) => { e.stopPropagation(); onMaximize(); }} title="Maximize to full screen">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
                        </button>

                        {/* Hang up */}
                        <button className="mini-ctrl-btn hangup" onClick={(e) => { e.stopPropagation(); endCall(); }} title="End call">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path></svg>
                        </button>
                    </div>
                )}

                <style>{`
                    .floating-call-widget {
                        position: fixed;
                        z-index: 13000;
                        background: rgba(20, 20, 22, 0.9);
                        backdrop-filter: blur(24px) saturate(180%);
                        -webkit-backdrop-filter: blur(24px) saturate(180%);
                        border-radius: 20px;
                        padding: 8px;
                        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.08);
                        cursor: grab;
                        transition: transform 0.15s cubic-bezier(0.25, 0.8, 0.25, 1);
                        overflow: hidden;
                        display: flex;
                        flex-direction: column;
                        box-sizing: border-box;
                    }
                    .floating-call-widget.dragging {
                        cursor: grabbing;
                        transform: scale(0.98);
                        transition: none !important;
                    }
                    .floating-call-widget:not(.dragging) {
                        transition: top 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), left 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), transform 0.15s ease, width 0.3s ease, height 0.3s ease !important;
                    }

                    /* size mode small dimensions */
                    .floating-call-widget.call-type-audio.size-small { width: 180px; height: 80px; }
                    .floating-call-widget.call-type-audio.size-medium { width: 260px; height: 105px; }

                    .floating-call-widget.call-type-video.size-small { width: 160px; height: 240px; }
                    .floating-call-widget.call-type-video.size-medium { width: 240px; height: 360px; }

                    .widget-content {
                        width: 100%; height: 100%;
                        display: flex;
                        position: relative;
                        box-sizing: border-box;
                    }

                    /* Video Layout minimized */
                    .mini-video-wrapper {
                        width: 100%; height: 100%;
                        position: relative;
                        border-radius: 12px;
                        overflow: hidden;
                        background: #121214;
                    }

                    .mini-video-track {
                        width: 100%; height: 100%;
                    }
                    .mini-video-track video {
                        object-fit: cover !important;
                    }

                    .mini-avatar-fallback {
                        width: 100%; height: 100%;
                        display: flex; align-items: center; justify-content: center;
                        background: radial-gradient(circle, #2c2c2e 0%, #121214 100%);
                    }

                    .mini-avatar-img {
                        width: 44px; height: 44px; border-radius: 50%; object-fit: cover;
                        border: 2px solid rgba(255,255,255,0.15);
                        background: #2c2c2e;
                    }

                    /* Picture-in-picture local view */
                    .mini-video-local-pip {
                        position: absolute;
                        top: 8px; right: 8px;
                        width: 25%; height: 25%;
                        min-width: 36px; min-height: 54px;
                        background: #1a1a1c;
                        border-radius: 8px;
                        overflow: hidden;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1);
                        z-index: 5;
                        display: flex; align-items: center; justify-content: center;
                    }
                    .mini-video-local-pip img {
                        width: 100%; height: 100%; object-fit: cover;
                    }

                    .mini-video-info {
                        position: absolute;
                        bottom: 0; left: 0; right: 0;
                        background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%);
                        padding: 8px 6px;
                        display: flex; justify-content: space-between; align-items: center;
                        color: white; font-size: 10px; font-weight: 500;
                        z-index: 4;
                    }

                    /* Audio container minimized */
                    .mini-audio-container {
                        width: 100%; height: 100%;
                        display: flex;
                        flex-direction: column;
                        justify-content: space-between;
                        padding: 4px;
                    }

                    .mini-audio-header {
                        display: flex; align-items: center; gap: 8px;
                    }

                    .mini-audio-avatars {
                        position: relative; width: 44px; height: 44px; flex-shrink: 0;
                    }

                    .mini-avatar-ring {
                        width: 32px; height: 32px; border-radius: 50%; object-fit: cover;
                        border: 1.5px solid rgba(255,255,255,0.2);
                        background: #2c2c2e;
                        position: absolute;
                    }
                    .mini-avatar-ring.partner { top: 0; left: 0; z-index: 2; }
                    .mini-avatar-ring.self { bottom: 0; right: 0; z-index: 1; border-color: rgba(52, 199, 89, 0.4); }

                    .mini-info {
                        display: flex; flex-direction: column; min-width: 0;
                    }
                    .mini-name {
                        color: white; font-size: 12px; font-weight: 600;
                        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                    }
                    .mini-status {
                        color: rgba(255,255,255,0.4); font-size: 9px; font-weight: 500;
                        text-transform: uppercase; letter-spacing: 0.3px;
                    }
                    .mini-timer {
                        color: #34c759; font-size: 11px; font-weight: 600;
                        font-variant-numeric: tabular-nums;
                    }

                    .mini-indicators {
                        display: flex; gap: 6px; margin-top: 4px;
                        padding-left: 2px;
                    }
                    .mini-indicator {
                        display: flex; align-items: center; justify-content: center;
                        width: 18px; height: 18px; border-radius: 50%;
                        background: rgba(255,255,255,0.06);
                    }
                    .mini-indicator.red { color: #ff3b30; background: rgba(255, 59, 48, 0.15); }
                    .mini-indicator.green { color: #34c759; background: rgba(52, 199, 89, 0.15); }

                    /* Quick Controls Overlay */
                    .mini-controls-overlay {
                        position: absolute; inset: 0;
                        background: rgba(0, 0, 0, 0.75);
                        z-index: 10;
                        display: flex;
                        flex-wrap: wrap;
                        align-content: center;
                        justify-content: center;
                        gap: 8px;
                        padding: 10px;
                        box-sizing: border-box;
                        animation: fadeInMini 0.2s ease-in-out;
                    }
                    @keyframes fadeInMini { from { opacity: 0; } to { opacity: 1; } }

                    .mini-ctrl-btn {
                        width: 28px; height: 28px; border-radius: 50%; border: none;
                        display: flex; align-items: center; justify-content: center;
                        background: rgba(255,255,255,0.15);
                        color: white; cursor: pointer; transition: all 0.2s;
                    }
                    .mini-ctrl-btn:hover { background: rgba(255,255,255,0.3); transform: scale(1.08); }
                    .mini-ctrl-btn:active { transform: scale(0.95); }

                    .mini-ctrl-btn.muted, .mini-ctrl-btn.camera-off, .mini-ctrl-btn.speaker-off {
                        background: white; color: #1c1c1e;
                    }

                    .mini-ctrl-btn.hangup {
                        background: #ff3b30; color: white;
                    }
                    .mini-ctrl-btn.hangup:hover { background: #ff453a; }
                    .mini-ctrl-btn.size { background: #0084ff; }

                    /* Medium Audio adaptations */
                    .size-medium .mini-avatar-ring { width: 38px; height: 38px; }
                    .size-medium .mini-audio-avatars { width: 54px; height: 54px; }
                    .size-medium .mini-name { font-size: 14px; }
                    .size-medium .mini-status { font-size: 10px; }
                    .size-medium .mini-timer { font-size: 12px; }
                    .size-medium .mini-indicators { gap: 8px; margin-top: 8px; }
                    .size-medium .mini-indicator { width: 22px; height: 22px; }
                    .size-medium .mini-controls-overlay { gap: 10px; }
                    .size-medium .mini-ctrl-btn { width: 32px; height: 32px; }
                `}</style>
            </div>
        );
    }
    // --- End Floating Window ---

    return (
        <div className="call-interface-overlay">
            <span className="status-pill">
                <div className={`status-dot ${status !== 'Connected' ? 'connecting' : ''}`}></div>
                {status === 'Connected' ? formatDuration(callDuration) : status}
            </span>

            {/* Main Content Area */}
            {isVideoCall ? (
                <>
                    {/* Remote Video/Avatar */}
                    {hasRemoteVideo ? (
                        <div className="remote-video-wrapper">
                            <div ref={remoteVideoRef} className="remote-video-container"></div>
                            {/* Overlay for Remote User Identity in Video */}
                            <div className="video-identity-overlay">
                                <img 
                                    src={getAvatar2D(callData.partner.avatar_url, callData.partner.username)} 
                                    className="small-avatar"
                                    onError={(e) => handleAvatarError(e, callData.partner.username)}
                                    alt=""
                                />
                                <span>{callData.partner.username}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="remote-avatar-container" style={{ '--bg-image': `url(${getAvatar2D(callData.partner.avatar_url, callData.partner.username)})` }}>
                            <img 
                                src={getAvatar2D(callData.partner.avatar_url, callData.partner.username)} 
                                className="remote-avatar" 
                                alt="Remote User"
                                onError={(e) => handleAvatarError(e, callData.partner.username)}
                            />
                            <h2>{callData.partner.username}</h2>
                            <div className="call-status-text">
                                {status === 'Connected' ? 'Camera Off' : status}
                            </div>
                        </div>
                    )}

                    {/* Local User View (PIP) */}
                    <div className="local-video">
                        {!cameraOff ? (
                            <div ref={localVideoRef} style={{ width: '100%', height: '100%' }}></div>
                        ) : (
                            <img 
                                src={getAvatar2D(currentUser.avatar_url, currentUser.username)}
                                alt="Me"
                                className="local-avatar-img"
                                onError={(e) => handleAvatarError(e, currentUser.username)}
                            />
                        )}
                    </div>
                </>
            ) : (
                /* Audio Call Layout - Dual Avatars */
                <div className="audio-dual-layout">
                    {/* Partner Avatar */}
                    <div className="audio-avatar-wrapper pulse">
                        <img 
                            src={getAvatar2D(callData.partner.avatar_url, callData.partner.username)} 
                            alt={callData.partner.username}
                            className="audio-avatar"
                            onError={(e) => handleAvatarError(e, callData.partner.username)}
                        />
                        <span className="audio-name">{callData.partner.username}</span>
                    </div>

                    {/* Local Avatar */}
                    <div className="audio-avatar-wrapper">
                         <img 
                            src={getAvatar2D(currentUser.avatar_url, currentUser.username)} 
                            alt="Me"
                            className="audio-avatar local"
                            onError={(e) => handleAvatarError(e, currentUser.username)}
                        />
                        <span className="audio-name">Me</span>
                    </div>
                </div>
            )}

            {/* Call Controls with SVG Icons */}
            <div className="call-controls">
                <button 
                    className={`ctrl-btn ${muted ? 'muted' : ''}`} 
                    onClick={toggleMute}
                    title={muted ? 'Unmute' : 'Mute'}
                >
                    {muted ? (
                         <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                    ) : (
                         <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                    )}
                </button>

                <button className="ctrl-btn hangup" onClick={() => endCall()} title="Hang Up">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(135deg)' }}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                </button>

                {isVideoCall && (
                    <button 
                        className={`ctrl-btn ${cameraOff ? 'camera-off' : ''}`} 
                        onClick={toggleCamera}
                        title={cameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
                    >
                        {cameraOff ? (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M21 21l-3.5-3.5m-2-2l-4.25-4.25-2.25-2.25-4-4L1 1"></path><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                        ) : (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                        )}
                    </button>
                )}

                {isVideoCall && cameras.length > 1 && !cameraOff && (
                    <button 
                        className="ctrl-btn" 
                        onClick={switchCamera}
                        title="Switch Camera"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z"></path><path d="m19 8 5-3v10l-5-3"></path></svg>
                    </button>
                )}

                <button 
                    className="ctrl-btn minimize-btn" 
                    onClick={onMinimize}
                    title="Minimize"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="4 14 10 14 10 20"></polyline>
                        <polyline points="20 10 14 10 14 4"></polyline>
                        <line x1="14" y1="10" x2="21" y2="3"></line>
                        <line x1="3" y1="21" x2="10" y2="14"></line>
                    </svg>
                </button>
            </div>

            <style>{`
                /* Call Overlay Premium Design */
                .call-interface-overlay {
                    position: fixed; inset: 0; 
                    background: radial-gradient(circle at center, #18181b 0%, #09090b 100%);
                    z-index: 12000;
                    display: flex; flex-direction: column;
                    overflow: hidden;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                }
                
                @keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
                
                /* Video Layer */
                .remote-video-container {
                    width: 100%; height: 100%; position: absolute; inset: 0; z-index: 1;
                }
                .remote-video-container video {
                    width: 100%; height: 100%; object-fit: cover;
                }
                
                /* Remote Avatar (Audio Call / Connecting) */
                .remote-avatar-container {
                    position: absolute; inset: 0; z-index: 2;
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    background: radial-gradient(circle at center, #1c1c1e 0%, #000000 100%);
                }
                
                .remote-avatar-container::before {
                    content: '';
                    position: absolute; inset: -10%;
                    background-image: var(--bg-image);
                    background-size: cover;
                    background-position: center;
                    filter: blur(80px) brightness(0.4) saturate(140%);
                    opacity: 0.85;
                    z-index: -1;
                    transform: scale(1.15);
                    animation: slowPulseBg 15s ease-in-out infinite alternate;
                }

                @keyframes slowPulseBg {
                    0% { transform: scale(1.15) rotate(0deg); opacity: 0.8; }
                    50% { transform: scale(1.22) rotate(3deg); opacity: 0.9; }
                    100% { transform: scale(1.15) rotate(-3deg); opacity: 0.8; }
                }
 
                .remote-avatar {
                    width: 170px; height: 170px; border-radius: 50%;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.6);
                    object-fit: cover;
                    border: 3.5px solid rgba(255,255,255,0.18);
                    margin-bottom: 28px;
                    animation: premiumAvatarPulse 3s cubic-bezier(0.25, 0.8, 0.25, 1) infinite;
                    background: #18181b;
                    z-index: 5;
                }
                
                @keyframes premiumAvatarPulse {
                    0% {
                        box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.12),
                                    0 0 0 10px rgba(255, 255, 255, 0.08),
                                    0 20px 50px rgba(0,0,0,0.6);
                        transform: scale(1);
                    }
                    50% {
                        box-shadow: 0 0 0 15px rgba(255, 255, 255, 0.06),
                                    0 0 0 30px rgba(255, 255, 255, 0),
                                    0 24px 60px rgba(0,0,0,0.7);
                        transform: scale(1.02);
                    }
                    100% {
                        box-shadow: 0 0 0 0 rgba(255, 255, 255, 0),
                                    0 0 0 0 rgba(255, 255, 255, 0),
                                    0 20px 50px rgba(0,0,0,0.6);
                        transform: scale(1);
                    }
                }
 
                .remote-avatar-container h2 {
                    font-size: 26px; font-weight: 700; color: white;
                    letter-spacing: -0.03em; margin: 0;
                    text-shadow: 0 4px 16px rgba(0,0,0,0.5);
                }
                
                .call-status-text {
                    font-size: 13px; color: rgba(255,255,255,0.55);
                    margin-top: 10px; font-weight: 600;
                    letter-spacing: 2px; text-transform: uppercase;
                    animation: textPulse 1.8s infinite alternate;
                }

                @keyframes textPulse {
                    0% { opacity: 0.5; }
                    100% { opacity: 0.9; }
                }
                
                /* Local Video (PIP) */
                .local-video {
                    position: absolute; top: 60px; right: 24px;
                    width: 100px; height: 150px;
                    background: #09090b;
                    border-radius: 20px;
                    overflow: hidden;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.5), 0 0 0 1.5px rgba(255,255,255,0.08);
                    z-index: 110;
                    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s;
                    cursor: grab;
                }
                .local-video:hover { 
                    transform: scale(1.04) translateY(-2px);
                    box-shadow: 0 24px 50px rgba(0,0,0,0.6), 0 0 0 1.5px rgba(255,255,255,0.15);
                }
 
                .local-avatar-img {
                    width: 100%; height: 100%;
                    object-fit: cover;
                    background: #2c2c2e;
                }
                
                /* Status Indicator */
                .status-pill {
                    position: absolute; top: 60px; left: 24px;
                    background: rgba(20, 20, 25, 0.6);
                    backdrop-filter: blur(25px) saturate(180%);
                    -webkit-backdrop-filter: blur(25px) saturate(180%);
                    padding: 8px 16px; border-radius: 100px;
                    display: flex; align-items: center; gap: 8px;
                    color: white; font-weight: 600; font-size: 13px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                    border: 1px solid rgba(255,255,255,0.08);
                    z-index: 105;
                    letter-spacing: 0.2px;
                }
                
                .status-dot { 
                    width: 8px; height: 8px; background: #30d158; border-radius: 50%; 
                    box-shadow: 0 0 10px #30d158, 0 0 20px #30d158;
                    animation: greenGlowPulse 1.5s infinite alternate;
                }
                .status-dot.connecting { 
                    background: #ff9f0a; 
                    box-shadow: 0 0 10px #ff9f0a, 0 0 20px #ff9f0a; 
                    animation: orangeGlowPulse 1.5s infinite alternate;
                }

                @keyframes greenGlowPulse {
                    0% { transform: scale(0.9); opacity: 0.6; box-shadow: 0 0 4px #30d158; }
                    100% { transform: scale(1.1); opacity: 1; box-shadow: 0 0 12px #30d158; }
                }
                @keyframes orangeGlowPulse {
                    0% { transform: scale(0.9); opacity: 0.6; box-shadow: 0 0 4px #ff9f0a; }
                    100% { transform: scale(1.1); opacity: 1; box-shadow: 0 0 12px #ff9f0a; }
                }
 
                /* Controls Bar */
                .call-controls {
                    position: absolute; bottom: 48px; left: 50%;
                    transform: translateX(-50%);
                    display: flex; gap: 20px;
                    padding: 16px 36px;
                    background: rgba(20, 20, 25, 0.55);
                    backdrop-filter: blur(25px) saturate(190%);
                    -webkit-backdrop-filter: blur(25px) saturate(190%);
                    border-radius: 100px;
                    box-shadow: 0 24px 70px rgba(0,0,0,0.65), inset 0 1px 1px rgba(255,255,255,0.06);
                    border: 1px solid rgba(255,255,255,0.08);
                    z-index: 120;
                }
 
                .ctrl-btn {
                    width: 54px; height: 54px;
                    border-radius: 50%; border: none;
                    background: rgba(255,255,255,0.08);
                    color: #f4f4f5; cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                    border: 1px solid rgba(255,255,255,0.04);
                }
                
                .ctrl-btn:hover { 
                    background: rgba(255,255,255,0.15); 
                    transform: translateY(-2px); 
                    color: #ffffff;
                    border-color: rgba(255,255,255,0.1);
                }
                .ctrl-btn:active { transform: scale(0.95); }
                
                .ctrl-btn svg { width: 22px; height: 22px; stroke-width: 2.2px; }
 
                .ctrl-btn.muted, .ctrl-btn.camera-off { 
                    background: #ffffff; color: #09090b;
                    box-shadow: 0 0 15px rgba(255,255,255,0.3);
                    border-color: #ffffff;
                }
                .ctrl-btn.muted:hover, .ctrl-btn.camera-off:hover {
                    background: #f4f4f5;
                }
 
                .ctrl-btn.hangup {
                    background: #ff3b30; width: 64px; height: 64px; margin: 0 10px;
                    border-color: rgba(255,255,255,0.08);
                    box-shadow: 0 6px 20px rgba(255, 59, 48, 0.3);
                }
                .ctrl-btn.hangup:hover { 
                    background: #ff453a; 
                    box-shadow: 0 10px 30px rgba(255, 59, 48, 0.55); 
                    transform: translateY(-2px) scale(1.05); 
                }
                
                .ctrl-btn.minimize-btn {
                    background: rgba(255,255,255,0.08);
                }
                .ctrl-btn.minimize-btn:hover {
                    background: rgba(255,255,255,0.15);
                }
                
                /* Mobile optimization */
                @media (max-width: 480px) {
                    .call-controls { width: 92%; justify-content: space-evenly; padding: 12px; bottom: 32px; gap: 12px; }
                    .ctrl-btn { width: 48px; height: 48px; }
                    .ctrl-btn.hangup { width: 58px; height: 58px; }
                    .local-video { width: 85px; height: 128px; top: 20px; right: 20px; }
                    .status-pill { top: 20px; left: 20px; }
                    
                    .audio-dual-layout { flex-direction: column; gap: 40px; }
                    .audio-avatar { width: 120px; height: 120px; }
                }
 
                /* Audio Dual Layout */
                .audio-dual-layout {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 60px;
                    background: radial-gradient(circle at center, #1c1c1e 0%, #000000 100%);
                    position: relative;
                }
 
                .audio-avatar-wrapper {
                    display: flex; flex-direction: column; align-items: center; gap: 16px;
                    position: relative;
                }
 
                .audio-avatar {
                    width: 150px; height: 150px;
                    border-radius: 50%;
                    object-fit: cover;
                    border: 4px solid rgba(255, 255, 255, 0.1);
                    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                    z-index: 2;
                }
                
                .audio-avatar.local {
                    border-color: rgba(52, 199, 89, 0.3); /* Green Tint for self */
                }
 
                .audio-avatar-wrapper.pulse .audio-avatar {
                    animation: pulse-ring 3s infinite;
                }
 
                .audio-name {
                    font-size: 1.2rem; font-weight: 700; color: white;
                    text-shadow: 0 2px 10px rgba(0,0,0,0.5);
                }
 
                .audio-status {
                    position: absolute;
                    bottom: 25%;
                    color: rgba(255,255,255,0.5);
                    font-size: 0.9rem;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
 
                @keyframes pulse-ring {
                    0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.1); }
                    50% { box-shadow: 0 0 0 20px rgba(255, 255, 255, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
                }
            `}</style>
        </div>
    );
}
