import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// ─── Sticker Packs ────────────────────────────────────────────────────────────
const STICKER_PACKS = [
    {
        id: 'vibes',
        name: 'Vibes',
        thumb: '😎',
        stickers: ['😎', '🤙', '✌️', '🔥', '💯', '🤘', '😜', '🤩']
    },
    {
        id: 'feelings',
        name: 'Feelings',
        thumb: '🥺',
        stickers: ['🥺', '😭', '🤧', '😩', '🥰', '😍', '🤗', '😤']
    },
    {
        id: 'animals',
        name: 'Critters',
        thumb: '🐼',
        stickers: ['🐼', '🦊', '🐸', '🐨', '🦋', '🦄', '🐙', '🦁']
    },
    {
        id: 'food',
        name: 'Foodie',
        thumb: '🍕',
        stickers: ['🍕', '🍔', '🌮', '🍜', '🍩', '🍦', '🧋', '🍣']
    },
    {
        id: 'activities',
        name: 'Activities',
        thumb: '⚽',
        stickers: ['⚽', '🏀', '🎮', '🎸', '🎨', '📚', '🏄', '🧘']
    },
];

// ─── Premium Emoji Packs ──────────────────────────────────────────────────────
const EMOJI_PACKS = [
    {
        id: 'aesthetic',
        name: 'Aesthetic',
        thumb: '🌸',
        emojis: ['🌸', '✨', '🦋', '🌙', '⭐', '🌈', '🎀', '💫', '🌺', '🍃', '🌿', '🪐']
    },
    {
        id: 'minimal',
        name: 'Minimal',
        thumb: '◾',
        emojis: ['◾', '▪️', '🔲', '⬛', '🖤', '🌑', '⚫', '🌚', '💭', '〰️', '➿', '🔗']
    },
    {
        id: 'party',
        name: 'Party',
        thumb: '🎉',
        emojis: ['🎉', '🎊', '🥳', '🍾', '🎈', '🎁', '🎶', '🕺', '💃', '🎤', '🔥', '✨']
    },
];

