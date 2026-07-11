import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
const nearoLogo = '/logo.webp';

const PINS = [
  { x: 8,  y: 12, s: 28, d: 0,    c: '#8B5CF6' },
  { x: 82, y: 9,  s: 22, d: 0.7,  c: '#F97316' },
  { x: 91, y: 40, s: 17, d: 1.2,  c: '#6366F1' },
  { x: 4,  y: 52, s: 20, d: 0.4,  c: '#EC4899' },
  { x: 87, y: 65, s: 16, d: 1.0,  c: '#8B5CF6' },
  { x: 11, y: 76, s: 13, d: 1.5,  c: '#F97316' },
  { x: 46, y: 6,  s: 12, d: 0.8,  c: '#6366F1' },
];

const FEATURES = [
  { icon: '📍', label: 'Nearby People'  },
  { icon: '💬', label: 'Instant Chat'   },
  { icon: '🔒', label: 'Safe & Private' },
];

function Pin({ x, y, s, d, c }) {
  return (
    <div style={{
      position: 'fixed', left: `${x}%`, top: `${y}%`,
      animation: `wlFloat ${3.5 + d * 0.4}s ease-in-out ${d}s infinite`,
      pointerEvents: 'none', zIndex: 1,
    }}>
      <svg width={s} height={s * 1.35} viewBox="0 0 24 32">
        <ellipse cx="12" cy="30.5" rx="3.5" ry="1.1" fill="rgba(0,0,0,0.07)" />
        <path d="M12 0C6.48 0 2 4.48 2 10c0 7.5 10 21 10 21S22 17.5 22 10C22 4.48 17.52 0 12 0z"
          fill={c} style={{ filter: `drop-shadow(0 2px 8px ${c}55)` }} />
        <circle cx="12" cy="10" r="4.2" fill="white" fillOpacity="0.95" />
        <circle cx="12" cy="10" r="1.8" fill={c} fillOpacity="0.65" />
      </svg>
    </div>
  );
}

function Lines() {
  return (
    <svg style={{ position:'fixed', inset:0, width:'100%', height:'100%', zIndex:1, pointerEvents:'none' }} preserveAspectRatio="none">
      {[
        { x1:'11%', y1:'15%', x2:'84%', y2:'12%', c:'rgba(139,92,246,0.12)', dur:'5s'  },
        { x1:'84%', y1:'12%', x2:'93%', y2:'43%', c:'rgba(249,115,22,0.1)',  dur:'6s'  },
        { x1:'6%',  y1:'55%', x2:'89%', y2:'68%', c:'rgba(99,102,241,0.1)', dur:'7s'  },
      ].map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke={l.c} strokeWidth="1" strokeDasharray="4 10">
          <animate attributeName="strokeDashoffset" from="0" to="-100" dur={l.dur} repeatCount="indefinite" />
        </line>
      ))}
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#EA4335" d="M5.27 9.76A7.08 7.08 0 0 1 12 4.93c1.84 0 3.5.67 4.79 1.76l3.57-3.57A12 12 0 0 0 12 0C7.37 0 3.38 2.7 1.36 6.64l3.91 3.12z"/>
      <path fill="#34A853" d="M16.04 18.01A7.05 7.05 0 0 1 12 19.07c-2.95 0-5.47-1.81-6.6-4.4l-3.92 3c2 3.98 6.05 6.73 10.52 6.33 2.94-.27 5.6-1.57 7.55-3.65l-3.51-2.34z"/>
      <path fill="#FBBC05" d="M19.07 19.35A12 12 0 0 0 24 12c0-.67-.06-1.32-.17-1.95H12v4.1h6.76a5.82 5.82 0 0 1-2.5 3.8l2.81 3.4z"/>
      <path fill="#4285F4" d="M5.4 14.67A7.1 7.1 0 0 1 4.93 12c0-.93.16-1.83.47-2.67L1.36 6.24A12 12 0 0 0 0 12c0 1.93.46 3.75 1.27 5.37l4.13-2.7z"/>
    </svg>
  );
}

