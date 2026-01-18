import React, { useEffect, useState, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Toast from '../components/Toast';
import Avatar3D from '../components/Avatar3D';
import AvatarEditor from '../components/AvatarEditor';
import { useTheme } from '../context/ThemeContext';
import { useLocationContext } from '../context/LocationContext';

export default function Profile() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const [toastMsg, setToastMsg] = useState(null);
    const [blockedUsers, setBlockedUsers] = useState([]);
    const [showBlockedModal, setShowBlockedModal] = useState(false);
    const [showAvatarEditor, setShowAvatarEditor] = useState(false);
    const [showThemeMenu, setShowThemeMenu] = useState(false);
    const { theme, updateTheme } = useTheme();
    const { isLocationEnabled, resetPermission, setPermission } = useLocationContext();

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

            // Self-Healing (Legacy check removed for brevity, assuming established users or fresh setup)
            // Note: Keeping existing self-healing if needed but simplifying for readability in this update
            
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
            // Updated to use manual join to ensure correct profile is fetched
            // 1. Get the list of blocked IDs
            const { data: blocks, error: blocksError } = await supabase
                .from('blocks')
                .select('id, blocked_id')
                .eq('blocker_id', userId);

            if (blocksError) throw blocksError;

            if (!blocks || blocks.length === 0) {
                setBlockedUsers([]);
                return;
            }

            const blockedIds = blocks.map(b => b.blocked_id);

            // 2. Fetch the actual profiles for these IDs
            const { data: profiles, error: profilesError } = await supabase
                .from('profiles')
                .select('id, full_name, username, gender, avatar_url')
                .in('id', blockedIds);

            if (profilesError) throw profilesError;

            // 3. Map back to include the block_id for unblocking
            const combinedData = profiles.map(profile => {
                const blockRecord = blocks.find(b => b.blocked_id === profile.id);
                return {
                    block_id: blockRecord?.id,
                    ...profile
                };
            });

            setBlockedUsers(combinedData);

        } catch (err) {
            console.error('Error fetching blocked users:', err);
        }
    };

    const handleUnblock = async (blockId, userName) => {
        try {
            const { error } = await supabase
                .from('blocks')
                .delete()
                .eq('id', blockId);

            if (error) throw error;

            setBlockedUsers(prev => prev.filter(u => u.block_id !== blockId));
            showToast(`Unblocked ${userName}`);
        } catch (err) {
            console.error('Unblock error:', err);
            showToast('Failed to unblock user');
        }
    };

    const blockUser = async (userId, userName) => {
        try {
            const { error } = await supabase
                .from('blocks')
                .insert({
                    blocker_id: user.id,
                    blocked_id: userId
                });

            if (error) throw error;

            // Refresh blocked users list
            await fetchBlockedUsers(user.id);
            showToast(`Blocked ${userName}`);
        } catch (err) {
            console.error('Block error:', err);
            showToast('Failed to block user');
        }
    };


    const updateProfile = async (updates) => {
        // OPTIMISTIC UPDATE: Update local state + LocalStorage immediately
        const previousUser = { ...user };
        const updatedUser = { ...user, ...updates };
        
        console.log('🟣 [Profile] updateProfile called with:', updates);
        console.log('🟣 [Profile] Current user ID:', user.id);
        
        setUser(updatedUser);
        localStorage.setItem('currentUser', JSON.stringify(updatedUser)); // Sync for MapHome
        window.dispatchEvent(new Event('local-user-update')); // Broadcast change to MapHome

        try {
            console.log('🟣 [Profile] Attempting database update...');
            const { error, data } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', user.id);

            if (error) {
                console.error('🟣 [Profile] Database update ERROR:', error);
                throw error;
            }
            console.log('🟣 [Profile] Database update SUCCESS:', data);
            showToast("Profile updated successfully! ✅");
        } catch (error) {
            console.error("🟣 [Profile] Error updating profile:", error);
            // Revert state on failure
            setUser(previousUser);
            localStorage.setItem('currentUser', JSON.stringify(previousUser));
            showToast("Failed to update profile ❌");
        }
    };

    const handleAvatarSave = (url) => {
        setShowAvatarEditor(false);
        // Append unique timestamp to force cache invalidation for 3D viewers
        // Handle existing query params from AvatarEditor
        const separator = url.includes('?') ? '&' : '?';
        const timestampedUrl = `${url}${separator}t=${Date.now()}`;
        console.log('🔵 [Profile] Avatar Save - Original URL:', url);
        console.log('🔵 [Profile] Avatar Save - Timestamped URL:', timestampedUrl);
        updateProfile({ avatar_url: timestampedUrl });
    };

    const showToast = (msg) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(null), 3000);
    };

    const [showPrivacyMenu, setShowPrivacyMenu] = useState(false);
    const [activeModal, setActiveModal] = useState(null); // 'password' or 'delete'
    const [showPublicConfirm, setShowPublicConfirm] = useState(false);

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

    const is3DAvatar = user.avatar_url?.includes('.glb');

    return (
        <div className="profile-page">
            {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
            
            {showAvatarEditor && (
                <AvatarEditor 
                    onSave={handleAvatarSave} 
                    onClose={() => setShowAvatarEditor(false)} 
                />
            )}

            {/* Header Card */}
            <div className={`profile-header-card ${is3DAvatar ? 'expanded-3d' : ''}`}>
                <div className={`avatar-wrapper ${is3DAvatar ? 'wrapper-3d' : ''}`}>
                    {is3DAvatar ? (
                        <div className="avatar-3d-container">
                             <Avatar3D url={user.avatar_url} key={user.avatar_url} />
                             {/* Customize button moved to detailed info section */}
                        </div>
                    ) : (
                        <>
                            <img src={(() => {
                                // Fallback logic for old avatars
                                const safeName = encodeURIComponent(user.username || user.full_name || 'User');
                                const gender = user.gender?.toLowerCase();
                                if (user.avatar_url) return user.avatar_url; // Use existing if not 3D
                                if (gender === 'male') return `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&hair=short01,short02,short03,short04,short05,short06,short07,short08&earringsProbability=0`;
                                if (gender === 'female') return `https://api.dicebear.com/9.x/adventurer/svg?seed=${safeName}&glassesProbability=0&mustacheProbability=0&beardProbability=0&hair=long01,long02,long03,long04,long05,long10,long12`;
                                return `https://api.dicebear.com/7.x/avataaars/svg?seed=${safeName}`;
                            })()} alt="Avatar" className="profile-avatar" />
                            {/* Edit Overlay Removed */}
                            <div className="status-indicator"></div>
                        </>
                    )}
                </div>
                
                <div className="profile-info">
                    <div className="profile-username">@{user.username || user.full_name?.toLowerCase().replace(/\s/g, '')}</div>
                    <div className="tags-row">
                        {user.status && !user.hide_status && <span className="tag status">{user.status}</span>}
                        
                        {/* Edit Avatar Button - Always visible, right of status */}
                        <button 
                            onClick={() => setShowAvatarEditor(true)}
                            className="edit-avatar-btn-inline"
                            title="Change Avatar"
                        >
                            ✏️
                        </button>
                    </div>
                    {/* Location Warning */}
                    {!isLocationEnabled && (
                        <div className="location-warning-badge">
                            <span>📍 Location is disabled</span>
                            <button onClick={() => { resetPermission(); navigate('/map'); }}>
                                Enable
                            </button>
                        </div>
                    )}
                    {/* Bio Section */}
                    <div className={`profile-bio ${!user.bio ? 'empty':''}`} onClick={() => setActiveModal('edit-bio')}>
                        {user.bio || "Ready for adventure 🌎"}
                    </div>
                </div>
                {/* Edit Username Button */}
                <button className="edit-btn" onClick={() => setActiveModal('edit-name')}>Edit Username</button>
            </div>


            <div className="scroll-content">
                {/* Section: Personal */}
                <div className="section-label">Personal</div>
                <div className="menu-group">
                    <MenuItem
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l8-4 8 4v14M9 10a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v11H9V10z"/></svg>}
                        label="Institute / Work"
                        value={user.institute || 'Add Institute / Work'} 
                        iconClass="icon-personal"
                        onClick={() => setActiveModal('edit-institute')}
                    />
                    <MenuItem
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>}
                        label="Interests" 
                        value={user.interests?.join(', ') || 'Add interests'} 
                        iconClass="icon-interests"
                        onClick={() => setActiveModal('edit-interests')}
                    />
                    <div className="menu-item toggle-item">
                        <span className="menu-icon-wrapper icon-interests">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </span>
                        <div className="menu-content">
                            <span className="menu-label">Hide Status</span>
                        </div>
                        <label className="toggle-switch">
                            <input 
                                type="checkbox" 
                                checked={user.hide_status || false}
                                onChange={async (e) => {
                                    console.log('🔵 Toggle hide_status:', e.target.checked);
                                    await updateProfile({ hide_status: e.target.checked });
                                    console.log('✅ Updated hide_status to:', e.target.checked);
                                }}
                            />
                            <span className="toggle-slider"></span>
                        </label>
                    </div>
                    <div className="menu-item toggle-item">
                        <span className="menu-icon-wrapper icon-interests">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        </span>
                        <div className="menu-content">
                            <span className="menu-label">Show Last Seen</span>
                            <span className="menu-hint" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>If turned off, you won't see others' status either</span>
                        </div>
                        <label className="toggle-switch">
                            <input 
                                type="checkbox" 
                                checked={user.show_last_seen !== false}
                                onChange={async (e) => {
                                    await updateProfile({ show_last_seen: e.target.checked });
                                }}
                            />
                            <span className="toggle-slider"></span>
                        </label>
                    </div>
                    <MenuItem
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>}
                        label="Birthday"
                        value={user.birth_date ? new Date(user.birth_date).toLocaleDateString() : 'Add Birthday'}
                        iconClass="icon-birthday"

                        onClick={() => setActiveModal('edit-birthday')}
                    />
                </div>

                <div className="section-label">Settings</div>
                <div className="menu-group">
                    <div className="menu-item toggle-item">
                        <span className="menu-icon-wrapper icon-lock" style={{ background: 'rgba(52, 199, 89, 0.15)', color: '#34C759' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        </span>
                        <div className="menu-content">
                            <span className="menu-label">Public Profile</span>
                            <span className="menu-hint" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                {user.is_public !== false ? 'Visible to everyone' : 'Friends only'}
                            </span>
                        </div>
                        <label className="toggle-switch">
                            <input 
                                type="checkbox" 
                                checked={user.is_public !== false}
                                onChange={async (e) => {
                                    const newValue = e.target.checked;
                                    if (newValue) {
                                        // Turning Public -> Confirm first
                                        setShowPublicConfirm(true);
                                    } else {
                                        // Turning Private -> Immediate
                                        await updateProfile({ is_public: false });
                                    }
                                }}
                            />
                            <span className="toggle-slider"></span>
                        </label>
                    </div>

                    <div className="menu-item toggle-item">
                        <span className="menu-icon-wrapper icon-location" style={{ background: 'rgba(0, 198, 255, 0.15)', color: '#00C6FF' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        </span>
                        <div className="menu-content">
                            <span className="menu-label">Location Services</span>
                            <span className="menu-hint" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                {isLocationEnabled ? 'Visible on map' : 'Location hidden'}
                            </span>
                        </div>
                        <label className="toggle-switch">
                            <input 
                                type="checkbox" 
                                checked={isLocationEnabled}
                                onChange={(e) => {
                                    if (e.target.checked) {
                                        setPermission('granted');
                                    } else {
                                        setPermission('denied');
                                    }
                                }}
                            />
                            <span className="toggle-slider"></span>
                        </label>
                    </div>

                    <MenuItem
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>}
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
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>}
                        label="Theme"
                        value={theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System (Auto)'}
                        hasArrow={!showThemeMenu}
                        isExpanded={showThemeMenu}
                        iconClass="icon-notif"
                        onClick={() => setShowThemeMenu(!showThemeMenu)}
                    />

                    {showThemeMenu && (
                        <div className="inner-submenu">
                            <div className="submenu-hint">Choose your theme:</div>
                            <div className="chip-grid">
                                {['light', 'dark'].map(themeOption => (
                                    <button
                                        key={themeOption}
                                        className={`chip-option ${theme === themeOption ? 'active' : ''}`}
                                        onClick={() => updateTheme(themeOption)}
                                    >
                                        {themeOption === 'light' ? '☀️ Light' : '🌙 Dark'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    <MenuItem
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>}
                        label="Chat Wallpaper"
                        hasArrow
                        iconClass="icon-interests"
                        onClick={() => setActiveModal('wallpaper')}
                    />

                    <MenuItem
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
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
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>}
                        label="Blocked Users" 
                        hasArrow 
                        iconClass="icon-block"
                        onClick={() => setShowBlockedModal(true)}
                    />
                    <MenuItem 
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>}
                        label="Safety Center" 
                        hasArrow 
                        iconClass="icon-safety"
                    />
                    <div className="divider" style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '0 16px' }}></div>
                    <MenuItem
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>}
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

            {/* Public Profile Confirmation Modal */}
            {showPublicConfirm && (
                <div className="modal-backdrop">
                    <div className="modal-content">
                        <div className="modal-header">
                            <div className="icon-wrapper desc-lock">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            </div>
                            <h3>Go Public?</h3>
                        </div>
                        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', lineHeight: '1.5', margin: 0 }}>
                            Everyone can see your profile and status.
                        </p>
                        <div className="modal-footer">
                            <button className="btn-sec" onClick={() => setShowPublicConfirm(false)}>Cancel</button>
                            <button className="btn-pri" onClick={async () => {
                                await updateProfile({ is_public: true });
                                setShowPublicConfirm(false);
                            }}>Public</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modals */}
            {activeModal && (
                <div className="modal-backdrop">
                    <div className="modal-content">
                        {activeModal === 'edit-name' && (
                            <>
                                <div className="modal-header">
                                    <div className="icon-wrapper desc-lock">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                    </div>
                                    <h3>Edit Username</h3>
                                </div>
                                <form onSubmit={(e) => {
                                    e.preventDefault();
                                    const formData = new FormData(e.target);
                                    const newUsername = formData.get('username');
                                    if (newUsername && newUsername.trim()) {
                                        updateProfile({ username: newUsername.trim().toLowerCase().replace(/\s/g, '') });
                                        setActiveModal(null);
                                    }
                                }} className="modal-form">
                                    <div className="input-group">
                                        <label>Username (without @)</label>
                                        <input 
                                            type="text" 
                                            name="username"
                                            placeholder="username"
                                            defaultValue={user.username || user.full_name?.toLowerCase().replace(/\s/g, '')}
                                            autoFocus
                                            required
                                            pattern="[a-z0-9_]+"
                                            title="Only lowercase letters, numbers, and underscores allowed"
                                        />
                                    </div>
                                    <div className="modal-footer">
                                        <button type="button" onClick={() => setActiveModal(null)} className="btn-sec">Cancel</button>
                                        <button type="submit" className="btn-pri">Save Username</button>
                                    </div>
                                </form>
                            </>
                        )}
                        {activeModal === 'password' && (
                            <>
                                <div className="modal-header">
                                    <div className="icon-wrapper desc-lock">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
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



                        {activeModal === 'edit-bio' && (
                            <>
                                <div className="modal-header">
                                    <div className="icon-wrapper icon-bio">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                            <polyline points="14 2 14 8 20 8"></polyline>
                                            <line x1="16" y1="13" x2="8" y2="13"></line>
                                            <line x1="16" y1="17" x2="8" y2="17"></line>
                                            <polyline points="10 9 9 9 8 9"></polyline>
                                        </svg>
                                    </div>
                                    <h3>Edit Bio</h3>
                                </div>
                                <form onSubmit={(e) => {
                                    e.preventDefault();
                                    updateProfile({ bio: e.target.elements.bio.value });
                                    setActiveModal(null);
                                }} className="modal-form">
                                    <div className="input-group">
                                        <label>About You</label>
                                        <textarea 
                                            name="bio" 
                                            defaultValue={user.bio} 
                                            placeholder="Tell us about yourself..." 
                                            rows="4"
                                            maxLength="200"
                                            autoFocus 
                                            className="bio-textarea"
                                        />
                                        <div className="char-counter">
                                            {user.bio?.length || 0}/200 characters
                                        </div>
                                    </div>
                                    <div className="modal-footer">
                                        <button type="button" onClick={() => setActiveModal(null)} className="btn-sec">Cancel</button>
                                        <button type="submit" className="btn-pri">Save Bio</button>
                                    </div>
                                </form>
                            </>
                        )}
                        
                        {activeModal === 'edit-institute' && (
                            <>
                                <div className="modal-header"><h3>Edit Institute / Work</h3></div>
                                <form onSubmit={(e) => {
                                    e.preventDefault();
                                    updateProfile({ institute: e.target.elements.inst.value });
                                    setActiveModal(null);
                                }} className="modal-form">
                                    <div className="input-group">
                                        <label>Institute / Workspace</label>
                                        <input name="inst" defaultValue={user.institute} placeholder="e.g. MIT, Google" autoFocus />
                                    </div>
                                    <div className="modal-footer">
                                        <button type="button" onClick={() => setActiveModal(null)} className="btn-sec">Cancel</button>
                                        <button type="submit" className="btn-pri">Save</button>
                                    </div>
                                </form>
                            </>
                        )}
                        {activeModal === 'edit-interests' && (
                            <>
                                <div className="modal-header"><h3>Edit Interests</h3></div>
                                <form onSubmit={(e) => {
                                    e.preventDefault();
                                    updateProfile({ interests: e.target.elements.interests.value.split(',').map(s => s.trim()).filter(Boolean) });
                                    setActiveModal(null);
                                }} className="modal-form">
                                    <div className="input-group">
                                        <label>Interests (comma separated)</label>
                                        <input name="interests" defaultValue={user.interests?.join(', ')} placeholder="singing, coding, hiking" autoFocus />
                                    </div>
                                    <div className="modal-footer">
                                        <button type="button" onClick={() => setActiveModal(null)} className="btn-sec">Cancel</button>
                                        <button type="submit" className="btn-pri">Save</button>
                                    </div>
                                </form>
                            </>
                        )}
                        {activeModal === 'edit-birthday' && (
                            <>
                                <div className="modal-header"><h3>Edit Birthday</h3></div>
                                <form onSubmit={(e) => {
                                    e.preventDefault();
                                    updateProfile({ birth_date: e.target.elements.bday.value });
                                    setActiveModal(null);
                                }} className="modal-form">
                                    <div className="input-group">
                                        <label>Select Date</label>
                                        <input 
                                            type="date" 
                                            name="bday" 
                                            defaultValue={user.birth_date} 
                                            style={{ colorScheme: 'dark' }} // Force dark calendar
                                            onClick={(e) => e.target.showPicker && e.target.showPicker()} // Force open
                                        />
                                    </div>
                                    <div className="modal-footer">
                                        <button type="button" onClick={() => setActiveModal(null)} className="btn-sec">Cancel</button>
                                        <button type="submit" className="btn-pri">Save</button>
                                    </div>
                                </form>
                            </>
                        )}
                        {activeModal === 'wallpaper' && (
                            <>
                                <div className="modal-header">
                                    <h3>Chat Wallpaper</h3>
                                </div>
                                <div className="wallpaper-grid">
                                    {[
                                        { name: 'Default', value: '' }, // Null/Empty = Default Theme
                                        { name: 'Sunset', value: 'linear-gradient(to bottom, #ff7e5f, #feb47b)' },
                                        { name: 'Ocean', value: 'linear-gradient(to bottom, #2b5876, #4e4376)' },
                                        { name: 'Forest', value: 'linear-gradient(to bottom, #134e5e, #71b280)' },
                                        { name: 'Cyber', value: 'linear-gradient(to bottom, #0f0c29, #302b63, #24243e)' },
                                        { name: 'Love', value: 'linear-gradient(to bottom, #DA4453, #89216B)' },
                                    ].map(wp => (
                                        <div 
                                            key={wp.name}
                                            className={`wallpaper-option ${user.chat_background === wp.value ? 'active' : ''}`}
                                            style={{ background: wp.value || '#333' }}
                                            onClick={() => {
                                                updateProfile({ chat_background: wp.value });
                                                setActiveModal(null);
                                            }}
                                        >
                                            {user.chat_background === wp.value && <span className="check-icon">✓</span>}
                                        </div>
                                    ))}
                                </div>
                                <div className="modal-footer">
                                    <button onClick={() => setActiveModal(null)} className="btn-sec">Cancel</button>
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
                                    <div key={user.block_id} className="blocked-user-item">
                                        <img 
                                            src={user.avatar_url || (() => {
                                                const safeName = encodeURIComponent(user.username || user.full_name || 'User');
                                                if (user.gender === 'Male') return `https://avatar.iran.liara.run/public/boy?username=${safeName}`;
                                                if (user.gender === 'Female') return `https://avatar.iran.liara.run/public/girl?username=${safeName}`;
                                                return `https://avatar.iran.liara.run/public?username=${safeName}`;
                                            })()} 
                                            alt={user.full_name} 
                                            className="blocked-avatar"
                                        />
                                        <div className="blocked-info">
                                            <strong>@{user.username || user.full_name?.toLowerCase().replace(/\s/g, '')}</strong>
                                        </div>
                                        <button 
                                            className="unblock-btn"
                                            onClick={() => handleUnblock(user.block_id, user.full_name || user.username)}
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
                    /* Light Professional Theme */
                    --card-bg: #ffffff;
                    --card-bg-hover: #f5f3f0;
                    --bg-dark: #faf8f5;
                    --border-subtle: #e5e5ea;
                    --text-primary: #1d1d1f;
                    --text-secondary: #6e6e73;
                    --accent-cyan: #0084ff;
                }

                .profile-page {
                    min-height: 100vh;
                    background: var(--bg-color);
                    color: var(--text-primary);
                    padding-bottom: 80px;
                    position: relative;
                    overflow-x: hidden;
                    font-family: 'Inter', -apple-system, sans-serif;
                }

                /* Removed Ambient Glow */
                .ambient-glow { display: none; }

                /* Header Card */
                .profile-header-card {
                    margin: 15px; margin-top: 20px;
                    background: transparent;
                    border: none;
                    padding: 20px 25px;
                    display: flex; flex-direction: column; align-items: center;
                    text-align: center; gap: 18px;
                    position: relative; z-index: 1;
                }

                .avatar-wrapper { 
                    position: relative; padding: 0; background: transparent; 
                    border-radius: 50%;
                }

                .profile-avatar {
                    width: 64px; height: 64px; border-radius: 50%; object-fit: cover;
                    border: 3px solid #ffffff;
                    box-shadow: 0 4px 16px rgba(0,0,0,0.1);
                }

                .status-indicator {
                    position: absolute; bottom: 4px; right: 4px;
                    width: 14px; height: 14px; 
                    background: #00ff88;
                    border: 2px solid #ffffff;
                    border-radius: 50%;
                }

                .profile-info { display: flex; flex-direction: column; align-items: center; }
                .profile-info h1 { 
                    margin: 0; font-size: 1.8rem; font-weight: 700; margin-bottom: 8px;
                    color: var(--text-primary);
                }
                
                .profile-username {
                    font-size: 1.8rem;
                    font-weight: 700;
                    background: linear-gradient(135deg, #00C6FF 0%, #0072FF 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                    margin-bottom: 12px;
                    letter-spacing: 0.5px;
                }

                .tags-row { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-bottom: 12px; }
                .tag {
                    font-size: 0.8rem; padding: 6px 14px; border-radius: 14px;
                    background: rgba(0, 212, 255, 0.1); 
                    border: 1px solid rgba(0, 212, 255, 0.3);
                    color: var(--accent-cyan);
                    font-weight: 600;
                }
                .edit-avatar-btn-inline {
                    width: 32px; height: 32px;
                    border-radius: 50%;
                    background: var(--accent-cyan);
                    color: white;
                    border: 2px solid white;
                    box-shadow: 0 4px 10px rgba(0, 132, 255, 0.3);
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer;
                    font-size: 0.9rem;
                    transition: all 0.2s;
                    margin-left: 8px; /* Ensure spacing from tag */
                }
                .edit-avatar-btn-inline:hover {
                    transform: scale(1.1);
                    background: #0077e6;
                }

                .profile-bio {
                    font-size: 0.95rem; color: var(--text-primary); /* Brighter text */
                    font-weight: 600; /* Bold */
                    max-width: 85%; 
                    white-space: pre-wrap; word-break: break-word; /* Allow multi-line */
                    cursor: pointer; padding: 6px 14px; border-radius: 10px;
                    transition: background 0.2s;
                    margin-top: 6px;
                    text-align: center;
                }
                .profile-bio:hover { background: rgba(0,0,0,0.05); color: #1d1d1f; }
                .profile-bio.empty { font-style: italic; opacity: 0.6; }

                .edit-btn {
                    position: absolute; top: 0; right: 0;
                    padding: 8px 16px; border-radius: 20px;
                    background: #333;
                    border: none; color: white;
                    font-size: 0.85rem; font-weight: 600;
                    cursor: pointer; transition: all 0.2s;
                }
                .edit-btn:hover { background: #444; color: white; }
                .edit-btn:active { transform: scale(0.96); }

                .scroll-content { 
                    padding: 0 15px; 
                    z-index: 1; 
                    position: relative; 
                    display: flex; 
                    flex-direction: column; 
                    gap: 8px; 
                }

                /* Modern Section Labels */
                .section-label {
                    margin: 24px 0 12px 4px;
                    font-size: 0.8rem; 
                    text-transform: uppercase; 
                    letter-spacing: 1.2px;
                    color: rgba(0, 0, 0, 0.6);
                    font-weight: 800;
                    position: relative;
                    padding-left: 12px;
                }
                
                .section-label::before {
                    content: '';
                    position: absolute;
                    left: 0;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 3px;
                    height: 14px;
                    background: linear-gradient(180deg, #00d4ff, #0072ff);
                    border-radius: 2px;
                }

                .menu-group {
                    background: transparent;
                    backdrop-filter: none;
                    -webkit-backdrop-filter: none;
                    border-radius: 0;
                    overflow: hidden;
                    margin-bottom: 16px;
                    border: none;
                    box-shadow: none;
                }

                .menu-item {
                    display: flex; 
                    align-items: center; 
                    padding: 12px 16px;
                    cursor: pointer; 
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    border-bottom: 1px solid rgba(0, 0, 0, 0.12);
                    background: transparent;
                    position: relative;
                }
                
                .menu-item::before {
                    content: '';
                    position: absolute;
                    left: 0;
                    top: 0;
                    bottom: 0;
                    width: 0;
                    background: rgba(0,0,0,0.02);
                    transition: width 0.3s ease;
                }
                
                .menu-item:hover::before {
                    width: 100%;
                }
                
                .menu-item:last-child { border-bottom: none; }
                
                .menu-item:hover { 
                    background: rgba(0,0,0,0.03);
                    transform: translateX(4px);
                }
                
                .menu-item:active {
                    transform: translateX(2px) scale(0.99);
                }

                .menu-icon-wrapper {
                    width: 36px; 
                    height: 36px; 
                    border-radius: 10px;
                    display: flex; 
                    align-items: center; 
                    justify-content: center;
                    margin-right: 12px; 
                    font-size: 1rem;
                    background: rgba(0,0,0,0.06);
                    border: 1px solid rgba(0,0,0,0.08);
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                    transition: all 0.3s ease;
                }
                
                .menu-item:hover .menu-icon-wrapper {
                    transform: scale(1.1) rotate(-5deg);
                    box-shadow: 0 4px 16px rgba(0,0,0,0.1);
                }

                .menu-content { 
                    flex: 1; 
                    display: flex; 
                    flex-direction: column; 
                    justify-content: center;
                    min-width: 0;
                }
                
                .menu-label { 
                    font-size: 0.95rem; 
                    color: #000;
                    font-weight: 400; 
                    margin-bottom: 0;
                    letter-spacing: -0.01em;
                }
                
                
                .menu-value { 
                    font-size: 0.85rem; 
                    font-weight: 600; 
                    color: var(--text-primary);
                    margin-top: 2px;
                    padding: 0;
                    background: transparent;
                    border-left: none;
                    border-radius: 6px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                
                .menu-chevron { 
                    color: rgba(0, 0, 0, 0.3);
                    font-size: 1.2rem; 
                    transition: all 0.3s ease; 
                    margin-left: 12px;
                }
                
                .menu-item:hover .menu-chevron {
                    color: rgba(0, 0, 0, 0.6);
                    transform: translateX(4px);
                }
                
                .menu-chevron.expanded { 
                    transform: rotate(90deg); 
                }
                
                /* Icon Color Schemes - Simple & Professional */
                .icon-personal,
                .icon-interests,
                .icon-birthday,
                .icon-notif,
                .icon-lock,
                .icon-block,
                .icon-safety,
                .icon-delete {
                    color: #1d1d1f;
                    background: rgba(0,0,0,0.04);
                    border-color: rgba(0,0,0,0.08);
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                }
                
                .menu-icon-wrapper svg { stroke-width: 2px; }

                /* Solid Submenu */
                .inner-submenu {
                    background: transparent;
                    padding: 4px 16px 16px 54px; /* Indented alignment */
                    border-top: none;
                }
                .submenu-hint { 
                    font-size: 0.8rem; color: #aaa; margin-bottom: 12px; font-weight: 500;
                }
                .chip-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
                .chip-option {
                    background: #222; border: 1px solid #333;
                    color: #aaa; padding: 8px 4px; border-radius: 8px;
                    font-size: 0.75rem; cursor: pointer; transition: all 0.2s;
                }
                .chip-option:hover { background: #333; color: white; }
                .chip-option.active { 
                    background: var(--accent-cyan); color: black; border-color: transparent; font-weight: bold;
                }

                /* Toggle Switch Styles */
                .toggle-item {
                    cursor: default !important;
                }
                
                .toggle-item:hover {
                    background: transparent !important;
                    transform: none !important;
                }

                .toggle-switch {
                    position: relative;
                    display: inline-block;
                    width: 52px;
                    height: 28px;
                    margin-left: auto;
                }

                .toggle-switch input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                }

                .toggle-slider {
                    position: absolute;
                    cursor: pointer;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: #ccc;
                    transition: 0.3s;
                    border-radius: 28px;
                }

                .toggle-slider:before {
                    position: absolute;
                    content: "";
                    height: 22px;
                    width: 22px;
                    left: 3px;
                    bottom: 3px;
                    background-color: white;
                    transition: 0.3s;
                    border-radius: 50%;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                }

                .toggle-switch input:checked + .toggle-slider {
                    background-color: #34c759;
                }

                .toggle-switch input:checked + .toggle-slider:before {
                    transform: translateX(24px);
                }

                .logout-btn {
                    width: 100%; padding: 16px; border-radius: 16px;
                    background: transparent;
                    border: 1px solid rgba(255, 69, 58, 0.3);
                    color: #ff453a; font-weight: 600; font-size: 1rem;
                    cursor: pointer; margin-top: 20px;
                    transition: all 0.2s;
                }
                .logout-btn:hover { background: rgba(255, 69, 58, 0.1); }
                
                .version-info { text-align: center; color: #333; font-size: 0.75rem; padding: 20px 0; }

                /* Modal Styles - Modern Professional Design */
                .modal-backdrop {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.85);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    z-index: 10000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                
                .modal-content {
                    background: linear-gradient(135deg, rgba(30, 30, 35, 0.98) 0%, rgba(20, 20, 25, 0.98) 100%);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 28px;
                    padding: 32px 28px;
                    width: 90%;
                    max-width: 420px;
                    box-shadow: 0 24px 60px rgba(0,0,0,0.6), 0 8px 20px rgba(0,0,0,0.4);
                    display: flex;
                    flex-direction: column;
                    gap: 24px;
                }
                
                .modal-header {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    margin-bottom: 4px;
                }
                
                .icon-wrapper {
                    width: 48px;
                    height: 48px;
                    border-radius: 14px;
                    background: rgba(255,255,255,0.04);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 1px solid rgba(255,255,255,0.08);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                }
                
                .desc-lock {
                    color: #00C6FF;
                    background: rgba(0, 198, 255, 0.08);
                    border-color: rgba(0, 198, 255, 0.2);
                    box-shadow: 0 4px 16px rgba(0, 198, 255, 0.15);
                }
                
                .modal-content h3 {
                    margin: 0;
                    color: white;
                    font-size: 1.5rem;
                    font-weight: 700;
                    letter-spacing: -0.02em;
                }
                
                .modal-form {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }
                
                .input-group {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    text-align: left;
                }
                
                .input-group label {
                    font-size: 0.875rem;
                    color: rgba(255,255,255,0.6);
                    font-weight: 600;
                    margin-left: 4px;
                    letter-spacing: -0.01em;
                }
                
                .input-group input {
                    width: 100%;
                    padding: 14px 16px;
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 14px;
                    color: white;
                    font-size: 0.95rem;
                    outline: none;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                .input-group input::placeholder {
                    color: rgba(255,255,255,0.3);
                }
                
                .input-group input:focus {
                    border-color: #00C6FF;
                    background: rgba(0, 198, 255, 0.05);
                    box-shadow: 0 0 0 3px rgba(0, 198, 255, 0.1);
                }

                .modal-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                    margin-top: 8px;
                }
                
                .btn-sec {
                    background: rgba(255,255,255,0.06);
                    color: rgba(255,255,255,0.8);
                    border: 1px solid rgba(255,255,255,0.08);
                    padding: 14px 24px;
                    cursor: pointer;
                    font-size: 0.95rem;
                    font-weight: 600;
                    border-radius: 14px;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                .btn-sec:hover {
                    background: rgba(255,255,255,0.1);
                    color: white;
                    transform: translateY(-2px);
                }
                
                .btn-sec:active {
                    transform: scale(0.96);
                }
                
                .btn-pri {
                    background: linear-gradient(135deg, #00C6FF 0%, #0072FF 100%);
                    color: white;
                    border: none;
                    padding: 14px 24px;
                    border-radius: 14px;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 0.95rem;
                    box-shadow: 0 8px 20px rgba(0, 198, 255, 0.3);
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                .btn-pri:hover {
                    box-shadow: 0 12px 28px rgba(0, 198, 255, 0.4);
                    transform: translateY(-2px);
                }
                
                .btn-pri:active {
                    transform: scale(0.96);
                }
                
                /* Cyan Button Variant for Edit Name */
                .btn-pri-cyan {
                    background: linear-gradient(135deg, #00C6FF 0%, #0072FF 100%);
                    color: white;
                    border: none;
                    padding: 14px 24px;
                    border-radius: 14px;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 0.95rem;
                    box-shadow: 0 8px 20px rgba(0, 198, 255, 0.3);
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                .btn-pri-cyan:hover {
                    box-shadow: 0 12px 28px rgba(0, 198, 255, 0.4);
                    transform: translateY(-2px);
                }
                
                .btn-pri-cyan:active {
                    transform: scale(0.96);
                }
                
                /* Edit Icon Styling */
                .icon-edit {
                    color: #00C6FF;
                    background: rgba(0, 198, 255, 0.08);
                    border-color: rgba(0, 198, 255, 0.2);
                    box-shadow: 0 4px 16px rgba(0, 198, 255, 0.15);
                }
                
                /* Name Fields Grid */
                .name-fields-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 16px;
                }
                
                @media (max-width: 480px) {
                    .name-fields-grid {
                        grid-template-columns: 1fr;
                    }
                }
                
                /* Bio Textarea Styling */
                .bio-textarea {
                    resize: vertical;
                    min-height: 100px;
                    font-family: inherit;
                    line-height: 1.6;
                    width: 100%;
                    padding: 14px 16px;
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 14px;
                    color: white;
                    font-size: 0.95rem;
                    outline: none;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                .bio-textarea::placeholder {
                    color: rgba(255,255,255,0.3);
                }
                
                .bio-textarea:focus {
                    border-color: #ff9500;
                    background: rgba(255, 149, 0, 0.05);
                    box-shadow: 0 0 0 3px rgba(255, 149, 0, 0.1);
                }
                
                .char-counter {
                    font-size: 0.75rem;
                    color: rgba(255,255,255,0.4);
                    text-align: right;
                    margin-top: 8px;
                }
                
                /* Bio Icon Styling */
                .icon-bio {
                    color: #ff9500;
                    background: rgba(255, 149, 0, 0.08);
                    border-color: rgba(255, 149, 0, 0.2);
                    box-shadow: 0 4px 16px rgba(255, 149, 0, 0.15);
                }
                
                /* Blocked list */
                .blocked-list { max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
                .blocked-user-item { display: flex; align-items: center; gap: 10px; padding: 10px; background: #222; border-radius: 12px; }
                .blocked-avatar { width: 40px; height: 40px; border-radius: 50%; }
                .blocked-info { flex: 1; color: white; font-size: 0.9rem; }
                .unblock-btn { padding: 6px 12px; border-radius: 8px; border: none; background: #333; color: white; cursor: pointer; }
                
                .icon-warn { font-size: 3rem; margin-bottom: 8px; display: block; }
                .btn-danger { background: #ff453a; color: white; border: none; padding: 12px 20px; border-radius: 12px; cursor: pointer; font-weight: 600; }
            
                /* Wallpaper Grid */
                .wallpaper-grid {
                    display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; padding: 10px 0;
                }
                .wallpaper-option {
                    aspect-ratio: 1; border-radius: 16px; cursor: pointer;
                    border: 2px solid transparent; position: relative;
                    display: flex; align-items: center; justify-content: center;
                    transition: transform 0.2s;
                }
                .wallpaper-option:hover { transform: scale(1.05); }
                .wallpaper-option.active { border-color: var(--accent-cyan); box-shadow: 0 0 15px rgba(0, 212, 255, 0.3); }
                .check-icon { font-weight: bold; color: white; text-shadow: 0 1px 3px rgba(0,0,0,0.5); }

                /* 3D Avatar Styles */
                .profile-header-card.expanded-3d {
                    background: transparent;
                    border-bottom: none;
                    padding-bottom: 20px;
                    padding-top: 0;
                    margin-top: 0;
                }

                .avatar-wrapper.wrapper-3d {
                    width: 100%;
                    height: auto;
                    background: transparent;
                    border-radius: 0;
                    margin-bottom: 20px;
                    margin-top: -30px; /* Pull up a bit more */
                    display: flex; 
                    justify-content: center;
                }

                .avatar-3d-container {
                    width: 100%;
                    max-width: 400px;
                    height: 280px; /* Shortened from 400px */
                    position: relative;
                }

                .edit-avatar-btn-overlay:hover {
                    background: white;
                    color: black;
                }

                .location-warning-badge {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    background: rgba(255, 69, 58, 0.15);
                    border: 1px solid rgba(255, 69, 58, 0.3);
                    padding: 8px 16px;
                    border-radius: 20px;
                    margin: 10px 0;
                    color: #FF453A;
                    font-size: 0.9rem;
                    font-weight: 500;
                }
                .location-warning-badge button {
                    background: #FF453A;
                    color: white;
                    border: none;
                    padding: 4px 12px;
                    border-radius: 12px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    cursor: pointer;
                }
                
                .edit-avatar-btn-3d {
                    position: absolute;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(0,0,0,0.6);
                    border: 1px solid rgba(255,255,255,0.2);
                    color: white;
                    padding: 8px 16px;
                    border-radius: 20px;
                    font-weight: 600;
                    cursor: pointer;
                    backdrop-filter: blur(5px);
                    transition: all 0.2s;
                    display: flex; align-items: center; gap: 8px;
                    z-index: 10;
                }
                .edit-avatar-btn-3d:hover { background: rgba(0,0,0,0.8); border-color: var(--accent-cyan); }

                .edit-avatar-btn-overlay {
                    position: absolute; bottom: 0; right: 0;
                    width: 32px; height: 32px; border-radius: 50%;
                    background: var(--accent-cyan); color: black;
                    border: 2px solid #1a1a2e;
                    cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 1rem;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.3);
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
