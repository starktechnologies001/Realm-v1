import React, { useRef, memo, useEffect, useState } from 'react';
import { motion, useMotionValue, useTransform, useAnimation } from 'framer-motion';
import MessageStatusTick from './MessageStatusTick';
import { getOptimizedStorageUrl } from '../utils/avatarUtils';

const formatAudioTime = (secs) => {
    if (isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};

const VoicePlayBubble = ({ url, isMe, createdAt, deliveryStatus, formatTime }) => {
    const audioRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);

    const handlePlayPause = (e) => {
        e.stopPropagation();
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            if (!audioRef.current.src) {
                audioRef.current.src = url;
            }
            audioRef.current.play().catch(err => console.warn('Audio play error:', err));
        }
    };

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
        }
    };

    const handleLoadedMetadata = () => {
        if (audioRef.current) {
            setDuration(audioRef.current.duration);
        }
    };

    const handleSpeedToggle = (e) => {
        e.stopPropagation();
        if (!audioRef.current) return;
        let nextRate = 1;
        if (playbackRate === 1) nextRate = 1.5;
        else if (playbackRate === 1.5) nextRate = 2;
        else nextRate = 1;

        setPlaybackRate(nextRate);
        audioRef.current.playbackRate = nextRate;
    };

    const handleSeek = (e, seconds) => {
        e.stopPropagation();
        if (!audioRef.current) return;
        const newTime = Math.max(0, Math.min(duration || audioRef.current.duration || Infinity, audioRef.current.currentTime + seconds));
        audioRef.current.currentTime = newTime;
        setCurrentTime(newTime);
    };

    const handleEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0);
    };

    const WAVE_BARS = [5, 10, 16, 12, 8, 14, 20, 15, 10, 12, 18, 14, 9, 12, 16, 11, 7, 10, 14, 8];
    const progressPercent = duration ? (currentTime / duration) : 0;

    const handleWaveformClick = (e) => {
        e.stopPropagation();
        if (!audioRef.current || !duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, clickX / rect.width));
        audioRef.current.currentTime = percentage * duration;
        setCurrentTime(percentage * duration);
    };

    return (
        <div className={`voice-bubble-container ${isMe ? 'voice-bubble-sent' : 'voice-bubble-received'}`}>
            <audio
                ref={audioRef}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={handleEnded}
                preload="metadata"
            />
            <div className="voice-row">
                <button 
                    className="voice-play-btn" 
                    onClick={handlePlayPause}
                    style={{ background: isMe ? '#ffffff' : '#0084ff', color: isMe ? '#0084ff' : '#ffffff' }}
                >
                    {isPlaying ? '⏸' : '▶️'}
                </button>
                
                <div className="voice-waveform" onClick={handleWaveformClick}>
                    {WAVE_BARS.map((height, idx) => {
                        const barProgress = idx / WAVE_BARS.length;
                        const isActive = progressPercent >= barProgress;
                        return (
                            <div 
                                key={idx}
                                className={`voice-wave-bar ${isActive ? 'active' : ''}`}
                                style={{ height: `${height}px` }}
                            />
                        );
                    })}
                </div>
            </div>
            
            <div className="voice-controls-row">
                <span className="voice-duration">
                    {isPlaying ? `${formatAudioTime(currentTime)} / ` : ''}{formatAudioTime(duration || audioRef.current?.duration)}
                </span>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button className="voice-seek-btn" onClick={(e) => handleSeek(e, -10)}>⏪ 10s</button>
                    <button className="voice-seek-btn" onClick={(e) => handleSeek(e, 10)}>⏩ 10s</button>
                    <span className="voice-speed-badge" onClick={handleSpeedToggle}>
                        {playbackRate}x
                    </span>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px', marginTop: '2px', opacity: 0.85 }}>
                <span className="msg-time-inline" style={{ fontSize: '0.7em', margin: 0 }}>{formatTime(createdAt)}</span>
                <MessageStatusTick status={deliveryStatus} isSender={isMe} />
            </div>
        </div>
    );
};

