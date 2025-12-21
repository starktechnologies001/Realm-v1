import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Toast from '../components/Toast';

export default function Profile() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const [toastMsg, setToastMsg] = useState(null);

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
                    <img src={user.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default'} alt="Avatar" className="profile-avatar" />
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

            {/* Reuse existing styles ... */}
            <style>{`
                .profile-page {
                    min-height: 100vh;
                    background: #0f0f0f;
                    color: white;
                    padding-bottom: 80px;
                    position: relative;
                    overflow-x: hidden;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                }
                .ambient-glow {
                    position: absolute; top: -100px; left: 50%; transform: translateX(-50%);
                    width: 300px; height: 300px;
                    background: radial-gradient(circle, rgba(66, 133, 244, 0.15) 0%, transparent 70%);
                    pointer-events: none; z-index: 0;
                }
                
                .profile-header-card {
                    margin: 15px;
                    margin-top: 40px;
                    background: rgba(255, 255, 255, 0.03);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    border-radius: 20px;
                    padding: 30px 20px;
                    display: flex;
                    flex-direction: column; /* Centered Layout */
                    align-items: center;
                    text-align: center;
                    gap: 15px;
                    position: relative;
                    z-index: 1;
                }
                .avatar-wrapper { position: relative; }
                .profile-avatar {
                    width: 80px; height: 80px; border-radius: 50%; object-fit: cover;
                    border: 2px solid rgba(255,255,255,0.1);
                    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                }
                .status-indicator {
                    position: absolute; bottom: 5px; right: 5px;
                    width: 14px; height: 14px; background: #00ff88;
                    border: 2px solid #1e1e1e; border-radius: 50%;
                }
                .profile-info { display: flex; flex-direction: column; align-items: center; }
                .profile-info h1 { margin: 0; font-size: 1.4rem; font-weight: 700; margin-bottom: 5px; }
                .tags-row { display: flex; gap: 8px; justify-content: center; }
                .tag {
                    font-size: 0.75rem; padding: 4px 12px; border-radius: 12px;
                    background: rgba(255,255,255,0.06); color: #ccc;
                    font-weight: 500;
                }
                .edit-btn {
                    position: absolute; top: 15px; right: 15px;
                    padding: 6px 14px; border-radius: 18px;
                    background: rgba(255,255,255,0.08); color: white;
                    border: none; font-size: 0.8rem; font-weight: 600;
                    cursor: pointer; transition: all 0.2s;
                }
                .edit-btn:active { transform: scale(0.95); opacity: 0.8; }

                .scroll-content { padding: 0 15px; z-index: 1; position: relative; display: flex; flex-direction: column; gap: 10px; }
                .section-label {
                    margin: 20px 0 8px 5px;
                    font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px;
                    color: #666; font-weight: 700;
                }
                
                .menu-group {
                    background: #1c1c1e;
                    border-radius: 16px;
                    overflow: hidden;
                }
                
                .menu-item {
                    display: flex; align-items: center; padding: 14px;
                    cursor: pointer; transition: background 0.2s;
                }
                .menu-item:active { background: rgba(255,255,255,0.05); }
                .menu-icon { width: 32px; text-align: center; font-size: 1.1rem; margin-right: 4px; }
                .menu-content { flex: 1; display: flex; flex-direction: column; }
                .menu-label { font-size: 0.95rem; color: #fff; font-weight: 400; }
                .menu-value { font-size: 0.85rem; color: #777; margin-top: 1px; }
                .menu-chevron { color: #555; font-size: 1.1rem; transform: rotate(0deg); transition: transform 0.2s; }
                .menu-chevron.expanded { transform: rotate(90deg); }

                .inner-submenu {
                    background: #151517;
                    padding: 12px;
                    border-top: 1px solid rgba(255,255,255,0.03);
                    animation: slideDown 0.2s ease-out;
                }
                .submenu-hint { font-size: 0.75rem; color: #777; margin-bottom: 8px; }
                .chip-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px; }
                .chip-option {
                    background: rgba(255,255,255,0.08); border: none;
                    color: #aaa; padding: 6px 4px; border-radius: 6px;
                    font-size: 0.7rem; cursor: pointer;
                }
                .chip-option.active { background: #4285F4; color: white; font-weight: 600; }
                
                .submenu-row {
                    width: 100%; display: flex; align-items: center; gap: 10px;
                    padding: 10px; background: transparent; border: none;
                    color: white; font-size: 0.9rem; text-align: left;
                    border-radius: 6px; cursor: pointer;
                }
                .submenu-row:active { background: rgba(255,255,255,0.05); }
                .submenu-row .icon { font-size: 1rem; width: 20px; text-align: center; }
                .submenu-row.danger { color: #ff453a; }

                .logout-btn {
                    width: 100%; margin-top: 10px; padding: 14px;
                    background: rgba(255, 69, 58, 0.1); 
                    color: #ff453a; border-radius: 16px; border: none;
                    font-size: 0.95rem; font-weight: 600; cursor: pointer;
                }
                .logout-btn:active { background: rgba(255, 69, 58, 0.1); }
                
                .version-info { text-align: center; color: #333; margin-top: 15px; font-size: 0.7rem; }

                /* Modals */
                .modal-backdrop {
                    position: fixed; inset: 0; background: rgba(0,0,0,0.6);
                    backdrop-filter: blur(5px); z-index: 5000;
                    display: flex; align-items: center; justify-content: center;
                }
                .modal-content {
                    background: #1c1c1e; width: 85%; max-width: 300px;
                    padding: 20px; border-radius: 20px;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.5);
                    text-align: center;
                }
                .modal-content h3 { margin: 10px 0; font-size: 1.1rem; }
                .modal-content p { color: #aaa; font-size: 0.85rem; margin-bottom: 15px; }
                .modal-content input {
                    width: 100%; padding: 10px; margin-bottom: 8px;
                    background: #2c2c2e; border: none; border-radius: 8px;
                    color: white; font-size: 0.95rem;
                }
                .modal-footer { display: flex; gap: 8px; margin-top: 10px; }
                .modal-footer button { flex: 1; padding: 10px; border-radius: 10px; border: none; font-weight: 600; cursor: pointer; }
                .btn-sec { background: rgba(255,255,255,0.1); color: white; }
                .btn-pri { background: #4285F4; color: white; }
                .btn-danger { background: #ff453a; color: white; }
                .icon-warn { font-size: 2.5rem; margin-bottom: 5px; display: block; }
                
                @keyframes slideDown { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
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
