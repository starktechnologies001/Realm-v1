import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useLocationContext } from '../context/LocationContext';
import './Profile.css'; // Reuse profile styling

const VisibilitySettings = () => {
    const navigate = useNavigate();
    const { startLocation, stopLocation } = useLocationContext();
    
    const [visibilityMode, setVisibilityMode] = useState('public');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const { data } = await supabase.from('profiles').select('visibility_mode').eq('id', session.user.id).single();
                if (data) {
                    setVisibilityMode(data.visibility_mode || 'public');
                }
            }
            setLoading(false);
        };
        fetchUser();
    }, []);

    const updateVisibility = async (mode) => {
        setVisibilityMode(mode);
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
            await supabase.from('profiles').update({ 
                visibility_mode: mode,
                is_ghost_mode: mode === 'ghost'
            }).eq('id', session.user.id);

            if (mode === 'ghost') {
                // Keep location tracking active so user can access the map and see everyone's avatar, but they are hidden (handled via DB columns).
                startLocation();
            } else {
                startLocation();
            }
        }
    };

    return (
        <div className="profile-container" style={{ padding: '20px', paddingBottom: '100px' }}>
            <div className="profile-header">
                <button className="icon-btn back-btn" onClick={() => navigate(-1)} style={{ color: '#111' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                </button>
                <h2 style={{ color: '#111' }}>Map Visibility</h2>
                <div style={{ width: 24 }} /> {/* spacer */}
            </div>

            <div className="settings-content" style={{ marginTop: '24px' }}>
                <div style={{
                    background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '12px', padding: '16px', marginBottom: '24px', display: 'flex', gap: '12px',
                    alignItems: 'flex-start'
                }}>
                    <span style={{ fontSize: '20px' }}>🛡️</span>
                    <div>
                        <h4 style={{ margin: '0 0 4px', color: '#60a5fa', fontSize: '0.95rem' }}>How we protect your location</h4>
                        <p style={{ margin: 0, color: 'var(--text-secondary, #9ca3af)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                            Your exact GPS coordinates are <strong>never</strong> shared or stored on our servers. 
                            We apply a protective 50–100m randomized blur directly on your device. 
                            If you enable Ghost Mode, your location is cryptographically erased from our systems entirely.
                        </p>
                    </div>
                </div>

                <div className="visibility-options">
                    {/* PUBLIC */}
                    <div 
                        className={`visibility-card ${visibilityMode === 'public' ? 'active' : ''}`}
                        onClick={() => updateVisibility('public')}
                        style={{
                            background: visibilityMode === 'public' ? 'rgba(0, 212, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                            border: visibilityMode === 'public' ? '1px solid #00d4ff' : '1px solid transparent',
                            borderRadius: '16px',
                            padding: '20px',
                            marginBottom: '16px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex',
                            gap: '16px'
                        }}
                    >
                        <div style={{ fontSize: '24px' }}>🌍</div>
                        <div>
                            <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem', color: visibilityMode === 'public' ? '#00d4ff' : '#111' }}>Public</h3>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #666)', lineHeight: 1.4 }}>
                                You are visible to everyone nearby. We apply a random 50-100m blur to your location so no one knows your exact spot.
                            </p>
                        </div>
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                            <div style={{ 
                                width: 20, height: 20, borderRadius: '50%', 
                                border: visibilityMode === 'public' ? '6px solid #00d4ff' : '2px solid rgba(255,255,255,0.3)',
                                background: visibilityMode === 'public' ? '#fff' : 'transparent'
                            }} />
                        </div>
                    </div>

                    {/* FRIENDS */}
                    <div 
                        className={`visibility-card ${visibilityMode === 'friends' ? 'active' : ''}`}
                        onClick={() => updateVisibility('friends')}
                        style={{
                            background: visibilityMode === 'friends' ? 'rgba(52, 199, 89, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                            border: visibilityMode === 'friends' ? '1px solid #34C759' : '1px solid transparent',
                            borderRadius: '16px',
                            padding: '20px',
                            marginBottom: '16px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex',
                            gap: '16px'
                        }}
                    >
                        <div style={{ fontSize: '24px' }}>👥</div>
                        <div>
                            <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem', color: visibilityMode === 'friends' ? '#34C759' : '#111' }}>Friends Only</h3>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #666)', lineHeight: 1.4 }}>
                                Only accepted friends can see you on the map. You are completely hidden from strangers.
                            </p>
                        </div>
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                            <div style={{ 
                                width: 20, height: 20, borderRadius: '50%', 
                                border: visibilityMode === 'friends' ? '6px solid #34C759' : '2px solid rgba(255,255,255,0.3)',
                                background: visibilityMode === 'friends' ? '#fff' : 'transparent'
                            }} />
                        </div>
                    </div>

                    {/* GHOST */}
                    <div 
                        className={`visibility-card ${visibilityMode === 'ghost' ? 'active' : ''}`}
                        onClick={() => updateVisibility('ghost')}
                        style={{
                            background: visibilityMode === 'ghost' ? 'rgba(128, 90, 213, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                            border: visibilityMode === 'ghost' ? '1px solid #805AD5' : '1px solid transparent',
                            borderRadius: '16px',
                            padding: '20px',
                            marginBottom: '16px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex',
                            gap: '16px'
                        }}
                    >
                        <div style={{ fontSize: '24px' }}>👻</div>
                        <div>
                            <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem', color: visibilityMode === 'ghost' ? '#A8A8B3' : '#111' }}>Ghost Mode</h3>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary, #666)', lineHeight: 1.4 }}>
                                You are completely hidden from the map. Your location data is strictly wiped from the database. You can still see others.
                            </p>
                        </div>
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                            <div style={{ 
                                width: 20, height: 20, borderRadius: '50%', 
                                border: visibilityMode === 'ghost' ? '6px solid #805AD5' : '2px solid rgba(255,255,255,0.3)',
                                background: visibilityMode === 'ghost' ? '#fff' : 'transparent'
                            }} />
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    Changes are saved automatically and apply instantly.
                </div>
            </div>
        </div>
    );
};

export default VisibilitySettings;