const MessageBubble = ({ 
    msg, 
    deliveryStatus,
    userId, 
    partner, 
    isSelectionMode,
    isSelected,
    isHighlighted, 
    dateHeader, 
    onSwipeReply,
    onToggleSelection, 
    onViewImage,
    onScrollToMessage,
    onMessageLongPress,
    onReactionToggle,
    onReactionBadgeClick,
    onMediaLoad = () => {}
}) => {
    const isMe = msg.sender_id === userId;
    const isImage = msg.message_type === 'image' || msg.type === 'image';
    const isVideoMsg = msg.message_type === 'video' || msg.type === 'video';
    const imageUrl = msg.image_url || msg.media_url;
    
    // Helper to parse thought replies:
    // Pattern 1: Replied to your thought "Mr tibf f": hhh
    // Pattern 2: Replying to your thought: "helloo NN"\n\nHey
    const parseThoughtReply = (content) => {
        if (!content) return null;
        const match1 = content.match(/^Replied to your thought "([\s\S]*?)": ([\s\S]*)$/);
        if (match1) {
            return { thought: match1[1], reply: match1[2] };
        }
        const match2 = content.match(/^Replying to your thought: "([\s\S]*?)"\s+([\s\S]*)$/);
        if (match2) {
            return { thought: match2[1], reply: match2[2] };
        }
        return null;
    };

    const parsedThoughtReply = parseThoughtReply(msg.content);
    
    // Framer Motion Values
    const x = useMotionValue(0);
    const controls = useAnimation();
    
    // Icon Transformations based on drag x
    const iconScale = useTransform(x, [0, 60], [0.5, 1.2]);
    const iconOpacity = useTransform(x, [10, 50], [0, 1]);
    const iconX = useTransform(x, [0, 60], [0, 10]); // Slight parallax
    
    // Long Press Logic
    const longPressTimer = useRef(null);
    const longPressTriggered = useRef(false);

    const triggerLongPress = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
        longPressTriggered.current = true; // Mark as triggered
        if (onMessageLongPress) {
            onMessageLongPress(msg.id);
        } else {
            onToggleSelection(msg.id, true);
        }
    };

    const handlePointerDown = () => {
        // Reset trigger state on new touch
        longPressTriggered.current = false;
        
        if (!isSelectionMode) {
            longPressTimer.current = setTimeout(() => {
                if (navigator.vibrate) navigator.vibrate(50);
                triggerLongPress();
            }, 400); // 400ms for mobile long press
        }
    };

    const handleDragStart = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleDragEnd = (event, info) => {
        // Clear timer just in case
        if (longPressTimer.current) clearTimeout(longPressTimer.current);

        const dragX = info.offset.x;
        // Threshold for reply
        if (dragX > 60 && !isSelectionMode) {
            if (navigator.vibrate) navigator.vibrate(10);
            onSwipeReply(msg);
        }
    };
    
    // Clean up timer on unmount
    useEffect(() => {
        return () => {
            if (longPressTimer.current) clearTimeout(longPressTimer.current);
        };
    }, []);

    const handleBubbleClick = (e) => {
        // Use capture to stop propagation if this was a long press released interaction
        if (longPressTriggered.current) {
            e.preventDefault();
            e.stopPropagation();
            longPressTriggered.current = false; // Reset
            return;
        }

        if (isSelectionMode) {
            e.preventDefault();
            e.stopPropagation();
            onToggleSelection(msg.id);
            return;
        }
    };

    // Format Time Helper
    const formatTime = (isoString) => {
        if (!isoString) return '';
        const date = new Date(isoString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <React.Fragment>
            {dateHeader}
            <motion.div 
                className={`msg-bubble ${isMe ? 'me' : 'them'} ${msg.message_type === 'call_log' ? 'call-log' : ''} ${isSelected ? 'selected' : ''} ${isHighlighted ? 'message-highlight' : ''}`}
                
                // Drag Props
                drag={isSelectionMode ? false : "x"}
                dragConstraints={{ left: 0, right: 0 }} // Snap back to 0
                dragElastic={{ right: 0.3, left: 0 }}   // Allow pulling right, solid wall left
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onPointerDown={handlePointerDown}
                onPointerUp={() => longPressTimer.current && clearTimeout(longPressTimer.current)}
                onPointerCancel={() => longPressTimer.current && clearTimeout(longPressTimer.current)}
                
                style={{
                    x,
                    touchAction: 'pan-y',
                    cursor: isSelectionMode ? 'pointer' : 'grab',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    WebkitTouchCallout: 'none',
                    scale: isSelected ? 0.98 : 1
                }}
                
                onClickCapture={handleBubbleClick}
                onContextMenu={(e) => {
                    e.preventDefault(); 
                    if (!isSelectionMode) triggerLongPress();
                }}
                
                // Layout transition
                layout
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
                {/* Selection Checkbox */}
                {isSelectionMode && (
                    <div className="selection-overlay">
                        <div className={`selection-checkbox ${isSelected ? 'checked' : ''}`}>
                            {isSelected && <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                        </div>
                    </div>
                )}

                {/* Reply Swipe Icon - Behind/Attached via transform */}
                <motion.div 
                    className="reply-swipe-icon"
                    style={{
                        position: 'absolute',
                        left: -40,
                        top: '50%',
                        y: '-50%',
                        scale: iconScale,
                        opacity: iconOpacity,
                        x: iconX,
                        color: 'var(--theme-accent, #00f0ff)',
                        fontSize: '1.2rem',
                        pointerEvents: 'none',
                        zIndex: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: '32px', height: '32px',
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: '50%',
                        backdropFilter: 'blur(4px)'
                    }}
                >
                   <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>
                </motion.div>

                {/* Story Reply Preview */}
                {msg.reply_to_story && (
                    <div className="quoted-story clickable" style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '4px 8px 4px 4px', marginBottom: '4px', background: 'rgba(100,100,100,0.2)',
                        borderRadius: '8px', borderLeft: '3px solid #f09433', overflow: 'hidden'
                    }}>
                        <div style={{ width: '32px', height: '42px', flexShrink: 0 }}>
                            <img 
                                src={getOptimizedStorageUrl(msg.reply_to_story.media_url, { width: 100, height: 100 })} 
                                alt="Story"
                                width="32"
                                height="42"
                                loading="lazy"
                                decoding="async"
                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} 
                            />
                        </div>
                        <div style={{ fontSize: '12px', opacity: 0.9, display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 600 }}>Replied to story</span>
                        </div>
                    </div>
                )}

                {/* Quoted Message / Thought Reply */}
                {parsedThoughtReply ? (
                    <div className="quoted-message">
                        <div className="quoted-message-header" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '0.9rem' }}>💭</span>
                            {isMe ? 'Replied to thought' : `${partner.username || partner.full_name}'s thought`}
                        </div>
                        <div className="quoted-message-content">
                            {parsedThoughtReply.thought}
                        </div>
                    </div>
                ) : msg.reply_to ? (
                    <div 
                        className="quoted-message clickable" 
                        onClick={(e) => {
                            e.stopPropagation();
                            onScrollToMessage(msg.reply_to.id);
                        }}
                    >
                        <div className="quoted-message-header">
                            {msg.reply_to.sender_id === userId ? 'You' : (partner.username || partner.full_name)}
                        </div>
                        <div className="quoted-message-content">
                            {msg.reply_to.message_type === 'image' ? '📷 Photo' : 
                             msg.reply_to.message_type === 'video' ? '🎥 Video' :
                             msg.reply_to.message_type === 'call_log' ? (
                                (() => {
                                    try {
                                        const log = typeof msg.reply_to.content === 'string' 
                                            ? JSON.parse(msg.reply_to.content) 
                                            : msg.reply_to.content;
                                        
                                        const isMissed = ['missed', 'declined', 'rejected', 'busy'].includes(log.status);
                                        const isMyCall = log.caller_id ? log.caller_id === userId : (msg.reply_to.sender_id === userId);
                                        const icon = log.call_type === 'video' ? '🎥' : '📞';
                                        
                                        const direction = isMyCall ? 'Outgoing' : 'Incoming';
                                        let text = `${direction} ${log.call_type === 'video' ? 'Video' : 'Audio'} Call`;
                                        
                                        if (isMissed) {
                                             const statusText = log.status.charAt(0).toUpperCase() + log.status.slice(1);
                                             text += ` • ${statusText}`;
                                        }
                                        
                                        return `${icon} ${text}`;
                                    } catch { return '📞 Call'; }
                                })()
                             ) :
                             msg.reply_to.content?.length > 50 ? msg.reply_to.content.substring(0, 50) + '...' : msg.reply_to.content}
                        </div>
                    </div>
                ) : null}

                {isImage || isVideoMsg ? (
                    <div className="msg-image-container" style={{ display: 'flex', flexDirection: 'column' }}>
                        {isVideoMsg ? (
                            <video 
                                src={imageUrl} 
                                controls 
                                playsInline
                                className="sent-video" 
                                onClick={() => onViewImage(imageUrl)}
                                onLoadedData={onMediaLoad}
                                style={{ cursor: 'pointer', borderRadius: '8px', marginBottom: msg.content && msg.content !== '🎥 Video' && msg.content !== '📷 Photo' ? '6px' : '0', maxWidth: '100%', maxHeight: '300px' }}
                            />
                        ) : (
                            <img 
                                src={getOptimizedStorageUrl(imageUrl, { width: 500 })} 
                                alt="Sent" 
                                className="sent-image" 
                                width="300"
                                height="200"
                                onClick={() => onViewImage(imageUrl)}
                                onLoad={onMediaLoad}
                                loading="lazy"
                                decoding="async"
                                style={{ cursor: 'pointer', borderRadius: '8px', marginBottom: msg.content && msg.content !== '📷 Photo' && msg.content !== '🎥 Video' ? '6px' : '0', aspectRatio: '300/200', objectFit: 'cover' }}
                            />
                        )}
                        {msg.content && msg.content !== '📷 Photo' && msg.content !== '🎥 Video' && (
                            <span className="msg-text" style={{ padding: '0 4px', wordBreak: 'break-word' }}>
                                {parsedThoughtReply ? parsedThoughtReply.reply : msg.content}
                            </span>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px', padding: '4px 4px 0 0', marginTop: '2px' }}>
                            <span className="msg-time-inline" style={{ margin: 0, fontSize: '0.7em', opacity: 0.7 }}>{formatTime(msg.created_at)}</span>
                            <MessageStatusTick 
                                status={deliveryStatus} 
                                isSender={isMe} 
                            />
                        </div>
                    </div>
                ) : msg.message_type === 'call_log' ? (
                    (() => {
                        let log = {};
                        try { log = JSON.parse(msg.content); } catch (e) { log = { status: 'unknown' }; }
                        
                        const isVideo = log.call_type === 'video' || log.call_type === 'video_call';
                        const isAudio = log.call_type === 'audio';
                        const isMissed = ['missed', 'declined', 'rejected', 'busy'].includes(log.status);
                        
                        const isMyCall = log.caller_id ? String(log.caller_id) === String(userId) : isMe;
                        const typeStr = isVideo ? 'video call' : 'audio call';
                        
                        let mainText = '';
                        let durationText = '';

                        const status = log.status; // ended, declined, missed, busy, rejected, cancelled

                        if (status === 'declined' || status === 'rejected') {
                            mainText = 'Declined call';
                        } else if (status === 'missed' || status === 'busy' || status === 'cancelled') {
                            mainText = 'Missed call';
                        } else {
                            const direction = isMyCall ? 'Outgoing' : 'Incoming';
                            mainText = `${direction} ${typeStr}`;
                            
                            if (status === 'ended' && log.duration > 0) {
                                const mins = Math.floor(log.duration / 60);
                                const secs = log.duration % 60;
                                durationText = ` • ${mins}:${secs.toString().padStart(2, '0')}`;
                            }
                        }

                        return (
                            <div className={`call-log-bubble ${isMissed ? 'missed' : 'active-call'} ${isMe ? 'me' : 'them'}`}>
                                <div style={{ 
                                    width: '36px', height: '36px', borderRadius: '50%', 
                                    background: isMissed ? 'rgba(255, 59, 48, 0.12)' : 'rgba(124, 58, 237, 0.12)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: isMissed ? '#ff3b30' : '#7c3aed',
                                    flexShrink: 0
                                }}>
                                    {isVideo ? (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                                    ) : (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path></svg>
                                    )}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: '120px' }}>
                                    <span className="call-log-title" style={{ fontWeight: 600, fontSize: '0.9rem', color: isMissed ? '#ff3b30' : 'inherit', wordBreak: 'break-word' }}>
                                        {mainText}
                                        {durationText && <span className="duration-label" style={{ fontWeight: 600, marginLeft: '6px' }}>{durationText}</span>}
                                    </span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', opacity: 0.7, fontSize: '0.7rem', justifyContent: 'flex-end' }}>
                                        <span style={{ fontSize: '0.95em' }}>{formatTime(msg.created_at)}</span>
                                        <MessageStatusTick 
                                            status={deliveryStatus} 
                                            isSender={isMe} 
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })()
                ) : msg.message_type === 'sticker' ? (
                    /* ── Premium Sticker ── */
                    <div className="msg-sticker-container" style={{ textAlign: isMe ? 'right' : 'left' }}>
                        <span style={{
                            fontSize: '3.5rem',
                            display: 'block',
                            lineHeight: 1.1,
                            filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.25))',
                            marginBottom: '4px',
                        }}>
                            {msg.content}
                        </span>
                        <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', alignItems: 'center', gap: '4px', opacity: 0.6, fontSize: '0.7rem' }}>
                            <span>{formatTime(msg.created_at)}</span>
                            <MessageStatusTick status={deliveryStatus} isSender={isMe} />
                        </div>
                    </div>
                ) : msg.message_type === 'audio' ? (
                    <VoicePlayBubble
                        url={imageUrl}
                        isMe={isMe}
                        createdAt={msg.created_at}
                        deliveryStatus={deliveryStatus}
                        formatTime={formatTime}
                    />
                ) : (
                    <div className="msg-text-container">
                        <span className="msg-text">{parsedThoughtReply ? parsedThoughtReply.reply : msg.content}</span>
                        <span className="msg-time-inline">{formatTime(msg.created_at)}</span>
                        <MessageStatusTick 
                            status={deliveryStatus} 
                            isSender={isMe} 
                        />
                    </div>
                )}

                {/* Reactions Display */}
                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                    <div className="reactions-display" style={{
                        position: 'absolute',
                        bottom: '-12px',
                        [isMe ? 'right' : 'left']: '12px',
                        display: 'flex',
                        gap: '4px',
                        zIndex: 2,
                    }}>
                        {Array.from(new Set(Object.values(msg.reactions))).map((emoji, idx) => {
                            const count = Object.values(msg.reactions).filter(e => e === emoji).length;
                            return (
                                <span 
                                    key={idx} 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (msg.reactions && msg.reactions[userId] === emoji) {
                                            if (onReactionBadgeClick) onReactionBadgeClick(msg.id, emoji);
                                        } else {
                                            if (onReactionToggle) onReactionToggle(msg.id, emoji);
                                        }
                                    }}
                                    style={{
                                        fontSize: '1rem',
                                        cursor: 'pointer',
                                        padding: '0 2px',
                                        filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.3))'
                                    }}
                                >
                                    {emoji} {count > 1 ? <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>{count}</span> : ''}
                                </span>
                            );
                        })}
                    </div>
                )}
            </motion.div>
        </React.Fragment>
    );
};

