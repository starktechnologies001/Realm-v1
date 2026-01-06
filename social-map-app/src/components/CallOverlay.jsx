import React, { useState, useEffect, useRef } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { supabase } from '../supabaseClient';

export default function CallOverlay({ callData, currentUser, onEnd }) {
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

    useEffect(() => {
        let mounted = true;
        const APP_ID = import.meta.env.VITE_AGORA_APP_ID;

        if (!APP_ID) {
            setStatus('⚠️ Agora App ID not configured');
            console.error('Please add VITE_AGORA_APP_ID to your .env file');
            return;
        }

        const initializeCall = async () => {
            try {
                // Create Agora client
                const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
                clientRef.current = client;

                // Handle remote user events
                client.on('user-published', async (user, mediaType) => {
                    await client.subscribe(user, mediaType);
                    console.log('Subscribed to remote user:', user.uid, mediaType);

                    if (mediaType === 'video') {
                        setRemoteUsers(prev => {
                            // Remove existing instance of this user (if they only had audio before)
                            const others = prev.filter(u => u.uid !== user.uid);
                            // Add the updated user object (now with videoTrack)
                            return [...others, user];
                        });
                    }

                    if (mediaType === 'audio' && user.audioTrack) {
                        user.audioTrack.play();
                    }
                });

                client.on('user-unpublished', (user, mediaType) => {
                    console.log('User unpublished:', user.uid, mediaType);
                    // Do NOT remove user from remoteUsers, just trigger re-render so UI updates
                    if (mediaType === 'video') {
                         setRemoteUsers(prev => prev.map(u => u.uid === user.uid ? user : u));
                    }
                });

                client.on('user-left', (user) => {
                    console.log('User left:', user.uid);
                    setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
                });

                // Generate channel name from call participants
                const sortedIds = [currentUser.id, callData.partner.id].sort();
                const channelName = `call_${sortedIds[0].slice(0, 15)}_${sortedIds[1].slice(0, 15)}`;

                // If we are the caller, create/update call record with channel name
                if (!callData.isIncoming) {
                    setStatus('Calling...');

                    await supabase.from('calls').insert({
                        caller_id: currentUser.id,
                        receiver_id: callData.partner.id,
                        type: callData.type,
                        status: 'pending',
                        channel_name: channelName
                    });
                }

                // Create local tracks
                const isVideoCall = callData.type === 'video';
                
                if (isVideoCall) {
                    localVideoTrackRef.current = await AgoraRTC.createCameraVideoTrack();
                    setLocalTrackReady(true);
                }
                
                localAudioTrackRef.current = await AgoraRTC.createMicrophoneAudioTrack();

                // Helper to Join Channel with Retry Logic for UID_CONFLICT
                const joinWithRetry = async (retries = 3, useSuffix = false) => {
                    try {
                        let joinUid = currentUser.id;
                        if (useSuffix) {
                            // If conflict persists, append random suffix to bypass ghost session
                            joinUid = `${currentUser.id}-${Math.floor(Math.random() * 10000)}`;
                            console.warn('Switching to randomized UID:', joinUid);
                        }
                        
                        const uid = await client.join(APP_ID, channelName, null, joinUid);
                        console.log('Joined channel:', channelName, 'with UID:', uid);
                        return uid;
                    } catch (err) {
                        if (err.code === 'UID_CONFLICT') {
                            if (retries > 0) {
                                console.warn(`UID Conflict. Retrying... (${retries} attempts left)`);
                                setStatus(`Connection conflict... Retrying (${retries})`);
                                await new Promise(resolve => setTimeout(resolve, 1500)); // Wait 1.5s
                                return joinWithRetry(retries - 1, false);
                            } else if (!useSuffix) {
                                // If standard retries failed, force suffix strategy
                                setStatus('Resolving session...');
                                return joinWithRetry(0, true); 
                            }
                        }
                        throw err;
                    }
                };

                // Join channel
                await joinWithRetry();

                // Publish local tracks
                const tracksToPublish = [localAudioTrackRef.current];
                if (isVideoCall && localVideoTrackRef.current) {
                    tracksToPublish.push(localVideoTrackRef.current);
                }
                
                await client.publish(tracksToPublish);
                console.log('Published local tracks');

                if (mounted) {
                    setStatus('Connected');
                    callStartTimeRef.current = Date.now();
                    
                    // Start duration timer
                    durationIntervalRef.current = setInterval(() => {
                        if (callStartTimeRef.current) {
                            const elapsed = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
                            setCallDuration(elapsed);
                        }
                    }, 1000);
                }

                // Listen for call status changes
                const channel = supabase.channel('current_call')
                    .on('postgres_changes', { 
                        event: 'UPDATE', 
                        schema: 'public', 
                        table: 'calls',
                        filter: `channel_name=eq.${channelName}`
                    }, (payload) => {
                        if (payload.new.status === 'ended' || payload.new.status === 'rejected') {
                            cleanup();
                            onEnd();
                        }
                        if (payload.new.status === 'active' && mounted) {
                            setStatus('Connected');
                            if (!callStartTimeRef.current) {
                                callStartTimeRef.current = Date.now();
                            }
                        }
                        if (payload.new.status === 'ringing' && mounted) {
                            setStatus('Ringing...');
                        }
                    })
                    .subscribe();

                return () => {
                    supabase.removeChannel(channel);
                };

            } catch (error) {
                console.error('Call initialization error:', error);
                
                // Detailed Error Handling
                if (error.code === 'PERMISSION_DENIED' || error.name === 'NotAllowedError') {
                    setStatus('⚠️ Camera/Mic access denied. Please allow perms.');
                    // Optional: You could show a more prominent actionable button here
                } else if (error.code === 'UID_CONFLICT') {
                    setStatus('Connection stuck. Please refresh the page.');
                } else {
                    setStatus(`Failed: ${error.message || JSON.stringify(error)}`);
                }
            }
        };

        const cleanup = async () => {
            mounted = false;
            
            // Stop duration timer
            if (durationIntervalRef.current) {
                clearInterval(durationIntervalRef.current);
            }

            // Close local tracks
            if (localAudioTrackRef.current) {
                localAudioTrackRef.current.close();
            }
            if (localVideoTrackRef.current) {
                localVideoTrackRef.current.close();
            }

            // Leave channel
            if (clientRef.current) {
                await clientRef.current.leave();
                console.log('Left channel');
            }
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

        // Update DB to end call
        const sortedIds = [currentUser.id, callData.partner.id].sort();
        const channelName = `call_${sortedIds[0].slice(0, 15)}_${sortedIds[1].slice(0, 15)}`;
        await supabase.from('calls')
            .update({ status: 'ended' })
            .eq('channel_name', channelName);
        
        onEnd();
    };

    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const isVideoCall = callData.type === 'video';
    // Check if remote user has active video track
    const hasRemoteVideo = remoteUsers.length > 0 && remoteUsers[0].videoTrack;

    return (
        <div className="call-interface-overlay">
            <span className="status-pill">
                <div className={`status-dot ${status !== 'Connected' ? 'connecting' : ''}`}></div>
                {status === 'Connected' ? formatDuration(callDuration) : status}
            </span>

            {/* Remote Video/Avatar */}
            {isVideoCall && hasRemoteVideo ? (
                <div ref={remoteVideoRef} className="remote-video-container"></div>
            ) : (
                <div className="remote-avatar-container">
                    <img 
                        src={(() => {
                            const u = callData.partner;
                            if (u.avatar_url) return u.avatar_url;
                            const safeName = encodeURIComponent(u.username || u.full_name || 'User');
                            const g = u.gender?.toLowerCase();
                            if (g === 'male') return `https://avatar.iran.liara.run/public/boy?username=${safeName}`;
                            if (g === 'female') return `https://avatar.iran.liara.run/public/girl?username=${safeName}`;
                            return `https://avatar.iran.liara.run/public?username=${safeName}`;
                        })()}
                        className="remote-avatar" 
                        alt="Remote User" 
                    />
                    <h2 style={{ color: 'white', marginTop: '24px', fontSize: '1.5rem', fontWeight: '600', textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
                        {callData.partner.full_name || callData.partner.username}
                        {!hasRemoteVideo && status === 'Connected' && <span style={{display:'block', fontSize:'0.9rem', opacity: 0.7, marginTop:'8px'}}>Camera Off</span>}
                    </h2>
                </div>
            )}

            {/* Local Video - Only show if camera is ON */}
            {isVideoCall && !cameraOff && (
                <div ref={localVideoRef} className="local-video"></div>
            )}

            {/* Call Controls with SVG Icons */}
            <div className="call-controls">
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

                <button className="ctrl-btn hangup" onClick={endCall} title="Hang Up">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path><line x1="23" y1="1" x2="1" y2="23"></line></svg>
                </button>

                {isVideoCall && (
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
                )}
            </div>

            <style>{`
                /* CALL OVERLAY REDESIGN */
                .call-interface-overlay {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: radial-gradient(circle at center, #1a1a2e 0%, #000 90%);
                    z-index: 12000;
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    animation: fadeIn 0.5s ease-out;
                }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                
                .remote-video-container {
                    width: 100%; height: 100%; position: absolute; top: 0; left: 0; z-index: 1;
                }
                .remote-video-container video {
                    width: 100%; height: 100%; object-fit: cover;
                }
                
                .remote-avatar-container {
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    width: 100%; height: 100%; z-index: 2;
                    background: radial-gradient(circle, rgba(30,30,40,0.5) 0%, rgba(0,0,0,0.8) 100%);
                }
                .remote-avatar {
                    width: 180px; height: 180px; border-radius: 50%;
                    border: 4px solid rgba(255,255,255,0.1);
                    box-shadow: 0 0 30px rgba(0, 240, 255, 0.2);
                    object-fit: cover; padding: 4px;
                    animation: pulseAvatar 3s infinite ease-in-out;
                }
                @keyframes pulseAvatar {
                    0% { box-shadow: 0 0 0 0 rgba(0, 240, 255, 0.2); }
                    50% { box-shadow: 0 0 0 20px rgba(0, 240, 255, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(0, 240, 255, 0); }
                }

                .local-video {
                    position: absolute; top: 24px; right: 24px;
                    width: 140px; height: 200px; 
                    background: #1e1e1e;
                    border-radius: 18px; 
                    border: 1px solid rgba(255,255,255,0.15);
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                    z-index: 10; overflow: hidden;
                    transition: all 0.3s ease;
                }
                .local-video:hover { transform: scale(1.05); border-color: rgba(255,255,255,0.3); }
                .local-video video { width: 100%; height: 100%; object-fit: cover; }
                
                /* Glass Control Bar */
                .call-controls {
                    position: absolute; bottom: 40px; 
                    left: 50%; transform: translateX(-50%);
                    display: flex; gap: 20px; z-index: 20;
                    padding: 16px 32px;
                    background: rgba(20, 20, 20, 0.6);
                    backdrop-filter: blur(20px) saturate(180%);
                    -webkit-backdrop-filter: blur(20px) saturate(180%);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 100px;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.4);
                }
                
                .ctrl-btn {
                    width: 56px; height: 56px; border-radius: 50%;
                    border: none; background: rgba(255,255,255,0.1);
                    color: white; cursor: pointer; 
                    display: flex; align-items: center; justify-content: center;
                    transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                }
                .ctrl-btn:hover { background: rgba(255,255,255,0.2); transform: translateY(-4px); }
                .ctrl-btn:active { transform: translateY(0); }
                
                .ctrl-btn.muted, .ctrl-btn.camera-off { 
                    background: white; color: black;
                }
                
                .ctrl-btn.hangup { 
                    background: #FF453A; color: white; margin-left: 20px; 
                    width: 64px; height: 64px; /* Slightly larger */
                }
                .ctrl-btn.hangup:hover { background: #FF3B30; box-shadow: 0 8px 20px rgba(255, 69, 58, 0.4); }

                .status-pill {
                    position: absolute; top: 40px; left: 24px; /* Moving to top left like FaceTime */
                    background: rgba(0,0,0,0.4); backdrop-filter: blur(15px);
                    color: rgba(255,255,255,0.9); 
                    padding: 8px 16px; border-radius: 12px; 
                    font-size: 0.9rem; font-weight: 500; letter-spacing: 0.5px;
                    z-index: 5; border: 1px solid rgba(255,255,255,0.05);
                    display: flex; align-items: center; gap: 8px;
                }
                .status-dot {
                    width: 8px; height: 8px; border-radius: 50%; background: #00ff00;
                    box-shadow: 0 0 10px #00ff00;
                }
                .status-dot.connecting { background: #ffaa00; box-shadow: 0 0 10px #ffaa00; }
            `}</style>
        </div>
    );
}
