import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { getAvatarHeadshot } from '../utils/avatarUtils';
import Toast from './Toast';

export default function StatusView({ currentUser, friends, onSelectFriend, refreshTrigger }) {
    const [myStories, setMyStories] = useState([]);
    const [friendsStories, setFriendsStories] = useState([]);
    const [viewedStoryIds, setViewedStoryIds] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [editingStory, setEditingStory] = useState(null); // { id, caption }
    const [editCaptionText, setEditCaptionText] = useState('');
    const [savingCaption, setSavingCaption] = useState(false);

    useEffect(() => {
        if (currentUser) {
            fetchStories();
        }
    }, [currentUser, friends, refreshTrigger]);

    const fetchStories = async () => {
        try {
            setLoading(true);

            // 1. Fetch My Stories
            // ... (keep existing)
            const { data: myData, error: myError } = await supabase
                .from('stories')
                .select('*')
                .eq('user_id', currentUser.id)
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: false });

            if (myError) throw myError;
            setMyStories(myData || []);

            // 1.5 Fetch My Views (to know what I've seen)
            const { data: viewsData, error: viewsError } = await supabase
                .from('story_views')
                .select('story_id')
                .eq('viewer_id', currentUser.id);
            
            if (viewsError) throw viewsError;
            const viewedSet = new Set(viewsData?.map(v => v.story_id));

            setViewedStoryIds(viewedSet);

            // 2. Fetch Friends' Stories
            const friendIds = friends.map(f => f.id);
            if (friendIds.length > 0) {
                const { data: friendsData, error: friendsError } = await supabase
                    .from('stories')
                    .select(`
                        *,
                        profiles:user_id (id, username, full_name, avatar_url)
                    `)
                    .in('user_id', friendIds)
                    .gt('expires_at', new Date().toISOString())
                    .order('created_at', { ascending: false });

                if (friendsError) throw friendsError;

                // Group by User
                const grouped = {};
                friendsData?.forEach(story => {
                    if (!grouped[story.user_id]) {
                        grouped[story.user_id] = {
                            user: story.profiles,
                            stories: [],
                            latest: story.created_at,
                            allViewed: true // Assume true, prove false
                        };
                    }
                    grouped[story.user_id].stories.push(story);
                    
                    // If any active story is NOT in viewedSet, then allViewed = false
                    if (!viewedSet.has(story.id)) {
                        grouped[story.user_id].allViewed = false;
                    }
                });

                // Convert to array and sort by latest story
                // Optional: Push viewed stories to the end? For now just sort by time.
                setFriendsStories(Object.values(grouped).sort((a, b) => 
                    new Date(b.latest) - new Date(a.latest)
                ));
            } else {
                setFriendsStories([]);
            }

        } catch (error) {
            console.error('Error fetching stories:', error);
        } finally {
            setLoading(false);
        }
    };

    // ... (keep handleFileSelect, handleUpload)

    // ...

            {/* Friends Status */}


    const [selectedFile, setSelectedFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [caption, setCaption] = useState('');

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) return;

        try {
            setUploading(true);
            const fileExt = selectedFile.name.split('.').pop();
            const fileName = `${currentUser.id}/${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            // Upload to Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('story-media')
                .upload(filePath, selectedFile);

            if (uploadError) throw uploadError;

            // Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('story-media')
                .getPublicUrl(filePath);

            // Create Story Record
            const { error: dbError } = await supabase
                .from('stories')
                .insert({
                    user_id: currentUser.id,
                    media_url: publicUrl,
                    caption: caption.trim(),
                    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Explicit 24h expiry
                });

            if (dbError) throw dbError;

            await fetchStories(); // Refresh
            
            // Cleanup
            setSelectedFile(null);
            setPreviewUrl(null);
            setCaption('');
            
        } catch (error) {
            console.error('Upload failed:', error);
            alert(`Failed to upload status: ${error.message || error.error_description || 'Unknown error'}`);
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteStory = async (storyId, e) => {
        if (e) e.stopPropagation();
        if (!window.confirm('Are you sure you want to delete this story?')) return;

        try {
            setLoading(true);
            const { error } = await supabase
                .from('stories')
                .delete()
                .eq('id', storyId);

            if (error) throw error;
            await fetchStories();
        } catch (error) {
            console.error('Delete failed:', error);
            alert('Failed to delete story.');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenEditCaption = (story, e) => {
        if (e) e.stopPropagation();
        setEditingStory(story);
        setEditCaptionText(story.caption || '');
    };

    const handleSaveEditCaption = async () => {
        if (!editingStory) return;
        setSavingCaption(true);
        try {
            const { error } = await supabase
                .from('stories')
                .update({ caption: editCaptionText.trim() })
                .eq('id', editingStory.id);
            if (error) throw error;
            // Update local state
            setMyStories(prev => prev.map(s =>
                s.id === editingStory.id ? { ...s, caption: editCaptionText.trim() } : s
            ));
            setEditingStory(null);
        } catch (err) {
            alert('Failed to update caption.');
        } finally {
            setSavingCaption(false);
        }
    };

    return (
        <div className="status-view">
            {/* Upload Preview Overlay */}
            {previewUrl && (
                <div className="upload-preview-overlay">
                    <div className="preview-container">
                        <img src={previewUrl} alt="Preview" className="preview-image" />
                        <input 
                            type="text" 
                            className="caption-input"
                            placeholder="Add a caption..." 
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                            autoFocus
                        />
                        <div className="preview-actions">
                            <button className="cancel-btn" onClick={() => {
                                setSelectedFile(null);
                                setPreviewUrl(null);
                                setCaption('');
                            }}>Cancel</button>
                            <button className="post-btn" onClick={handleUpload} disabled={uploading}>
                                {uploading ? 'Posting...' : 'Post Status'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Caption Modal */}
            {editingStory && (
                <div className="edit-caption-overlay" onClick={() => setEditingStory(null)}>
                    <div className="edit-caption-sheet" onClick={e => e.stopPropagation()}>
                        <div className="edit-caption-header">
                            <span>Edit Caption</span>
                            <button className="edit-caption-close" onClick={() => setEditingStory(null)}>✕</button>
                        </div>
                        {editingStory.media_url && (
                            <img src={editingStory.media_url} alt="Story" className="edit-caption-preview" />
                        )}
                        <input
                            type="text"
                            className="edit-caption-input"
                            placeholder="Add a caption..."
                            value={editCaptionText}
                            onChange={e => setEditCaptionText(e.target.value)}
                            autoFocus
                            maxLength={150}
                        />
                        <div className="edit-caption-actions">
                            <button className="ec-cancel-btn" onClick={() => setEditingStory(null)}>Cancel</button>
                            <button className="ec-save-btn" onClick={handleSaveEditCaption} disabled={savingCaption}>
                                {savingCaption ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* My Status */}
            <div className="status-row my-status-container">
                <div className="my-status-main" onClick={() => {
                    if (myStories.length > 0) {
                        onSelectFriend({
                            user: currentUser,
                            stories: myStories
                        });
                    }
                }}>
                    <div className="status-avatar-wrapper">
                        <div className={`status-ring ${myStories.length > 0 ? 'active' : 'empty'}`}>
                            <img src={getAvatarHeadshot(currentUser?.avatar_url, currentUser?.username)} alt="My Avatar" />
                        </div>
                        <label className="add-status-btn" onClick={(e) => e.stopPropagation()}>
                            <input type="file" accept="image/*" onChange={handleFileSelect} disabled={uploading} hidden />
                            {uploading ? '...' : '+'}
                        </label>
                    </div>
                    <div className="status-info">
                        <h3>My Status</h3>
                        <p>{myStories.length > 0 ? `${myStories.length} active` : 'Tap to add status'}</p>
                    </div>
                </div>


            </div>

            <div className="section-divider">Recent Updates</div>

            {/* Friends Status */}
            <div className="friends-status-list">
                {friendsStories.length === 0 && !loading && (
                    <div className="empty-state">No recent updates from friends.</div>
                )}
                
                {friendsStories.map(group => (
                    <div key={group.user.id} className="status-row" onClick={() => onSelectFriend(group)}>
                        <div className="status-avatar-wrapper">
                            <div className={`status-ring ${group.allViewed ? 'viewed' : 'active'}`}>
                                <img src={getAvatarHeadshot(group.user.avatar_url, group.user.username)} alt={group.user.username} />
                            </div>
                        </div>
                        <div className="status-info">
                            <h3>{group.user.username}</h3>
                            <p>{new Date(group.latest).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                    </div>
                ))}
            </div>

            <style>{`
                .status-view {
                    padding: 16px;
                    color: var(--text-primary, #000000);
                }
                .status-row {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 12px 0;
                    cursor: pointer;
                }
                .status-avatar-wrapper {
                    position: relative;
                    width: 60px;
                    height: 60px;
                }
                .status-ring {
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    padding: 3px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s;
                }
                .status-ring.active {
                    background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
                }
                .status-ring.viewed {
                    background: #555;
                    opacity: 0.7;
                    padding: 2px;
                }
                .status-ring.empty {
                    border: 2px dashed var(--text-secondary, rgba(0,0,0,0.3));
                }
                .status-ring img {
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    object-fit: cover;
                    border: 2px solid var(--bg-paper, #fff);
                }
                .add-status-btn {
                    position: absolute;
                    bottom: 0;
                    right: 0;
                    width: 20px;
                    height: 20px;
                    background: #0095f6;
                    border: 2px solid var(--bg-paper, #fff);
                    border-radius: 50%;
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    font-weight: bold;
                    cursor: pointer;
                }
                .status-info h3 {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 600;
                    color: var(--text-primary, #000000);
                }
                .status-info p {
                    margin: 2px 0 0;
                    font-size: 13px;
                    color: var(--text-secondary, rgba(0,0,0,0.5));
                }
                .my-status-container {
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 12px;
                    border-bottom: 1px solid var(--separator, rgba(0,0,0,0.05));
                    padding-bottom: 20px;
                }
                .my-status-main {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    width: 100%;
                }
                .my-stories-management {
                    display: flex;
                    gap: 10px;
                    width: 100%;
                    overflow-x: auto;
                    padding: 4px 2px;
                }
                .mini-story-item {
                    position: relative;
                    width: 70px;
                    height: 90px;
                    border-radius: 10px;
                    overflow: hidden;
                    flex-shrink: 0;
                    border: 1.5px solid rgba(0,0,0,0.08);
                    cursor: pointer;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    transition: transform 0.15s ease;
                }
                .mini-story-item:active { transform: scale(0.96); }
                .mini-story-item img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    display: block;
                }
                .mini-story-caption {
                    position: absolute;
                    bottom: 22px; left: 0; right: 0;
                    background: linear-gradient(transparent, rgba(0,0,0,0.7));
                    color: white;
                    font-size: 8px;
                    padding: 2px 4px;
                    text-align: center;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .mini-story-actions {
                    position: absolute;
                    bottom: 0; left: 0; right: 0;
                    display: flex;
                    gap: 2px;
                    padding: 3px;
                    background: rgba(0,0,0,0.5);
                    backdrop-filter: blur(4px);
                }
                .mini-action-btn {
                    flex: 1;
                    height: 18px;
                    border: none;
                    border-radius: 4px;
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: background 0.15s;
                }
                .mini-edit-btn { background: rgba(66, 133, 244, 0.85); }
                .mini-edit-btn:active { background: rgba(66, 133, 244, 1); }
                .mini-delete-btn { background: rgba(255, 59, 48, 0.85); }
                .mini-delete-btn:active { background: rgba(255, 59, 48, 1); }
                .section-divider {
                    margin: 20px 0 10px;
                    font-size: 13px;
                    font-weight: 600;
                    color: var(--text-secondary, rgba(0,0,0,0.4));
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .empty-state {
                    text-align: center;
                    padding: 40px;
                    color: var(--text-secondary, rgba(0,0,0,0.3));
                    font-size: 14px;
                }

                .upload-preview-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: #000;
                    z-index: 5000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .preview-container {
                    position: relative;
                    width: 100%; height: 100%;
                    max-width: 500px;
                    display: flex;
                    flex-direction: column;
                    background: #111;
                }
                .preview-image {
                    flex: 1;
                    width: 100%;
                    object-fit: contain;
                    background: #000;
                }
                .caption-input {
                    background: rgba(40,40,40, 0.9);
                    border: none;
                    color: white;
                    padding: 16px;
                    font-size: 16px;
                    outline: none;
                    width: 100%;
                }
                .preview-actions {
                    display: flex;
                    justify-content: space-between;
                    padding: 16px;
                    background: #111;
                }
                .cancel-btn {
                    background: none; border: none; color: white; padding: 10px 20px; font-weight: 500;
                }
                .post-btn {
                    background: #0095f6; border: none; color: white; padding: 10px 24px; border-radius: 20px; font-weight: 600;
                }
                .post-btn:disabled { opacity: 0.7; }

                /* Edit Caption Modal */
                .edit-caption-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.6);
                    backdrop-filter: blur(8px);
                    z-index: 6000;
                    display: flex;
                    align-items: flex-end;
                    justify-content: center;
                }
                .edit-caption-sheet {
                    background: var(--bg-card, #fff);
                    border-top-left-radius: 24px;
                    border-top-right-radius: 24px;
                    width: 100%;
                    max-width: 500px;
                    padding: 20px 20px calc(20px + env(safe-area-inset-bottom));
                    box-shadow: 0 -10px 40px rgba(0,0,0,0.2);
                    animation: ecSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }
                @keyframes ecSlideUp {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .edit-caption-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 14px;
                    font-weight: 700;
                    font-size: 16px;
                    color: var(--text-primary, #000);
                }
                .edit-caption-close {
                    background: rgba(120,120,128,0.15);
                    border: none;
                    width: 30px;
                    height: 30px;
                    border-radius: 50%;
                    font-size: 14px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--text-primary, #000);
                }
                .edit-caption-preview {
                    width: 100%;
                    max-height: 200px;
                    object-fit: contain;
                    border-radius: 12px;
                    margin-bottom: 14px;
                    background: #111;
                }
                .edit-caption-input {
                    width: 100%;
                    padding: 13px 16px;
                    border: 1.5px solid rgba(120,120,128,0.2);
                    border-radius: 14px;
                    font-size: 16px;
                    outline: none;
                    background: var(--bg-paper, #f5f5f7);
                    color: var(--text-primary, #000);
                    box-sizing: border-box;
                    transition: border-color 0.2s;
                    margin-bottom: 14px;
                }
                .edit-caption-input:focus { border-color: #007AFF; }
                .edit-caption-actions {
                    display: flex;
                    gap: 12px;
                }
                .ec-cancel-btn {
                    flex: 1;
                    padding: 13px;
                    border: none;
                    border-radius: 14px;
                    font-size: 15px;
                    font-weight: 600;
                    background: rgba(120,120,128,0.12);
                    color: var(--text-primary, #000);
                    cursor: pointer;
                }
                .ec-save-btn {
                    flex: 1;
                    padding: 13px;
                    border: none;
                    border-radius: 14px;
                    font-size: 15px;
                    font-weight: 600;
                    background: #007AFF;
                    color: white;
                    cursor: pointer;
                    box-shadow: 0 4px 12px rgba(0,122,255,0.3);
                }
                .ec-save-btn:disabled { opacity: 0.6; }
            `}</style>
        </div>
    );
}
