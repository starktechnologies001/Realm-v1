import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { getAvatarHeadshot } from '../utils/avatarUtils';
import Toast from './Toast';

export default function StoryViewer({ 
    userStories, // { user: {}, stories: [], latest: '' }
    currentUser, 
    onClose, 
    onNextUser, 
    onPrevUser 
}) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [progress, setProgress] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [viewers, setViewers] = useState([]);
    const [showViewersList, setShowViewersList] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editCaption, setEditCaption] = useState('');

    // Derived state
    const stories = userStories?.stories || [];
    const currentStory = stories[currentIndex];
    const user = userStories?.user || {};
    const isOwner = currentUser?.id && user?.id && currentUser.id === user.id;
    
    // Handle property mismatches (MapHome uses 'name'/'avatar', DB uses 'username'/'avatar_url')
    const displayUsername = user.username || user.name || 'User';
    const displayAvatar = user.avatar_url || user.avatar;

    if (!userStories || !userStories.user) {
        console.error('StoryViewer: Missing user data', userStories);
        return null;
    }
    
    const STORY_DURATION = 5000; // 5 seconds per story
    const timerRef = useRef(null);
    const startTimeRef = useRef(null);

    // Load initial views & mark as viewed
    useEffect(() => {
        if (!currentStory) return;

        // 1. Mark as viewed (if not owner)
        if (!isOwner) {
            const markViewed = async () => {
                try {
                    await supabase
                        .from('story_views')
                        .upsert(
                            { story_id: currentStory.id, viewer_id: currentUser.id },
                            { onConflict: 'story_id,viewer_id', ignoreDuplicates: true }
                        );
                } catch (e) {
                    console.error('Failed to mark view', e);
                }
            };
            markViewed();
        }

        // 2. Fetch Viewers (if owner)
        if (isOwner) {
            const fetchViewers = async () => {
                const { data } = await supabase
                    .from('story_views')
                    .select('profiles:viewer_id(id, username, avatar_url), viewed_at')
                    .eq('story_id', currentStory.id)
                    .order('viewed_at', { ascending: false });
                
                // Flatten and set
                setViewers(data?.map(v => v.profiles) || []);
            };
            fetchViewers();
        }

        // Reset Timer
        setProgress(0);
        startTimeRef.current = Date.now();
        
    }, [currentStory, isOwner, currentUser.id]);

    // Timer Logic
    useEffect(() => {
        if (!currentStory || isPaused || showViewersList) return;

        const interval = setInterval(() => {
            const elapsed = Date.now() - startTimeRef.current;
            const percentage = Math.min((elapsed / STORY_DURATION) * 100, 100);
            
            setProgress(percentage);

            if (elapsed >= STORY_DURATION) {
                handleNext();
            }
        }, 50); // Fluid update

        return () => clearInterval(interval);
    }, [currentStory, currentIndex, isPaused, showViewersList]);

    const handleNext = () => {
        if (currentIndex < stories.length - 1) {
            setCurrentIndex(prev => prev + 1);
            startTimeRef.current = Date.now(); // Reset timer base
        } else {
            onNextUser ? onNextUser() : onClose();
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
            startTimeRef.current = Date.now();
        } else {
            onPrevUser ? onPrevUser() : onClose();
        }
    };

    const handleDelete = async () => {
        if (!confirm('Delete this status update?')) return;
        
        try {
            const { error } = await supabase
                .from('stories')
                .delete()
                .eq('id', currentStory.id);

            if (error) throw error;
            
            // Remove locally to avoid full reload if possible, 
            // but for safety/sync we'll reload or close
            window.location.reload(); 
        } catch (err) {
            alert('Failed to delete: ' + err.message);
        }
    };

    const [toast, setToast] = useState(null); // Local toast state

    const handleReply = async (e) => {
        e.preventDefault();
        if (!replyText.trim()) return;

        // Send message with story context
        // This assumes basic message table structure.
        const { error } = await supabase.from('messages').insert({
            sender_id: currentUser.id,
            receiver_id: user.id,
            content: replyText,
            reply_to_story_id: currentStory.id, // Ensure DB has column or omit context visually
            message_type: 'text'
        });

        if (!error) {
            setReplyText('');
            // Resume correctly: reset start time based on current progress
            startTimeRef.current = Date.now() - (progress / 100 * STORY_DURATION);
            setIsPaused(false);
            
            // Show success toast
            setToast({ message: 'Message sent successfully! 📤' });
            setTimeout(() => setToast(null), 3000);
        }
    };

    const handleEditClick = (e) => {
        e.stopPropagation();
        setIsPaused(true);
        setEditCaption(currentStory.caption || '');
        setIsEditing(true);
    };

    const handleSaveCaption = async (e) => {
        e?.stopPropagation();
        try {
            const { error } = await supabase
                .from('stories')
                .update({ caption: editCaption.trim() })
                .eq('id', currentStory.id);

            if (error) throw error;

            // Mutate local object for immediate feedback
            currentStory.caption = editCaption.trim();
            
            setIsEditing(false);
            setIsPaused(false);
            setToast({ message: 'Caption updated! ✏️' });
        } catch (err) {
            console.error(err);
            setToast({ message: 'Failed to update caption' });
        }
    };

    if (!currentStory) return null;

    return (
        <div className="story-viewer-overlay">
            {/* Toast Notification */}
            {toast && <Toast message={toast.message} onClose={() => setToast(null)} />}

            {/* Click zones for navigation */}
            <div className="nav-zone left" onClick={handlePrev}></div>
            <div className="nav-zone right" onClick={handleNext}></div>

            <div className="story-content-wrapper" 
                 onMouseDown={() => { setIsPaused(true); }}
                 onMouseUp={() => { setIsPaused(false); startTimeRef.current = Date.now() - (progress / 100 * STORY_DURATION); }}
                 onTouchStart={() => { setIsPaused(true); }}
                 onTouchEnd={() => { setIsPaused(false); startTimeRef.current = Date.now() - (progress / 100 * STORY_DURATION); }}
            >
                {/* Progress Bars */}
                <div className="progress-container">
                    {stories.map((s, idx) => (
                        <div key={s.id} className="progress-bar-bg">
                            <div 
                                className="progress-bar-fill"
                                style={{ 
                                    width: idx < currentIndex ? '100%' : idx === currentIndex ? `${progress}%` : '0%'
                                }}
                            ></div>
                        </div>
                    ))}
                </div>

                {/* Header */}
                <div className="story-header" style={{
                    paddingTop: '60px' // Avoid notch overlap
                }}>
                    <div className="user-info">
                        <img src={getAvatarHeadshot(displayAvatar, displayUsername)} alt="Avatar" />
                        <div className="meta">
                            <span className="username" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{displayUsername}</span>
                            <span className="timestamp" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                                {new Date(currentStory.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    </div>
                    <div className="actions">
                        {isOwner && (
                            <>
                                <button className="action-btn edit-btn" onClick={handleEditClick} title="Edit Caption">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                </button>
                                <button className="action-btn delete-btn" onClick={(e) => { e.stopPropagation(); handleDelete(); }} title="Delete Story">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                </button>
                            </>
                        )}
                        <button className="action-btn close-btn" onClick={(e) => { e.stopPropagation(); onClose(); }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                </div>
                
                {/* Main Media */}
                <img src={currentStory.media_url} className="story-image" alt="Story" />
                
                {/* Caption or Edit Input */}
                {isEditing ? (
                    <div className="story-caption-edit" onClick={e => e.stopPropagation()}>
                        <input 
                            type="text" 
                            value={editCaption}
                            onChange={e => setEditCaption(e.target.value)}
                            className="caption-edit-input"
                            placeholder="Add a caption..."
                            autoFocus
                        />
                        <div className="edit-actions">
                            <button className="cancel-caption-btn" onClick={() => { setIsEditing(false); setIsPaused(false); }}>Cancel</button>
                            <button className="save-caption-btn" onClick={handleSaveCaption}>Save</button>
                        </div>
                    </div>
                ) : (
                    currentStory.caption && <div className="story-caption">{currentStory.caption}</div>
                )}

                {/* Footer: Reply or Views */}
                <div className="story-footer" 
                    onClick={e => e.stopPropagation()}
                    onMouseDown={e => e.stopPropagation()}
                    onMouseUp={e => e.stopPropagation()}
                    onTouchStart={e => e.stopPropagation()}
                    onTouchEnd={e => e.stopPropagation()}
                >
                    {isOwner ? (
                        <div className="viewers-list-snippet" onClick={() => setShowViewersList(true)}>
                            <span className="eye-icon">👁️</span> {viewers.length} views
                        </div>
                    ) : (
                        <form className="reply-form" onSubmit={handleReply}>
                            <input 
                                type="text" 
                                placeholder="Send message..." 
                                value={replyText}
                                onChange={e => setReplyText(e.target.value)}
                                onFocus={() => setIsPaused(true)}
                                onBlur={() => {
                                    // Resume correctly: reset start time based on current progress
                                    startTimeRef.current = Date.now() - (progress / 100 * STORY_DURATION);
                                    setIsPaused(false);
                                }}
                            />
                            <button type="submit" disabled={!replyText.trim()}>Send</button>
                        </form>
                    )}
                </div>
            </div>

            {/* Viewers List Modal */}
            {showViewersList && (
                <div className="viewers-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="viewers-header">
                        <h3>Viewed by {viewers.length}</h3>
                        <button onClick={() => {
                            // Resume correctly
                            startTimeRef.current = Date.now() - (progress / 100 * STORY_DURATION);
                            setShowViewersList(false);
                        }}>✕</button>
                    </div>
                    <div className="viewers-list">
                        {viewers.length === 0 ? (
                            <p className="no-views">No views yet</p>
                        ) : (
                            viewers.map((v, i) => (
                                <div key={i} className="viewer-item">
                                    <img src={getAvatarHeadshot(v.avatar_url, v.username)} alt={v.username} />
                                    <span>{v.username}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            <style>{`
                .story-viewer-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: #000;
                    z-index: 3000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .story-content-wrapper {
                    position: relative;
                    width: 100%;
                    height: 100%;
                    max-width: 500px;
                    display: flex;
                    flex-direction: column;
                }
                .nav-zone {
                    position: absolute;
                    top: 0; bottom: 0;
                    width: 30%;
                    z-index: 10;
                }
                .nav-zone.left { left: 0; }
                .nav-zone.right { right: 0; }
                
                .progress-container {
                    position: absolute;
                    top: 10px; left: 10px; right: 10px;
                    display: flex;
                    gap: 4px;
                    z-index: 20;
                }
                .progress-bar-bg {
                    height: 2px;
                    background: rgba(255,255,255,0.3);
                    flex: 1;
                    border-radius: 2px;
                    overflow: hidden;
                }
                .progress-bar-fill {
                    height: 100%;
                    background: #fff;
                    transition: width 0.05s linear;
                }

                .story-header {
                    position: absolute;
                    top: 0; left: 0; right: 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start; /* Align for top padding */
                    z-index: 20;
                    background: linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 50%, transparent 100%);
                    padding: 60px 20px 40px; /* Safe area for notch */
                }
                .user-info {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .user-info img {
                    width: 40px; height: 40px;
                    border-radius: 50%;
                    border: 2px solid rgba(255,255,255,0.8);
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                }
                .meta {
                    display: flex;
                    flex-direction: column;
                }
                .username { 
                    font-weight: 700; color: #fff; font-size: 15px; 
                    text-shadow: 0 1px 3px rgba(0,0,0,0.5);
                }
                .timestamp { 
                    font-size: 12px; opacity: 0.9; color: #eee; 
                    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
                }
                
                .actions {
                    display: flex;
                    gap: 12px;
                }
                
                .action-btn {
                    background: rgba(25, 25, 25, 0.4);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: white;
                    width: 40px; height: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
                    cursor: pointer;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                }
                .action-btn:active { transform: scale(0.92); }
                .action-btn:hover {
                    background: rgba(255, 255, 255, 0.15);
                    border-color: rgba(255, 255, 255, 0.3);
                }
                .action-btn svg {
                    width: 20px; height: 20px;
                    stroke-width: 2;
                    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
                }
                .delete-btn:hover {
                    background: rgba(255, 59, 48, 0.25);
                    border-color: rgba(255, 59, 48, 0.5);
                }

                .story-image {
                    width: 100%; height: 100%;
                    object-fit: contain;
                    background: #000;
                }

                .story-caption {
                    position: absolute;
                    bottom: 100px; /* Above gestures area */
                    left: 20px; right: 20px;
                    text-align: center;
                    color: white;
                    font-size: 18px;
                    line-height: 1.4;
                    padding: 12px 16px;
                    background: rgba(0, 0, 0, 0.4);
                    border-radius: 16px;
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    text-shadow: 0 1px 2px rgba(0,0,0,0.5);
                }

                .story-footer {
                    position: absolute;
                    bottom: 0; left: 0; right: 0;
                    padding: 20px 20px 40px; /* Bottom safe area */
                    background: linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 60%, transparent 100%);
                    z-index: 20;
                    display: flex;
                    justify-content: center;
                }
                
                /* Edit Mode Styles */
                .story-caption-edit {
                    position: absolute;
                    bottom: 0; left: 0; right: 0;
                    z-index: 30;
                    background: rgba(20, 20, 20, 0.85);
                    padding: 24px 20px 40px;
                    border-top-left-radius: 24px;
                    border-top-right-radius: 24px;
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    box-shadow: 0 -10px 40px rgba(0,0,0,0.5);
                    animation: slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
                    border-top: 1px solid rgba(255,255,255,0.1);
                }
                
                .caption-edit-input {
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: white;
                    padding: 14px 18px;
                    border-radius: 16px;
                    font-size: 16px;
                    outline: none;
                    width: 100%;
                    transition: border-color 0.2s, background 0.2s;
                }
                .caption-edit-input:focus {
                    background: rgba(255, 255, 255, 0.12);
                    border-color: rgba(64, 156, 255, 0.5);
                }

                .edit-actions {
                    display: flex;
                    gap: 12px;
                    justify-content: flex-end;
                }
                .save-caption-btn, .cancel-caption-btn {
                    border: none;
                    padding: 12px 24px;
                    border-radius: 12px;
                    font-weight: 600;
                    font-size: 15px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .save-caption-btn {
                    background: #007AFF; /* iOS Blue */
                    color: white;
                    box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);
                }
                .save-caption-btn:active { transform: scale(0.96); }
                
                .cancel-caption-btn {
                    background: rgba(255, 255, 255, 0.1);
                    color: rgba(255, 255, 255, 0.9);
                }
                .cancel-caption-btn:hover { background: rgba(255, 255, 255, 0.15); }
                .cancel-caption-btn:active { transform: scale(0.96); }

                /* Viewer List & Reply Styles */
                .reply-form { width: 100%; display: flex; gap: 12px; position: relative; }
                .reply-form input {
                    flex: 1;
                    background: rgba(0, 0, 0, 0.4);
                    border: 1px solid rgba(255,255,255,0.3);
                    border-radius: 24px;
                    padding: 12px 20px;
                    color: white;
                    font-size: 15px;
                    backdrop-filter: blur(10px);
                }
                .reply-form input::placeholder { color: rgba(255,255,255,0.6); }
                .reply-form input:focus { border-color: rgba(255,255,255,0.8); background: rgba(0,0,0,0.6); }
                
                .reply-form button {
                    position: absolute;
                    right: 8px; top: 50%; transform: translateY(-50%);
                    background: white; 
                    color: black;
                    border: none;
                    border-radius: 20px;
                    padding: 6px 14px;
                    font-weight: 700;
                    font-size: 13px;
                    cursor: pointer;
                }

                .viewers-list-snippet {
                    color: white; font-weight: 500; font-size: 14px;
                    display: flex; align-items: center; gap: 8px;
                    cursor: pointer;
                    background: rgba(30, 30, 30, 0.6);
                    padding: 10px 20px;
                    border-radius: 30px;
                    backdrop-filter: blur(12px);
                    border: 1px solid rgba(255,255,255,0.1);
                    transition: background 0.2s;
                }
                .viewers-list-snippet:active { background: rgba(50, 50, 50, 0.8); }

                .viewers-modal {
                    position: absolute;
                    bottom: 0; left: 0; right: 0;
                    background: #1c1c1e;
                    border-top-left-radius: 20px;
                    border-top-right-radius: 20px;
                    z-index: 4000;
                    max-height: 60vh;
                    overflow-y: auto;
                    padding: 20px;
                    animation: slideUp 0.3s ease-out;
                    box-shadow: 0 -10px 60px rgba(0,0,0,0.5);
                }
                @keyframes slideUp {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .viewers-header {
                    display: flex; justify-content: space-between; align-items: center;
                    margin-bottom: 20px;
                    padding-bottom: 15px;
                    border-bottom: 1px solid rgba(255,255,255,0.08);
                }
                .viewers-header h3 { color: white; margin: 0; font-size: 17px; font-weight: 600; }
                
                .viewer-item {
                    display: flex; align-items: center; gap: 14px;
                    padding: 10px 0;
                    color: white;
                }
                .viewer-item img {
                    width: 44px; height: 44px; border-radius: 50%; object-fit: cover;
                    border: 1px solid rgba(255,255,255,0.1);
                }
                .no-views { color: rgba(255,255,255,0.4); text-align: center; margin-top: 30px; font-size: 14px; }
            `}</style>
        </div>
    );
}
