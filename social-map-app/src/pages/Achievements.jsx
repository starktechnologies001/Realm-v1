import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { ACHIEVEMENTS, RARITY_META, checkUnlockedAchievements } from '../utils/premiumUtils';

const CATEGORY_TABS = [
    { id: 'all',      label: 'All',      icon: '🏆' },
    { id: 'social',   label: 'Social',   icon: '👥' },
    { id: 'activity', label: 'Activity', icon: '💬' },
    { id: 'explorer', label: 'Explorer', icon: '🗺️' },
    { id: 'special',  label: 'Special',  icon: '✨' },
];

export default function Achievements() {
    const navigate = useNavigate();
    const [user, setUser] = useState(() => {
        try { return JSON.parse(localStorage.getItem('currentUser') || 'null'); } catch { return null; }
    });
    const [unlocked, setUnlocked] = useState([]);
    const [stats, setStats] = useState({ friends: 0, thoughts: 0 });
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState('all');

    useEffect(() => {
        if (!user?.id) { navigate('/login'); return; }

        const fetchStatsAndAchievements = async () => {
            try {
                const { count: friendsCount } = await supabase
                    .from('friendships')
                    .select('id', { count: 'exact', head: true })
                    .eq('status', 'accepted')
                    .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`);

                const { count: thoughtsCount } = await supabase
                    .from('stories')
                    .select('id', { count: 'exact', head: true })
                    .eq('user_id', user.id);

                const currentFriends = friendsCount || 0;
                const currentThoughts = thoughtsCount || 0;
                setStats({ friends: currentFriends, thoughts: currentThoughts });
                setUnlocked(checkUnlockedAchievements(user, currentFriends, currentThoughts));
            } catch (err) {
                console.error('Failed to load achievements stats:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchStatsAndAchievements();
    }, [user?.id, navigate]);

    if (loading) {
        return (
            <div style={S.page}>
                <div style={S.loadingWrap}>
                    <div style={S.spinner} />
                    <p style={{ color: 'var(--text-secondary)', marginTop: 12 }}>Loading achievements…</p>
                </div>
                <style>{pageCSS}</style>
            </div>
        );
    }

    const total = ACHIEVEMENTS.length;
    const unlockedCount = unlocked.length;
    const percent = Math.round((unlockedCount / total) * 100);

    const filtered = activeCategory === 'all'
        ? ACHIEVEMENTS
        : ACHIEVEMENTS.filter(a => a.category === activeCategory);

    return (
        <div style={S.page}>
            {/* Hero Header */}
            <header style={S.header}>
                <button style={S.backBtn} onClick={() => navigate(-1)}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                </button>
                <div style={S.headerContent}>
                    <h1 style={S.headerTitle}>🏆 Achievements</h1>
                    <p style={S.headerSub}>Earn badges by engaging with Nearo</p>
                </div>
            </header>

            {/* Progress Ring Card */}
            <div style={S.progressCard}>
                <div style={S.progressRingWrap}>
                    <svg width="80" height="80" viewBox="0 0 80 80">
                        <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6"/>
                        <circle
                            cx="40" cy="40" r="34" fill="none"
                            stroke="url(#progressGrad)" strokeWidth="6"
                            strokeLinecap="round"
                            strokeDasharray={`${2 * Math.PI * 34}`}
                            strokeDashoffset={`${2 * Math.PI * 34 * (1 - percent / 100)}`}
                            transform="rotate(-90 40 40)"
                        />
                        <defs>
                            <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#f59e0b"/>
                                <stop offset="100%" stopColor="#f97316"/>
                            </linearGradient>
                        </defs>
                    </svg>
                    <div style={S.progressRingLabel}>
                        <span style={S.progressPercent}>{percent}%</span>
                    </div>
                </div>
                <div style={S.progressInfo}>
                    <div style={S.progressTitle}>Your Progress</div>
                    <div style={S.progressSubtitle}>{unlockedCount} of {total} achievements unlocked</div>
                    <div style={S.rarityRow}>
                        {['common','rare','epic','legendary'].map(r => {
                            const count = ACHIEVEMENTS.filter(a => a.rarity === r && unlocked.includes(a.id)).length;
                            const meta = RARITY_META[r];
                            return (
                                <div key={r} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: meta.color }}>{count}</span>
                                    <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{r}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Category Tabs */}
            <div style={S.tabBar}>
                {CATEGORY_TABS.map(tab => (
                    <button
                        key={tab.id}
                        style={{ ...S.tabBtn, ...(activeCategory === tab.id ? S.tabBtnActive : {}) }}
                        onClick={() => setActiveCategory(tab.id)}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* Achievement Cards */}
            <div style={S.grid}>
                {filtered.map(ach => {
                    const isUnlocked = unlocked.includes(ach.id);
                    const meta = RARITY_META[ach.rarity];
                    return (
                        <div
                            key={ach.id}
                            style={{
                                ...S.card,
                                opacity: isUnlocked ? 1 : 0.55,
                                border: isUnlocked ? `1.5px solid ${meta.color}` : '1.5px solid rgba(255,255,255,0.06)',
                                boxShadow: isUnlocked ? `0 4px 20px ${meta.glow}` : 'none',
                            }}
                        >
                            {/* Icon */}
                            <div style={{
                                ...S.iconWrap,
                                background: isUnlocked
                                    ? `radial-gradient(circle, ${meta.glow} 0%, transparent 70%)`
                                    : 'rgba(255,255,255,0.04)',
                                border: isUnlocked ? `1.5px solid ${meta.ring}` : '1.5px dashed rgba(255,255,255,0.12)',
                            }}>
                                <span style={{ fontSize: '1.6rem', filter: isUnlocked ? 'none' : 'grayscale(1) opacity(0.5)' }}>
                                    {isUnlocked ? ach.icon : '🔒'}
                                </span>
                            </div>

                            {/* Text */}
                            <div style={S.cardBody}>
                                <div style={S.cardTitleRow}>
                                    <span style={{ ...S.cardTitle, color: isUnlocked ? meta.color : 'var(--text-secondary)' }}>
                                        {ach.title}
                                    </span>
                                    <span style={{
                                        ...S.rarityBadge,
                                        background: isUnlocked ? meta.color : 'rgba(255,255,255,0.08)',
                                        color: isUnlocked ? '#fff' : 'var(--text-secondary)',
                                    }}>
                                        {meta.label}
                                    </span>
                                </div>
                                <p style={S.cardDesc}>{isUnlocked ? ach.desc : ach.hint}</p>
                                {isUnlocked && (
                                    <div style={S.unlockedTag}>✅ Unlocked</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <style>{pageCSS}</style>
        </div>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
    page: {
        minHeight: '100dvh',
        background: 'var(--bg-color)',
        color: 'var(--text-primary)',
        paddingBottom: '32px',
        fontFamily: 'var(--font-family)',
    },
    loadingWrap: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '100dvh',
    },
    spinner: {
        width: 36, height: 36, borderRadius: '50%',
        border: '3px solid rgba(255,255,255,0.1)',
        borderTopColor: '#f59e0b',
        animation: 'spin 0.8s linear infinite',
    },
    header: {
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '20px 16px 16px',
        background: 'var(--glass-bg)',
        borderBottom: '1px solid var(--glass-border)',
        backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 10,
    },
    backBtn: {
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        borderRadius: '50%', width: 38, height: 38,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-primary)', cursor: 'pointer', flexShrink: 0,
    },
    headerContent: { flex: 1 },
    headerTitle: { fontSize: '1.1rem', fontWeight: 800, margin: 0 },
    headerSub: { fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '2px 0 0' },
    progressCard: {
        margin: '16px', padding: '20px',
        background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(249,115,22,0.08))',
        border: '1.5px solid rgba(245,158,11,0.25)',
        borderRadius: '20px',
        display: 'flex', alignItems: 'center', gap: '20px',
        boxShadow: '0 8px 32px rgba(245,158,11,0.12)',
    },
    progressRingWrap: { position: 'relative', flexShrink: 0 },
    progressRingLabel: {
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    progressPercent: { fontSize: '0.85rem', fontWeight: 800, color: '#f59e0b' },
    progressInfo: { flex: 1 },
    progressTitle: { fontWeight: 800, fontSize: '1rem', marginBottom: 4 },
    progressSubtitle: { fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 12 },
    rarityRow: {
        display: 'flex', gap: 16,
    },
    tabBar: {
        display: 'flex', gap: 8, padding: '0 16px 12px',
        overflowX: 'auto', scrollbarWidth: 'none',
    },
    tabBtn: {
        flexShrink: 0,
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        borderRadius: '100px', padding: '7px 14px',
        fontSize: '0.78rem', fontWeight: 600,
        color: 'var(--text-secondary)', cursor: 'pointer',
        transition: 'all 0.2s', whiteSpace: 'nowrap',
    },
    tabBtnActive: {
        background: 'linear-gradient(135deg, #f59e0b, #f97316)',
        border: '1px solid #f59e0b', color: '#fff',
        boxShadow: '0 4px 12px rgba(245,158,11,0.3)',
    },
    grid: {
        padding: '0 16px',
        display: 'flex', flexDirection: 'column', gap: 12,
    },
    card: {
        background: 'var(--glass-bg)',
        borderRadius: '16px', padding: '16px',
        display: 'flex', alignItems: 'center', gap: '14px',
        transition: 'all 0.2s',
    },
    iconWrap: {
        width: 60, height: 60, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    cardBody: { flex: 1, minWidth: 0 },
    cardTitleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
    cardTitle: { fontWeight: 700, fontSize: '0.9rem' },
    rarityBadge: {
        flexShrink: 0,
        padding: '2px 8px', borderRadius: '100px',
        fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
    },
    cardDesc: { fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 },
    unlockedTag: {
        marginTop: 6, fontSize: '0.7rem', color: '#22c55e', fontWeight: 700,
    },
};

const pageCSS = `
    @keyframes spin { to { transform: rotate(360deg); } }
    ::-webkit-scrollbar { display: none; }
`;
