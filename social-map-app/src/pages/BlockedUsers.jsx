import React, { useState, useEffect } from 'react'; 
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { unblockUser } from '../utils/blockUtils';
import Toast from '../components/Toast';
import { getAvatarHeadshot, DEFAULT_GENERIC_AVATAR } from '../utils/avatarUtils';

export default function BlockedUsers() {
    const [blockedList, setBlockedList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [toastMsg, setToastMsg] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        fetchBlockedUsers();
    }, []);

    const fetchBlockedUsers = async () => {
        setLoading(true);
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;

        // Fetch blocked users and join with profiles
        // We use the 'blocked_users' table and join on 'blocked_id' -> profiles
        const { data, error } = await supabase
            .from('blocked_users')
            .select(`
                id,
                blocked_id,
                created_at,
                profile:profiles!blocked_id (
                    id,
                    username,
                    full_name,
                    avatar_url,
                    gender
                )
            `)
            .eq('blocker_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching blocked users:', error);
            showToast('Failed to load blocked users');
        } else {
            setBlockedList(data || []);
        }
        setLoading(false);
    };

    const handleUnblock = async (targetId, name) => {
        if (!window.confirm(`Unblock ${name}?`)) return;

        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        const result = await unblockUser(user.id, targetId);

        if (result.success) {
            showToast(`Unblocked ${name}`);
            // Optimistic update
            setBlockedList(prev => prev.filter(item => item.blocked_id !== targetId));
        } else {
            showToast('Failed to unblock');
        }
    };

    const showToast = (msg) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(null), 3000);
    };

    return (
        <div className="blocked-users-page" style={{ 
            minHeight: '100vh', 
            background: 'var(--bg-color)', 
            color: 'var(--text-color)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
        }}>
            {/* Header */}
            <div className="glass-header" style={{
                position: 'sticky',
                top: 0,
                zIndex: 100,
                background: 'rgba(250, 248, 245, 0.85)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                padding: '16px 20px',
                borderBottom: '0.5px solid rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
            }}>
                <button 
                    onClick={() => navigate(-1)} 
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                </button>
                <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Blocked Users</h1>
            </div>

            {/* List */}
            <div className="blocked-list" style={{ padding: '20px' }}>
                {loading ? (
                    <div className="spinner-container" style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
                        <div className="spinner"></div> 
                    </div>
                ) : blockedList.length === 0 ? (
                    <div className="empty-state" style={{ textAlign: 'center', marginTop: 60, opacity: 0.6 }}>
                        <div style={{ fontSize: 40, marginBottom: 16 }}>🛡️</div>
                        <h3>No blocked users</h3>
                        <p style={{ marginTop: 8 }}>You haven't blocked anyone yet.</p>
                    </div>
                ) : (
                    <div className="list-content" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {blockedList.map(item => {
                            const profile = item.profile;
                            if (!profile) return null;
                            const name = profile.full_name || profile.username || 'Unknown';
                            const avatar = getAvatarHeadshot(profile.avatar_url, profile.gender);
                            
                            return (
                                <div key={item.id} className="blocked-user-item" style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    background: 'var(--bg-card, #fff)',
                                    padding: '12px 16px',
                                    borderRadius: '16px',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                                }}>
                                    <div className="user-info" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <img 
                                            src={avatar} 
                                            alt={name} 
                                            style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', background: '#eee' }} 
                                        />
                                        <div>
                                            <div className="username-text" style={{ fontWeight: 600, fontSize: '16px', color: '#000' }}>@{profile.username}</div>
                                        </div>
                                    </div>
                                    
                                    <button 
                                        className="unblock-btn"
                                        onClick={() => handleUnblock(item.blocked_id, name)}
                                        style={{
                                            background: 'rgba(0,0,0,0.05)',
                                            color: '#000', // Default (Light mode)
                                            border: 'none',
                                            padding: '8px 16px',
                                            borderRadius: '20px',
                                            fontWeight: 600,
                                            fontSize: '13px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Unblock
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
            
            <style>{`
                /* Dark Mode Support */
                @media (prefers-color-scheme: dark) {
                    .blocked-users-page {
                        background: #000 !important;
                        color: #fff !important;
                    }
                    .glass-header {
                        background: rgba(20, 20, 25, 0.85) !important;
                        border-bottom-color: rgba(255,255,255,0.15) !important;
                    }
                    .glass-header h1, .glass-header button {
                        color: #fff !important;
                    }
                    .blocked-user-item {
                        background: #1c1c1e !important;
                        box-shadow: none !important;
                    }
                    .username-text {
                        color: #fff !important;
                    }
                    .unblock-btn {
                        background: rgba(255, 255, 255, 0.15) !important;
                        color: #fff !important;
                    }
                    .empty-state {
                        color: #888;
                    }
                }
            `}</style>
        </div>
    );
}
