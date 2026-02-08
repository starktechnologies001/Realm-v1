import React, { useState, useEffect, useRef } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { supabase } from '../supabaseClient';
import { getAvatar2D, handleAvatarError } from '../utils/avatarUtils';

export default function CallOverlay({ callData, currentUser, onEnd, isMinimized, toggleMinimize }) {
    const [status, setStatus] = useState('Connecting...');
    const [muted, setMuted] = useState(false);
    const [cameraOff, setCameraOff] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const [remoteUsers, setRemoteUsers] = useState([]);
    const [localTrackReady, setLocalTrackReady] = useState(false);
    
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const clientRef = useRef(null);
    const localAudioTrackRef = useRef(null);
    const localVideoTrackRef = useRef(null);
    const callStartTimeRef = useRef(null);
    const durationIntervalRef = useRef(null);
    const ringingTimeoutRef = useRef(null); // Timeout for outgoing calls

    const hasAnsweredRef = useRef(false);
    const hasEndedRef = useRef(false); // Prevent double-fire of onEnd
    const endCallRef = useRef(null); // Access endCall inside useEffect

    // Play Local Video Track when ready and camera is on
    useEffect(() => {
        if (localTrackReady && localVideoTrackRef.current && localVideoRef.current && !cameraOff) {
            localVideoTrackRef.current.play(localVideoRef.current);
        }
    }, [localTrackReady, cameraOff]);

    // Play Remote Video Track when available
    useEffect(() => {
        if (remoteUsers.length > 0 && remoteUsers[0].videoTrack && remoteVideoRef.current) {
            remoteUsers[0].videoTrack.play(remoteVideoRef.current);
        }
    }, [remoteUsers]);

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
                    hasAnsweredRef.current = true; // Mark as answered to prevent timeout start
                    // Clear timeout if it's already running
                    if (ringingTimeoutRef.current) clearTimeout(ringingTimeoutRef.current);
                    
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
                    setStatus('Calling...'); // Explicit feedback
                    
                    await supabase.from('calls').insert({
                        caller_id: currentUser.id,
                        receiver_id: callData.partner.id,
                        type: callData.type,
                        status: 'pending',
                        channel_name: channelName
                    });
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
                                    await endCall(); // This uses the current callDuration (0) -> 'missed'
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

    // Effect to play Local Video when ready
    useEffect(() => {
        if (localTrackReady && localVideoRef.current && localVideoTrackRef.current) {
            localVideoTrackRef.current.play(localVideoRef.current);
        }
    }, [localTrackReady, cameraOff]);

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
    }, [remoteUsers]);

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

    const endCall = async () => {
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
        const isMissed = !callData.isIncoming && finalDuration === 0;
        const finalStatus = isMissed ? 'missed' : 'ended';

        // Update DB to end call
        const sortedIds = [currentUser.id, callData.partner.id].sort();
        const channelName = `call_${sortedIds[0].slice(0, 15)}_${sortedIds[1].slice(0, 15)}`;
        
        await supabase.from('calls')
            .update({ 
                status: finalStatus,
                ended_at: new Date().toISOString(),
                duration_seconds: finalDuration
            })
            .eq('channel_name', channelName);
        
        if (!hasEndedRef.current) {
            hasEndedRef.current = true;
            onEnd(finalDuration, finalStatus);
        }
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

    return (
        <div className={`call-interface-overlay ${isMinimized ? 'minimized' : ''}`}>
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
                    
                    <div className="audio-status">{status}</div>
                </div>
            )}

            {/* Minimized View (PiP) Handling */}
            <div className={`call-controls ${isMinimized ? 'minimized-controls' : ''}`}>
                {!isMinimized && (
                    <button 
                        className={`ctrl-btn ${muted ? 'muted' : ''}`} 
                        onClick={toggleMute}
                        title={muted ? 'Unmute' : 'Mute'}
                    >
                        {muted ? (
                             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                        ) : (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                        )}
                    </button>
                )}

                <button className={`ctrl-btn hangup ${isMinimized ? 'small' : ''}`} onClick={endCall} title="Hang Up">
                    <svg width={isMinimized ? 20 : 28} height={isMinimized ? 20 : 28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" y1="1" x2="1" y2="23"></line></svg>
                </button>

                {isMinimized ? (
                    <button className="ctrl-btn maximize" onClick={toggleMinimize} title="Maximize">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
                    </button>
                ) : (
                    isVideoCall && (
                        <button 
                            className={`ctrl-btn ${cameraOff ? 'camera-off' : ''}`} 
                            onClick={toggleCamera}
                            title={cameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
                        >
                            {cameraOff ? (
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M21 21l-3.5-3.5m-2-2l-4.25-4.25-2.25-2.25-4-4L1 1"></path><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                            ) : (
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                            )}
                        </button>
                    )
                )}
            </div>

            {/* Top Bar Controls (Maximize/Minimize) */}
            {!isMinimized && (
                <button 
                    className="minimize-btn" 
                    onClick={toggleMinimize}
                    title="Minimize Call"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
                </button>
            )}

            <style>{`
                /* Call Overlay Premium Design */
                .call-interface-overlay {
                    position: fixed; inset: 0; 
                    background: #000;
                    z-index: 12000;
                    display: flex; flex-direction: column;
                    overflow: hidden;
                    animation: fadeIn 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
                }
                
                @keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
                
                /* Minimize Button */
                .minimize-btn {
                    position: absolute; top: 60px; left: 24px;
                    width: 40px; height: 40px;
                    border-radius: 50%; border: none;
                    background: rgba(255,255,255,0.15);
                    backdrop-filter: blur(10px);
                    color: white; display: flex; align-items: center; justify-content: center;
                    cursor: pointer; z-index: 20;
                    transition: all 0.2s;
                    border: 1px solid rgba(255,255,255,0.1);
                }
                .minimize-btn:hover { background: rgba(255,255,255,0.25); transform: scale(1.05); }

                /* Move status pill when not minimized */
                .call-interface-overlay:not(.minimized) .status-pill {
                    left: 76px; /* Shift right to make room for minimize btn */
                }

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
                    position: absolute; inset: 0;
                    background-image: var(--bg-image);
                    background-size: cover;
                    background-position: center;
                    filter: blur(60px) brightness(0.6);
                    opacity: 0.8;
                    z-index: -1;
                    transform: scale(1.2);
                }

                .remote-avatar {
                    width: 180px; height: 180px; border-radius: 50%;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.6);
                    object-fit: cover;
                    border: 4px solid rgba(255,255,255,0.2);
                    margin-bottom: 32px;
                    animation: pulse-avatar 3s ease-in-out infinite;
                    background: #2c2c2e;
                }
                
                @keyframes pulse-avatar {
                    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,255,255, 0.2); }
                    50% { transform: scale(1.03); box-shadow: 0 0 0 15px rgba(255,255,255, 0); }
                    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,255,255, 0); }
                }

                .remote-avatar-container h2 {
                    font-size: 32px; font-weight: 800; color: white;
                    letter-spacing: -0.5px; margin: 0;
                    text-shadow: 0 4px 12px rgba(0,0,0,0.4);
                }
                
                .call-status-text {
                    font-size: 16px; color: rgba(255,255,255,0.7);
                    margin-top: 8px; font-weight: 500;
                    letter-spacing: 0.5px; text-transform: uppercase;
                }
                
                /* Local Video (PIP) */
                .local-video {
                    position: absolute; top: 60px; right: 24px;
                    width: 120px; height: 180px;
                    background: #1a1a1a;
                    border-radius: 24px;
                    overflow: hidden;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1);
                    z-index: 10;
                    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
                    cursor: grab;
                }
                .local-video:hover { transform: scale(1.05); }

                .local-avatar-img {
                    width: 100%; height: 100%;
                    object-fit: cover;
                    background: #2c2c2e;
                }
                
                /* Status Indicator */
                .status-pill {
                    position: absolute; top: 60px; left: 24px;
                    background: rgba(255, 255, 255, 0.15);
                    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
                    padding: 8px 16px; border-radius: 30px;
                    display: flex; align-items: center; gap: 8px;
                    color: white; font-weight: 600; font-size: 14px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                    border: 1px solid rgba(255,255,255,0.1);
                    z-index: 5;
                    transition: all 0.3s ease;
                }
                
                .status-dot { width: 8px; height: 8px; background: #34c759; border-radius: 50%; box-shadow: 0 0 8px #34c759; }
                .status-dot.connecting { background: #ff9f0a; box-shadow: 0 0 8px #ff9f0a; }

                /* Controls Bar */
                .call-controls {
                    position: absolute; bottom: 50px; left: 50%;
                    transform: translateX(-50%);
                    display: flex; gap: 24px;
                    padding: 18px 40px;
                    background: rgba(20, 20, 20, 0.75);
                    backdrop-filter: blur(24px) saturate(180%);
                    -webkit-backdrop-filter: blur(24px) saturate(180%);
                    border-radius: 60px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.6);
                    border: 1px solid rgba(255,255,255,0.12);
                    z-index: 20;
                }

                .ctrl-btn {
                    width: 60px; height: 60px;
                    border-radius: 50%; border: none;
                    background: rgba(255,255,255,0.1);
                    color: white; cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                .ctrl-btn:hover { background: rgba(255,255,255,0.2); transform: scale(1.1); }
                .ctrl-btn:active { transform: scale(0.95); }
                
                .ctrl-btn svg { width: 28px; height: 28px; stroke-width: 2px; }

                .ctrl-btn.muted, .ctrl-btn.camera-off { 
                    background: white; color: #1c1c1e;
                    box-shadow: 0 0 20px rgba(255,255,255,0.4);
                }

                .ctrl-btn.hangup {
                    background: #ff3b30; width: 72px; height: 72px; margin: 0 12px;
                }
                .ctrl-btn.hangup:hover { background: #ff453a; box-shadow: 0 8px 30px rgba(255, 59, 48, 0.5); transform: scale(1.1); }
                
                /* Mobile optimization */
                @media (max-width: 480px) {
                    .call-controls { width: 90%; justify-content: space-evenly; padding: 16px; bottom: 40px; }
                    .ctrl-btn { width: 52px; height: 52px; }
                    .ctrl-btn.hangup { width: 64px; height: 64px; }
                    .local-video { width: 90px; height: 135px; top: 20px; right: 20px; }
                    .status-pill { top: 20px; left: 20px; }
                    
                    /* Minimize btn support on mobile */
                    .minimize-btn { top: 20px; left: 20px; }
                    .call-interface-overlay:not(.minimized) .status-pill { left: 72px; }
                    
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

                /* --- Minimized (PiP) Styles --- */
                .call-interface-overlay.minimized {
                    position: fixed;
                    inset: auto;
                    bottom: 90px; /* Above bottom nav */
                    right: 16px;
                    width: 140px;
                    height: 200px;
                    border-radius: 16px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                    border: 1px solid rgba(255,255,255,0.15);
                    z-index: 12000;
                    background: #1c1c1e;
                    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                }

                .call-interface-overlay.minimized .remote-video-container video {
                    object-fit: cover;
                }
                
                .call-interface-overlay.minimized .local-video {
                    display: none;
                }
                
                .call-interface-overlay.minimized .audio-dual-layout {
                    flex-direction: column;
                    gap: 6px;
                    transform: scale(0.5); 
                }
                .call-interface-overlay.minimized .audio-name,
                .call-interface-overlay.minimized .audio-status {
                    display: none;
                }

                .call-interface-overlay.minimized .status-pill {
                    top: 6px; left: 6px;
                    padding: 2px 6px;
                    font-size: 9px;
                    background: rgba(0,0,0,0.6);
                    border-width: 0.5px;
                }
                .call-interface-overlay.minimized .status-dot { width: 5px; height: 5px; }

                /* Minimized Controls - SMALLER */
                .call-controls.minimized-controls {
                    width: 100%;
                    bottom: 0;
                    left: 0;
                    transform: none;
                    background: linear-gradient(to top, rgba(0,0,0,0.8), transparent);
                    border: none;
                    border-radius: 0 0 16px 16px;
                    justify-content: center;
                    gap: 16px; /* Reduced gap */
                    padding: 8px 0;
                    backdrop-filter: none;
                    box-shadow: none;
                }

                .call-interface-overlay.minimized .minimize-btn {
                    display: none; /* Hide top-left minimize btn in PiP */
                }

                /* Small maximize button */
                .ctrl-btn.maximize {
                    background: rgba(255,255,255,0.2);
                    width: 32px; height: 32px; /* Smaller */
                }
                .ctrl-btn.maximize svg { width: 16px; height: 16px; }

                /* Small hangup btn */
                .call-interface-overlay.minimized .ctrl-btn.hangup {
                    width: 32px; height: 32px; margin: 0;
                }
                .call-interface-overlay.minimized .ctrl-btn.hangup svg { width: 16px; height: 16px; }
            `}</style>
        </div>
    );
}
