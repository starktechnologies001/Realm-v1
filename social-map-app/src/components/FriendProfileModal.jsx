import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import '@google/model-viewer';

export default function FriendProfileModal({ friend, onClose, onAction, relationshipStatus = 'connected' }) {
    const [fullProfile, setFullProfile] = useState(friend);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'media'
    const [sharedMedia, setSharedMedia] = useState([]);
    const [mediaLoading, setMediaLoading] = useState(false);
    const [viewingImage, setViewingImage] = useState(null);

    useEffect(() => {
        const fetchDetails = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            
            // 1. Fetch Profile
            const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', friend.id)
                .single();
            
            if (data) setFullProfile({ ...friend, ...data });
            setLoading(false);

            // 2. Fetch Shared Media if user exists
            if (user) {
                setMediaLoading(true);
                const { data: mediaData } = await supabase
                    .from('messages')
                    .select('id, content, message_type, image_url, created_at')
                    .or(`and(sender_id.eq.${user.id},receiver_id.eq.${friend.id}),and(sender_id.eq.${friend.id},receiver_id.eq.${user.id})`)
                    .eq('message_type', 'image') // or logic for files later
                    .order('created_at', { ascending: false })
                    .limit(20);
                
                if (mediaData) setSharedMedia(mediaData);
                setMediaLoading(false);
            }
        };
        fetchDetails();
    }, [friend.id]);

    const handleAction = (type) => {
        if (onAction) onAction(type, fullProfile);
    };

    if (!fullProfile) return null;

    return (
        <div className="friend-modal-backdrop" onClick={onClose}>
            <div className="friend-modal-content" onClick={e => e.stopPropagation()}>
                <button className="close-corner-btn" onClick={onClose}>✕</button>

                {/* 1. Top Section - Identity */}
                <div className="fm-identity-section">
                    <div className="fm-avatar-stage">
                        <div className="fm-avatar-glow"></div>
                        {fullProfile.model_url ? (
                            <model-viewer
                                src={fullProfile.model_url}
                                poster={fullProfile.avatar_url}
                                camera-controls
                                auto-rotate
                                shadow-intensity="1"
                                background-color="transparent"
                                style={{ width: '100%', height: '100%' }}
                                interaction-prompt="none"
                                autoplay
                            ></model-viewer>
                        ) : (
                            <img src={fullProfile.avatar_url} className="fm-static-avatar" />
                        )}
                        <div className={`fm-status-badge ${fullProfile.status === 'Online' ? 'active' : ''}`}>
                            {fullProfile.status === 'Online' ? 'Online' : 'Last seen recently'}
                        </div>
                    </div>
                    
                    <h2 className="fm-username">{fullProfile.full_name || fullProfile.username}</h2>
                    {/* Segmented Tabs */}
                    <div className="fm-segmented-control">
                        <button className={`fm-segment ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>Profile</button>
                        <button className={`fm-segment ${activeTab === 'media' ? 'active' : ''}`} onClick={() => setActiveTab('media')}>Media</button>
                    </div>
                </div>

                {/* TAB CONTENT */}
                <div className="fm-content-body">
                    {activeTab === 'profile' ? (
                        <div className="fm-scroll-container">
                            
                            {/* Stats Card */}
                            <div className="fm-card fm-stats-card">
                                <div className="fm-stat-item">
                                    <span className="val">3</span>
                                    <span className="lbl">Mutuals</span>
                                </div>
                                <div className="vertical-divider"></div>
                                <div className="fm-stat-item">
                                    <span className="val">{new Date(fullProfile.created_at || Date.now()).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}</span>
                                    <span className="lbl">Joined</span>
                                </div>
                                <div className="vertical-divider"></div>
                                <div className="fm-stat-item">
                                    <span className="val">
                                        {fullProfile.birth_date 
                                            ? new Date(fullProfile.birth_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                                            : '--'}
                                    </span>
                                    <span className="lbl">Birthday 🎂</span>
                                </div>
                            </div>

                            {/* About Card */}
                            <div className="fm-card fm-about-card">
                                <div className="card-header-lbl">ABOUT</div>
                                <p className="fm-bio-text">
                                    {fullProfile.bio || "No bio yet. Just here to make friends!"}
                                </p>
                                
                                <div className="fm-tags-row">
                                    {fullProfile.interests?.map((tag, i) => (
                                        <span key={i} className="fm-pill-tag">{tag}</span>
                                    )) || (
                                        <>
                                            <span className="fm-pill-tag">Music 🎵</span>
                                            <span className="fm-pill-tag">Travel ✈️</span>
                                            {fullProfile.institute && <span className="fm-pill-tag">{fullProfile.institute} 🎓</span>}
                                        </>
                                    )}
                                </div>

                                <div className="fm-intent-row">
                                    <span className="intent-icon">🤝</span>
                                    <span className="intent-text">Looking for <b>Friends & Networking</b></span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="fm-media-grid">
                            {mediaLoading ? (
                                <p className="fm-empty-msg">Loading media...</p>
                            ) : sharedMedia.length === 0 ? (
                                <div className="fm-empty-state">
                                    <span style={{fontSize:'2rem'}}>📷</span>
                                    <p>No shared media yet.</p>
                                </div>
                            ) : (
                                sharedMedia.map(item => (
                                    <div key={item.id} className="fm-media-item" onClick={() => setViewingImage(item.image_url)}>
                                        <img src={item.image_url} alt="Shared" loading="lazy" />
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {/* 4. Actions */}
                <div className="fm-actions">
                    {relationshipStatus === 'connected' && (
                        <>
                            <button className="fm-btn-primary" onClick={() => handleAction('chat')}>
                                💬 Chat
                            </button>
                            <button className="fm-btn-secondary" onClick={() => handleAction('audio')}>
                                📞
                            </button>
                            <button className="fm-btn-secondary" onClick={() => handleAction('video')}>
                                🎥
                            </button>
                        </>
                    )}
                    {relationshipStatus === 'none' && (
                         <button className="fm-btn-primary" onClick={() => handleAction('poke')}>
                            🟡 Poke
                         </button>
                    )}
                    <button className="fm-btn-ghost" onClick={() => handleAction('mute')}>
                        🔕 Mute
                    </button>
                </div>

                {/* 5. Privacy Footer */}
                <div className="fm-privacy-footer">
                    <button className="fm-privacy-link" onClick={() => handleAction('report')}>⚠️ Report User</button>
                    <button className="fm-privacy-link danger" onClick={() => handleAction('block')}>🚫 Block</button>
                </div>

                {/* Image Viewer Overlay */}
                {viewingImage && (
                    <div className="fm-image-viewer" onClick={() => setViewingImage(null)}>
                        <img src={viewingImage} alt="Full" />
                        <button className="fm-close-viewer">✕</button>
                    </div>
                )}
            </div>

            <style>{`
                .friend-modal-backdrop {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.85); backdrop-filter: blur(15px);
                    z-index: 9999; display: flex; align-items: center; justify-content: center;
                    animation: fadeIn 0.3s;
                }
                .friend-modal-content {
                    width: 90%; max-width: 380px; max-height: 90vh; overflow-y: auto;
                    background: linear-gradient(160deg, #1a1a1a, #0d0d0d);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 30px;
                    padding: 0; position: relative;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.6);
                    animation: slideUp 0.4s cubic-bezier(0.19, 1, 0.22, 1);
                    display: flex; flex-direction: column;
                }
                .close-corner-btn {
                    position: absolute; top: 15px; right: 15px;
                    background: rgba(255,255,255,0.1); color: white;
                    border: none; width: 32px; height: 32px; border-radius: 50%;
                    cursor: pointer; z-index: 10; font-size: 1rem;
                }
                
                /* Identity */
                .fm-identity-section {
                    position: relative;
                    background: radial-gradient(circle at center, #2a2a2a 0%, #1a1a1a 100%);
                    padding: 40px 20px 20px;
                    display: flex; flex-direction: column; align-items: center;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                }
                .fm-avatar-stage {
                    width: 140px; height: 180px; position: relative; margin-bottom: 10px;
                }
                .fm-avatar-glow {
                    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                    width: 100px; height: 100px; background: rgba(0, 198, 255, 0.2);
                    border-radius: 50%; filter: blur(30px); z-index: 0;
                }
                .fm-static-avatar {
                    width: 100%; height: 100%; object-fit: contain; z-index: 1; position: relative;
                }
                .fm-status-badge {
                    position: absolute; bottom: -10px; left: 50%; transform: translateX(-50%);
                    background: #333; color: #aaa;
                    padding: 4px 12px; border-radius: 20px; font-size: 0.7rem; border: 1px solid #444;
                    white-space: nowrap; z-index: 2;
                }
                .fm-status-badge.active {
                    background: rgba(0, 255, 136, 0.15); color: #00ff88; border-color: rgba(0, 255, 136, 0.3);
                }
                .fm-username { margin: 15px 0 5px; font-size: 1.4rem; color: white; text-align: center; }
                .fm-mood { font-size: 0.9rem; color: #888; text-align: center; }

                /* About */
                .fm-section { padding: 20px 25px; border-bottom: 1px solid rgba(255,255,255,0.05); }
                .fm-section-title { 
                    font-size: 0.7rem; color: #555; font-weight: 700; letter-spacing: 1.5px; margin-bottom: 12px; 
                }
                .fm-bio { font-size: 0.95rem; color: #ccc; line-height: 1.5; margin: 0 0 15px; }
                .fm-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 15px; }
                .fm-tag { 
                    background: rgba(255,255,255,0.05); color: #aaa; padding: 6px 14px; 
                    border-radius: 12px; font-size: 0.8rem; 
                }
                .fm-intent-pill {
                    background: linear-gradient(90deg, rgba(0, 198, 255, 0.1), transparent);
                    border-left: 2px solid #00c6ff;
                    padding: 10px 15px; color: #00c6ff; font-size: 0.85rem; font-weight: 500;
                    border-radius: 8px;
                }

                /* Social */
                .fm-social { display: flex; justify-content: space-around; }
                .fm-stat { display: flex; flex-direction: column; align-items: center; gap: 4px; }
                .fm-stat-val { font-size: 1.1rem; color: white; font-weight: 700; }
                .fm-stat-label { font-size: 0.75rem; color: #666; }

                /* Actions */
                .fm-actions { 
                    padding: 25px; display: flex; gap: 10px; justify-content: center; 
                    background: black;
                }
                .fm-btn-primary {
                    flex: 1; background: white; color: black; font-weight: 700; border: none;
                    padding: 12px; border-radius: 14px; cursor: pointer;
                    display: flex; align-items: center; justify-content: center; gap: 8px;
                    transition: transform 0.2s;
                }
                .fm-btn-secondary {
                    width: 48px; height: 48px; border-radius: 14px;
                    background: rgba(255,255,255,0.1); border: none; color: white; font-size: 1.2rem;
                    cursor: pointer; display: flex; align-items: center; justify-content: center;
                }
                .fm-btn-ghost {
                    background: transparent; color: #666; border: 1px solid #333; padding: 0 15px; 
                    border-radius: 14px; font-size: 0.8rem; cursor: pointer;
                }
                
                /* Privacy */
                .fm-privacy-footer {
                    padding: 10px 20px 20px; display: flex; justify-content: space-between; align-items: center;
                    background: black;
                }
                .fm-privacy-link {
                    background: transparent; border: none; color: #666; font-size: 0.75rem; cursor: pointer;
                }
                .fm-privacy-link.danger { color: #883333; }
                
                .fm-privacy-link.danger { color: #ff4d4d; opacity: 0.8; }
                
                /* Segmented Tabs */
                .fm-segmented-control {
                    display: flex; background: rgba(0,0,0,0.3);
                    border-radius: 12px; padding: 4px;
                    width: 90%; margin: 20px auto 0;
                }
                .fm-segment {
                    flex: 1; border: none; background: transparent; color: #888;
                    padding: 8px; border-radius: 10px; font-weight: 600; font-size: 0.9rem;
                    cursor: pointer; transition: all 0.2s;
                }
                .fm-segment.active {
                    background: rgba(255,255,255,0.1); color: white;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                }

                .fm-content-body { flex: 1; overflow-y: auto; padding-top: 20px; }
                .fm-scroll-container { display: flex; flex-direction: column; gap: 16px; padding: 0 20px 20px; }

                /* Cards */
                .fm-card {
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.05);
                    border-radius: 20px; padding: 20px;
                }

                /* Stats Card */
                .fm-stats-card {
                    display: flex; align-items: center; justify-content: space-evenly;
                    background: linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));
                }
                .fm-stat-item { display: flex; flex-direction: column; align-items: center; gap: 4px; }
                .fm-stat-item .val { font-size: 1.1rem; font-weight: 700; color: white; }
                .fm-stat-item .lbl { font-size: 0.75rem; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
                .vertical-divider { width: 1px; height: 30px; background: rgba(255,255,255,0.1); }

                /* About Card */
                .fm-about-card { display: flex; flex-direction: column; gap: 15px; }
                .card-header-lbl { font-size: 0.75rem; color: #555; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin-bottom: -5px; }
                .fm-bio-text { font-size: 0.95rem; color: #ddd; line-height: 1.5; margin: 0; }
                
                .fm-tags-row { display: flex; flex-wrap: wrap; gap: 8px; }
                .fm-pill-tag {
                    background: rgba(0, 198, 255, 0.1); color: #00d4ff;
                    padding: 6px 14px; border-radius: 20px; font-size: 0.8rem; font-weight: 500;
                    border: 1px solid rgba(0, 198, 255, 0.15);
                }

                .fm-intent-row {
                    display: flex; align-items: center; gap: 10px;
                    background: rgba(0,0,0,0.2); padding: 12px; border-radius: 14px;
                }
                .intent-icon { font-size: 1.2rem; }
                .intent-text { font-size: 0.85rem; color: #bbb; }
                .intent-text b { color: white; }

                /* Media Grid override */
                .fm-media-grid { padding: 0 2px 20px; }

                .fm-image-viewer {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.95); z-index: 10000;
                    display: flex; align-items: center; justify-content: center;
                    animation: fadeIn 0.2s;
                }
                .fm-image-viewer img { max-width: 100%; max-height: 90vh; box-shadow: 0 0 50px rgba(0,0,0,0.5); }
                .fm-close-viewer {
                    position: absolute; top: 20px; right: 20px;
                    background: rgba(255,255,255,0.2); color: white; border: none;
                    width: 40px; height: 40px; border-radius: 50%; font-size: 1.2rem; cursor: pointer;
                }

                @keyframes slideUp { from { transform: translateY(50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            `}</style>
        </div>
    );
}
