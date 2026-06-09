import React from 'react';
import './LocationOnboarding.css';
import locationIllustration from '../assets/location_onboarding.png';
import nearoLogo from '../assets/logo.png';

export default function LocationOnboarding({ onEnable, isDarkMode }) {
    const dark = isDarkMode;

    return (
        <div style={{
            height: '100dvh',
            width: '100vw',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            overflow: 'hidden',
            position: 'relative',
            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            background: dark
                ? 'linear-gradient(160deg, #0a0a0f 0%, #13111a 100%)'
                : 'linear-gradient(160deg, #f9f7ff 0%, #f0eeff 50%, #e8f0fe 100%)',
            padding: 'max(20px, env(safe-area-inset-top)) 0 max(24px, env(safe-area-inset-bottom))',
        }}>
            {/* Ambient glows */}
            <div style={{
                position: 'absolute', top: '-10%', right: '-5%',
                width: '50vw', height: '50vw', borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(255,106,0,0.12) 0%, transparent 70%)',
                filter: 'blur(60px)', pointerEvents: 'none',
            }} />
            <div style={{
                position: 'absolute', bottom: '-10%', left: '-5%',
                width: '55vw', height: '55vw', borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(120,80,255,0.1) 0%, transparent 70%)',
                filter: 'blur(60px)', pointerEvents: 'none',
            }} />
            {/* Dot grid */}
            <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                backgroundImage: `radial-gradient(${dark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)'} 1.5px, transparent 1.5px)`,
                backgroundSize: '24px 24px',
            }} />

            {/* ── TOP: Logo + Title ── */}
            <div style={{ textAlign: 'center', width: '100%', paddingTop: 48, zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <img
                    src={nearoLogo}
                    alt="Logo"
                    style={{
                        height: 52, width: 'auto', objectFit: 'contain', display: 'block', margin: '0 auto 2px',
                        filter: 'drop-shadow(0 6px 16px rgba(255,106,0,0.18))',
                    }}
                />
                <h1 style={{
                    margin: 0,
                    fontSize: 18,
                    fontWeight: 700,
                    letterSpacing: '-0.3px',
                    lineHeight: 1.3,
                    color: dark ? '#f1f1f3' : '#1a1a2e',
                    padding: '0 32px',
                }}>
                    Discover people around you
                </h1>

                {/* Privacy badge — right below the title */}
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px', borderRadius: 100,
                    background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,106,0,0.08)',
                    border: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,106,0,0.15)',
                }}>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke={dark ? '#FF9500' : '#FF6A00'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span style={{
                        fontSize: 11.5, fontWeight: 600,
                        color: dark ? '#FF9500' : '#FF6A00',
                        letterSpacing: '0.1px',
                    }}>Your location is never shared exactly</span>
                </div>
            </div>

            {/* ── MIDDLE: Illustration ── */}
            <div style={{
                flex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '100%', position: 'relative',
                maxHeight: '38vh', minHeight: '200px',
                zIndex: 2,
            }}>
                {/* Floating badges */}
                <div style={{
                    position: 'absolute', top: '8%', left: '8%',
                    width: 38, height: 38, borderRadius: '50%', fontSize: 18,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: dark ? 'rgba(30,28,40,0.9)' : 'rgba(255,255,255,0.95)',
                    border: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.05)',
                    boxShadow: '0 8px 20px rgba(0,0,0,0.1)',
                    animation: 'floatBadge1 4s ease-in-out infinite',
                }}>💬</div>
                <div style={{
                    position: 'absolute', bottom: '5%', right: '8%',
                    width: 38, height: 38, borderRadius: '50%', fontSize: 18,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: dark ? 'rgba(30,28,40,0.9)' : 'rgba(255,255,255,0.95)',
                    border: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.05)',
                    boxShadow: '0 8px 20px rgba(0,0,0,0.1)',
                    animation: 'floatBadge2 4.5s ease-in-out infinite',
                }}>💖</div>
                <div style={{
                    position: 'absolute', top: '12%', right: '6%',
                    width: 38, height: 38, borderRadius: '50%', fontSize: 18,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: dark ? 'rgba(30,28,40,0.9)' : 'rgba(255,255,255,0.95)',
                    border: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.05)',
                    boxShadow: '0 8px 20px rgba(0,0,0,0.1)',
                    animation: 'floatBadge3 3.8s ease-in-out infinite',
                }}>📍</div>

                {/* Glow behind illustration */}
                <div style={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '65%', height: '65%', borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(255,106,0,0.18) 0%, transparent 70%)',
                    filter: 'blur(40px)',
                }} />

                <img
                    src={locationIllustration}
                    alt="Map illustration"
                    style={{
                        width: '75%', maxWidth: 260,
                        objectFit: 'contain',
                        filter: dark
                            ? 'drop-shadow(0 24px 48px rgba(0,0,0,0.5)) brightness(0.92)'
                            : 'drop-shadow(0 20px 40px rgba(255,106,0,0.1)) drop-shadow(0 8px 16px rgba(0,0,0,0.06))',
                        mixBlendMode: dark ? 'normal' : 'multiply',
                        animation: 'floatingSmooth 6s ease-in-out infinite',
                        position: 'relative', zIndex: 3,
                    }}
                />
            </div>

            {/* ── FEATURE CARDS ── */}
            <div style={{
                width: '100%', maxWidth: 400,
                padding: '0 20px',
                display: 'flex', flexDirection: 'column', gap: 10,
                zIndex: 2,
                animation: 'fadeSlideUp 0.7s ease both',
            }}>
                {[
                    {
                        emoji: '📍',
                        title: 'Real-time Connections',
                        desc: 'See who is active near you and connect instantly.',
                        color: 'rgba(255,106,0,0.1)',
                    },
                    {
                        emoji: '🔒',
                        title: 'Privacy by Design',
                        desc: 'Toggle Ghost Mode or limit your visibility anytime.',
                        color: 'rgba(120,80,255,0.1)',
                    },
                ].map((item, i) => (
                    <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '12px 16px',
                        borderRadius: 18,
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.8)',
                        border: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.9)',
                        boxShadow: dark
                            ? '0 4px 20px rgba(0,0,0,0.2)'
                            : '0 4px 20px rgba(0,0,0,0.05), 0 1px 4px rgba(0,0,0,0.03)',
                    }}>
                        <div style={{
                            width: 36, height: 36, borderRadius: 12, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 17, background: item.color,
                        }}>{item.emoji}</div>
                        <div style={{ flex: 1 }}>
                            <div style={{
                                fontSize: 13.5, fontWeight: 700,
                                color: dark ? '#f3f3f5' : '#111827',
                                letterSpacing: '-0.2px', marginBottom: 2,
                            }}>{item.title}</div>
                            <div style={{
                                fontSize: 11.5, lineHeight: 1.45,
                                color: dark ? '#9ca3af' : '#6b7280',
                            }}>{item.desc}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── BOTTOM: CTA ── */}
            <div style={{
                width: '100%', maxWidth: 400,
                padding: '12px 20px',
                paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                zIndex: 2,
            }}>
                <button
                    onClick={onEnable}
                    style={{
                        width: '100%',
                        padding: '17px 24px',
                        borderRadius: 100,
                        border: 'none',
                        background: 'linear-gradient(135deg, #FF6A00 0%, #FF9500 100%)',
                        color: '#fff',
                        fontSize: 16,
                        fontWeight: 700,
                        letterSpacing: '0.3px',
                        cursor: 'pointer',
                        boxShadow: '0 12px 32px rgba(255,106,0,0.35), inset 0 2px 2px rgba(255,255,255,0.22)',
                        position: 'relative',
                        overflow: 'hidden',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-2px) scale(1.01)';
                        e.currentTarget.style.boxShadow = '0 16px 40px rgba(255,106,0,0.45), inset 0 2px 2px rgba(255,255,255,0.28)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.transform = '';
                        e.currentTarget.style.boxShadow = '0 12px 32px rgba(255,106,0,0.35), inset 0 2px 2px rgba(255,255,255,0.22)';
                    }}
                >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                    </svg>
                    Enable Location
                    <div style={{
                        position: 'absolute', top: 0, left: '-100%',
                        width: '50%', height: '100%', zIndex: 1,
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                        transform: 'skewX(-20deg)',
                        animation: 'shineSweep 5s ease-in-out infinite',
                    }} />
                </button>
            </div>

            <style>{`
                @keyframes floatingSmooth {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
                @keyframes floatBadge1 {
                    0%, 100% { transform: translateY(0) rotate(0deg); }
                    50% { transform: translateY(-6px) rotate(-4deg); }
                }
                @keyframes floatBadge2 {
                    0%, 100% { transform: translateY(0) rotate(0deg); }
                    50% { transform: translateY(-5px) rotate(4deg); }
                }
                @keyframes floatBadge3 {
                    0%, 100% { transform: translateY(0) rotate(0deg); }
                    50% { transform: translateY(-7px) rotate(-3deg); }
                }
                @keyframes fadeSlideUp {
                    from { opacity: 0; transform: translateY(16px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes shineSweep {
                    0%, 60% { left: -100%; }
                    100% { left: 200%; }
                }
            `}</style>
        </div>
    );
}
