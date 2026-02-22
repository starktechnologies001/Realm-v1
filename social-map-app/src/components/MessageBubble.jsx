import React, { useRef, memo, useEffect } from 'react';
import { motion, useMotionValue, useTransform, useAnimation } from 'framer-motion';
import MessageStatusTick from './MessageStatusTick';

const MessageBubble = memo(({ 
    msg, 
    userId, 
    partner, 
    isSelectionMode, 
    isSelected, 
    isHighlighted, 
    dateHeader, 
    onSwipeReply, 
    onToggleSelection, 
    onViewImage,
    onScrollToMessage 
}) => {
    const isMe = msg.sender_id === userId;
    const isImage = msg.message_type === 'image' || msg.type === 'image';
    const imageUrl = msg.image_url || msg.media_url;
    
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

    const handlePointerDown = () => {
        // Reset trigger state on new touch
        longPressTriggered.current = false;
        
        if (!isSelectionMode) {
            longPressTimer.current = setTimeout(() => {
                if (navigator.vibrate) navigator.vibrate(50);
                longPressTriggered.current = true; // Mark as triggered
                onToggleSelection(msg.id, true);
            }, 500);
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
                className={`msg-bubble ${isMe ? 'me' : 'them'} ${isSelected ? 'selected' : ''} ${isHighlighted ? 'message-highlight' : ''} ${msg.message_type === 'call_log' ? 'system-msg' : ''}`}
                
                // Drag Props
                drag={isSelectionMode ? false : "x"}
                dragConstraints={{ left: 0, right: 0 }} // Snap back to 0
                dragElastic={{ right: 0.3, left: 0 }}   // Allow pulling right, solid wall left
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onPointerDown={handlePointerDown}
                onPointerUp={() => longPressTimer.current && clearTimeout(longPressTimer.current)}
                
                style={{
                    x,
                    touchAction: 'pan-y',
                    cursor: isSelectionMode ? 'pointer' : 'grab',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    scale: isSelected ? 0.98 : 1
                }}
                
                onClickCapture={handleBubbleClick}
                onContextMenu={(e) => {
                    e.preventDefault(); 
                    if (!isSelectionMode) onToggleSelection(msg.id, true);
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
                                src={msg.reply_to_story.media_url} 
                                alt="Story"
                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px' }} 
                            />
                        </div>
                        <div style={{ fontSize: '12px', opacity: 0.9, display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 600 }}>Replied to story</span>
                        </div>
                    </div>
                )}

                {/* Quoted Message */}
                {msg.reply_to && (
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
                )}

                {isImage ? (
                    <div className="msg-image-container" style={{ display: 'flex', flexDirection: 'column' }}>
                        <img 
                            src={imageUrl} 
                            alt="Sent" 
                            className="sent-image" 
                            onClick={() => onViewImage(imageUrl)}
                            style={{ cursor: 'pointer', borderRadius: '8px', marginBottom: msg.content && msg.content !== '📷 Photo' ? '6px' : '0' }}
                        />
                        {msg.content && msg.content !== '📷 Photo' && (
                            <span className="msg-text" style={{ padding: '0 4px', wordBreak: 'break-word' }}>{msg.content}</span>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px', padding: '4px 4px 0 0', marginTop: '2px' }}>
                            <span className="msg-time-inline" style={{ margin: 0, fontSize: '0.7em', opacity: 0.7 }}>{formatTime(msg.created_at)}</span>
                            <MessageStatusTick 
                                status={msg.delivery_status || (msg.is_read ? 'seen' : 'delivered')} 
                                isSender={isMe} 
                            />
                        </div>
                    </div>
                ) : msg.message_type === 'call_log' ? (
                    <div className="call-log-bubble">
                        {(() => {
                            let log = {};
                            try { log = JSON.parse(msg.content); } catch (e) { log = { status: 'unknown' }; }
                            
                            const isVideo = log.call_type === 'video' || log.call_type === 'video_call';
                            const isAudio = log.call_type === 'audio';
                            const isMissed = ['missed', 'declined', 'rejected', 'busy'].includes(log.status);
                            
                            // Determine Text
                            const isMyCall = log.caller_id ? log.caller_id === userId : isMe;
                            const typeLabel = isVideo ? 'Video call' : (isAudio ? 'Audio call' : 'Call');
                            const icon = isVideo ? '🎥' : '📞'; // Use emoji as requested or keep SVG? User used emoji in spec. 
                            // Actually user used emoji in text description, but the SVG in code is nice.
                            // I will keep specific specific logical string "Video call"

                            // ---------------------------------------------------------
                            // FINAL SPEC TEXT LOGIC
                            // ---------------------------------------------------------
                            let mainText = typeLabel;
                            let durationText = '';

                            const status = log.status; // ended, declined, missed, busy, rejected
                            const type = isVideo ? 'Video' : (isAudio ? 'Audio' : 'Call');
                            const typeStr = isVideo ? 'Video call' : (isAudio ? 'Audio call' : 'Call');

                            if (status === 'ended' && log.duration > 0) {
                                // 3. Accepted & Ended
                                const direction = isMyCall ? 'Outgoing' : 'Incoming';
                                mainText = `${direction} ${typeStr}`;
                                
                                // Format Duration
                                const mins = Math.floor(log.duration / 60);
                                const secs = log.duration % 60;
                                durationText = ` • ${mins}:${secs.toString().padStart(2, '0')}`;
                                
                            } else if (status === 'declined' || status === 'rejected') {
                                // 2. Declined (Normal or with Message)
                                // "Audio call • Declined"
                                mainText = `${typeStr} • Declined`;

                            } else if (status === 'missed' || status === 'busy') {
                                // 5. Timeout / Missed
                                // "Missed audio call"
                                mainText = `Missed ${typeStr.toLowerCase()}`;
                                
                            } else if (status === 'ended' && log.duration === 0) {
                                // Edge case: Ended immediately (cancelled)
                                const direction = isMyCall ? 'Outgoing' : 'Incoming';
                                mainText = `${direction} ${typeStr} ended`;
                            } else {
                                // Fallback
                                mainText = typeStr;
                            }

                            return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ 
                                        width: '36px', height: '36px', borderRadius: '50%', 
                                        background: isMissed ? 'rgba(255, 59, 48, 0.15)' : 'rgba(52, 199, 89, 0.15)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: isMissed ? '#ff3b30' : '#34c759',
                                        flexShrink: 0
                                    }}>
                                        {isVideo ? (
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
                                        ) : (
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"></path></svg>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                        <span style={{ fontWeight: 600, fontSize: '0.95rem', color: isMissed ? '#ff3b30' : 'inherit' }}>
                                            {mainText}
                                            {durationText && <span style={{ fontWeight: 400, marginLeft: '6px', opacity: 0.85 }}>{durationText}</span>}
                                        </span>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                ) : (
                    <div className="msg-text-container">
                        <span className="msg-text">{msg.content}</span>
                        <span className="msg-time-inline">{formatTime(msg.created_at)}</span>
                        <MessageStatusTick 
                            status={msg.delivery_status || (msg.is_read ? 'seen' : 'delivered')} 
                            isSender={isMe} 
                        />
                    </div>
                )}
            </motion.div>
        </React.Fragment>
    );
});

export default MessageBubble;
