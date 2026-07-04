import React, { useEffect, useState, useRef, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import Toast from '../components/Toast';

// 🚀 Lazy-loaded heavy components — only download when needed
const Avatar3D = React.lazy(() => import('../components/Avatar3D'));
const AvatarEditor = React.lazy(() => import('../components/AvatarEditor'));
const ImageCropper = React.lazy(() => import('../components/ImageCropper'));
import { useTheme } from '../context/ThemeContext';
import { useLocationContext } from '../context/LocationContext';
import { getAvatar2D, DEFAULT_MALE_AVATAR, DEFAULT_FEMALE_AVATAR, DEFAULT_GENERIC_AVATAR } from '../utils/avatarUtils';
import { getStatusRingClass } from '../utils/statusUtils';
import { uploadToStorage } from '../utils/fileUpload';
import { premiumTiers, ACHIEVEMENTS } from '../utils/premiumUtils';
import './Profile.css';

const formatRelativeTime = (dateStr) => {
    if (!dateStr) return 'recently';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) {
        if (diffHours === 1) return '1 hour ago';
        return `${diffHours} hours ago`;
    }
    
    // Check if yesterday
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    }
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export default function Profile() {
    const [user, setUser] = useState(() => {
        try { return JSON.parse(localStorage.getItem('currentUser') || 'null'); } catch { return null; }
    });
    const [loading, setLoading] = useState(false); // 🚀 No spinner if cache exists
    const navigate = useNavigate();
    const [toastMsg, setToastMsg] = useState(null);
    // const [blockedUsers, setBlockedUsers] = useState([]); // Moved to BlockedUsers.jsx
    // const [showBlockedModal, setShowBlockedModal] = useState(false); // Moved to BlockedUsers.jsx
    const [showAvatarEditor, setShowAvatarEditor] = useState(false);
    const [showThemeMenu, setShowThemeMenu] = useState(false);
    const { theme, updateTheme } = useTheme();
    const [uploadingWallpaper, setUploadingWallpaper] = useState(false);
    const wallpaperInputRef = useRef(null);
    const photoInputRef = useRef(null);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);

    // Profile states
    const [friendsCount, setFriendsCount] = useState(0);
    const [unlockedAchievements, setUnlockedAchievements] = useState([]);

    const { 
        locationEnabled,
        startLocation,
        stopLocation
    } = useLocationContext();

    const [cropImage, setCropImage] = useState(null); // State for cropping

    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
             showToast("Image too large (Max 5MB) ⚠️");
             return;
        }

        // Open Cropper
        const reader = new FileReader();
        reader.addEventListener('load', () => {
            setCropImage(reader.result);
        });
        reader.readAsDataURL(file);
        
        // Reset input so same file can be selected again if cancelled
        e.target.value = null; 
    };

    const onCropComplete = async (croppedBlob) => {
        setCropImage(null); // Close cropper
        setUploadingPhoto(true);
        
        // Create a File from Blob for uploadToStorage (it expects a File-like object with name/type)
        const file = new File([croppedBlob], `avatar_${Date.now()}.jpg`, { type: 'image/jpeg' });

        try {
            // Use 'chat-images' bucket which is known to be public for images
            const { fileUrl, error } = await uploadToStorage(file, user.id, null, 'chat-images');
            console.log("📸 [Profile] Upload Result:", { fileUrl, error });
            
            if (error) throw new Error(error);

            // Update profile with new avatar URL
            await updateProfile({ avatar_url: fileUrl });
            showToast("Profile photo updated 📸");
        } catch (error) {
            console.error('Photo upload failed:', error);
            showToast("Upload failed ❌");
        } finally {
            setUploadingPhoto(false);
        }
    };

    const onCropCancel = () => {
        setCropImage(null);
    };

    const handleRemovePhoto = async () => {
        if (!window.confirm("Remove current photo?")) return;
        
        let defaultAvatar = DEFAULT_GENERIC_AVATAR;
        if (user.gender === 'Male') defaultAvatar = DEFAULT_MALE_AVATAR;
        else if (user.gender === 'Female') defaultAvatar = DEFAULT_FEMALE_AVATAR;

        await updateProfile({ avatar_url: defaultAvatar });
        showToast("Photo removed 🗑️");
    };

    const handleWallpaperUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
             showToast("Image too large (Max 5MB) ⚠️");
             return;
        }

        setUploadingWallpaper(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `wallpapers/${user.id}_${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('chat-images')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('chat-images').getPublicUrl(fileName);
            
            // Update profile with new wallpaper URL
            await updateProfile({ chat_background: `url('${data.publicUrl}')` });
            showToast("Wallpaper updated 🖼️");
            
        } catch (error) {
            console.error('Wallpaper upload failed:', error);
            showToast("Upload failed ❌");
        } finally {
            setUploadingWallpaper(false);
        }
    };

    useEffect(() => {
        fetchProfile();
    }, []);

    // Fetch premium features & visitor data dynamically
    useEffect(() => {
        if (!user?.id) return;
        
        const loadPremiumData = async () => {
            try {
                // 1. Fetch friends count
                const { count } = await supabase
                    .from('friendships')
                    .select('id', { count: 'exact', head: true })
                    .eq('status', 'accepted')
                    .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);
                setFriendsCount(count || 0);



                // 3. Compute achievements
                import('../utils/premiumUtils').then(({ checkUnlockedAchievements }) => {
                    const unlocked = checkUnlockedAchievements(user, count || 0);
                    setUnlockedAchievements(unlocked);
                });
            } catch (err) {
                console.error("Error loading premium data:", err);
            }
        };

        loadPremiumData();
    }, [user?.id, user?.subscription_tier, user?.streak_count, user?.status_message]);

    // 🔥 Sync UI: If Location is Enabled, Ghost Mode MUST be Off (unless user's visibility mode is ghost)
    useEffect(() => {
        if (locationEnabled && user?.is_ghost_mode && user?.visibility_mode !== 'ghost') {
             console.log("🔵 [Profile] Location enabled, forcing Ghost Mode OFF in UI");
             setUser(prev => ({ ...prev, is_ghost_mode: false }));
        }
    }, [locationEnabled, user?.is_ghost_mode, user?.visibility_mode]);

    const fetchProfile = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const authUser = session?.user;
            if (!authUser) { navigate('/login'); return; }

            // 🚀 Run profile + stories in PARALLEL
            const [profileResult, storiesResult] = await Promise.all([
                supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', authUser.id)
                    .maybeSingle(),
                supabase
                    .from('stories')
                    .select('id')
                    .eq('user_id', authUser.id)
                    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            ]);

            if (profileResult.error) throw profileResult.error;
            const data = profileResult.data;
            const stories = storiesResult.data;

            let hasStory = false;
            let hasUnseenStory = false;
            if (stories && stories.length > 0) {
                hasStory = true;
                const { data: views } = await supabase
                    .from('story_views')
                    .select('story_id')
                    .eq('viewer_id', authUser.id)
                    .in('story_id', stories.map(s => s.id));
                const viewedCount = views ? views.length : 0;
                hasUnseenStory = viewedCount < stories.length;
            }

            const merged = { ...data, hasStory, hasUnseenStory };
            setUser(merged);
            // Keep localStorage in sync for map and other pages
            localStorage.setItem('currentUser', JSON.stringify(merged));
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




    const updateProfile = async (updates, successMessage = "Profile updated successfully! ✅") => {
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
            showToast(successMessage);
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
        
        // Aggressively preload the 2D version for the Map
        const avatar2D = getAvatar2D(timestampedUrl);
        const preloadImg = new Image();
        preloadImg.src = avatar2D;
        console.log('🔵 [Profile] Preloading 2D Avatar for Map:', avatar2D);

        updateProfile({ avatar_url: timestampedUrl });
    };

    const showToast = (msg) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(null), 3000);
    };

    const [showPrivacyMenu, setShowPrivacyMenu] = useState(false);
    const [activeModal, setActiveModal] = useState(null); // 'edit-username', 'password', 'edit-bio', 'edit-interests'
    const [showPublicConfirm, setShowPublicConfirm] = useState(false);

    // Password Form State
    const [passForm, setPassForm] = useState({ current: '', new: '', confirm: '' });
    const [showPasswords, setShowPasswords] = useState({ current: false, new: false, confirm: false });

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
            const { data: { session } } = await supabase.auth.getSession();
            const authUser = session?.user;
            if (!authUser) throw new Error("Session expired. Please log in again.");

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
        let expiry = null;
        let successMsg = "Notifications unmuted! 🔔";
        
        if (duration === '10 Minutes') {
            const date = new Date(Date.now() + 10 * 60000);
            expiry = date.toISOString();
            successMsg = `Muted until ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 🔕`;
        } else if (duration === '1 Hour') {
             const date = new Date(Date.now() + 60 * 60000);
             expiry = date.toISOString();
             successMsg = `Muted until ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 🔕`;
        } else if (duration === '24 Hours') {
             const date = new Date(Date.now() + 24 * 60 * 60000);
             expiry = date.toISOString();
             successMsg = `Muted until tomorrow ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 🔕`;
        }
        
        const isMuting = duration !== 'Unmute';
        
        const newSettings = { 
            ...user.mute_settings, 
            message: isMuting ? duration : 'Never', 
            muted_until: expiry,
            mute_all: isMuting // Timer enables mute_all
        };
        updateProfile({ mute_settings: newSettings }, successMsg);
    };

    if (loading && !user) return <div style={{ color: 'white', padding: '20px' }}>Loading profile...</div>;
    if (!user) return null;

    const is3DAvatar = user.avatar_url?.includes('.glb');

    return (
        <div className="profile-page">
            {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}
            
            {/* Image Cropper Modal — load the cropper library only when user picks a photo */}
            {cropImage && (
                <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}><div style={{ width: 36, height: 36, border: '3px solid rgba(255,255,255,0.15)', borderTop: '3px solid #0084ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /></div>}>
                    <ImageCropper
                        imageSrc={cropImage}
                        onCropComplete={onCropComplete}
                        onCancel={onCropCancel}
                    />
                </Suspense>
            )}

            {showAvatarEditor && (
                <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}><div style={{ width: 36, height: 36, border: '3px solid rgba(255,255,255,0.15)', borderTop: '3px solid #0084ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /></div>}>
                    <AvatarEditor 
                        onSave={handleAvatarSave} 
                        onClose={() => setShowAvatarEditor(false)} 
                    />
                </Suspense>
            )}

            {/* Header Card */}
            <div className={`profile-header-card ${is3DAvatar ? 'expanded-3d' : ''} ${user.subscription_tier === 'silver' ? 'profile-card-silver' : user.subscription_tier === 'gold' ? 'profile-card-gold' : user.subscription_tier === 'diamond' ? 'profile-card-diamond' : ''}`}>
                <div className={`avatar-wrapper ${is3DAvatar ? 'wrapper-3d' : ''}`} style={{ position: 'relative' }}>
                    {is3DAvatar ? (
                        <div className="avatar-3d-container">
                            <Suspense fallback={
                                <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <div style={{ width: 30, height: 30, border: '3px solid rgba(255,255,255,0.15)', borderTop: '3px solid #0084ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                                </div>
                            }>
                                <Avatar3D url={user.avatar_url} key={user.avatar_url} poster={getAvatar2D(user.avatar_url)} />
                            </Suspense>
                        </div>
                    ) : (
                        <div className={`profile-avatar-container ${
                            user.subscription_tier === 'silver' ? 'avatar-ring-silver' :
                            user.subscription_tier === 'gold' ? 'avatar-ring-gold' :
                            user.subscription_tier === 'diamond' ? `avatar-ring-diamond effect-${user.avatar_effect || 'none'}` :
                            user.subscription_tier === 'legend' ? 'avatar-ring-legend' : ''
                        }`} style={{ width: '100%', height: '100%', borderRadius: '50%', position: 'relative' }}>
                            <img src={(() => {
                                if (user.avatar_url) return user.avatar_url;
                                // Fallback to realistic defaults
                                const gender = user.gender;
                                if (gender === 'Male') return DEFAULT_MALE_AVATAR;
                                if (gender === 'Female') return DEFAULT_FEMALE_AVATAR;
                                return DEFAULT_GENERIC_AVATAR;
                            })()} alt="Avatar" className={`profile-avatar ${getStatusRingClass(user, user)}`} />
                        </div>
                    )}
                    
                    {/* Unified Update Button */}
                    <div className="avatar-overlay-btn" onClick={(e) => { e.stopPropagation(); setActiveModal('photo-options'); }}>
                        +
                    </div>
                    
                    {/* Dropdown Menu (Professional Small Box) */}
                    {activeModal === 'photo-options' && (
                        <>
                            {/* Click-away backdrop */}
                            <div 
                                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }} 
                                onClick={(e) => { e.stopPropagation(); setActiveModal(null); }}
                            />
                            
                            <div style={{
                                position: 'absolute',
                                top: '50%', /* Start at the vertical center of the button */
                                left: '100%',
                                transform: 'translateY(0)', /* Hangs down from the center */
                                marginLeft: '10px',
                                background: 'rgba(255, 255, 255, 0.95)',
                                backdropFilter: 'blur(12px)',
                                borderRadius: '12px', /* Slightly smaller radius */
                                padding: '4px', /* Reduced padding */
                                boxShadow: '0 8px 30px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
                                zIndex: 100,
                                minWidth: 'max-content',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '1px', /* Minimal gap */
                                animation: 'fadeIn 0.2s ease-out'
                            }}>
                                {/* Arrow pointing left */}
                                <div style={{
                                    position: 'absolute',
                                    left: '-5px',
                                    top: '14px', /* Aligns with the button center roughly */
                                    width: '0',
                                    height: '0',
                                    borderTop: '5px solid transparent',
                                    borderBottom: '5px solid transparent',
                                    borderRight: '5px solid rgba(255, 255, 255, 0.95)'
                                }} />

                                <button
                                    onClick={(e) => { e.stopPropagation(); setActiveModal(null); photoInputRef.current?.click(); }}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#1d1d1f',
                                        padding: '8px 12px', /* Smaller padding */
                                        textAlign: 'left',
                                        fontSize: '0.85rem', /* Smaller text */
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        borderRadius: '8px',
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        transition: 'all 0.2s',
                                        whiteSpace: 'nowrap'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.06)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <span style={{ fontSize: '1rem' }}>📷</span> Upload Photo
                                </button>
                                
                                {user.avatar_url && !user.avatar_url.includes('defaults') && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setActiveModal(null); handleRemovePhoto(); }}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#ff3b30',
                                            padding: '8px 12px', /* Smaller padding */
                                            textAlign: 'left',
                                            fontSize: '0.85rem', /* Smaller text */
                                            fontWeight: '600',
                                            cursor: 'pointer',
                                            borderRadius: '8px',
                                            display: 'flex', alignItems: 'center', gap: '8px',
                                            transition: 'all 0.2s',
                                            whiteSpace: 'nowrap'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 59, 48, 0.1)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <span style={{ fontSize: '1rem' }}>🗑️</span> Remove Photo
                                    </button>
                                )}
                            </div>
                        </>
                    )}

                    <input 
                        type="file" 
                        ref={photoInputRef} 
                        style={{ display: 'none' }} 
                        accept="image/*"
                        onChange={handlePhotoUpload}
                    />
                </div>
                
                <div className="profile-info">
                    <div className="profile-username" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span>@{user.username || user.full_name?.toLowerCase().replace(/\s/g, '')}</span>
                        {user.subscription_tier === 'silver' && <span className="premium-badge silver">🥈 Silver Member</span>}
                        {user.subscription_tier === 'gold' && <span className="premium-badge gold">🥇 Gold Elite</span>}
                        {user.subscription_tier === 'diamond' && <span className="premium-badge diamond">💎 Diamond Elite</span>}
                        {user.subscription_tier === 'legend' && <span className="premium-badge legend">👑 Legend</span>}
                    </div>
                    <div className="tags-row">
                        {user.relationship_status && !user.hide_status && 
                            <span className="tag status">{user.relationship_status}</span>
                        }
                    </div>

                    {/* Bio Section */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', maxWidth: '100%', marginTop: '8px', gap: '8px' }}>
                        <div className={`profile-bio ${!user.bio ? 'empty':''}`} onClick={() => setActiveModal('edit-bio')} title={user.bio || ''} style={{ flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {user.bio || "Add a bio"}
                        </div>
                    </div>
                </div>
            </div>

            {/* Compact Stats Card */}
            <div className="profile-stats-card">
                <div className="stats-item">
                    <span className="stats-icon">👥</span>
                    <span className="stats-value">{friendsCount} Friends</span>
                </div>
                <div className="stats-item">
                    <span className="stats-icon">💭</span>
                    <span className="stats-value">18 Thoughts</span>
                </div>
                <div className="stats-item" onClick={() => navigate('/profile/streak')} style={{ cursor: 'pointer' }}>
                    <span className="stats-icon">🔥</span>
                    <span className="stats-value">{user.current_streak || 0} Day Streak</span>
                </div>
                <div className="stats-item" onClick={() => navigate('/profile/achievements')}>
                    <span className="stats-icon">🏆</span>
                    <span className="stats-value">{unlockedAchievements.length} Badges</span>
                </div>
            </div>

            {/* Premium Entry */}
            <div className="premium-preview-card minimal" onClick={() => navigate('/subscription')}>
                <div className="premium-preview-content">
                    <div className="premium-icon-box">
                        💎
                    </div>
                    <div className="premium-text-group">
                        <span className="premium-title">Nearo Premium</span>
                        <span className="premium-subtitle">
                            {user.subscription_tier === 'diamond' ? '💎 Diamond Elite' 
                            : user.subscription_tier === 'gold' ? '🥇 Gold Elite' 
                            : user.subscription_tier === 'silver' ? '🥈 Silver Member' 
                            : 'Current Plan: Free'}
                        </span>
                    </div>
                </div>
                <button className="premium-upgrade-btn">Upgrade &rarr;</button>
            </div>

            {/* Achievements Preview */}
            <div className="achievements-preview-card minimal" onClick={() => navigate('/profile/achievements')}>
                <div className="achievements-preview-header">
                    <span className="achievements-title">🏆 Achievements ({unlockedAchievements.length}/6)</span>
                    <span className="view-all-link">View All &rarr;</span>
                </div>
                <div className="achievements-preview-row minimal-row">
                    {ACHIEVEMENTS.map(ach => {
                        const isUnlocked = unlockedAchievements.includes(ach.id);
                        if (!isUnlocked) return null;
                        return (
                            <span key={ach.id} className="achievement-icon-bubble unlocked" title={ach.title}>
                                {ach.icon}
                            </span>
                        );
                    })}
                </div>
            </div>

            {/* Insights Entry */}
            <div className="menu-group" style={{ margin: '0 16px 16px 16px' }}>
                <MenuItem
                    icon={<span style={{ fontSize: '1.2rem' }}>👀</span>}
                    label="Insights"
                    value="Profile Views & Analytics"
                    hasArrow={true}
                    iconClass="icon-interests"
                    onClick={() => navigate('/profile/insights')}
                />
            </div>

            <div className="scroll-content">


                {/* Section: Personal Information */}
                <div className="section-label">Personal Information</div>
                <div className="menu-group">
                    <MenuItem
                        icon={<div style={{ fontSize: '1.2rem', lineHeight: 1 }}>{user.mood || '😶'}</div>}
                        label="Mood"
                        value={user.mood ? 'Change Mood' : 'Add Mood'}
                        iconClass="icon-personal"
                        onClick={() => setActiveModal('edit-mood')}
                    />
                    <MenuItem
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>}
                        label="Username"
                        value={`@${user.username || user.full_name?.toLowerCase().replace(/\s/g, '')}`} 
                        iconClass="icon-personal"
                        onClick={() => setActiveModal('edit-name')}
                    />
                    <MenuItem
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>}
                        label="Bio"
                        value={user.bio || 'Add Bio'} 
                        iconClass="icon-bio"
                        onClick={() => setActiveModal('edit-bio')}
                    />
                    <MenuItem
                        icon={<span style={{fontSize: '1rem'}}>💕</span>}
                        label="Relationship Status" 
                        value={user.relationship_status || 'Add Status'} 
                        iconClass="icon-personal"
                        onClick={() => setActiveModal('edit-relationship')}
                    />
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
                    <MenuItem
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>}
                        label="Birthday"
                        value={user.birth_date ? new Date(user.birth_date).toLocaleDateString() : 'Add Birthday'}
                        iconClass="icon-birthday"
                        onClick={() => setActiveModal('edit-birthday')}
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
                                onChange={async (e) => await updateProfile({ hide_status: e.target.checked })}
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
                        </div>
                        <label className="toggle-switch">
                            <input 
                                type="checkbox" 
                                checked={user.show_last_seen !== false}
                                onChange={async (e) => await updateProfile({ show_last_seen: e.target.checked })}
                            />
                            <span className="toggle-slider"></span>
                        </label>
                    </div>
                </div>

                {/* Section: Settings */}
                <div className="section-label">Settings</div>
                <div className="menu-group">
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
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>}
                        label="Notifications"
                        value={user.mute_settings?.mute_all ? 'DND Enabled' : (user.mute_settings?.message && user.mute_settings.message !== 'Never' ? `Muted: ${user.mute_settings.message}` : '')}
                        hasArrow={true}
                        iconClass="icon-notif"
                        onClick={() => setActiveModal('notifications')}
                    />

                    <MenuItem
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
                        label="Privacy"
                        value="Manage visibility, locations & password"
                        hasArrow={true}
                        iconClass="icon-lock"
                        onClick={() => setActiveModal('privacy-settings')}
                    />

                    <MenuItem
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>}
                        label="Chat Wallpaper"
                        hasArrow={true}
                        iconClass="icon-interests"
                        onClick={() => setActiveModal('wallpaper')}
                    />

                    <MenuItem 
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>}
                        label="Blocked Users" 
                        hasArrow={true}
                        iconClass="icon-block"
                        onClick={() => navigate('/blocked-users')}
                    />

                    <MenuItem 
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>}
                        label="Safety Center" 
                        hasArrow={true}
                        iconClass="icon-safety"
                        onClick={() => navigate('/legal/safety')}
                    />

                    <MenuItem 
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>}
                        label="Terms of Service" 
                        hasArrow={true}
                        iconClass="icon-safety"
                        onClick={() => navigate('/legal/terms')}
                    />
                </div>

                <button className="logout-btn" onClick={() => setActiveModal('logout-confirm')}>
                    Log Out
                </button>

                <div className="version-info">Nearo v1.0.0</div>
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
                        <p style={{ color: 'rgba(0,0,0,0.6)', fontSize: '0.95rem', lineHeight: '1.5', margin: 0 }}>
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
            {activeModal && activeModal !== 'photo-options' && (
                <div className="modal-backdrop" onClick={(e) => {
                    if (e.target === e.currentTarget) setActiveModal(null);
                }}>
                    <div className={`modal-content ${(activeModal === 'delete' || activeModal === 'logout-confirm') ? 'modal-confirm-layout' : ''}`}>
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
                                        updateProfile({ username: newUsername.trim().replace(/\s/g, '') });
                                        setActiveModal(null);
                                    }
                                }} className="modal-form">
                                    <div className="input-group">
                                        <label>Username (without @)</label>
                                        <input 
                                            type="text" 
                                            name="username"
                                            placeholder="username"
                                            defaultValue={user.username || user.full_name?.replace(/\s/g, '')}
                                            autoFocus
                                            required
                                            pattern="[a-zA-Z0-9_]+"
                                            title="Only letters, numbers, and underscores allowed"
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
                                    <div className="input-group" style={{ position: 'relative' }}>
                                        <label>Current Password</label>
                                        <input 
                                            type={showPasswords.current ? "text" : "password"} 
                                            placeholder="Enter current password"
                                            value={passForm.current} 
                                            onChange={e => setPassForm({ ...passForm, current: e.target.value })} 
                                            style={{ paddingRight: '40px' }}
                                        />
                                        <button 
                                            type="button" 
                                            onClick={() => setShowPasswords({...showPasswords, current: !showPasswords.current})} 
                                            style={{ position: 'absolute', right: '12px', top: '38px', background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: 0, fontSize: '1.2rem' }}
                                        >
                                            {showPasswords.current ? '👁️' : '👁️‍🗨️'}
                                        </button>
                                    </div>
                                    <div className="input-group" style={{ position: 'relative' }}>
                                        <label>New Password</label>
                                        <input 
                                            type={showPasswords.new ? "text" : "password"} 
                                            placeholder="Enter new password"
                                            value={passForm.new} 
                                            onChange={e => setPassForm({ ...passForm, new: e.target.value })} 
                                            style={{ paddingRight: '40px' }}
                                        />
                                        <button 
                                            type="button" 
                                            onClick={() => setShowPasswords({...showPasswords, new: !showPasswords.new})} 
                                            style={{ position: 'absolute', right: '12px', top: '38px', background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: 0, fontSize: '1.2rem' }}
                                        >
                                            {showPasswords.new ? '👁️' : '👁️‍🗨️'}
                                        </button>
                                    </div>
                                    <div className="input-group" style={{ position: 'relative' }}>
                                        <label>Confirm Password</label>
                                        <input 
                                            type={showPasswords.confirm ? "text" : "password"} 
                                            placeholder="Confirm new password"
                                            value={passForm.confirm} 
                                            onChange={e => setPassForm({ ...passForm, confirm: e.target.value })} 
                                            style={{ paddingRight: '40px' }}
                                        />
                                        <button 
                                            type="button" 
                                            onClick={() => setShowPasswords({...showPasswords, confirm: !showPasswords.confirm})} 
                                            style={{ position: 'absolute', right: '12px', top: '38px', background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: 0, fontSize: '1.2rem' }}
                                        >
                                            {showPasswords.confirm ? '👁️' : '👁️‍🗨️'}
                                        </button>
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
                                <h3>Delete Account?</h3>
                                <p>This action is permanent and cannot be undone.</p>
                                <div className="modal-footer">
                                    <button onClick={() => setActiveModal(null)} className="btn-sec">Keep</button>
                                    <button onClick={handleDeleteAccount} className="btn-danger">Delete</button>
                                </div>
                            </>
                        )}
                        {activeModal === 'logout-confirm' && (
                            <>
                                <div className="icon-warn">⚠️</div>
                                <h3>Log Out?</h3>
                                <p>Are you sure you want to log out?</p>
                                <div className="modal-footer">
                                    <button onClick={() => setActiveModal(null)} className="btn-sec">Cancel</button>
                                    <button onClick={handleLogout} className="btn-danger">Yes, Log Out</button>
                                </div>
                            </>
                        )}



                        {activeModal === 'edit-mood' && (
                            <>
                                <div className="modal-header"><h3>Select Your Mood</h3></div>
                                <div className="modal-form">
                                    <div className="mood-selector" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginBottom: '20px' }}>
                                        {['😊', '😎', '😴', '🥳', '🤔', '😭', '🤯', '😡', '🤢', '👽', '👻', '💩', '☕️', '🍕', '🎮', '🎧'].map(emoji => (
                                            <div 
                                                key={emoji} 
                                                onClick={async () => {
                                                    await updateProfile({ mood: emoji, mood_updated_at: new Date().toISOString() });
                                                    setActiveModal(null);
                                                }}
                                                style={{
                                                    fontSize: '2rem',
                                                    cursor: 'pointer',
                                                    padding: '10px',
                                                    borderRadius: '50%',
                                                    background: user.mood === emoji ? 'rgba(0, 132, 255, 0.2)' : 'transparent',
                                                    border: user.mood === emoji ? '1px solid #0084ff' : '1px solid transparent',
                                                    transition: 'all 0.2s ease-in-out',
                                                }}
                                            >
                                                {emoji}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="modal-footer">
                                        <button type="button" onClick={() => setActiveModal(null)} className="btn-sec">Cancel</button>
                                        {user.mood && (
                                            <button type="button" onClick={async () => {
                                                await updateProfile({ mood: null, mood_updated_at: null });
                                                setActiveModal(null);
                                            }} className="btn-danger">Remove Mood</button>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}

                        {activeModal === 'edit-relationship' && (
                            <>
                                <div className="modal-header">
                                    <div className="icon-wrapper icon-personal" style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        💕
                                    </div>
                                    <h3>Relationship Status</h3>
                                </div>
                                <form onSubmit={(e) => {
                                    e.preventDefault();
                                    const formData = new FormData(e.target);
                                    const newStatus = formData.get('relationship');
                                    if (newStatus) {
                                        updateProfile({ relationship_status: newStatus });
                                        setActiveModal(null);
                                    }
                                }} className="modal-form">
                                    <div className="input-group" style={{ position: 'relative' }}>
                                        <select 
                                            name="relationship"
                                            defaultValue={user.relationship_status || ''}
                                            className="modal-select"
                                        >
                                            <option value="" disabled>Select Status</option>
                                            <option value="Single">Single</option>
                                            <option value="Committed">Committed</option>
                                            <option value="Open to Date">Open to Date</option>
                                            <option value="Married">Married</option>
                                        </select>
                                        <div style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(0, 0, 0, 0.4)', fontSize: '0.8rem' }}>
                                            ▼
                                        </div>
                                    </div>
                                    <div className="modal-footer">
                                        <button type="button" onClick={() => setActiveModal(null)} className="btn-sec">Cancel</button>
                                        <button type="submit" className="btn-pri">Save</button>
                                    </div>
                                </form>
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
                                        <div style={{ position: 'relative' }}>
                                            <textarea 
                                                name="bio" 
                                                defaultValue={user.bio} 
                                                placeholder="Tell us about yourself..." 
                                                rows="4"
                                                maxLength="200"
                                                autoFocus 
                                                className="bio-textarea"
                                                style={{ paddingRight: '36px' }}
                                                onChange={(e) => {
                                                    const counter = e.target.parentElement.nextElementSibling;
                                                    if (counter) counter.textContent = `${e.target.value.length}/200 characters`;
                                                    
                                                    const clearBtn = e.target.parentElement.querySelector('.clear-bio-btn');
                                                    if (clearBtn) {
                                                        clearBtn.style.display = e.target.value.length > 0 ? 'flex' : 'none';
                                                    }
                                                }}
                                            />
                                            <button
                                                type="button"
                                                className="clear-bio-btn"
                                                title="Clear Text"
                                                style={{
                                                    position: 'absolute',
                                                    top: '12px',
                                                    right: '12px',
                                                    background: 'rgba(0, 0, 0, 0.06)',
                                                    border: 'none',
                                                    color: 'rgba(0, 0, 0, 0.4)',
                                                    width: '24px',
                                                    height: '24px',
                                                    borderRadius: '50%',
                                                    display: user.bio ? 'flex' : 'none',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s',
                                                    padding: 0
                                                }}
                                                onMouseEnter={e => { 
                                                    e.currentTarget.style.background = 'rgba(255, 59, 48, 0.15)';
                                                    e.currentTarget.style.color = '#ff3b30';
                                                }}
                                                onMouseLeave={e => { 
                                                    e.currentTarget.style.background = 'rgba(0, 0, 0, 0.06)';
                                                    e.currentTarget.style.color = 'rgba(0, 0, 0, 0.4)';
                                                }}
                                                onClick={(e) => {
                                                    const textarea = e.currentTarget.previousElementSibling;
                                                    if (textarea) {
                                                        textarea.value = '';
                                                        // Trigger onChange manually to update counter
                                                        const event = new Event('change', { bubbles: true });
                                                        textarea.dispatchEvent(event);
                                                        
                                                        const counter = e.currentTarget.parentElement.nextElementSibling;
                                                        if (counter) counter.textContent = `0/200 characters`;
                                                        
                                                        e.currentTarget.style.display = 'none';
                                                        textarea.focus();
                                                    }
                                                }}
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                                </svg>
                                            </button>
                                        </div>
                                        <div className="char-counter">
                                            {user.bio?.length || 0}/200 characters
                                        </div>
                                    </div>
                                    <div className="modal-footer">
                                        <button type="button" onClick={() => setActiveModal(null)} className="btn-sec">Cancel</button>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            {user.bio && (
                                                <button
                                                    type="button"
                                                    title="Delete Bio"
                                                    onClick={() => {
                                                        updateProfile({ bio: '' });
                                                        setActiveModal(null);
                                                    }}
                                                    style={{
                                                        background: 'rgba(255, 69, 58, 0.12)',
                                                        border: '1px solid rgba(255, 69, 58, 0.3)',
                                                        color: '#ff453a',
                                                        borderRadius: '10px',
                                                        padding: '10px 14px',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        transition: 'all 0.2s',
                                                    }}
                                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 69, 58, 0.25)'; }}
                                                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 69, 58, 0.12)'; }}
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>
                                                    </svg>
                                                </button>
                                            )}
                                            <button type="submit" className="btn-pri">Save Bio</button>
                                        </div>
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
                                            style={{ colorScheme: 'light' }} // Force light calendar
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
                                    {/* Upload Option */}
                                    <input 
                                        type="file" 
                                        ref={wallpaperInputRef}
                                        style={{ display: 'none' }}
                                        accept="image/*"
                                        onChange={handleWallpaperUpload}
                                    />
                                    <div 
                                        className="wallpaper-option upload-btn"
                                        onClick={() => wallpaperInputRef.current.click()}
                                    >
                                        {uploadingWallpaper ? '⏳' : '📤 Upload'}
                                    </div>
                                    {[
                                        { name: 'Default', value: '' }, // Null/Empty = Default Theme
                                        // Soft Gradients
                                        { name: 'Air', value: 'linear-gradient(to bottom, #E3F2FD, #FFFFFF)' },
                                        { name: 'Blush', value: 'linear-gradient(to bottom, #E1BEE7, #F8BBD0)' },
                                        { name: 'Fresh', value: 'linear-gradient(to bottom, #B2DFDB, #C8E6C9)' },
                                        // Minimal Patterns
                                        { name: 'Dots', value: 'radial-gradient(#cfd8dc 1.5px, transparent 1.5px) 0 0 / 24px 24px, #ffffff' },
                                        { name: 'Waves', value: 'radial-gradient(circle at 50% 120%, #81d4fa 0%, transparent 50%), radial-gradient(circle at 100% 0%, #e1bee7 0%, transparent 50%), #ffffff' },
                                        // Solids
                                        { name: 'Paper', value: '#F5F5F7' },
                                        { name: 'Sand', value: '#FDFbf7' },
                                        { name: 'Slate', value: '#f0f2f5' },
                                        // Legacy Favorites
                                        { name: 'Ocean', value: 'linear-gradient(to bottom, #2b5876, #4e4376)' },
                                        { name: 'Cyber', value: 'linear-gradient(to bottom, #0f0c29, #302b63, #24243e)' },
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
                        {activeModal === 'notifications' && (
                            <>
                                <div className="modal-header">
                                    <h3>Notification Settings</h3>
                                </div>
                                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    {/* Mute All Toggle */}
                                    <div className="menu-item" style={{ 
                                        padding: '12px 0', 
                                        borderBottom: '1px solid rgba(0,0,0,0.06)',
                                        background: 'transparent'
                                    }}>
                                        <div className="menu-content">
                                            <span className="menu-label" style={{ 
                                                fontSize: '1rem', 
                                                fontWeight: '600',
                                                color: user.mute_settings?.mute_all ? '#ff3b30' : '#1d1d1f'
                                            }}>
                                                Do Not Disturb
                                            </span>
                                            <span className="menu-hint" style={{ 
                                                fontSize: '0.8rem', 
                                                color: 'var(--text-secondary)',
                                                marginTop: '4px'
                                            }}>
                                                Mute all incoming calls and messages
                                            </span>
                                        </div>
                                        <label className="toggle-switch">
                                            <input 
                                                type="checkbox" 
                                                checked={user.mute_settings?.mute_all || false}
                                                onChange={(e) => {
                                                    // When toggling DND, we clear any timer
                                                    const newSettings = { 
                                                        ...user.mute_settings, 
                                                        mute_all: e.target.checked,
                                                        muted_until: null // Clear timer on manual toggle
                                                    };
                                                    updateProfile({ mute_settings: newSettings });
                                                }}
                                            />
                                            <span className="toggle-slider"></span>
                                        </label>
                                    </div>

                                    <div>

                                        <div className="submenu-hint" style={{ 
                                            transition: 'opacity 0.3s', 
                                            opacity: 1,
                                            marginBottom: '12px',
                                            color: 'var(--text-secondary)',
                                            fontWeight: '500'
                                        }}>
                                            Mute Duration
                                        </div>
                                        <div className="chip-grid">
                                            {['10 Minutes', '1 Hour', '24 Hours', 'Unmute'].map(dur => (
                                                <button
                                                    key={dur}
                                                    className={`chip-option ${(user.mute_settings?.message === dur || (dur === 'Unmute' && (!user.mute_settings?.message || user.mute_settings.message === 'Never'))) ? 'active' : ''}`}
                                                    onClick={() => handleMuteChange(dur)}
                                                >
                                                    {dur}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button onClick={() => setActiveModal(null)} className="btn-sec">Done</button>
                                </div>
                            </>
                        )}

                        {activeModal === 'premium-themes' && (
                            <>
                                <div className="modal-header">
                                    <h3>Premium Themes</h3>
                                </div>
                                <div className="chip-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', padding: '16px 0' }}>
                                    {[
                                        { id: 'default', name: 'Default ⚪' },
                                        { id: 'purple_glass', name: 'Purple Glass 🟣' },
                                        { id: 'ocean_blue', name: 'Ocean Blue 🔵' },
                                        { id: 'midnight_black', name: 'Midnight 🌑' },
                                        { id: 'sunset_orange', name: 'Sunset 🟠' }
                                    ].map(t => (
                                        <button
                                            key={t.id}
                                            className={`chip-option ${user.premium_theme === t.id ? 'active' : ''}`}
                                            onClick={async () => {
                                                await updateProfile({ premium_theme: t.id });
                                                setActiveModal(null);
                                            }}
                                        >
                                            {t.name}
                                        </button>
                                    ))}
                                </div>
                                <div className="modal-footer">
                                    <button onClick={() => setActiveModal(null)} className="btn-sec">Cancel</button>
                                </div>
                            </>
                        )}

                        {activeModal === 'avatar-effects' && (
                            <>
                                <div className="modal-header">
                                    <h3>Avatar Effects</h3>
                                </div>
                                <div className="chip-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', padding: '16px 0' }}>
                                    {[
                                        { id: 'none', name: 'None' },
                                        { id: 'neon_ring', name: 'Neon Ring 🟢' },
                                        { id: 'diamond_ring', name: 'Diamond Ring 💎' },
                                        { id: 'diamond_aura', name: 'Diamond Aura 🌌' },
                                        { id: 'galaxy_effect', name: 'Galaxy Effect 🌀' },
                                        { id: 'blue_glow', name: 'Blue Glow 🔵' },
                                        { id: 'animated_pulse', name: 'Animated Pulse 💓' }
                                    ].map(eff => (
                                        <button
                                            key={eff.id}
                                            className={`chip-option ${user.avatar_effect === eff.id ? 'active' : ''}`}
                                            onClick={async () => {
                                                await updateProfile({ avatar_effect: eff.id });
                                                setActiveModal(null);
                                            }}
                                        >
                                            {eff.name}
                                        </button>
                                    ))}
                                </div>
                                <div className="modal-footer">
                                    <button onClick={() => setActiveModal(null)} className="btn-sec">Cancel</button>
                                </div>
                            </>
                        )}

                        {activeModal === 'advanced-privacy' && (
                            <>
                                <div className="modal-header">
                                    <h3>🔒 Advanced Privacy</h3>
                                </div>
                                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '16px 0' }}>
                                    <div className="toggle-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Hide Mood Status</span>
                                        <label className="toggle-switch">
                                            <input 
                                                type="checkbox" 
                                                checked={user.hide_mood || false}
                                                onChange={async (e) => await updateProfile({ hide_mood: e.target.checked })}
                                            />
                                            <span className="toggle-slider"></span>
                                        </label>
                                    </div>
                                    <div className="toggle-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Hide Last Seen</span>
                                        <label className="toggle-switch">
                                            <input 
                                                type="checkbox" 
                                                checked={user.hide_last_seen || false}
                                                onChange={async (e) => await updateProfile({ hide_last_seen: e.target.checked })}
                                            />
                                            <span className="toggle-slider"></span>
                                        </label>
                                    </div>
                                    <div className="toggle-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Hide Relationship Status</span>
                                        <label className="toggle-switch">
                                            <input 
                                                type="checkbox" 
                                                checked={user.hide_relationship_status || false}
                                                onChange={async (e) => await updateProfile({ hide_relationship_status: e.target.checked })}
                                            />
                                            <span className="toggle-slider"></span>
                                        </label>
                                    </div>
                                    <div className="toggle-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Hide Online Status</span>
                                        <label className="toggle-switch">
                                            <input 
                                                type="checkbox" 
                                                checked={user.hide_online_status || false}
                                                onChange={async (e) => await updateProfile({ hide_online_status: e.target.checked })}
                                            />
                                            <span className="toggle-slider"></span>
                                        </label>
                                    </div>
                                    <div className="toggle-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Hide Birthday</span>
                                        <label className="toggle-switch">
                                            <input 
                                                type="checkbox" 
                                                checked={user.hide_birthday || false}
                                                onChange={async (e) => await updateProfile({ hide_birthday: e.target.checked })}
                                            />
                                            <span className="toggle-slider"></span>
                                        </label>
                                    </div>
                                    <div className="toggle-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Hide Institute / Work</span>
                                        <label className="toggle-switch">
                                            <input 
                                                type="checkbox" 
                                                checked={user.hide_institute || false}
                                                onChange={async (e) => await updateProfile({ hide_institute: e.target.checked })}
                                            />
                                            <span className="toggle-slider"></span>
                                        </label>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button onClick={() => setActiveModal(null)} className="btn-sec">Done</button>
                                </div>
                            </>
                        )}

                        {activeModal === 'privacy-settings' && (
                            <>
                                <div className="modal-header">
                                    <h3>🔒 Privacy Settings</h3>
                                </div>
                                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '16px 0' }}>
                                    <div className="toggle-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span className="menu-label">Public Profile</span>
                                        <label className="toggle-switch">
                                            <input 
                                                type="checkbox" 
                                                checked={user.is_public !== false}
                                                onChange={async (e) => {
                                                    const newValue = e.target.checked;
                                                    if (newValue) {
                                                        setShowPublicConfirm(true);
                                                    } else {
                                                        await updateProfile({ is_public: false });
                                                    }
                                                }}
                                            />
                                            <span className="toggle-slider"></span>
                                        </label>
                                    </div>
                                    <div className="toggle-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span className="menu-label">Location Services</span>
                                            <span className="menu-hint" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                {locationEnabled ? 'Visible on map' : 'Location hidden'}
                                            </span>
                                        </div>
                                        <label className="toggle-switch">
                                            <input 
                                                type="checkbox" 
                                                checked={locationEnabled}
                                                onChange={async (e) => {
                                                    const checked = e.target.checked;
                                                    if (checked) {
                                                        startLocation(true);        
                                                        await updateProfile({
                                                            is_ghost_mode: false,
                                                            is_location_on: true,
                                                            visibility_mode: user.visibility_mode === 'ghost' ? 'public' : (user.visibility_mode || 'public')
                                                        });
                                                    } else {
                                                        stopLocation();
                                                        await updateProfile({ is_location_on: false });
                                                    }
                                                }}  
                                            />
                                            <span className="toggle-slider"></span>
                                        </label>
                                    </div>
                                    <MenuItem
                                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
                                        label="Map Visibility"
                                        value={user.visibility_mode === 'ghost' ? 'Ghost Mode' : user.visibility_mode === 'friends' ? 'Friends Only' : 'Public'}
                                        hasArrow={true}
                                        onClick={() => { setActiveModal(null); navigate('/visibility-settings'); }}
                                    />
                                    <MenuItem
                                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
                                        label="Change Password"
                                        hasArrow={true}
                                        onClick={() => setActiveModal('password')}
                                    />
                                    <MenuItem
                                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>}
                                        label="Delete Account"
                                        style={{ color: '#ff453a' }}
                                        onClick={() => setActiveModal('delete')}
                                    />
                                </div>
                                <div className="modal-footer">
                                    <button onClick={() => setActiveModal(null)} className="btn-sec">Done</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}





            {/* Styles moved to Profile.css */}
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
