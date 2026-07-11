import React from 'react';
import './LocationOnboarding.css';
const locationIllustration = '/location_onboarding.webp';
const nearoLogo = '/logo.webp';

export default function LocationOnboarding({ onEnable, isDarkMode, fullHeight = false }) {
    const dark = isDarkMode;

    return (
        <div style={{
            height: fullHeight ? '100dvh' : 'calc(100dvh - 60px - env(safe-area-inset-bottom))',
            width: '100vw',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            overflowY: 'auto',
            overflowX: 'hidden',
            position: 'relative',
            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            background: dark
                ? 'linear-gradient(160deg, #0d0b14 0%, #11101a 100%)'
                : 'linear-gradient(160deg, #f0eeff 0%, #faf9ff 40%, #fff7f0 100%)',
            padding: 'max(10px, env(safe-area-inset-top)) 0 0',
        }}>
            {/* Top-right warm orange glow */}
            <div style={{
                position: 'absolute', top: '-5%', right: '-5%',
                width: '55vw', height: '55vw', borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(255,160,50,0.35) 0%, transparent 65%)',
                filter: 'blur(40px)', pointerEvents: 'none', zIndex: 0,
            }} />
            {/* Top-left purple glow */}
            <div style={{
                position: 'absolute', top: '-5%', left: '-5%',
                width: '45vw', height: '45vw', borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(180,130,255,0.25) 0%, transparent 65%)',
                filter: 'blur(40px)', pointerEvents: 'none', zIndex: 0,
            }} />

            {/* ── TOP: Logo + Title ── */}
            <div style={{
                textAlign: 'center', width: '100%', paddingTop: 16, zIndex: 2,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
            }}>
                {/* Logo */}
                <img
                    src={nearoLogo}
                    alt="Logo"
                    width="128"
                    height="52"
                    decoding="async"
                    style={{ height: 52, width: 'auto', objectFit: 'contain', display: 'block', margin: '0 auto 14px' }}
                />

                {/* Headline — two separate lines matching the reference */}
                <div style={{ padding: '0 20px', lineHeight: 1.15 }}>
                    <div style={{
                        fontSize: 32, fontWeight: 800,
                        color: dark ? '#f0eeff' : '#1a1040',
                        letterSpacing: '-0.8px',
                    }}>
                        Discover people
                    </div>
                    {/* "around you" in purple gradient with underline */}
                    <div style={{ position: 'relative', display: 'inline-block', marginTop: 2 }}>
                        <div style={{
                            fontSize: 32, fontWeight: 800,
                            letterSpacing: '-0.8px',
                            background: 'linear-gradient(90deg, #7B2FF7 0%, #9B59F5 50%, #B06EFF 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                        }}>
                            around you
                        </div>
                        {/* Purple underline bar */}
                        <div style={{
                            position: 'absolute', bottom: -5, left: '50%',
                            transform: 'translateX(-50%)',
                            width: '72%', height: 3, borderRadius: 2,
                            background: 'linear-gradient(90deg, #7B2FF7, #B06EFF)',
                        }} />
                    </div>
                </div>

                {/* Privacy badge — compact pill */}
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '6px 12px', borderRadius: 100, marginTop: 14,
                    background: dark ? 'rgba(255,106,0,0.12)' : 'rgba(255,200,160,0.55)',
                    border: dark ? '1px solid rgba(255,106,0,0.25)' : '1px solid rgba(255,150,80,0.3)',
                }}>
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke={dark ? '#FF9500' : '#E06000'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span style={{
                        fontSize: 10.5, fontWeight: 600,
                        color: dark ? '#FF9500' : '#C05000',
                        letterSpacing: '0.1px',
                    }}>Your location is never shared exactly</span>
                </div>
            </div>

            {/* ── MIDDLE: Illustration ── */}
            <div style={{
                flex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '100%', position: 'relative',
                maxHeight: '34vh', minHeight: '180px',
                zIndex: 2, marginTop: 10,
            }}>
                {/* Floating chat badge — left */}
                <div style={{
                    position: 'absolute', top: '18%', left: '4%',
                    width: 44, height: 44, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: dark ? 'rgba(120,80,255,0.18)' : '#ffffff',
                    border: dark ? '1px solid rgba(120,80,255,0.3)' : '1px solid rgba(120,80,255,0.10)',
                    boxShadow: '0 6px 20px rgba(120,80,255,0.14)',
                    backdropFilter: 'blur(12px)',
                    animation: 'floatBadge1 4s ease-in-out infinite',
                }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={dark ? '#D6C7FF' : '#8060E0'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                </div>

                {/* Floating location pin badge — right top */}
                <div style={{
                    position: 'absolute', top: '14%', right: '4%',
                    width: 44, height: 44, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: dark ? 'rgba(255,150,0,0.18)' : '#ffffff',
                    border: dark ? '1px solid rgba(255,150,0,0.3)' : '1px solid rgba(255,150,0,0.10)',
                    boxShadow: '0 6px 20px rgba(255,120,0,0.14)',
                    backdropFilter: 'blur(12px)',
                    animation: 'floatBadge3 3.8s ease-in-out infinite',
                }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={dark ? '#FFC485' : '#FF7A00'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="10" r="3"/>
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                    </svg>
                </div>

                {/* Floating heart badge — right bottom */}
                <div style={{
                    position: 'absolute', bottom: '14%', right: '4%',
                    width: 44, height: 44, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: dark ? 'rgba(255,45,85,0.18)' : '#ffffff',
                    border: dark ? '1px solid rgba(255,45,85,0.3)' : '1px solid rgba(255,45,85,0.10)',
                    boxShadow: '0 6px 20px rgba(255,45,85,0.14)',
                    backdropFilter: 'blur(12px)',
                    animation: 'floatBadge2 4.5s ease-in-out infinite',
                }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={dark ? '#FFB2C1' : '#FF2D55'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                </div>

                {/* Glow behind illustration */}
                <div style={{
                    position: 'absolute', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '80%', height: '80%', borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(255,140,0,0.12) 0%, transparent 70%)',
                    filter: 'blur(35px)',
                }} />

                <img
                    src={locationIllustration}
                    alt="Map illustration"
                    width="340"
                    height="280"
                    decoding="async"
                    loading="lazy"
                    style={{
                        width: '88%', maxWidth: 340,
                        maxHeight: '100%',
                        objectFit: 'contain',
                        filter: dark
                            ? 'drop-shadow(0 20px 40px rgba(0,0,0,0.5))'
                            : 'drop-shadow(0 16px 36px rgba(120,80,0,0.12)) drop-shadow(0 4px 12px rgba(0,0,0,0.06))',
                        animation: 'floatingSmooth 6s ease-in-out infinite',
                        position: 'relative', zIndex: 3,
                    }}
                />
            </div>

            {/* ── FEATURE CAPSULES ── */}
            <div style={{
                width: '100%', maxWidth: 420,
                padding: '0 16px',
                display: 'flex', flexDirection: 'row', flexWrap: 'wrap',
                gap: 8, justifyContent: 'center',
                zIndex: 2,
                animation: 'fadeSlideUp 0.6s ease both',
            }}>
                {[
                    {
                        icon: (
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke={dark ? '#FF9500' : '#FF6A00'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="10" r="3"/>
                                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                            </svg>
                        ),
                        label: 'Real-time Connections',
                        bg: dark ? 'rgba(255,106,0,0.13)' : 'rgba(255,200,160,0.40)',
                        border: dark ? '1px solid rgba(255,106,0,0.22)' : '1px solid rgba(255,150,80,0.25)',
                        color: dark ? '#FF9500' : '#C05000',
                    },
                    {
                        icon: (
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke={dark ? '#9D7BFF' : '#7850FF'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                        ),
                        label: 'Privacy by Design',
                        bg: dark ? 'rgba(120,80,255,0.13)' : 'rgba(200,180,255,0.30)',
                        border: dark ? '1px solid rgba(120,80,255,0.22)' : '1px solid rgba(140,100,255,0.22)',
                        color: dark ? '#B090FF' : '#6030D0',
                    },
                    {
                        icon: (
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke={dark ? '#FF8FA3' : '#FF2D55'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                            </svg>
                        ),
                        label: 'Meet Nearby',
                        bg: dark ? 'rgba(255,45,85,0.13)' : 'rgba(255,180,195,0.30)',
                        border: dark ? '1px solid rgba(255,45,85,0.22)' : '1px solid rgba(255,100,130,0.22)',
                        color: dark ? '#FF8FA3' : '#C0002A',
                    },
                ].map((item, i) => (
                    <div key={i} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '8px 14px', borderRadius: 100,
                        background: item.bg,
                        border: item.border,
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                    }}>
                        {item.icon}
                        <span style={{
                            fontSize: 12, fontWeight: 600,
                            color: item.color,
                            letterSpacing: '0.1px',
                            whiteSpace: 'nowrap',
                        }}>{item.label}</span>
                    </div>
                ))}
            </div>

            {/* ── BOTTOM: CTA ── */}
            <div style={{
                width: '100%', maxWidth: 420,
                padding: '12px 16px 8px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                zIndex: 2,
            }}>
                <button
                    onClick={onEnable}
                    style={{
                        width: '100%',
                        padding: '16px 24px',
                        borderRadius: 100,
                        border: 'none',
                        background: 'linear-gradient(90deg, #FF6A00 0%, #FF8C00 50%, #FFA500 100%)',
                        color: '#fff',
                        fontSize: 17,
                        fontWeight: 700,
                        letterSpacing: '0.2px',
                        cursor: 'pointer',
                        boxShadow: '0 12px 32px rgba(255,106,0,0.40), inset 0 1px 2px rgba(255,255,255,0.20)',
                        position: 'relative',
                        overflow: 'hidden',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 16px 40px rgba(255,106,0,0.50)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.transform = '';
                        e.currentTarget.style.boxShadow = '0 12px 32px rgba(255,106,0,0.40), inset 0 1px 2px rgba(255,255,255,0.20)';
                    }}
                >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="10" r="3"/>
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                    </svg>
                    Enable Location
                    {/* Right chevron in button */}
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: 20 }}>
                        <path d="M9 18l6-6-6-6"/>
                    </svg>
                    {/* Shine sweep */}
                    <div style={{
                        position: 'absolute', top: 0, left: '-100%',
                        width: '45%', height: '100%', zIndex: 1,
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)',
                        transform: 'skewX(-20deg)',
                        animation: 'shineSweep 5s ease-in-out infinite',
                    }} />
                </button>

                {/* Bottom trust line */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
                }}>
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke={dark ? '#9D7BFF' : '#9070D0'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                    <span style={{
                        fontSize: 12, fontWeight: 500,
                        color: dark ? 'rgba(200,190,240,0.5)' : '#9070D0',
                        letterSpacing: '0.2px',
                    }}>100% Secure • You're in Control</span>
                </div>
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
                    from { opacity: 0; transform: translateY(14px); }
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
