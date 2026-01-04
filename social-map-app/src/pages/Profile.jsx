import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Toast from '../components/Toast';
import AvatarCreator from '../components/AvatarCreator';

export default function Profile() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const [toastMsg, setToastMsg] = useState(null);
    const [blockedUsers, setBlockedUsers] = useState([]);
    const [showBlockedModal, setShowBlockedModal] = useState(false);
    const [showAvatarCreator, setShowAvatarCreator] = useState(false);

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                navigate('/login');
                return;
            }

            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (error) throw error;

                // Self-Healing: Enforce correct avatar based on gender (Fix legacy or mismatched avatars)
            if (data && data.gender) {
                const gender = data.gender.toLowerCase();
                const currentAvatar = data.avatar_url || '';
                const safeName = encodeURIComponent(data.username || data.full_name || 'User');
                
                let shouldUpdate = false;
                let newAvatarUrl = currentAvatar;

                // Check mismatch - now using DiceBear Adventurer as standard
                const isAdventurer = currentAvatar.includes('dicebear.com/9.x/adventurer');
                const isRPM = currentAvatar.includes('readyplayer.me');

                if (isRPM) {
                    shouldUpdate = false; // Trust custom avatars
                } else if (gender === 'male' && (!currentAvatar.includes('hair=short') || !isAdventurer)) {
                    newAvatarUrl = `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&hair=short01,short02,short03,short04,short05,short06,short07,short08&earringsProbability=0`;
                    shouldUpdate = true;
                } else if (gender === 'female' && (!currentAvatar.includes('hair=long') || !isAdventurer)) {
                    newAvatarUrl = `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&glassesProbability=0&mustacheProbability=0&beardProbability=0&hair=long01,long02,long03,long04,long05,long10,long12`;
                    shouldUpdate = true;
                }

                if (shouldUpdate) {
                    console.log(`Fixing avatar mismatch for ${gender}: ${currentAvatar} -> ${newAvatarUrl}`);
                    
                    // Update DB with new URL
                    await supabase.from('profiles')
                        .update({ avatar_url: newAvatarUrl })
                        .eq('id', user.id);
                    
                    // Update local data immediatey
                    data.avatar_url = newAvatarUrl;
                }
            }

            setUser(data);
            
            // Fetch blocked users
            await fetchBlockedUsers(user.id);
        } catch (error) {
            console.error("Error fetching profile:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        localStorage.clear();
        navigate('/login');
    };

    const fetchBlockedUsers = async (userId) => {
        try {
            const { data, error } = await supabase
                .from('friendships')
                .select(`
                    id,
                    receiver:profiles!receiver_id(id, full_name, username, gender)
                `)
                .eq('requester_id', userId)
                .eq('status', 'blocked');

            if (!error && data) {
                setBlockedUsers(data.map(b => ({
                    friendship_id: b.id,
                    ...b.receiver
                })));
            }
        } catch (err) {
            console.error('Error fetching blocked users:', err);
        }
    };

    const handleUnblock = async (friendshipId, userName) => {
        try {
            const { error } = await supabase
                .from('friendships')
                .delete()
                .eq('id', friendshipId);

            if (error) throw error;

            setBlockedUsers(prev => prev.filter(u => u.friendship_id !== friendshipId));
            showToast(`Unblocked ${userName}`);
        } catch (err) {
            console.error('Unblock error:', err);
            showToast('Failed to unblock user');
        }
    };

    const updateProfile = async (updates) => {
        try {
            const { error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', user.id);

            if (error) throw error;
            setUser({ ...user, ...updates });
            showToast("Profile updated successfully! ✅");
        } catch (error) {
            console.error("Error updating profile:", error);
            showToast("Failed to update profile ❌");
        }
    };

    const showToast = (msg) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(null), 3000);
    };

    const [showPrivacyMenu, setShowPrivacyMenu] = useState(false);
    const [activeModal, setActiveModal] = useState(null); // 'password' or 'delete'

    // Password Form State
    const [passForm, setPassForm] = useState({ current: '', new: '', confirm: '' });

    const handleChangePassword = async (e) => {
        e.preventDefault();
        
        // 1. Basic Validation
        if (passForm.new !== passForm.confirm) {
            showToast("New passwords do not match! ❌");
            return;
        }
        if (passForm.new.length < 6) {
            showToast("Password must be at least 6 characters ⚠️");
            return;
        }
        if (!passForm.current) {
            showToast("Please enter your current password 🔒");
            return;
        }

        try {
            // 2. Refresh Auth User to ensure we have the email (and session exists)
            const { data: { user: authUser }, error: userError } = await supabase.auth.getUser();
            if (userError || !authUser) throw new Error("Session expired. Please log in again.");

            // 3. Verify Current Password by attempting a sign-in
            // This is the standard pattern to "re-authenticate" before sensitive actions
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: authUser.email,
                password: passForm.current
            });

            if (signInError) {
                showToast("Current password is incorrect ❌");
                return;
            }

            // 4. Update to New Password
            const { error: updateError } = await supabase.auth.updateUser({ password: passForm.new });
            
            if (updateError) throw updateError;
            
            showToast("Password updated successfully! ✅");
            setActiveModal(null);
            setPassForm({ current: '', new: '', confirm: '' });
        } catch (error) {
            console.error(error);
            showToast(error.message || "Failed to update password");
        }
    };

    const handleDeleteAccount = async () => {
        if (window.confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
            try {
                // Delete account using secure RPC (deletes Auth User + Profile via cascade)
                const { error } = await supabase.rpc('delete_user');
                if (error) throw error;
                
                // Sign out
                await supabase.auth.signOut();
                localStorage.clear();
                window.location.href = '/login';
                localStorage.clear();
                navigate('/login');
            } catch (error) {
                console.error("Delete account error:", error);
                alert("Failed to delete account. Please try again.");
            }
        }
    };

    const [showNotifMenu, setShowNotifMenu] = useState(false);

    const handleMuteChange = (duration) => {
        // Update local state is tricky with nested JSON, so we reconstruct
        const newSettings = { ...user.mute_settings, message: duration };
        updateProfile({ mute_settings: newSettings });
    };

    if (loading) return <div style={{ color: 'white', padding: '20px' }}>Loading profile...</div>;
    if (!user) return null;

    return (
        <div className="profile-page">
            {showAvatarCreator && (
                <AvatarCreator 
                    onClose={() => setShowAvatarCreator(false)}
                    onAvatarExported={(pngUrl) => {
                        updateProfile({ avatar_url: pngUrl });
                        setShowAvatarCreator(false);
                    }}
                />
            )}
            {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
            {/* Ambient Background Gradient */}
            <div className="ambient-glow"></div>

            {/* Header Card */}
            <div className="profile-header-card">
                <div className="avatar-wrapper">
                    <img src={user.avatar_url || (() => {
                        const safeName = encodeURIComponent(user.username || user.full_name || 'User');
                        const gender = user.gender?.toLowerCase();
                        if (gender === 'male') return `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&hair=short01,short02,short03,short04,short05,short06,short07,short08&earringsProbability=0`;
                        if (gender === 'female') return `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&glassesProbability=0&mustacheProbability=0&beardProbability=0&hair=long01,long02,long03,long04,long05,long10,long12`;
                        return `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeName}`;
                    })()} alt="Avatar" className="profile-avatar" />
                    <button className="edit-avatar-badge" onClick={() => setShowAvatarCreator(true)}>
                        ✏️
                    </button>
                    <div className="status-indicator"></div>
                </div>
                <div className="profile-info">
                    <h1>{user.full_name || user.username}</h1>
                    <div className="tags-row">
                        {user.status && <span className="tag status">{user.status}</span>}
                    </div>
                </div>
                {/* Simple Edit for Name for now */}
                <button className="edit-btn" onClick={() => {
                    const newName = prompt("Enter full name:", user.full_name);
                    if (newName) updateProfile({ full_name: newName });
                }}>Edit</button>
            </div>

            <div className="scroll-content">
                {/* Section: Personal */}
                <div className="section-label">Personal</div>
                <div className="menu-group">
                    <MenuItem
                        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l8-4 8 4v14M9 10a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v11H9V10z"/></svg>}
                        label="Institute / Work"
                        value={user.institute || 'Add Institute'}
                        iconClass="icon-personal"
                        onClick={() => {
                            const inst = prompt("Enter your Institute Name:", user.institute || "");
                            if (inst) updateProfile({ institute: inst });
                        }}
                    />
                    <MenuItem 
                        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>}
                        label="Interests" 
                        value={user.interests?.join(', ') || 'Add interests'} 
                        iconClass="icon-interests"
                    />
                </div>

                {/* Section: App Settings */}
                <div className="section-label">Settings</div>
                <div className="menu-group">
                    <MenuItem
                        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>}
                        label="Notifications"
                        value={user.mute_settings?.message && user.mute_settings.message !== 'Never' ? `Muted: ${user.mute_settings.message}` : ''}
                        hasArrow={!showNotifMenu}
                        isExpanded={showNotifMenu}
                        iconClass="icon-notif"
                        onClick={() => setShowNotifMenu(!showNotifMenu)}
                    />

                    {showNotifMenu && (
                        <div className="inner-submenu">
                            <div className="submenu-hint">Mute messages for:</div>
                            <div className="chip-grid">
                                {['10 Minutes', '1 Hour', '24 Hours', 'Never'].map(dur => (
                                    <button
                                        key={dur}
                                        className={`chip-option ${user.mute_settings?.message === dur ? 'active' : ''}`}
                                        onClick={() => handleMuteChange(dur)}
                                    >
                                        {dur}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <MenuItem
                        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
                        label="Change Password"
                        hasArrow={false}
                        iconClass="icon-lock"
                        onClick={() => setActiveModal('password')}
                    />
                </div>

                {/* Section: Support & Safety */}
                <div className="section-label">Safety</div>
                <div className="menu-group">
                    <MenuItem 
                        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>}
                        label="Blocked Users" 
                        hasArrow 
                        iconClass="icon-block"
                        onClick={() => setShowBlockedModal(true)}
                    />
                    <MenuItem 
                        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>}
                        label="Safety Center" 
                        hasArrow 
                        iconClass="icon-safety"
                    />
                    <div className="divider" style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '0 16px' }}></div>
                    <MenuItem
                        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>}
                        label="Delete Account"
                        onClick={() => setActiveModal('delete')}
                        iconClass="icon-delete"
                        style={{ color: '#ff453a' }}
                    />
                </div>

                <button className="logout-btn" onClick={handleLogout}>
                    Log Out
                </button>

                <div className="version-info">RealMM v1.0.3</div>
            </div>

            {/* Modals */}
            {activeModal && (
                <div className="modal-backdrop">
                    <div className="modal-content">
                        {activeModal === 'password' && (
                            <>
                                <div className="modal-header">
                                    <div className="icon-wrapper desc-lock">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                    </div>
                                    <h3>Change Password</h3>
                                </div>
                                <form onSubmit={handleChangePassword} className="modal-form">
                                    <div className="input-group">
                                        <label>Current Password</label>
                                        <input 
                                            type="password" 
                                            placeholder="Enter current password"
                                            value={passForm.current} 
                                            onChange={e => setPassForm({ ...passForm, current: e.target.value })} 
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>New Password</label>
                                        <input 
                                            type="password" 
                                            placeholder="Enter new password"
                                            value={passForm.new} 
                                            onChange={e => setPassForm({ ...passForm, new: e.target.value })} 
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>Confirm Password</label>
                                        <input 
                                            type="password" 
                                            placeholder="Confirm new password"
                                            value={passForm.confirm} 
                                            onChange={e => setPassForm({ ...passForm, confirm: e.target.value })} 
                                        />
                                    </div>
                                    <div className="modal-footer">
                                        <button type="button" onClick={() => setActiveModal(null)} className="btn-sec">Cancel</button>
                                        <button type="submit" className="btn-pri">Update Password</button>
                                    </div>
                                </form>
                            </>
                        )}
                        {activeModal === 'delete' && (
                            <>
                                <div className="icon-warn">⚠️</div>
                                <h3 style={{ color: 'white' }}>Delete Account?</h3>
                                <p>This action is permanent and cannot be undone.</p>
                                <div className="modal-footer">
                                    <button onClick={() => setActiveModal(null)} className="btn-sec">Keep</button>
                                    <button onClick={handleDeleteAccount} className="btn-danger">Delete</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Blocked Users Modal */}
            {showBlockedModal && (
                <div className="modal-backdrop">
                    <div className="modal-content blocked-modal">
                        <h3>🚫 Blocked Users</h3>
                        {blockedUsers.length === 0 ? (
                            <p style={{ textAlign: 'center', color: '#888', padding: '20px' }}>
                                No blocked users
                            </p>
                        ) : (
                            <div className="blocked-list">
                                {blockedUsers.map(user => (
                                    <div key={user.friendship_id} className="blocked-user-item">
                                        <img 
                                            src={(() => {
                                                const safeName = encodeURIComponent(user.username || user.full_name || 'User');
                                                if (user.gender === 'Male') return `https://avatar.iran.liara.run/public/boy?username=${safeName}`;
                                                if (user.gender === 'Female') return `https://avatar.iran.liara.run/public/girl?username=${safeName}`;
                                                return `https://avatar.iran.liara.run/public?username=${safeName}`;
                                            })()} 
                                            alt={user.full_name} 
                                            className="blocked-avatar"
                                        />
                                        <div className="blocked-info">
                                            <strong>{user.full_name || user.username}</strong>
                                        </div>
                                        <button 
                                            className="unblock-btn"
                                            onClick={() => handleUnblock(user.friendship_id, user.full_name || user.username)}
                                        >
                                            Unblock
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="modal-footer">
                            <button onClick={() => setShowBlockedModal(false)} className="btn-sec">Close</button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                :root {
                    --glass-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
                    --glass-border: rgba(255, 255, 255, 0.2);
                    --glass-highlight: rgba(255, 255, 255, 0.4);
                    --bg-primary: #0a0a0a;
                    --text-primary: #ffffff;
                    --text-secondary: #b0b0b0;
                    --accent-cyan: #00d4ff;
                    --accent-gradient: linear-gradient(135deg, #00C6FF, #0072FF);
                }

                .profile-page {
                    min-height: 100vh;
                    background: radial-gradient(ellipse at top, #1a1a2e 0%, var(--bg-primary) 50%);
                    color: var(--text-primary);
                    padding-bottom: 80px;
                    position: relative;
                    overflow-x: hidden;
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }

                /* Ambient Glow */
                .ambient-glow {
                    position: absolute; top: -150px; left: 50%; transform: translateX(-50%);
                    width: 500px; height: 500px;
                    background: radial-gradient(circle, rgba(0, 198, 255, 0.15) 0%, transparent 70%);
                    pointer-events: none; z-index: 0;
                    filter: blur(60px);
                }

                /* Glass Header Card with Highlights */
                .profile-header-card {
                    margin: 15px;
                    margin-top: 50px;
                    background: transparent; /* Removed background */
                    border: none; /* Removed border */
                    padding: 35px 25px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                    gap: 18px;
                    position: relative;
                    z-index: 1;
                    box-shadow: none; /* Removed shadow */
                }

                /* Top highlight bar removed */

                .avatar-wrapper { 
                    position: relative;
                    padding: 0; /* Removed padding */
                    background: transparent; /* Removed blue gradient */
                    border-radius: 50%;
                    box-shadow: none; /* Removed blue glow */
                }

                .profile-avatar {
                    width: 90px; height: 90px; border-radius: 50%; object-fit: cover;
                    border: 3px solid var(--bg-primary);
                    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
                }

                .status-indicator {
                    position: absolute; bottom: 8px; right: 8px;
                    width: 16px; height: 16px; 
                    background: #00ff88;
                    border: 3px solid var(--bg-primary); 
                    border-radius: 50%;
                    box-shadow: 0 0 12px rgba(0, 255, 136, 0.8);
                }

                .profile-info { display: flex; flex-direction: column; align-items: center; }
                .profile-info h1 { 
                    margin: 0; font-size: 1.6rem; font-weight: 700; margin-bottom: 8px;
                    color: var(--text-primary);
                    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
                }

                .tags-row { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
                .tag {
                    font-size: 0.8rem; padding: 6px 14px; border-radius: 14px;
                    background: linear-gradient(135deg, rgba(0, 198, 255, 0.2), rgba(0, 198, 255, 0.1));
                    border: 1px solid rgba(0, 198, 255, 0.4);
                    color: var(--accent-cyan);
                    font-weight: 600;
                    backdrop-filter: blur(10px);
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
                }

                .edit-btn {
                    position: absolute; top: 18px; right: 18px;
                    padding: 8px 16px; border-radius: 18px;
                    background: linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.08));
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255,255,255,0.25);
                    color: white;
                    font-size: 0.85rem; font-weight: 600;
                    cursor: pointer; transition: all 0.2s;
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3);
                }
                .edit-btn:hover { 
                    background: linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.12));
                    border-color: var(--accent-cyan);
                    box-shadow: 
                        inset 0 1px 0 rgba(255, 255, 255, 0.4),
                        0 0 12px rgba(0, 212, 255, 0.3);
                }
                .edit-btn:active { transform: scale(0.96); }

                .scroll-content { 
                    padding: 0 15px; z-index: 1; position: relative; 
                    display: flex; flex-direction: column; gap: 12px; 
                }

                .section-label {
                    margin: 24px 0 10px 8px;
                    font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1.5px;
                    color: var(--accent-cyan); font-weight: 700;
                    text-shadow: 0 0 8px rgba(0, 212, 255, 0.6);
                }

                /* Glass Menu Groups with Highlights */
                .menu-group {
                    background: rgba(30, 30, 30, 0.6);
                    backdrop-filter: blur(20px) saturate(180%);
                    -webkit-backdrop-filter: blur(20px) saturate(180%);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 16px;
                    overflow: hidden;
                    box-shadow: 0 4px 24px rgba(0,0,0,0.2);
                    margin-bottom: 24px;
                }

                .menu-item {
                    display: flex; align-items: center; padding: 16px;
                    cursor: pointer; transition: background 0.2s;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    position: relative;
                }
                .menu-item:last-child { border-bottom: none; }
                .menu-item:hover { 
                    background: rgba(255,255,255,0.05);
                }
                .menu-item:active { background: rgba(255,255,255,0.08); }

                .menu-icon-wrapper {
                    width: 32px; height: 32px; border-radius: 8px;
                    display: flex; align-items: center; justify-content: center;
                    margin-right: 14px;
                    color: white; font-size: 1.1rem;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                }

                .menu-content { flex: 1; display: flex; flex-direction: column; justify-content: center; }
                .menu-label { font-size: 1rem; color: #fff; font-weight: 500; }
                .menu-value { font-size: 0.85rem; color: #888; margin-top: 2px; }
                .menu-chevron { 
                    color: #555; font-size: 1.1rem; 
                    transform: rotate(0deg); transition: transform 0.3s;
                }
                .menu-chevron.expanded { transform: rotate(90deg); }

                /* Specific Icon Gradients */
                .icon-personal { background: linear-gradient(135deg, #00C6FF, #0072FF); }
                .icon-interests { background: linear-gradient(135deg, #FF512F, #DD2476); }
                .icon-notif { background: linear-gradient(135deg, #F09819, #EDDE5D); }
                .icon-lock { background: linear-gradient(135deg, #434343, #000000); border: 1px solid rgba(255,255,255,0.2); }
                .icon-block { background: linear-gradient(135deg, #FF416C, #FF4B2B); }
                .icon-safety { background: linear-gradient(135deg, #11998e, #38ef7d); }
                .icon-delete { background: rgba(255, 69, 58, 0.15); color: #ff453a; }

                /* Glass Submenu */
                .inner-submenu {
                    background: rgba(0, 0, 0, 0.3);
                    padding: 16px;
                    border-top: 1px solid rgba(255,255,255,0.05);
                }
                .submenu-hint { 
                    font-size: 0.8rem; color: #aaa; margin-bottom: 12px; 
                    font-weight: 500;
                }
                .chip-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
                .chip-option {
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1);
                    color: #aaa; 
                    padding: 8px 4px; border-radius: 8px;
                    font-size: 0.75rem; 
                    cursor: pointer; transition: all 0.2s;
                }
                .chip-option:hover { background: rgba(255,255,255,0.1); color: white; }
                .chip-option.active { 
                    background: var(--accent-gradient); 
                    color: white; border-color: transparent; 
                    box-shadow: 0 4px 12px rgba(0, 114, 255, 0.3);
                }

                .logout-btn {
                    width: 100%; padding: 16px; border-radius: 16px;
                    background: rgba(255, 69, 58, 0.1);
                    border: 1px solid rgba(255, 69, 58, 0.3);
                    color: #ff453a; font-weight: 600; font-size: 1rem;
                    cursor: pointer; margin-top: 10px; margin-bottom: 30px;
                    transition: all 0.2s;
                }
                .logout-btn:hover { background: rgba(255, 69, 58, 0.2); }
                
                .version-info { text-align: center; color: #444; font-size: 0.75rem; padding-bottom: 20px; }

                /* Modal Styles */
                .modal-backdrop {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.8); backdrop-filter: blur(12px);
                    z-index: 10000; display: flex; align-items: center; justify-content: center;
                    animation: fadeIn 0.3s ease;
                }
                .modal-content {
                    background: rgba(30,30,30,0.85); 
                    backdrop-filter: blur(25px) saturate(180%);
                    -webkit-backdrop-filter: blur(25px) saturate(180%);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 24px; padding: 32px; width: 90%; max-width: 380px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.6);
                    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    display: flex; flex-direction: column; gap: 20px;
                }
                
                .modal-header { display: flex; align-items: center; gap: 15px; margin-bottom: 5px; }
                .icon-wrapper {
                    width: 44px; height: 44px; border-radius: 12px;
                    background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05));
                    display: flex; align-items: center; justify-content: center;
                    color: white; border: 1px solid rgba(255,255,255,0.1);
                }
                .desc-lock { color: #00d4ff; box-shadow: 0 0 15px rgba(0, 212, 255, 0.2); }
                
                .modal-content h3 { margin: 0; color: white; font-size: 1.3rem; font-weight: 600; }
                
                .modal-form { display: flex; flex-direction: column; gap: 16px; }
                
                .input-group { display: flex; flex-direction: column; gap: 8px; text-align: left; }
                .input-group label { font-size: 0.85rem; color: #aaa; font-weight: 500; margin-left: 4px; }
                .input-group input {
                    width: 100%; padding: 14px 16px;
                    background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 12px; color: white; font-size: 0.95rem; outline: none;
                    transition: all 0.2s;
                }
                .input-group input:focus { 
                    border-color: #0072ff; background: rgba(0, 114, 255, 0.05); 
                    box-shadow: 0 0 0 3px rgba(0, 114, 255, 0.15);
                }

                .modal-footer { display: flex; justify-content: flex-end; gap: 12px; margin-top: 10px; }
                .btn-sec { 
                    background: transparent; color: #888; border: none; padding: 12px 18px; 
                    cursor: pointer; font-size: 0.95rem; font-weight: 500; transition: color 0.2s;
                }
                .btn-sec:hover { color: white; }
                
                .btn-pri { 
                    box-shadow: 
                        0 4px 12px rgba(255, 69, 58, 0.3),
                        inset 0 1px 0 rgba(255, 255, 255, 0.3);
                }
                .btn-danger:hover { 
                    box-shadow: 
                        0 6px 16px rgba(255, 69, 58, 0.4),
                        inset 0 1px 0 rgba(255, 255, 255, 0.4);
                }
                .modal-footer button:active { transform: scale(0.96); }

                .icon-warn { 
                    font-size: 3rem; margin-bottom: 8px; display: block;
                }
            `}</style>
        </div>
    );
}

function MenuItem({ icon, label, value, hasArrow, isExpanded, onClick, style, iconClass }) {
    return (
        <div className="menu-item" onClick={onClick} style={style}>
            <span className={`menu-icon-wrapper ${iconClass || ''}`}>{icon}</span>
            <div className="menu-content">
                <span className="menu-label">{label}</span>
                {value && <span className="menu-value">{value}</span>}
            </div>
            {hasArrow && <span className={`menu-chevron ${isExpanded ? 'expanded' : ''}`}>›</span>}
        </div>
    );
}