export default function Welcome() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate('/map', { replace: true });
      else setTimeout(() => setReady(true), 80);
    });
  }, [navigate]);

  return (
    <div style={S.root}>
      {/* Gradient orbs */}
      <div style={S.orbTL} />
      <div style={S.orbBR} />

      {/* Floating decorations */}
      {PINS.map((p, i) => <Pin key={i} {...p} />)}
      <Lines />

      {/* Full-screen layout: top logo + bottom actions */}
      <div style={{ ...S.layout, opacity: ready ? 1 : 0, transform: ready ? 'none' : 'translateY(20px)' }}>

        {/* ── TOP: Logo & headline ── */}
        <div style={S.top}>
          <img src={nearoLogo} alt="Nearo" width="52" height="52" fetchpriority="high" decoding="sync" style={S.logoImg} />
          <h1 style={S.appName}>Nearo</h1>
          <h2 style={S.headline}>
            Discover People<br />
            <span style={S.accent}>Around You</span>
          </h2>
          <p style={S.sub}>Meet people nearby in a safe and fun way</p>

          {/* Feature pills */}
          <div style={S.pillsRow}>
            {FEATURES.map(f => (
              <div key={f.label} style={S.pill}>
                <span style={{ fontSize: '0.82rem' }}>{f.icon}</span>
                <span style={S.pillText}>{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── BOTTOM: Actions ── */}
        <div style={S.bottom}>
          {/* Primary CTA */}
          <button id="wl-get-started" style={S.btnPrimary}
            onClick={() => navigate('/signup')}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 16px 40px rgba(124,58,237,0.38)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(124,58,237,0.28)'; }}>
            Get Started →
          </button>

          {/* Outline login */}
          <button id="wl-login" style={S.btnOutline}
            onClick={() => navigate('/login')}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.06)'; e.currentTarget.style.borderColor = '#8B5CF6'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(124,58,237,0.35)'; }}>
            Log In
          </button>

          {/* Divider */}
          <div style={S.divider}>
            <div style={S.divLine} />
            <span style={S.divText}>or</span>
            <div style={S.divLine} />
          </div>

          {/* Social: Google only */}
          <button id="wl-google" style={S.googleBtn}
            onClick={() => navigate('/login?social=google')}
            onMouseEnter={e => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.85)'; e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.06)'; }}>
            <GoogleIcon /><span style={S.googleLabel}>Continue with Google</span>
          </button>

          {/* Terms */}
          <p style={S.terms}>
            By continuing you agree to our{' '}
            <span style={S.link} onClick={() => navigate('/legal/terms')}>Terms</span>
            {' & '}
            <span style={S.link} onClick={() => navigate('/legal/privacy')}>Privacy</span>
          </p>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; }
        @keyframes wlFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-11px); }
        }
        #wl-get-started, #wl-login, #wl-google, #wl-apple {
          transition: all 0.25s cubic-bezier(0.16,1,0.3,1);
          -webkit-tap-highlight-color: transparent;
          font-family: 'Inter', -apple-system, sans-serif;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

