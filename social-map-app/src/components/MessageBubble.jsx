import React, { useRef, memo } from 'react';

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
    const swipeRef = useRef({
        startX: 0,
        startY: 0,
        currentX: 0,
        touchMoved: false,
        longPressTimer: null,
        hapticTriggered: false
    });
    const iconRef = useRef(null);

    const isMe = msg.sender_id === userId;
    const isImage = msg.message_type === 'image' || msg.type === 'image';
    const imageUrl = msg.image_url || msg.media_url;

    // --- Touch Handlers (Local to this bubble) ---
    const handleTouchStart = (e) => {
        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;
        
        swipeRef.current = { 
            startX: touchX, 
            startY: touchY,
            currentX: 0,
            touchMoved: false,
            longPressTimer: null
        };

        if (!isSelectionMode) {
            swipeRef.current.longPressTimer = setTimeout(() => {
                const state = swipeRef.current;
                if (state && !state.touchMoved) {
                    if (navigator.vibrate) navigator.vibrate(50);
                    state.touchMoved = true; 
                    onToggleSelection(msg.id, true); // True = Force enable mode
                }
            }, 600);
        }
    };
    
    const handleTouchMove = (e) => {
        const state = swipeRef.current;
        if (!state || !state.startX) return;
        
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const diffX = currentX - state.startX;
        const diffY = currentY - (state.startY || 0);

        // Vertical Scroll Detection
        if (Math.abs(diffY) > Math.abs(diffX) * 1.5) return;
        if (Math.abs(diffX) < 5) return;

        state.touchMoved = true;
        
        if (state.longPressTimer) {
            clearTimeout(state.longPressTimer);
            state.longPressTimer = null;
        }
        
        if (isSelectionMode) return;
        
        if (diffX > 0) {
            // Logarithmic resistance
            const resistance = 0.5;
            const translateX = Math.min(diffX * resistance, 100);
            state.currentX = translateX;
            
            e.currentTarget.style.transform = `translateX(${translateX}px)`;
            
            // Icon Animation
            if (iconRef.current) {
                const progress = Math.max(0, Math.min(1, (translateX - 10) / 40));
                iconRef.current.style.transform = `translateY(-50%) scale(${progress})`;
                iconRef.current.style.opacity = progress;
                
                // Haptic Feedback
                if (translateX > 50 && !state.hapticTriggered) {
                    if (navigator.vibrate) navigator.vibrate(15);
                    state.hapticTriggered = true;
                } else if (translateX < 50 && state.hapticTriggered) {
                    state.hapticTriggered = false;
                }
            }
        }
    };
    
    const handleTouchEnd = (e) => {
        const state = swipeRef.current;
        if (state) {
            if (state.longPressTimer) clearTimeout(state.longPressTimer);
            if (state.currentX > 50 && !isSelectionMode) { // Threshold matches feedback
                onSwipeReply(msg);
                if (navigator.vibrate) navigator.vibrate(10); // Confirm haptic
            }
            swipeRef.current = { startX: 0, startY: 0, currentX: 0, touchMoved: false, longPressTimer: null, hapticTriggered: false };
        }
        
        e.currentTarget.style.transform = 'translateX(0)';
        e.currentTarget.style.transition = 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)';
        
        // Reset icon
        if (iconRef.current) {
             iconRef.current.style.transform = 'translateY(-50%) scale(0)';
             iconRef.current.style.opacity = '0';
        }
    };

    // --- Mouse Handlers ---
    const handleMouseDown = (e) => {
        if (e.button !== 0) return;
        const x = e.clientX;
        const y = e.clientY;
        
        swipeRef.current = { 
            startX: x, 
            startY: y,
            currentX: 0,
            touchMoved: false,
            longPressTimer: null
        };

        if (!isSelectionMode) {
            swipeRef.current.longPressTimer = setTimeout(() => {
                const state = swipeRef.current;
                if (state && !state.touchMoved) {
                    if (navigator.vibrate) navigator.vibrate(50);
                    state.touchMoved = true; 
                    onToggleSelection(msg.id, true);
                }
            }, 600);
        }
    };

    const handleMouseMove = (e) => {
        const state = swipeRef.current;
        if (!state || !state.startX) return;
        
        if ((e.buttons & 1) === 0) {
             handleMouseUp(e);
             return;
        }

        const currentX = e.clientX;
        const currentY = e.clientY;
        const diffX = currentX - state.startX;
        const diffY = currentY - (state.startY || 0);
        
        if (Math.abs(diffY) > Math.abs(diffX) * 1.5) return;
        if (Math.abs(diffX) < 5) return;

        state.touchMoved = true;
        
        if (state.longPressTimer) clearTimeout(state.longPressTimer);
        
        if (isSelectionMode) return;
        
        if (diffX > 0) {
            state.currentX = diffX;
            const translateX = Math.min(diffX, 80);
            e.currentTarget.style.transform = `translateX(${translateX}px)`;
        }
    };

    const handleMouseUp = (e) => {
         const state = swipeRef.current;
         let wasDragging = false;
         if (state) {
             if (state.longPressTimer) clearTimeout(state.longPressTimer);
             if (state.touchMoved) wasDragging = true;
             if (state.currentX > 50 && !isSelectionMode) {
                 onSwipeReply(msg);
             }
             swipeRef.current = { startX: 0, startY: 0, currentX: 0, touchMoved: false, longPressTimer: null };
         }
         e.currentTarget.style.transform = 'translateX(0)';
         e.currentTarget.style.transition = 'transform 0.2s';
         
         if (wasDragging) {
             e.currentTarget.setAttribute('data-dragged', 'true');
             setTimeout(() => e.target?.removeAttribute('data-dragged'), 50); 
         } else {
             e.currentTarget.removeAttribute('data-dragged');
         }
    };

    const handleBubbleClick = (e) => {
         if (e.currentTarget.getAttribute('data-dragged')) {
             e.stopPropagation();
             e.preventDefault();
             return;
         }
         if (isSelectionMode) {
             e.preventDefault();
             e.stopPropagation();
             onToggleSelection(msg.id); // No force state = Toggle
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
            <div 
                className={`msg-bubble ${isMe ? 'me' : 'them'} ${isSelected ? 'selected' : ''} ${isHighlighted ? 'message-highlight' : ''}`}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onContextMenu={(e) => {
                    e.preventDefault();
                    if (!isSelectionMode) onToggleSelection(msg.id, true);
                }}
                onClickCapture={handleBubbleClick}
                style={{
                    transform: isSelected ? 'scale(0.98)' : 'scale(1)',
                    transition: 'all 0.2s ease', // Only transition transform/scale
                    cursor: isSelectionMode ? 'pointer' : 'default',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    touchAction: 'pan-y'
                }}
            >
                {/* Selection Checkbox */}
                {isSelectionMode && (
                    <div className="selection-overlay">
                        <div className={`selection-checkbox ${isSelected ? 'checked' : ''}`}>
                            {isSelected && <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                        </div>
                    </div>
                )}

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
                             msg.reply_to.content?.length > 50 ? msg.reply_to.content.substring(0, 50) + '...' : msg.reply_to.content}
                        </div>
                    </div>
                )}

                {/* Reply Swipe Icon */}
                <div 
                    ref={iconRef}
                    className="reply-swipe-icon"
                    style={{
                        position: 'absolute',
                        left: -35,
                        top: '50%',
                        transform: `translateY(-50%) scale(${swipeRef.current.currentX > 40 ? 1 : Math.max(0, (swipeRef.current.currentX - 10) / 30)})`,
                        opacity: swipeRef.current.currentX > 10 ? 1 : 0,
                        transition: swipeRef.current.touchMoved ? 'none' : 'all 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28)',
                        color: 'var(--theme-accent, #00f0ff)',
                        fontSize: '1.2rem',
                        pointerEvents: 'none',
                        zIndex: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: '30px', height: '30px',
                        background: 'rgba(255,255,255,0.1)',
                        borderRadius: '50%',
                        backdropFilter: 'blur(4px)'
                    }}
                >
                   <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>
                </div>

                {isImage ? (
                    <img 
                        src={imageUrl} 
                        alt="Sent" 
                        className="sent-image" 
                        onClick={() => onViewImage(imageUrl)}
                        style={{ cursor: 'pointer' }}
                    />
                ) : (
                    <div className="msg-text">{msg.content}</div>
                )}
                
                {/* Meta info (Time + Status) */}
                <div className="msg-meta">
                    <span className="msg-time">{formatTime(msg.created_at)}</span>
                    {isMe && (
                        <span className={`msg-status ${msg.is_read ? 'read' : ''}`}>
                             {msg.sending ? '🕐' : (msg.is_read || msg.delivered_at) ? '✓✓' : '✓'}
                        </span>
                    )}
                </div>
            </div>
        </React.Fragment>
    );
});

export default MessageBubble;
