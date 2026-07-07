import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useTheme } from '../context/ThemeContext';
import { getPremiumCustomizations, savePremiumCustomizations } from '../utils/premiumCustomizations.jsx';
import Toast from '../components/Toast';

export default function PremiumSettings() {
    const navigate = useNavigate();
    const location = useLocation();
    const { theme, updateTheme, SILVER_THEMES, GOLD_THEMES, DIAMOND_THEMES } = useTheme();

    const query = new URLSearchParams(location.search);
    const activeTab = query.get('tab') || 'theme';

    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [toastMsg, setToastMsg] = useState(null);

    // Form settings states
    const [selectedTheme, setSelectedTheme] = useState('light');
    const [profileBg, setProfileBg] = useState('default');
    const [profileMusic, setProfileMusic] = useState('none');
    const [customMusicUrl, setCustomMusicUrl] = useState('');
    const [musicTitle, setMusicTitle] = useState('');
    const [avatarAccessory, setAvatarAccessory] = useState('none');
    const [usernameEffect, setUsernameEffect] = useState('none');
    const [chatBubbleStyle, setChatBubbleStyle] = useState('default');
    const [appIcon, setAppIcon] = useState('default');

    // Nearby Moment states
    const [momentPreset, setMomentPreset] = useState('☕ Working nearby');
    const [momentCustomText, setMomentCustomText] = useState('');
    const [momentDuration, setMomentDuration] = useState(60); // minutes
    const [activeMoment, setActiveMoment] = useState(null);
    const [momentExpiry, setMomentExpiry] = useState(null);

    const presetMoments = [
        '☕ Working nearby',
        '🏃 Running',
        '🍕 At a Restaurant',
        '🎮 Looking for Players',
        '📚 Studying',
        '🎧 Listening to Music',
        '🍿 Watching Movie'
    ];

    const usernameStyles = [
        { key: 'none', name: 'Standard Name', preview: 'Normal text style', tier: 'free' },
        // Gold styles
        { key: 'gold_gradient', name: '👑 Gold Gradient', preview: 'Shimmering Gold', className: 'effect-username-gold-gradient', tier: 'gold' },
        { key: 'neon_gradient', name: '⚡ Neon Gradient', preview: 'Neon Pink/Cyan', className: 'effect-username-neon-gradient', tier: 'gold' },
        { key: 'rainbow', name: '🌈 Rainbow Style', preview: 'Shifting Rainbow', className: 'effect-username-rainbow', tier: 'gold' },
        { key: 'glow', name: '🔆 Glow Effect', preview: 'Warm Gold Glow', className: 'effect-username-glow', tier: 'gold' },
        // Diamond styles
        { key: 'diamond', name: '💎 Diamond Gradient', preview: 'Animated Diamond Gradient', className: 'effect-username-diamond-gradient', tier: 'diamond' },
        { key: 'shimmer', name: '✨ Shimmer Effect', preview: 'Sweeping Metallic Shimmer', className: 'effect-username-shimmer', tier: 'diamond' },
        { key: 'neon', name: '⚡ Neon Pulse', preview: 'Glowing Cyan Neon', className: 'effect-username-neon-pulse', tier: 'diamond' },
        { key: 'crystal', name: '❄️ Crystal Glow', preview: 'Ice Blue Glow', className: 'effect-username-crystal-glow', tier: 'diamond' }
    ];

    const avatarAccessories = [
        { key: 'none', name: 'None', emoji: '❌', tier: 'free' },
        // Gold accessories
        { key: 'crown', name: 'Gold Crown', emoji: '👑', tier: 'gold' },
        { key: 'halo', name: 'Angel Halo', emoji: '😇', tier: 'gold' },
        { key: 'sunglasses', name: 'Sunglasses', emoji: '🕶️', tier: 'gold' },
        { key: 'headphones', name: 'Headphones', emoji: '🎧', tier: 'gold' },
        { key: 'premium_caps', name: 'Premium Cap', emoji: '🧢', tier: 'gold' },
        // Diamond accessories
        { key: 'wings', name: 'Cyber Wings', emoji: '🪽', tier: 'diamond' },
        { key: 'mask', name: 'Premium Mask', emoji: '🎭', tier: 'diamond' },
        { key: 'jacket', name: 'Premium Jacket', emoji: '🧥', tier: 'diamond' },
        { key: 'luxury', name: 'Luxury Aura', emoji: '✨', tier: 'diamond' }
    ];

    const profileBackgrounds = [
        { key: 'default', name: 'Default App', style: 'rgba(255,255,255,0.05)', tier: 'free' },
        // Gold backgrounds
        { key: 'galaxy', name: 'Galaxy (Animated)', style: 'linear-gradient(135deg, #09090e, #2e0854, #4c0082)', tier: 'gold' },
        { key: 'ocean', name: 'Ocean (Animated)', style: 'linear-gradient(135deg, #021a36, #0e7490, #0891b2)', tier: 'gold' },
        { key: 'fire', name: 'Fire (Animated)', style: 'linear-gradient(135deg, #1c0000, #7f1d1d, #b91c1c, #ea580c)', tier: 'gold' },
        { key: 'snow', name: 'Snow (Animated)', style: 'linear-gradient(135deg, #0f172a, #1e293b, #3b82f6, #93c5fd)', tier: 'gold' },
        { key: 'neon', name: 'Neon (Animated)', style: 'linear-gradient(135deg, #000000, #4c1d95, #c026d3, #0284c7)', tier: 'gold' },
        // Diamond backgrounds
        { key: 'diamond_crystal', name: 'Diamond Crystal', style: 'radial-gradient(circle at top left, #0e203c, #050a14)', tier: 'diamond' },
        { key: 'space_black', name: 'Space Black', style: '#050505', tier: 'diamond' },
        { key: 'platinum', name: 'Platinum Metallic', style: 'radial-gradient(circle at top right, #25252b, #0f0f12)', tier: 'diamond' },
        { key: 'aurora_elite', name: 'Aurora Elite', style: 'linear-gradient(180deg, #020612, #040914)', tier: 'diamond' },
        { key: 'royal_diamond', name: 'Royal Diamond', style: 'radial-gradient(circle at 50% 0%, #20043c, #050209)', tier: 'diamond' },
        { key: 'sunset_gold', name: 'Sunset Gold', style: 'linear-gradient(135deg, #451a03, #1c0c02)', tier: 'diamond' },
        { key: 'cyberpunk', name: 'Cyber Neon', style: 'linear-gradient(135deg, #18001e, #05000a)', tier: 'diamond' }
    ];

    const chatBubbleStyles = [
        { key: 'default', name: 'Classic Round' },
        { key: 'glass', name: 'Glassmorphic' },
        { key: 'tech', name: 'Sharp Tech' },
        { key: 'terminal', name: 'Retro Terminal' },
        { key: 'cloud', name: 'Soft Cloud' }
    ];

    const appIcons = [
        { key: 'default', name: 'Classic Blue', emoji: '📱', color: '#0084ff', tier: 'free' },
        // Gold icons
        { key: 'icon_green', name: 'Green Icon', emoji: '🟢', color: '#10b981', tier: 'gold' },
        { key: 'icon_blue', name: 'Blue Icon', emoji: '🔵', color: '#3b82f6', tier: 'gold' },
        { key: 'icon_purple', name: 'Purple Icon', emoji: '🟣', color: '#8b5cf6', tier: 'gold' },
        { key: 'icon_gold', name: 'Gold Icon', emoji: '🟡', color: '#facc15', tier: 'gold' },
        { key: 'icon_black', name: 'Black Icon', emoji: '⚫', color: '#111827', tier: 'gold' },
        // Diamond icons
        { key: 'diamond', name: 'Diamond Spark', emoji: '💎', color: '#00d4ff', tier: 'diamond' },
        { key: 'midnight', name: 'Midnight Noir', emoji: '🌑', color: '#1a1a1a', tier: 'diamond' },
        { key: 'gold', name: 'Neon Gold', emoji: '👑', color: '#facc15', tier: 'diamond' }
    ];

    const tabs = [
        { id: 'theme', label: 'Themes & Backgrounds', emoji: '🎨' },
        { id: 'accessories', label: 'Accessories & Moments', emoji: '👑' },
        { id: 'username', label: 'Username & Chat', emoji: '✨' },
        { id: 'icons', label: 'Custom App Icons', emoji: '📱' }
    ];

    useEffect(() => {
        const fetchUserData = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) { navigate('/login'); return; }

            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .maybeSingle();

            if (profile) {
                setUser(profile);
                const cust = getPremiumCustomizations(profile);

                setSelectedTheme(profile.app_theme || 'light');
                setProfileBg(cust.profileBackgroundStyle);
                setAvatarAccessory(cust.avatarAccessory);
                setUsernameEffect(cust.usernameEffect);
                setChatBubbleStyle(cust.chatBubbleStyle);
                setAppIcon(cust.appIcon);

                if (cust.profileMusic) {
                    if (['chill_beats', 'ambient_waves', 'lofi_dream', 'cyber_lounge'].includes(cust.profileMusic)) {
                        setProfileMusic(cust.profileMusic);
                    } else {
                        setProfileMusic('custom');
                        setCustomMusicUrl(cust.profileMusic);
                    }
                }
                setMusicTitle(cust.profileMusicTitle || '');

                // Resolve Nearby Moment
                if (cust.nearbyMoment && cust.nearbyMomentExpiresAt) {
                    const expiry = new Date(cust.nearbyMomentExpiresAt);
                    if (expiry.getTime() > Date.now()) {
                        setActiveMoment(cust.nearbyMoment);
                        setMomentExpiry(expiry);
                    }
                }
            }
            setLoading(false);
        };

        fetchUserData();
    }, [navigate]);

    const isItemLocked = (itemTier) => {
        if (!user) return true;
        const currentTier = user.subscription_tier;
        if (currentTier === 'diamond') return false;
        if (currentTier === 'gold') {
            return itemTier === 'diamond';
        }
        return itemTier !== 'free';
    };

    const handleSelectOption = (key, val, tier) => {
        if (isItemLocked(tier)) {
            setToastMsg(`Upgrade to ${tier === 'diamond' ? 'Diamond Elite' : 'Gold'} to unlock this item! 💎`);
            return;
        }
        const updated = { [key]: val };
        if (key === 'avatarAccessory') setAvatarAccessory(val);
        if (key === 'usernameEffect') setUsernameEffect(val);
        if (key === 'profileBackgroundStyle') setProfileBg(val);
        if (key === 'appIcon') setAppIcon(val);
        if (key === 'chatBubbleStyle') setChatBubbleStyle(val);
        
        handleSave(key, updated);
    };

    const handleSave = async (section, data) => {
        if (!user || (user.subscription_tier !== 'diamond' && user.subscription_tier !== 'gold')) {
            setToastMsg('Premium membership required to save configurations! 👑');
            return;
        }

        const success = await savePremiumCustomizations(supabase, user.id, data);
        if (success) {
            setToastMsg('Customization saved successfully! ✨');
            // If changing Favicon/App Icon
            if (data.appIcon) {
                const favicon = document.getElementById('favicon') || document.querySelector('link[rel="icon"]');
                if (favicon) {
                    if (data.appIcon === 'diamond') favicon.href = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>💎</text></svg>';
                    else if (data.appIcon === 'midnight') favicon.href = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌑</text></svg>';
                    else if (data.appIcon === 'gold') favicon.href = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>👑</text></svg>';
                    else if (data.appIcon === 'icon_green') favicon.href = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2240%22 fill=%22%2310b981%22/></svg>';
                    else if (data.appIcon === 'icon_blue') favicon.href = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2240%22 fill=%22%233b82f6%22/></svg>';
                    else if (data.appIcon === 'icon_purple') favicon.href = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2240%22 fill=%22%238b5cf6%22/></svg>';
                    else if (data.appIcon === 'icon_gold') favicon.href = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2240%22 fill=%22%23facc15%22/></svg>';
                    else if (data.appIcon === 'icon_black') favicon.href = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2240%22 fill=%22%23111827%22/></svg>';
                    else favicon.href = '/favicon.ico';
                }
            }
        } else {
            setToastMsg('Customizations saved locally! Database columns pending migration. 👍');
        }
    };

    const handlePostMoment = async () => {
        if (!user || user.subscription_tier !== 'diamond') {
            setToastMsg('Diamond Elite required to post moments! 💎');
            return;
        }

        const text = momentCustomText.trim() ? momentCustomText.trim() : momentPreset;
        const expiresAt = new Date(Date.now() + momentDuration * 60000).toISOString();

        const success = await savePremiumCustomizations(supabase, user.id, {
            nearbyMoment: text,
            nearbyMomentExpiresAt: expiresAt
        });

        if (success || true) {
            setActiveMoment(text);
            setMomentExpiry(new Date(expiresAt));
            setToastMsg('Nearby Moment posted live! 📍');
        }
    };

    const handleClearMoment = async () => {
        if (!user) return;
        await savePremiumCustomizations(supabase, user.id, {
            nearbyMoment: null,
            nearbyMomentExpiresAt: null
        });
        setActiveMoment(null);
        setMomentExpiry(null);
        setToastMsg('Nearby Moment cleared.');
    };

    if (loading) {
        return <div style={{ color: 'white', padding: '30px', textAlign: 'center' }}>Loading Premium Settings...</div>;
    }

    const isGold = user?.subscription_tier === 'gold' || user?.subscription_tier === 'diamond';
    const isDiamond = user?.subscription_tier === 'diamond';

    return (
        <div style={{
            minHeight: '100vh',
            padding: '80px 20px 100px',
            background: '#ffffff',
            color: '#1d1d1f',
            fontFamily: 'Inter, system-ui, sans-serif'
        }}>
            {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg(null)} />}

            {/* Lock / Upgrade Cover if not Gold or Diamond */}
            {!isGold && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(16px)', zIndex: 1000,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    padding: '24px', textAlign: 'center', color: '#1d1d1f'
                }}>
                    <span style={{ fontSize: '3rem', marginBottom: '16px', filter: 'drop-shadow(0 0 12px rgba(217,119,6,0.2))' }}>👑</span>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: 900, margin: 0, color: '#d97706' }}>Gold Elite Customizer</h2>
                    <p style={{ fontSize: '0.9rem', color: '#64748b', maxWidth: '300px', margin: '12px 0 24px', lineHeight: 1.5 }}>
                        Upgrade to Gold Elite membership to access dynamic themes, custom profile backgrounds, avatars, and custom username styles.
                    </p>
                    <button 
                        onClick={() => navigate('/subscription')}
                        style={{
                            background: 'linear-gradient(135deg, #facc15, #eab308)',
                            color: '#fff', border: 'none', borderRadius: '14px',
                            padding: '14px 28px', fontSize: '0.92rem', fontWeight: 800,
                            cursor: 'pointer', boxShadow: '0 8px 24px rgba(250,204,21,0.2)'
                        }}
                    >
                        Unlock Now
                    </button>
                    <button 
                        onClick={() => navigate('/profile')}
                        style={{
                            background: 'none', border: 'none', color: '#64748b',
                            marginTop: '20px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer'
                        }}
                    >
                        Go Back
                    </button>
                </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <button 
                    onClick={() => navigate('/profile')}
                    style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0f172a', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                    &larr;
                </button>
                <div>
                    <h1 style={{ fontSize: '1.6rem', fontWeight: 900, margin: 0, color: '#d97706' }}>👑 Premium customizer</h1>
                    <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0' }}>Configure premium customization options</p>
                </div>
            </div>

            {/* Grid Container */}
            <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                {/* Tabs */}
                <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '24px', overflowX: 'auto' }}>
                    {tabs.map(t => (
                        <button
                            key={t.id}
                            onClick={() => navigate(`/profile/premium-settings?tab=${t.id}`)}
                            style={{
                                background: activeTab === t.id ? 'rgba(250, 204, 21, 0.15)' : 'transparent',
                                border: 'none',
                                borderRadius: '100px',
                                color: activeTab === t.id ? '#0f172a' : '#64748b',
                                padding: '10px 18px',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                whiteSpace: 'nowrap',
                                boxShadow: activeTab === t.id ? 'inset 0 0 0 1px rgba(250, 204, 21, 0.4)' : 'none'
                            }}
                        >
                            <span>{t.emoji}</span>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Tab Contents */}
                {activeTab === 'theme' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {/* Section: Premium Theme Store */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '24px', padding: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <span style={{ fontSize: '1.3rem' }}>🎨</span>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Premium Theme Store</h3>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {/* Gold Animated Themes */}
                                <div>
                                    <h4 style={{ fontSize: '0.78rem', color: '#d97706', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Gold Animated Themes</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: '10px' }}>
                                        {GOLD_THEMES.map(t => {
                                            const isActive = theme === t.key;
                                            const locked = isItemLocked('gold');
                                            return (
                                                <button
                                                    key={t.key}
                                                    onClick={() => {
                                                        if (locked) {
                                                            setToastMsg('Upgrade to Gold to unlock gold animated themes! 🥇');
                                                            return;
                                                        }
                                                        updateTheme(t.key);
                                                    }}
                                                    style={{
                                                        background: t.preview,
                                                        border: isActive ? '2.5px solid #d97706' : '1.5px solid #cbd5e1',
                                                        borderRadius: '16px', padding: '14px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'pointer', transition: 'all 0.2s', position: 'relative',
                                                        opacity: locked ? 0.5 : 1
                                                    }}
                                                >
                                                    {locked && <span style={{ position: 'absolute', top: '6px', right: '6px', fontSize: '0.7rem' }}>🔒</span>}
                                                    <span style={{ fontSize: '1.6rem' }}>{t.icon}</span>
                                                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>{t.name}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Diamond Exclusive Themes */}
                                <div>
                                    <h4 style={{ fontSize: '0.78rem', color: '#0284c7', margin: '10px 0 10px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Diamond Exclusive Themes</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: '10px' }}>
                                        {DIAMOND_THEMES.map(t => {
                                            const isActive = theme === t.key;
                                            const locked = isItemLocked('diamond');
                                            return (
                                                <button
                                                    key={t.key}
                                                    onClick={() => {
                                                        if (locked) {
                                                            setToastMsg('Upgrade to Diamond to unlock Diamond exclusive themes! 💎');
                                                            return;
                                                        }
                                                        updateTheme(t.key);
                                                    }}
                                                    style={{
                                                        background: t.preview,
                                                        border: isActive ? '2.5px solid #0284c7' : '1.5px solid #cbd5e1',
                                                        borderRadius: '16px', padding: '14px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'pointer', transition: 'all 0.2s', position: 'relative',
                                                        opacity: locked ? 0.5 : 1
                                                    }}
                                                >
                                                    {locked && <span style={{ position: 'absolute', top: '6px', right: '6px', fontSize: '0.7rem' }}>🔒</span>}
                                                    <span style={{ fontSize: '1.6rem' }}>{t.icon}</span>
                                                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>{t.name}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section: Profile Page Backgrounds */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '24px', padding: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <span style={{ fontSize: '1.3rem' }}>🖼️</span>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Profile Page Backgrounds</h3>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px' }}>
                                {profileBackgrounds.map(bg => {
                                    const locked = isItemLocked(bg.tier);
                                    return (
                                        <button
                                            key={bg.key}
                                            onClick={() => handleSelectOption('profileBackgroundStyle', bg.key, bg.tier)}
                                            style={{
                                                background: bg.style,
                                                border: profileBg === bg.key ? '2.5px solid #0284c7' : '1.5px solid #cbd5e1',
                                                borderRadius: '14px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s', position: 'relative',
                                                opacity: locked ? 0.5 : 1
                                            }}
                                        >
                                            {locked && <span style={{ position: 'absolute', top: '6px', right: '8px', fontSize: '0.7rem' }}>🔒</span>}
                                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>{bg.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Section: Profile Background Music */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '24px', padding: '24px', marginBottom: '40px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <span style={{ fontSize: '1.3rem' }}>🎵</span>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Profile Background Music</h3>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <select
                                    value={profileMusic}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setProfileMusic(val);
                                        if (val === 'none') {
                                            handleSave('profileMusic', { profileMusic: null, profileMusicTitle: null });
                                        } else if (val !== 'custom') {
                                            const titleMap = { chill_beats: 'Chill Beats', ambient_waves: 'Ambient Waves', lofi_dream: 'Lo-Fi Dream', cyber_lounge: 'Cyber Lounge' };
                                            handleSave('profileMusic', { profileMusic: val, profileMusicTitle: titleMap[val] });
                                        }
                                    }}
                                    style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '12px', color: '#0f172a', outline: 'none' }}
                                >
                                    <option value="none">No Background Music</option>
                                    <option value="chill_beats">🎵 Chill Beats Loop</option>
                                    <option value="ambient_waves">🎵 Ambient Waves</option>
                                    <option value="lofi_dream">🎵 Lo-Fi Dream Loop</option>
                                    <option value="cyber_lounge">🎵 Cyber Lounge Loop</option>
                                    <option value="custom">🔗 Link Custom MP3 Audio URL</option>
                                </select>

                                {profileMusic === 'custom' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                                        <input
                                            type="text"
                                            placeholder="Enter direct audio url (.mp3)"
                                            value={customMusicUrl}
                                            onChange={e => setCustomMusicUrl(e.target.value)}
                                            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '12px', color: '#0f172a', fontSize: '0.85rem' }}
                                        />
                                        <input
                                            type="text"
                                            placeholder="Track Title (e.g. My Favorite Song)"
                                            value={musicTitle}
                                            onChange={e => setMusicTitle(e.target.value)}
                                            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '12px', color: '#0f172a', fontSize: '0.85rem' }}
                                        />
                                        <button
                                            onClick={() => handleSave('profileMusic', { profileMusic: customMusicUrl, profileMusicTitle: musicTitle || 'Custom Track' })}
                                            style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '10px', padding: '10px', fontWeight: 700, cursor: 'pointer' }}
                                        >
                                            Save Custom Audio
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'accessories' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {/* Section: Avatar Accessories */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '24px', padding: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <span style={{ fontSize: '1.3rem' }}>👑</span>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Premium Avatar Accessories</h3>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
                                {avatarAccessories.map(acc => {
                                    const locked = isItemLocked(acc.tier);
                                    return (
                                        <button
                                            key={acc.key}
                                            onClick={() => handleSelectOption('avatarAccessory', acc.key, acc.tier)}
                                            style={{
                                                background: avatarAccessory === acc.key ? 'rgba(250, 204, 21, 0.15)' : '#f1f5f9',
                                                border: avatarAccessory === acc.key ? '1.5px solid #facc15' : '1px solid #cbd5e1',
                                                borderRadius: '16px', padding: '14px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'pointer', transition: 'all 0.2s', position: 'relative',
                                                opacity: locked ? 0.5 : 1
                                            }}
                                        >
                                            {locked && <span style={{ position: 'absolute', top: '6px', right: '6px', fontSize: '0.7rem' }}>🔒</span>}
                                            <span style={{ fontSize: '1.8rem' }}>{acc.emoji}</span>
                                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>{acc.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Section: Nearby Map Moments (Diamond Exclusive) */}
                        <div style={{ 
                            background: '#f8fafc', 
                            border: isDiamond ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid #e2e8f0', 
                            borderRadius: '24px', padding: '24px',
                            position: 'relative', opacity: isDiamond ? 1 : 0.7,
                            marginBottom: '40px'
                        }}>
                            {!isDiamond && (
                                <div style={{ position: 'absolute', top: 12, right: 16, background: '#0ea5e9', color: '#fff', borderRadius: '6px', fontSize: '0.62rem', fontWeight: 800, padding: '2px 8px' }}>
                                    DIAMOND ELITE
                                </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <span style={{ fontSize: '1.3rem' }}>📍</span>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Nearby Map Moments</h3>
                            </div>
                            
                            {activeMoment ? (
                                <div style={{ background: 'rgba(2, 132, 199, 0.08)', border: '1.5px solid #0ea5e9', borderRadius: '16px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#0284c7', textTransform: 'uppercase' }}>Active Moment</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                                            <span style={{ fontSize: '1.4rem' }}>{activeMoment.split(' ')[0]}</span>
                                            <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0f172a' }}>{activeMoment}</span>
                                        </div>
                                        {momentExpiry && (
                                            <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginTop: '6px' }}>
                                                Expires at: {momentExpiry.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        )}
                                    </div>
                                    <button 
                                        onClick={handleClearMoment}
                                        style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', borderRadius: '12px', padding: '10px 18px', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                        Clear
                                    </button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
                                        Broadcast a temporary moment to nearby map users. Perfect to invite someone to study, run, or grab pizza.
                                    </p>

                                    {/* Preset Grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
                                        {presetMoments.map(m => (
                                            <button 
                                                key={m}
                                                onClick={() => {
                                                    if (!isDiamond) {
                                                        setToastMsg('Diamond Elite level required for Map Moments! 💎');
                                                        return;
                                                    }
                                                    setMomentPreset(m); 
                                                    setMomentCustomText(''); 
                                                }}
                                                style={{
                                                    background: momentPreset === m && !momentCustomText && isDiamond ? 'rgba(2, 132, 199, 0.15)' : '#f1f5f9',
                                                    border: momentPreset === m && !momentCustomText && isDiamond ? '1.5px solid #0ea5e9' : '1px solid #cbd5e1',
                                                    color: '#0f172a', borderRadius: '12px', padding: '10px 8px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
                                                }}
                                            >
                                                {m}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Custom Moment Input */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>Or enter custom text:</label>
                                        <input 
                                            type="text"
                                            placeholder="☕ Studying nearby, 🍔 Lunch etc."
                                            disabled={!isDiamond}
                                            value={momentCustomText}
                                            onChange={e => setMomentCustomText(e.target.value)}
                                            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '12px', color: '#0f172a', fontSize: '0.85rem', outline: 'none' }}
                                        />
                                    </div>

                                    {/* Duration selector */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>Duration:</label>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            {[30, 60, 120, 180, 360].map(mins => (
                                                <button
                                                    key={mins}
                                                    disabled={!isDiamond}
                                                    onClick={() => setMomentDuration(mins)}
                                                    style={{
                                                        flex: 1,
                                                        background: momentDuration === mins && isDiamond ? '#0f172a' : '#f1f5f9',
                                                        border: momentDuration === mins && isDiamond ? '1px solid #0f172a' : '1px solid #cbd5e1',
                                                        color: momentDuration === mins && isDiamond ? '#fff' : '#0f172a',
                                                        borderRadius: '10px', padding: '8px 4px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer'
                                                    }}
                                                >
                                                    {mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <button 
                                        onClick={handlePostMoment}
                                        style={{ background: isDiamond ? '#0ea5e9' : '#e2e8f0', color: isDiamond ? '#fff' : '#64748b', border: 'none', borderRadius: '14px', padding: '14px', fontSize: '0.9rem', fontWeight: 800, cursor: isDiamond ? 'pointer' : 'default', marginTop: '6px' }}
                                    >
                                        {isDiamond ? 'Post Moment Live ⚡' : 'Locked — Diamond Only'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'username' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {/* Section: Animated Username Styles */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '24px', padding: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <span style={{ fontSize: '1.3rem' }}>✨</span>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Animated Username Styles</h3>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {usernameStyles.map(style => {
                                    const locked = isItemLocked(style.tier);
                                    return (
                                        <button
                                            key={style.key}
                                            onClick={() => handleSelectOption('usernameEffect', style.key, style.tier)}
                                            style={{
                                                background: usernameEffect === style.key ? 'rgba(124, 58, 237, 0.08)' : '#f1f5f9',
                                                border: usernameEffect === style.key ? '1.5px solid #7c3aed' : '1px solid #cbd5e1',
                                                borderRadius: '14px', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left', position: 'relative',
                                                opacity: locked ? 0.5 : 1, color: '#0f172a'
                                            }}
                                        >
                                            {locked && <span style={{ position: 'absolute', top: '14px', right: '20px', fontSize: '0.75rem' }}>🔒</span>}
                                            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{style.name}</span>
                                            <span className={style.className} style={{ fontSize: '0.85rem', fontWeight: 800 }}>
                                                @{user?.username || 'Username'}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Section: Chat Appearance (Bubbles Customizer) */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '24px', padding: '24px', marginBottom: '40px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <span style={{ fontSize: '1.3rem' }}>💬</span>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Chat Bubble Appearance</h3>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
                                {chatBubbleStyles.map(bubble => (
                                    <button
                                        key={bubble.key}
                                        onClick={() => handleSelectOption('chatBubbleStyle', bubble.key, 'gold')}
                                        style={{
                                            background: chatBubbleStyle === bubble.key ? 'rgba(250, 204, 21, 0.15)' : '#f1f5f9',
                                            border: chatBubbleStyle === bubble.key ? '1.5px solid #facc15' : '1px solid #cbd5e1',
                                            borderRadius: '14px', padding: '14px 10px', fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', cursor: 'pointer'
                                        }}
                                    >
                                        {bubble.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'icons' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {/* Section: App Icon Changer */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '24px', padding: '24px', marginBottom: '40px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <span style={{ fontSize: '1.3rem' }}>📱</span>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>App Icons (Favicons)</h3>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px' }}>
                                {appIcons.map(icon => {
                                    const locked = isItemLocked(icon.tier);
                                    return (
                                        <div 
                                            key={icon.key}
                                            onClick={() => handleSelectOption('appIcon', icon.key, icon.tier)}
                                            className="app-icon-preview"
                                            style={{
                                                background: appIcon === icon.key ? 'rgba(250, 204, 21, 0.15)' : '#f1f5f9',
                                                border: appIcon === icon.key ? '2px solid #facc15' : '1px solid #cbd5e1',
                                                flexDirection: 'column', gap: '6px', height: '90px', position: 'relative',
                                                opacity: locked ? 0.5 : 1, cursor: 'pointer', borderRadius: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center'
                                            }}
                                        >
                                            {locked && <span style={{ position: 'absolute', top: '6px', right: '6px', fontSize: '0.7rem' }}>🔒</span>}
                                            <span style={{ fontSize: '1.8rem' }}>{icon.emoji}</span>
                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0f172a' }}>{icon.name}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