// ─── Premium Reactions ────────────────────────────────────────────────────────
const PREMIUM_REACTIONS = [
    { emoji: '🫶', label: 'Love', color: '#f43f5e' },
    { emoji: '🤌', label: 'Chef Kiss', color: '#f97316' },
    { emoji: '🫡', label: 'Salute', color: '#3b82f6' },
    { emoji: '🥹', label: 'Touched', color: '#a855f7' },
    { emoji: '🫠', label: 'Melting', color: '#14b8a6' },
    { emoji: '🫣', label: 'Peeking', color: '#f59e0b' },
    { emoji: '🤯', label: 'Mind Blown', color: '#ec4899' },
    { emoji: '🥶', label: 'Frozen', color: '#38bdf8' },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function PremiumStickersPanel({ currentUser, onSend, onClose }) {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('stickers');
    const [activePack, setActivePack] = useState(STICKER_PACKS[0]);
    const [activeEmojiPack, setActiveEmojiPack] = useState(EMOJI_PACKS[0]);

    const isSilverOrAbove = ['silver', 'gold', 'diamond'].includes(currentUser?.subscription_tier);

    const handleSend = (content, type = 'sticker') => {
        if (!isSilverOrAbove) return;
        onSend(content, type);
    };

    // ── Lock Screen ───────────────────────────────────────────────────────────
    if (!isSilverOrAbove) {
        return (
            <div style={styles.panel}>
                <div style={styles.lockWrapper}>
                    <div style={styles.lockIcon}>🔒</div>
                    <div style={styles.lockTitle}>Premium Stickers</div>
                    <div style={styles.lockDesc}>Unlock stickers, emoji packs and premium reactions with Silver or above</div>
                    <button style={styles.upgradeBtn} onClick={() => { onClose(); navigate('/subscription'); }}>
                        🥈 Upgrade to Silver
                    </button>
                </div>
                <style>{panelCSS}</style>
            </div>
        );
    }

    // ── Main Panel ────────────────────────────────────────────────────────────
    return (
        <div style={styles.panel}>
            {/* Tab Bar */}
            <div style={styles.tabBar}>
                {['stickers', 'emoji', 'reactions'].map(tab => (
                    <button
                        key={tab}
                        style={{ ...styles.tabBtn, ...(activeTab === tab ? styles.tabBtnActive : {}) }}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab === 'stickers' ? '🎭 Stickers' : tab === 'emoji' ? '✨ Emoji' : '⚡ Reactions'}
                    </button>
                ))}
            </div>

            {/* ── Stickers Tab ── */}
            {activeTab === 'stickers' && (
                <>
                    {/* Pack selector */}
                    <div style={styles.packBar}>
                        {STICKER_PACKS.map(pack => (
                            <button
                                key={pack.id}
                                style={{ ...styles.packBtn, ...(activePack.id === pack.id ? styles.packBtnActive : {}) }}
                                onClick={() => setActivePack(pack)}
                                title={pack.name}
                            >
                                {pack.thumb}
                            </button>
                        ))}
                    </div>
                    {/* Sticker grid */}
                    <div style={styles.grid}>
                        {activePack.stickers.map((s, i) => (
                            <button
                                key={i}
                                style={styles.stickerBtn}
                                onClick={() => handleSend(s, 'sticker')}
                                className="sticker-item"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </>
            )}

            {/* ── Emoji Tab ── */}
            {activeTab === 'emoji' && (
                <>
                    {/* Emoji Pack selector */}
                    <div style={styles.packBar}>
                        {EMOJI_PACKS.map(pack => (
                            <button
                                key={pack.id}
                                style={{ ...styles.packBtn, ...(activeEmojiPack.id === pack.id ? styles.packBtnActive : {}) }}
                                onClick={() => setActiveEmojiPack(pack)}
                                title={pack.name}
                            >
                                {pack.thumb}
                            </button>
                        ))}
                    </div>
                    {/* Emoji grid */}
                    <div style={styles.emojiGrid}>
                        {activeEmojiPack.emojis.map((e, i) => (
                            <button
                                key={i}
                                style={styles.emojiBtn}
                                onClick={() => handleSend(e, 'text')}
                                className="sticker-item"
                            >
                                {e}
                            </button>
                        ))}
                    </div>
                </>
            )}

            {/* ── Reactions Tab ── */}
            {activeTab === 'reactions' && (
                <div style={styles.reactionsGrid}>
                    {PREMIUM_REACTIONS.map((r, i) => (
                        <button
                            key={i}
                            style={{ ...styles.reactionBtn, '--reaction-color': r.color }}
                            onClick={() => handleSend(r.emoji, 'text')}
                            className="reaction-item"
                        >
                            <span style={styles.reactionEmoji}>{r.emoji}</span>
                            <span style={{ ...styles.reactionLabel, color: r.color }}>{r.label}</span>
                        </button>
                    ))}
                </div>
            )}

            <style>{panelCSS}</style>
        </div>
    );
}

// ─── Inline Styles ────────────────────────────────────────────────────────────
const styles = {
    panel: {
        background: 'var(--bg-secondary, #1a1a1a)',
        borderTop: '1px solid var(--glass-border, rgba(255,255,255,0.08))',
        padding: '12px 8px 16px',
        maxHeight: '280px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
    },
    lockWrapper: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        gap: '10px',
        minHeight: '180px',
    },
    lockIcon: {
        fontSize: '2.5rem',
    },
    lockTitle: {
        fontSize: '1rem',
        fontWeight: 700,
        color: 'var(--text-primary, #fff)',
    },
    lockDesc: {
        fontSize: '0.8rem',
        color: 'var(--text-secondary, #888)',
        textAlign: 'center',
        maxWidth: '260px',
        lineHeight: 1.5,
    },
    upgradeBtn: {
        marginTop: '8px',
        background: 'linear-gradient(135deg, #cbd5e1, #94a3b8)',
        color: '#0f172a',
        border: 'none',
        borderRadius: '100px',
        padding: '10px 24px',
        fontWeight: 700,
        fontSize: '0.875rem',
        cursor: 'pointer',
    },
    tabBar: {
        display: 'flex',
        gap: '4px',
        padding: '0 4px',
    },
    tabBtn: {
        flex: 1,
        background: 'transparent',
        border: '1px solid var(--glass-border, rgba(255,255,255,0.08))',
        borderRadius: '10px',
        padding: '7px 4px',
        fontSize: '0.75rem',
        fontWeight: 600,
        color: 'var(--text-secondary, #888)',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    tabBtnActive: {
        background: 'var(--brand-primary, #0084ff)',
        border: '1px solid var(--brand-primary, #0084ff)',
        color: '#fff',
    },
    packBar: {
        display: 'flex',
        gap: '8px',
        padding: '0 4px',
        overflowX: 'auto',
        scrollbarWidth: 'none',
    },
    packBtn: {
        background: 'transparent',
        border: '1.5px solid transparent',
        borderRadius: '10px',
        padding: '5px 8px',
        fontSize: '1.3rem',
        cursor: 'pointer',
        transition: 'all 0.15s',
    },
    packBtnActive: {
        background: 'var(--glass-bg, rgba(255,255,255,0.06))',
        border: '1.5px solid var(--glass-border, rgba(255,255,255,0.15))',
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gap: '4px',
        overflowY: 'auto',
        maxHeight: '120px',
        padding: '0 4px',
    },
    stickerBtn: {
        background: 'transparent',
        border: 'none',
        borderRadius: '8px',
        padding: '6px',
        fontSize: '1.6rem',
        cursor: 'pointer',
        transition: 'transform 0.15s, background 0.15s',
        lineHeight: 1,
        textAlign: 'center',
    },
    emojiGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gap: '4px',
        overflowY: 'auto',
        maxHeight: '120px',
        padding: '0 4px',
    },
    emojiBtn: {
        background: 'transparent',
        border: 'none',
        borderRadius: '8px',
        padding: '6px',
        fontSize: '1.4rem',
        cursor: 'pointer',
        transition: 'transform 0.15s, background 0.15s',
        lineHeight: 1,
        textAlign: 'center',
    },
    reactionsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '8px',
        padding: '0 4px',
        overflowY: 'auto',
        maxHeight: '160px',
    },
    reactionBtn: {
        background: 'var(--glass-bg, rgba(255,255,255,0.04))',
        border: '1px solid var(--glass-border, rgba(255,255,255,0.08))',
        borderRadius: '12px',
        padding: '10px 4px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        cursor: 'pointer',
        transition: 'all 0.15s',
    },
    reactionEmoji: {
        fontSize: '1.8rem',
    },
    reactionLabel: {
        fontSize: '0.62rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.3px',
    },
};

// ─── Hover animations via <style> ─────────────────────────────────────────────
const panelCSS = `
    .sticker-item:hover {
        transform: scale(1.25);
        background: var(--glass-bg, rgba(255,255,255,0.08)) !important;
    }
    .sticker-item:active {
        transform: scale(0.9);
    }
    .reaction-item:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px var(--reaction-color, rgba(255,255,255,0.2));
        border-color: var(--reaction-color, rgba(255,255,255,0.2)) !important;
    }
    .reaction-item:active {
        transform: scale(0.95);
    }
`;
