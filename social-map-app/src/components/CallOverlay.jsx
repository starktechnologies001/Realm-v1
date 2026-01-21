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
                const isVideoCall = callData.type === 'video';

                // 1. IMMEDIATE: Initialize Local Tracks first for instant UI feedback
                if (isVideoCall) {
                    try {
                        localVideoTrackRef.current = await AgoraRTC.createCameraVideoTrack();
                        // Force a small delay to ensure track is ready for UI binding
                        await new Promise(r => setTimeout(r, 100)); 
                        setLocalTrackReady(true);
                        console.log('✅ Local video track ready');
                    } catch (trackErr) {
                        console.error('Failed to create camera track:', trackErr);
                        setStatus('⚠️ Camera Access Denied');
                        // Consider throwing here if video is critical, or fallback to audio
                    }
                }
                
                try {
                    localAudioTrackRef.current = await AgoraRTC.createMicrophoneAudioTrack();
                } catch (micErr) {
                    console.error('Failed to create mic track:', micErr);
                    setStatus('⚠️ Mic Access Denied');
                }

                // 2. Setup Agora Client
                const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
                clientRef.current = client;

                // Handle remote user events
                client.on('user-published', async (user, mediaType) => {
                    await client.subscribe(user, mediaType);
                    console.log('Subscribed to remote user:', user.uid, mediaType);

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
                });

                // 3. Setup Call Record & Signaling
                const sortedIds = [currentUser.id, callData.partner.id].sort();
                const channelName = `call_${sortedIds[0].slice(0, 15)}_${sortedIds[1].slice(0, 15)}`;

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

                // 4. Join Channel
                const joinWithRetry = async (retries = 3, useSuffix = false) => {
                    try {
                        let joinUid = currentUser.id;
                        if (useSuffix) {
                            joinUid = `${currentUser.id}-${Math.floor(Math.random() * 10000)}`;
                        }
                        return await client.join(APP_ID, channelName, null, joinUid);
                    } catch (err) {
                        if (err.code === 'UID_CONFLICT' && retries > 0) {
                            setStatus(`Connection conflict... (${retries})`);
                            await new Promise(resolve => setTimeout(resolve, 1500));
                            return joinWithRetry(retries - 1, false);
                        } else if (err.code === 'UID_CONFLICT') {
                            setStatus('Resolving session...');
                            return joinWithRetry(0, true);
                        }
                        throw err;
                    }
                };

                await joinWithRetry();

                // 5. Publish Tracks
                const tracksToPublish = [];
                if (localAudioTrackRef.current) tracksToPublish.push(localAudioTrackRef.current);
                if (localVideoTrackRef.current) tracksToPublish.push(localVideoTrackRef.current);
                
                if (tracksToPublish.length > 0) {
                    await client.publish(tracksToPublish);
                    console.log('Published local tracks');
                }

                if (mounted) {
                    setStatus('Connected');
                    callStartTimeRef.current = Date.now();
                    
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
                        if (payload.new.status === 'ended' || payload.new.status === 'rejected' || payload.new.status === 'declined') {
                            cleanup();
                            onEnd(callDuration, payload.new.status);
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
        
        onEnd(callDuration, 'ended');
    };

    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const isVideoCall = callData.type === 'video';
    // Check if remote user has active video track
    const hasRemoteVideo = remoteUsers.length > 0 && remoteUsers[0].videoTrack;

    const getAvatarUrl = (u) => {
        if (!u) return '';
        if (u.avatar_url) return u.avatar_url;
        const safeName = encodeURIComponent(u.username || u.full_name || 'User');
        const g = u.gender?.toLowerCase();
        if (g === 'male') return `https://avatar.iran.liara.run/public/boy?username=${safeName}`;
        if (g === 'female') return `https://avatar.iran.liara.run/public/girl?username=${safeName}`;
        return `https://avatar.iran.liara.run/public?username=${safeName}`;
    };

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
                        <div ref={remoteVideoRef} className="remote-video-container"></div>
                    ) : (
                        <div className="remote-avatar-container" style={{ '--bg-image': `url(${getAvatarUrl(callData.partner)})` }}>
                            <img 
                                src={getAvatarUrl(callData.partner)} 
                                className="remote-avatar" 
                                alt="Remote User"
                                onError={(e) => {
                                    const u = callData.partner;
                                    const safeName = encodeURIComponent(u.username || u.full_name || 'User');
                                    e.target.src = `https://avatar.iran.liara.run/public?username=${safeName}`;
                                }}
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
                                src={getAvatarUrl(currentUser)}
                                alt="Me"
                                className="local-avatar-img"
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
                            src={getAvatarUrl(callData.partner)} 
                            alt={callData.partner.username}
                            className="audio-avatar"
                        />
                        <span className="audio-name">{callData.partner.username}</span>
                    </div>

                    {/* Local Avatar */}
                    <div className="audio-avatar-wrapper">
                         <img 
                            src={getAvatarUrl(currentUser)} 
                            alt="Me"
                            className="audio-avatar local"
                        />
                        <span className="audio-name">Me</span>
                    </div>
                    
                    <div className="audio-status">{status}</div>
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
