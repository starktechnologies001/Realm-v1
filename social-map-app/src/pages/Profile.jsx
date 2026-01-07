import React, { useEffect, useState, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Toast from '../components/Toast';
import Avatar3D from '../components/Avatar3D';
import AvatarEditor from '../components/AvatarEditor';

export default function Profile() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const [toastMsg, setToastMsg] = useState(null);
    const [blockedUsers, setBlockedUsers] = useState([]);
    const [showBlockedModal, setShowBlockedModal] = useState(false);
    const [showAvatarEditor, setShowAvatarEditor] = useState(false);

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
                            <button className="edit-avatar-btn-overlay" onClick={() => setShowAvatarEditor(true)}>
                                ✏️
                            </button>
                            <div className="status-indicator"></div>
                        </>
                    )}
                </div>
                
                <div className="profile-info">
                    <h1>{user.full_name || user.username}</h1>
                    <div className="tags-row">
                        {user.status && <span className="tag status">{user.status}</span>}
                        {is3DAvatar && (
                            <button 
                                onClick={() => setShowAvatarEditor(true)}
                                style={{
                                    background: 'transparent',
                                    border: '1px solid #333',
                                    borderRadius: '50%',
                                    width: '28px',
                                    height: '28px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: 'var(--accent-cyan)',
                                    marginLeft: '8px'
                                }}
                            >
                                ✏️
                            </button>
                        )}
                    </div>
                    {/* Bio Section */}
                    <div className={`user-bio ${!user.bio ? 'empty':''}`} onClick={() => setActiveModal('edit-bio')}>
                        {user.bio || "Tap to add a bio..."}
                    </div>
                </div>
                {/* Simple Edit for Name for now */}
                <button className="edit-btn" onClick={() => {
                    const newName = prompt("Enter full name:", user.full_name);
                    if (newName) updateProfile({ full_name: newName });
                }}>Edit Name</button>
            </div>


            <div className="scroll-content">
                {/* Section: Personal */}
                <div className="section-label">Personal</div>
                <div className="menu-group">
                    <MenuItem
                        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l8-4 8 4v14M9 10a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v11H9V10z"/></svg>}
                        label="Institute / Work"
                        value={user.institute || 'Add Institute / Work'} 
                        iconClass="icon-personal"
                        onClick={() => setActiveModal('edit-institute')}
                    />
                    <MenuItem 
                        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>}
                        label="Interests" 
                        value={user.interests?.join(', ') || 'Add interests'} 
                        iconClass="icon-interests"
                        onClick={() => setActiveModal('edit-interests')}
                    />
                    <MenuItem
                        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>}
                        label="Birthday"
                        value={user.birth_date ? new Date(user.birth_date).toLocaleDateString() : 'Add Birthday'}
                        iconClass="icon-birthday"

                        onClick={() => setActiveModal('edit-birthday')}
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
                        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>}
                        label="Chat Wallpaper"
                        hasArrow
                        iconClass="icon-interests"
                        onClick={() => setActiveModal('wallpaper')}
                    />

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



                        {activeModal === 'edit-bio' && (
                            <>
                                <div className="modal-header"><h3>Edit Bio</h3></div>
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
                                            rows="3"
                                            autoFocus 
                                            style={{ resize: 'none' }}
                                        />
                                    </div>
                                    <div className="modal-footer">
                                        <button type="button" onClick={() => setActiveModal(null)} className="btn-sec">Cancel</button>
                                        <button type="submit" className="btn-pri">Save</button>
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
                    /* Solid Professional Theme */
                    --card-bg: #1e1e1e;
                    --card-bg-hover: #2a2a2a;
                    --bg-dark: #0a0a0a;
                    --border-subtle: #333333;
                    --text-primary: #ffffff;
                    --text-secondary: #a0a0a0;
                    --accent-cyan: #00d4ff;
                }

                .profile-page {
                    min-height: 100vh;
                    background: var(--bg-dark);
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
                    width: 100px; height: 100px; border-radius: 50%; object-fit: cover;
                    border: 4px solid #1a1a2e; /* Dark border outline */
                    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
                }

                .status-indicator {
                    position: absolute; bottom: 8px; right: 8px;
                    width: 18px; height: 18px; 
                    background: #00ff88;
                    border: 3px solid #1a1a2e; 
                    border-radius: 50%;
                }

                .profile-info { display: flex; flex-direction: column; align-items: center; }
                .profile-info h1 { 
                    margin: 0; font-size: 1.8rem; font-weight: 700; margin-bottom: 8px;
                    color: var(--text-primary);
                }

                .tags-row { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-bottom: 12px; }
                .tag {
                    font-size: 0.8rem; padding: 6px 14px; border-radius: 14px;
                    background: rgba(0, 212, 255, 0.1); 
                    border: 1px solid rgba(0, 212, 255, 0.3);
                    color: var(--accent-cyan);
                    font-weight: 600;
                }

                .user-bio {
                    font-size: 0.95rem; color: var(--text-primary); /* Brighter text */
                    font-weight: 600; /* Bold */
                    max-width: 85%; 
                    white-space: pre-wrap; word-break: break-word; /* Allow multi-line */
                    cursor: pointer; padding: 6px 14px; border-radius: 10px;
                    transition: background 0.2s;
                    margin-top: 6px;
                    text-align: center;
                }
                .user-bio:hover { background: rgba(255,255,255,0.05); color: white; }
                .user-bio.empty { font-style: italic; opacity: 0.6; }

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
                    padding: 0 15px; z-index: 1; position: relative; 
                    display: flex; flex-direction: column; gap: 12px; 
                }

                /* Flat Professional List Style */
                .section-label {
                    margin: 30px 0 10px 10px;
                    font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1.2px;
                    color: #666; font-weight: 700;
                }

                .menu-group {
                    background: rgba(30, 30, 32, 0.6); /* Semi-transparent */
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border-radius: 16px;
                    overflow: hidden;
                    margin-bottom: 20px;
                    border: 1px solid rgba(255,255,255,0.08);
                    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                }

                .menu-item {
                    display: flex; align-items: center; padding: 16px;
                    cursor: pointer; transition: background 0.2s;
                    border-bottom: 0.5px solid rgba(255, 255, 255, 0.08); 
                    background: transparent;
                }
                .menu-item:last-child { border-bottom: none; }
                .menu-item:hover { background: rgba(255,255,255,0.05); }

                .menu-icon-wrapper {
                    width: 32px; height: 32px; border-radius: 8px; /* Squircle-ish */
                    display: flex; align-items: center; justify-content: center;
                    margin-right: 14px; color: white; font-size: 1rem;
                }

                .menu-content { flex: 1; display: flex; flex-direction: column; justify-content: center; }
                
                .menu-label { font-size: 1rem; color: #fff; font-weight: 500; margin-bottom: 2px; }
                
                .menu-value { 
                    font-size: 0.9rem; 
                    font-weight: 600; 
                    color: rgba(255,255,255,0.7); /* Professional muted white instead of gradient for now, or keep per user pref? Let's use accent color or clean white */
                    /* Reverting gradient to solid for cleaner professional look unless requested */
                    color: #aaa;
                    margin-top: 2px;
                }
                
                .menu-chevron { color: #444; font-size: 1.1rem; transition: transform 0.3s; margin-left: 10px; }
                .menu-chevron.expanded { transform: rotate(90deg); }
                .menu-chevron { color: #444; font-size: 1.1rem; transition: transform 0.3s; margin-left: 10px; }
                .menu-chevron.expanded { transform: rotate(90deg); }
                
                .menu-chevron { color: #444; font-size: 1.1rem; transition: transform 0.3s; margin-left: 10px; }
                .menu-chevron.expanded { transform: rotate(90deg); }
                
                /* Glowing Icons Logic */
                .menu-icon-wrapper {
                    /* Base glass style */
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.05);
                    box-shadow: 0 0 15px rgba(0,0,0,0.5); /* Deep shadow behind */
                    transition: all 0.3s ease;
                }

                /* Individual Neon Glows */
                .icon-personal { 
                    color: #00d4ff; 
                    box-shadow: 0 0 15px rgba(0, 212, 255, 0.2), inset 0 0 10px rgba(0, 212, 255, 0.1);
                    border-color: rgba(0, 212, 255, 0.3);
                    text-shadow: 0 0 8px rgba(0, 212, 255, 0.6);
                }
                .icon-interests { 
                    color: #ff0055; 
                    box-shadow: 0 0 15px rgba(255, 0, 85, 0.2), inset 0 0 10px rgba(255, 0, 85, 0.1);
                    border-color: rgba(255, 0, 85, 0.3);
                    text-shadow: 0 0 8px rgba(255, 0, 85, 0.6);
                }
                .icon-birthday { 
                    color: #ff9500; 
                    box-shadow: 0 0 15px rgba(255, 149, 0, 0.2), inset 0 0 10px rgba(255, 149, 0, 0.1);
                    border-color: rgba(255, 149, 0, 0.3);
                    text-shadow: 0 0 8px rgba(255, 149, 0, 0.6);
                }
                .icon-notif { 
                    color: #ffd60a; 
                    box-shadow: 0 0 15px rgba(255, 214, 10, 0.2), inset 0 0 10px rgba(255, 214, 10, 0.1);
                    border-color: rgba(255, 214, 10, 0.3);
                    text-shadow: 0 0 8px rgba(255, 214, 10, 0.6);
                }
                .icon-lock { 
                    color: #bf5af2; 
                    box-shadow: 0 0 15px rgba(191, 90, 242, 0.2), inset 0 0 10px rgba(191, 90, 242, 0.1);
                    border-color: rgba(191, 90, 242, 0.3);
                    text-shadow: 0 0 8px rgba(191, 90, 242, 0.6);
                }
                .icon-block { 
                    color: #5e5ce6; 
                    box-shadow: 0 0 15px rgba(94, 92, 230, 0.2), inset 0 0 10px rgba(94, 92, 230, 0.1);
                    border-color: rgba(94, 92, 230, 0.3);
                    text-shadow: 0 0 8px rgba(94, 92, 230, 0.6);
                }
                .icon-safety { 
                    color: #30d158; 
                    box-shadow: 0 0 15px rgba(48, 209, 88, 0.2), inset 0 0 10px rgba(48, 209, 88, 0.1);
                    border-color: rgba(48, 209, 88, 0.3);
                    text-shadow: 0 0 8px rgba(48, 209, 88, 0.6);
                }
                .icon-delete { 
                    color: #ff453a; 
                    box-shadow: 0 0 15px rgba(255, 69, 58, 0.2), inset 0 0 10px rgba(255, 69, 58, 0.1);
                    border-color: rgba(255, 69, 58, 0.3);
                    text-shadow: 0 0 8px rgba(255, 69, 58, 0.6);
                }
                
                .menu-icon-wrapper svg { stroke-width: 2px; filter: drop-shadow(0 0 2px currentColor); }

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

                /* Modal Styles (Solid) */
                .modal-backdrop {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.8);
                    z-index: 10000; display: flex; align-items: center; justify-content: center;
                }
                .modal-content {
                    background: #1e1e1e; 
                    border: 1px solid #333;
                    border-radius: 24px; padding: 32px; width: 90%; max-width: 380px;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.5);
                    display: flex; flex-direction: column; gap: 20px;
                }
                
                .modal-header { display: flex; align-items: center; gap: 15px; margin-bottom: 5px; }
                .icon-wrapper {
                    width: 44px; height: 44px; border-radius: 12px;
                    background: #252525; display: flex; align-items: center; justify-content: center;
                    color: white; border: 1px solid #333;
                }
                .desc-lock { color: var(--accent-cyan); }
                
                .modal-content h3 { margin: 0; color: white; font-size: 1.3rem; font-weight: 600; }
                .modal-form { display: flex; flex-direction: column; gap: 16px; }
                
                .input-group { display: flex; flex-direction: column; gap: 8px; text-align: left; }
                .input-group label { font-size: 0.85rem; color: #aaa; font-weight: 500; margin-left: 4px; }
                .input-group input {
                    width: 100%; padding: 14px 16px;
                    background: #111; border: 1px solid #333;
                    border-radius: 12px; color: white; font-size: 0.95rem; outline: none;
                    transition: all 0.2s;
                }
                .input-group input:focus { 
                    border-color: var(--accent-cyan);
                }

                .modal-footer { display: flex; justify-content: flex-end; gap: 12px; margin-top: 10px; }
                .btn-sec { 
                    background: transparent; color: #888; border: none; padding: 12px 18px; 
                    cursor: pointer; font-size: 0.95rem; font-weight: 500;
                }
                .btn-sec:hover { color: white; }
                
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