const areReactionsEqual = (r1, r2) => {
    if (r1 === r2) return true;
    if (!r1 || !r2) return r1 === r2;
    const k1 = Object.keys(r1);
    const k2 = Object.keys(r2);
    if (k1.length !== k2.length) return false;
    for (let i = 0; i < k1.length; i++) {
        const key = k1[i];
        if (r1[key] !== r2[key]) return false;
    }
    return true;
};

// Custom comparison function for React.memo to prevent unnecessary re-renders
const arePropsEqual = (prevProps, nextProps) => {
    // Check primitive props
    if (
        prevProps.deliveryStatus !== nextProps.deliveryStatus ||
        prevProps.isSelectionMode !== nextProps.isSelectionMode ||
        prevProps.isSelected !== nextProps.isSelected ||
        prevProps.isHighlighted !== nextProps.isHighlighted ||
        prevProps.dateHeader !== nextProps.dateHeader
    ) {
        return false;
    }

    // Check message content and status
    if (
        prevProps.msg.id !== nextProps.msg.id ||
        prevProps.msg.content !== nextProps.msg.content ||
        prevProps.msg.delivery_status !== nextProps.msg.delivery_status ||
        prevProps.msg.is_read !== nextProps.msg.is_read ||
        !areReactionsEqual(prevProps.msg.reactions, nextProps.msg.reactions)
    ) {
        return false;
    }

    return true; // Props are equal, no re-render needed
};

export default memo(MessageBubble, arePropsEqual);