const S = {
  root: {
    position: 'fixed', inset: 0,
    background: 'linear-gradient(155deg, #EDE9FE 0%, #F5F3FF 20%, #FAFAFA 45%, #FFF7ED 72%, #FFEDD5 100%)',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    overflow: 'hidden',
  },

  /* Background orbs */
  orbTL: {
    position: 'fixed', top: '-15%', left: '-12%',
    width: '60vw', height: '60vw', maxWidth: 480, maxHeight: 480,
    background: 'radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 65%)',
    borderRadius: '50%', pointerEvents: 'none', zIndex: 0,
  },
  orbBR: {
    position: 'fixed', bottom: '-15%', right: '-12%',
    width: '65vw', height: '65vw', maxWidth: 500, maxHeight: 500,
    background: 'radial-gradient(circle, rgba(249,115,22,0.16) 0%, transparent 65%)',
    borderRadius: '50%', pointerEvents: 'none', zIndex: 0,
  },

  /* Full-screen flex layout */
  layout: {
    position: 'relative', zIndex: 2,
    height: '100%',
    maxWidth: 440,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 0,
    padding: '0 28px',
    paddingTop: 'max(env(safe-area-inset-top), 16px)',
    paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
    transition: 'opacity 0.55s cubic-bezier(0.16,1,0.3,1), transform 0.55s cubic-bezier(0.16,1,0.3,1)',
  },

  /* Top section */
  top: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    textAlign: 'center',
    paddingTop: 36,
    paddingBottom: 28,
  },

  logoImg: {
    width: 52, height: 52, objectFit: 'contain',
    marginBottom: 12,
  },
  appName: {
    fontSize: '2.4rem', fontWeight: 900,
    letterSpacing: '-1.8px', lineHeight: 1,
    marginBottom: 24,
    background: 'linear-gradient(135deg, #111827 0%, #7C3AED 55%, #F97316 100%)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
  },
  headline: {
    fontSize: 'clamp(1.7rem, 7vw, 2.3rem)',
    fontWeight: 800, color: '#111827',
    letterSpacing: '-0.7px', lineHeight: 1.14,
    marginBottom: 12,
  },
  accent: {
    background: 'linear-gradient(90deg, #7C3AED 0%, #F97316 100%)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
  },
  sub: {
    fontSize: '0.95rem', color: '#6B7280',
    lineHeight: 1.6, fontWeight: 400,
    marginBottom: 22,
  },

  /* Feature pills */
  pillsRow: {
    display: 'flex', gap: 8,
    flexWrap: 'wrap', justifyContent: 'center',
  },
  pill: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '7px 15px', borderRadius: 100,
    background: 'rgba(255,255,255,0.85)',
    border: '1.5px solid rgba(139,92,246,0.16)',
    boxShadow: '0 2px 10px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
    backdropFilter: 'blur(8px)',
  },
  pillText: {
    fontSize: '0.76rem', fontWeight: 700,
    color: '#4B5563', letterSpacing: '0.1px',
  },

  /* Bottom actions section */
  bottom: {
    display: 'flex', flexDirection: 'column', gap: 12,
    paddingBottom: 4,
  },
  btnPrimary: {
    width: '100%', padding: '16px',
    border: 'none', borderRadius: 16,
    background: 'linear-gradient(135deg, #6D28D9 0%, #7C3AED 50%, #A855F7 100%)',
    color: 'white', fontSize: '1rem', fontWeight: 700,
    letterSpacing: '0.2px',
    boxShadow: '0 8px 28px rgba(124,58,237,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
  },
  btnOutline: {
    width: '100%', padding: '15px',
    borderRadius: 16,
    background: 'rgba(255,255,255,0.6)',
    border: '1.5px solid rgba(124,58,237,0.3)',
    color: '#7C3AED', fontSize: '0.97rem', fontWeight: 600,
    backdropFilter: 'blur(6px)',
  },
  divider: {
    display: 'flex', alignItems: 'center', gap: 12,
    marginTop: 2, marginBottom: 2,
  },
  divLine: { flex: 1, height: '1px', background: 'rgba(0,0,0,0.08)' },
  divText: {
    fontSize: '0.75rem', color: '#9CA3AF',
    fontWeight: 500, letterSpacing: '0.5px',
  },
  googleBtn: {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    padding: '14px 20px', borderRadius: 14,
    background: 'rgba(255,255,255,0.85)',
    border: '1.5px solid rgba(0,0,0,0.08)',
    boxShadow: '0 2px 10px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)',
    backdropFilter: 'blur(8px)',
  },
  googleLabel: { color: '#111827', fontSize: '0.92rem', fontWeight: 600 },
  terms: {
    fontSize: '0.7rem', color: '#9CA3AF',
    textAlign: 'center', lineHeight: 1.6, paddingTop: 2,
  },
  link: {
    color: '#7C3AED', cursor: 'pointer',
    textDecoration: 'underline', textDecorationColor: 'rgba(124,58,237,0.28)',
  },
};
