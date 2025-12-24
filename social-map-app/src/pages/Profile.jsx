import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Toast from '../components/Toast';

export default function Profile() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const [toastMsg, setToastMsg] = useState(null);
    const [blockedUsers, setBlockedUsers] = useState([]);
    const [showBlockedModal, setShowBlockedModal] = useState(false);

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
    const [passForm, setPassForm] = useState({ new: '', confirm: '' });

    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (passForm.new !== passForm.confirm) {
            alert("New passwords do not match!");
            return;
        }
        if (passForm.new.length < 6) {
            alert("Password must be at least 6 characters.");
            return;
        }

        try {
            const { error } = await supabase.auth.updateUser({ password: passForm.new });
            if (error) throw error;
            alert("Password updated successfully!");
            setActiveModal(null);
            setPassForm({ new: '', confirm: '' });
        } catch (error) {
            alert("Error updating password: " + error.message);
        }
    };

    const handleDeleteAccount = async () => {
        if (window.confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
            try {
                // Delete profile row (Auth user deletion requires admin key or specific setup, 
                // typically we just deactivate or delete user content)
                const { error } = await supabase.from('profiles').delete().eq('id', user.id);
                if (error) throw error;

                await supabase.auth.signOut();
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
            {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
            {/* Ambient Background Gradient */}
            <div className="ambient-glow"></div>

            {/* Header Card */}
            <div className="profile-header-card">
                <div className="avatar-wrapper">
                    <img src={(() => {
                        const safeName = encodeURIComponent(user.username || user.full_name || 'User');
                        if (user.gender === 'Male') return `https://avatar.iran.liara.run/public/boy?username=${safeName}`;
                        if (user.gender === 'Female') return `https://avatar.iran.liara.run/public/girl?username=${safeName}`;
                        return `https://avatar.iran.liara.run/public?username=${safeName}`;
                    })()} alt="Avatar" className="profile-avatar" />
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
                        icon="🏫"
                        label="Institute / Work"
                        value={user.institute || 'Add Institute'}
                        onClick={() => {
                            const inst = prompt("Enter your Institute Name:", user.institute || "");
                            if (inst) updateProfile({ institute: inst });
                        }}
                    />
                    <MenuItem icon="🎭" label="Interests" value={user.interests?.join(', ') || 'Add interests'} />
                </div>

                {/* Section: App Settings */}
                <div className="section-label">Settings</div>
                <div className="menu-group">
                    <MenuItem
                        icon="🔔"
                        label="Notifications"
                        value={user.mute_settings?.message && user.mute_settings.message !== 'Never' ? `Muted: ${user.mute_settings.message}` : ''}
                        hasArrow={!showNotifMenu}
                        isExpanded={showNotifMenu}
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
                        icon="🔒"
                        label="Change Password"
                        hasArrow={false}
                        onClick={() => setActiveModal('password')}
                    />
                </div>

                {/* Section: Support & Safety */}
                <div className="section-label">Safety</div>
                <div className="menu-group">
                    <MenuItem icon="🚫" label="Blocked Users" hasArrow />
                    <MenuItem icon="🛡️" label="Safety Center" hasArrow />
                    <div className="divider" style={{ height: '1px', background: 'rgba(255,69,58,0.2)', marginLeft: '50px' }}></div>
                    <MenuItem
                        icon="🗑️"
                        label="Delete Account"
                        onClick={() => setActiveModal('delete')}
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
                                <h3>Change Password</h3>
                                <form onSubmit={handleChangePassword}>
                                    <input type="password" placeholder="New Password"
                                        value={passForm.new} onChange={e => setPassForm({ ...passForm, new: e.target.value })} />
                                    <input type="password" placeholder="Confirm New"
                                        value={passForm.confirm} onChange={e => setPassForm({ ...passForm, confirm: e.target.value })} />
                                    <div className="modal-footer">
                                        <button type="button" onClick={() => setActiveModal(null)} className="btn-sec">Cancel</button>
                                        <button type="submit" className="btn-pri">Update</button>
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
                    background: var(--glass-bg);
                    backdrop-filter: blur(20px) saturate(150%);
                    -webkit-backdrop-filter: blur(20px) saturate(150%);
                    border: 1px solid var(--glass-border);
                    border-radius: 24px;
                    padding: 35px 25px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                    gap: 18px;
                    position: relative;
                    z-index: 1;
                    box-shadow: 
                        0 8px 32px rgba(0, 0, 0, 0.4),
                        inset 0 1px 0 var(--glass-highlight),
                        inset 1px 0 0 rgba(255, 255, 255, 0.1),
                        inset -1px 0 0 rgba(255, 255, 255, 0.1);
                }

                /* Top highlight bar */
                .profile-header-card::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 10%; right: 10%;
                    height: 1px;
                    background: linear-gradient(90deg, transparent, var(--glass-highlight), transparent);
                }

                .avatar-wrapper { 
                    position: relative;
                    padding: 3px;
                    background: var(--accent-gradient);
                    border-radius: 50%;
                    box-shadow: 0 0 20px rgba(0, 198, 255, 0.4);
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
                    background: var(--glass-bg);
                    backdrop-filter: blur(20px) saturate(150%);
                    -webkit-backdrop-filter: blur(20px) saturate(150%);
                    border: 1px solid var(--glass-border);
                    border-radius: 20px;
                    overflow: hidden;
                    box-shadow: 
                        0 4px 20px rgba(0, 0, 0, 0.4),
                        inset 0 1px 0 var(--glass-highlight),
                        inset 1px 0 0 rgba(255, 255, 255, 0.08),
                        inset -1px 0 0 rgba(255, 255, 255, 0.08);
                    position: relative;
                }

                /* Top edge highlight */
                .menu-group::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 10%; right: 10%;
                    height: 1px;
                    background: linear-gradient(90deg, transparent, var(--glass-highlight), transparent);
                }

                .menu-item {
                    display: flex; align-items: center; padding: 16px;
                    cursor: pointer; transition: all 0.2s;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    position: relative;
                }
                .menu-item:last-child { border-bottom: none; }
                .menu-item:hover { 
                    background: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06));
                }
                .menu-item:hover::before {
                    content: '';
                    position: absolute;
                    left: 0; top: 0; bottom: 0;
                    width: 3px;
                    background: var(--accent-gradient);
                    box-shadow: 0 0 8px rgba(0, 198, 255, 0.6);
                }
                .menu-item:active { transform: scale(0.99); }

                .menu-icon { 
                    width: 36px; text-align: center; font-size: 1.2rem; margin-right: 12px;
                }
                .menu-content { flex: 1; display: flex; flex-direction: column; }
                .menu-label { font-size: 0.98rem; color: var(--text-primary); font-weight: 500; }
                .menu-value { font-size: 0.88rem; color: var(--text-secondary); margin-top: 2px; }
                .menu-chevron { 
                    color: var(--accent-cyan); font-size: 1.2rem; 
                    transform: rotate(0deg); transition: transform 0.3s;
                }
                .menu-chevron.expanded { transform: rotate(90deg); }

                /* Glass Submenu */
                .inner-submenu {
                    background: linear-gradient(135deg, rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.3));
                    backdrop-filter: blur(10px);
                    padding: 14px;
                    border-top: 1px solid rgba(0, 198, 255, 0.3);
                    box-shadow: inset 0 1px 0 rgba(0, 198, 255, 0.2);
                }
                .submenu-hint { 
                    font-size: 0.78rem; color: var(--accent-cyan); margin-bottom: 10px; 
                    font-weight: 600;
                }
                .chip-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; }
                .chip-option {
                    background: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06));
                    border: 1px solid rgba(255,255,255,0.15);
                    backdrop-filter: blur(8px);
                    color: var(--text-secondary); 
                    padding: 8px 6px; border-radius: 10px;
                    font-size: 0.72rem; cursor: pointer;
                    transition: all 0.2s;
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15);
                }
                .chip-option:hover { 
                    background: linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.1));
                    border-color: var(--accent-cyan);
                }
                .chip-option.active { 
                    background: var(--accent-gradient);
                    border-color: var(--accent-cyan);
                    color: white; font-weight: 700;
                    box-shadow: 
                        0 4px 12px rgba(0, 198, 255, 0.4),
                        inset 0 1px 0 rgba(255, 255, 255, 0.3);
                }

                .submenu-row {
                    width: 100%; display: flex; align-items: center; gap: 12px;
                    padding: 12px; background: transparent; border: none;
                    color: white; font-size: 0.92rem; text-align: left;
                    border-radius: 8px; cursor: pointer;
                    transition: all 0.2s;
                }
                .submenu-row:hover { 
                    background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05));
                }
                .submenu-row:active { background: rgba(255,255,255,0.15); }
                .submenu-row .icon { font-size: 1.1rem; width: 24px; text-align: center; }
                .submenu-row.danger { color: #ff6b6b; }

                /* Glass Logout Button */
                .logout-btn {
                    width: 100%; margin-top: 12px; padding: 16px;
                    background: linear-gradient(135deg, rgba(255, 69, 58, 0.2), rgba(255, 69, 58, 0.1));
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 69, 58, 0.4);
                    color: #ff6b6b; border-radius: 16px;
                    font-size: 0.98rem; font-weight: 700; cursor: pointer;
                    transition: all 0.2s;
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15);
                }
                .logout-btn:hover { 
                    background: linear-gradient(135deg, rgba(255, 69, 58, 0.3), rgba(255, 69, 58, 0.15));
                    border-color: rgba(255, 69, 58, 0.6);
                    box-shadow: 
                        inset 0 1px 0 rgba(255, 255, 255, 0.2),
                        0 0 16px rgba(255, 69, 58, 0.4);
                }
                .logout-btn:active { transform: scale(0.98); }

                .version-info { 
                    text-align: center; color: #555; margin-top: 20px; 
                    font-size: 0.72rem; font-weight: 600;
                }

                /* Glass Modals with Highlights */
                .modal-backdrop {
                    position: fixed; inset: 0; 
                    background: rgba(0,0,0,0.85);
                    backdrop-filter: blur(8px);
                    z-index: 5000;
                    display: flex; align-items: center; justify-content: center;
                }

                .modal-content {
                    background: var(--glass-bg);
                    backdrop-filter: blur(25px) saturate(150%);
                    -webkit-backdrop-filter: blur(25px) saturate(150%);
                    border: 1px solid var(--glass-border);
                    width: 88%; max-width: 320px;
                    padding: 28px; border-radius: 24px;
                    box-shadow: 
                        0 12px 40px rgba(0, 0, 0, 0.6),
                        inset 0 1px 0 var(--glass-highlight),
                        inset 1px 0 0 rgba(255, 255, 255, 0.1),
                        inset -1px 0 0 rgba(255, 255, 255, 0.1);
                    text-align: center;
                    position: relative;
                }

                /* Top highlight for modal */
                .modal-content::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 10%; right: 10%;
                    height: 1px;
                    background: linear-gradient(90deg, transparent, var(--glass-highlight), transparent);
                }

                .modal-content h3 { 
                    margin: 12px 0; font-size: 1.2rem; font-weight: 700;
                    color: var(--text-primary);
                }
                .modal-content p { color: var(--text-secondary); font-size: 0.88rem; margin-bottom: 18px; }
                .modal-content input {
                    width: 100%; padding: 12px; margin-bottom: 10px;
                    background: linear-gradient(135deg, rgba(0,0,0,0.5), rgba(0,0,0,0.3));
                    border: 1px solid rgba(255,255,255,0.2);
                    border-radius: 12px;
                    color: white; font-size: 0.95rem;
                    backdrop-filter: blur(8px);
                    transition: all 0.2s;
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
                }
                .modal-content input:focus { 
                    outline: none;
                    border-color: var(--accent-cyan);
                    box-shadow: 
                        inset 0 1px 0 rgba(255, 255, 255, 0.15),
                        0 0 0 3px rgba(0, 212, 255, 0.2);
                }

                .modal-footer { display: flex; gap: 10px; margin-top: 16px; }
                .modal-footer button { 
                    flex: 1; padding: 12px; border-radius: 12px; border: none; 
                    font-weight: 700; cursor: pointer; transition: all 0.2s;
                    font-size: 0.92rem;
                }
                .btn-sec { 
                    background: linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.08));
                    border: 1px solid rgba(255,255,255,0.2);
                    color: white;
                    backdrop-filter: blur(8px);
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
                }
                .btn-sec:hover { 
                    background: linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.12));
                    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3);
                }
                .btn-pri { 
                    background: var(--accent-gradient);
                    color: white;
                    box-shadow: 
                        0 4px 12px rgba(0, 198, 255, 0.3),
                        inset 0 1px 0 rgba(255, 255, 255, 0.3);
                }
                .btn-pri:hover { 
                    box-shadow: 
                        0 6px 16px rgba(0, 198, 255, 0.4),
                        inset 0 1px 0 rgba(255, 255, 255, 0.4);
                }
                .btn-danger { 
                    background: linear-gradient(135deg, #ff6b6b, #ff4444);
                    color: white;
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

function MenuItem({ icon, label, value, hasArrow, isExpanded, onClick, style }) {
    return (
        <div className="menu-item" onClick={onClick} style={style}>
            <span className="menu-icon">{icon}</span>
            <div className="menu-content">
                <span className="menu-label" style={style}>{label}</span>
                {value && <span className="menu-value">{value}</span>}
            </div>
            {hasArrow && <span className={`menu-chevron ${isExpanded ? 'expanded' : ''}`}>›</span>}
        </div>
    );
}
