import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
const nearoLogo = '/logo.webp';

const PINS = [
  { x: 8,  y: 15, s: 38, d: 0,    c: '#8B5CF6', emoji: '🙋‍♀️' },
  { x: 82, y: 12, s: 34, d: 0.7,  c: '#F97316', emoji: '🧑‍🚀' },
  { x: 91, y: 42, s: 30, d: 1.2,  c: '#6366F1', emoji: '👱‍♂️' },
  { x: 4,  y: 54, s: 32, d: 0.4,  c: '#EC4899', emoji: '👩‍🦰' },
  { x: 87, y: 68, s: 28, d: 1.0,  c: '#8B5CF6', emoji: '👋' },
  { x: 12, y: 78, s: 26, d: 1.5,  c: '#F97316', emoji: '🧑' },
  { x: 46, y: 8,  s: 26, d: 0.8,  c: '#6366F1', emoji: '✨' },
];

const FEATURES = [
  { icon: '📍', label: 'Nearby People'  },
  { icon: '💬', label: 'Instant Chat'   },
  { icon: '🔒', label: 'Safe & Private' },
];

function Pin({ x, y, s, d, c, emoji }) {
  return (
    <div className="welcome-pin-container" style={{
      left: `${x}%`, top: `${y}%`,
      animationDelay: `${d}s`,
      animationDuration: `${4 + d * 0.5}s`,
    }}>
      <div className="welcome-pin-balloon" style={{
        width: s, height: s,
        background: `linear-gradient(135deg, ${c}, ${c}dd)`,
        boxShadow: `0 8px 20px ${c}44, inset 0 2px 4px rgba(255,255,255,0.4)`,
        fontSize: `${s * 0.5}px`,
      }}>
        {emoji}
        <div className="welcome-pin-tail" style={{ borderTopColor: c }} />
      </div>
      <div className="welcome-pin-shadow" style={{
        width: s * 0.7,
        animationDelay: `${d}s`,
        animationDuration: `${4 + d * 0.5}s`,
      }} />
    </div>
  );
}

function MapAvatar({ top, left, right, bottom, color, imgUrl }) {
  return (
    <div style={{
      position: 'absolute',
      top, left, right, bottom,
      transform: left === '50%' ? 'translateX(-50%)' : 'none',
      width: 32, height: 32,
      borderRadius: '50%',
      border: '2px solid #ffffff',
      boxShadow: `0 0 0 2px ${color}, 0 4px 10px rgba(0,0,0,0.15)`,
      zIndex: 6,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: color
    }}>
      <img src={imgUrl} alt="avatar" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
      <div style={{
        position: 'absolute',
        bottom: '-3px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 0,
        height: 0,
        borderLeft: '4.5px solid transparent',
        borderRight: '4.5px solid transparent',
        borderTop: '5.5px solid currentColor'
      }} />
    </div>
  );
}

function MiniPin({ top, left, right, bottom, color }) {
  return (
    <div style={{
      position: 'absolute',
      top, left, right, bottom,
      zIndex: 3,
      opacity: 0.5,
      transform: 'scale(0.8)',
      filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
    }}>
      <svg width="14" height="19" viewBox="0 0 24 32">
        <path d="M12 0C6.48 0 2 4.48 2 10c0 7.5 10 21 10 21S22 17.5 22 10C22 4.48 17.52 0 12 0z" fill={color} />
        <circle cx="12" cy="10" r="4" fill="white" />
      </svg>
    </div>
  );
}

function Lines() {
  return (
    <svg style={{ position:'fixed', inset:0, width:'100%', height:'100%', zIndex:1, pointerEvents:'none' }} preserveAspectRatio="none">
      {[
        { x1:'11%', y1:'15%', x2:'84%', y2:'12%', c:'rgba(139,92,246,0.15)', dur:'5s'  },
        { x1:'84%', y1:'12%', x2:'93%', y2:'43%', c:'rgba(249,115,22,0.12)',  dur:'6s'  },
        { x1:'6%',  y1:'55%', x2:'89%', y2:'68%', c:'rgba(99,102,241,0.12)', dur:'7s'  },
      ].map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke={l.c} strokeWidth="1.5" strokeDasharray="5 8">
          <animate attributeName="strokeDashoffset" from="0" to="-100" dur={l.dur} repeatCount="indefinite" />
        </line>
      ))}
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
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
    <div className="welcome-root">
      {/* Moving Ambient Glow Orbs */}
      <div className="ambient-glow orb-1" />
      <div className="ambient-glow orb-2" />
      <div className="ambient-glow orb-3" />

      {/* Floating background pins and connection lines */}
      {PINS.map((p, i) => <Pin key={i} {...p} />)}
      <Lines />

      {/* Main glass card container */}
      <div className={`welcome-layout ${ready ? 'ready' : ''}`}>
        
        {/* ── TOP: Logo & headline ── */}
        <div className="welcome-top">
          {/* Circular Map Layout with Small Avatars as in the User's Image */}
          <div className="circular-map-container">
            <div className="circular-map-circle" />
            
            {/* Ambient logo glow */}
            <div className="welcome-logo-glow" />
            
            {/* Center Logo */}
            <div className="circular-map-logo">
              <img src={nearoLogo} alt="Nearo" width="60" height="60" fetchpriority="high" decoding="sync" className="welcome-logo-img" />
            </div>
            
            {/* Surrounding Map Avatars with colored borders */}
            <MapAvatar top="0px" left="50%" color="#A855F7" imgUrl="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100" />
            <MapAvatar top="32%" right="-8px" color="#F97316" imgUrl="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100" />
            <MapAvatar bottom="0px" right="20%" color="#22C55E" imgUrl="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100" />
            <MapAvatar bottom="0px" left="20%" color="#3B82F6" imgUrl="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100" />
            <MapAvatar top="32%" left="-8px" color="#EF4444" imgUrl="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100" />
            
            {/* Mini Pins inside the circle illustration */}
            <MiniPin top="20%" right="25%" color="#A855F7" />
            <MiniPin top="45%" left="22%" color="#3B82F6" />
            <MiniPin bottom="25%" right="40%" color="#22C55E" />
          </div>
          
          <h1 className="welcome-app-name">Nearo</h1>
          
          <h2 className="welcome-headline">
            Discover People<br />
            <span className="welcome-accent">Around You</span>
          </h2>
          
          <p className="welcome-sub">Meet people nearby in a safe and fun way</p>

          {/* Feature pills */}
          <div className="welcome-pills-row">
            {FEATURES.map(f => (
              <div key={f.label} className="welcome-pill">
                <span className="welcome-pill-icon">{f.icon}</span>
                <span className="welcome-pill-text">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── BOTTOM: Actions ── */}
        <div className="welcome-bottom">
          {/* Primary CTA */}
          <button id="wl-get-started" className="welcome-btn-primary" onClick={() => navigate('/signup')}>
            Get Started →
          </button>

          {/* Outline Login */}
          <button id="wl-login" className="welcome-btn-outline" onClick={() => navigate('/login')}>
            Log In
          </button>

          {/* Divider */}
          <div className="welcome-divider">
            <div className="welcome-div-line" />
            <span className="welcome-div-text">or</span>
            <div className="welcome-div-line" />
          </div>

          {/* Social: Google */}
          <button id="wl-google" className="welcome-google-btn" onClick={() => navigate('/login?social=google')}>
            <GoogleIcon />
            <span className="welcome-google-label">Continue with Google</span>
          </button>

          {/* Terms and Privacy Policy links */}
          <p className="welcome-terms">
            By continuing you agree to our{' '}
            <span className="welcome-link" onClick={() => navigate('/legal/terms')}>Terms</span>
            {' & '}
            <span className="welcome-link" onClick={() => navigate('/legal/privacy')}>Privacy</span>
          </p>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@600;700;800;900&display=swap');
        
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        
        .welcome-root {
          position: fixed; inset: 0;
          background: linear-gradient(155deg, #F0E6FF 0%, #F5F3FF 25%, #FAFAFA 50%, #FFF5E6 75%, #FFEAD2 100%);
          font-family: "Outfit", "Inter", -apple-system, sans-serif;
          overflow: hidden;
          width: 100vw;
          height: 100vh;
        }

        /* Dynamic Animated Ambient Glow Orbs */
        .ambient-glow {
          position: fixed;
          border-radius: 50%;
          filter: blur(100px);
          pointer-events: none;
          z-index: 0;
          opacity: 0.65;
        }
        .orb-1 {
          top: -15%; left: -10%;
          width: 55vw; height: 55vw;
          background: radial-gradient(circle, rgba(139,92,246,0.3) 0%, rgba(99,102,241,0.05) 70%, transparent 100%);
          animation: orbMove1 24s ease-in-out infinite alternate;
        }
        .orb-2 {
          bottom: -15%; right: -10%;
          width: 60vw; height: 60vw;
          background: radial-gradient(circle, rgba(249,115,22,0.25) 0%, rgba(236,72,153,0.05) 70%, transparent 100%);
          animation: orbMove2 28s ease-in-out infinite alternate;
        }
        .orb-3 {
          top: 35%; right: 15%;
          width: 45vw; height: 45vw;
          background: radial-gradient(circle, rgba(99,102,241,0.2) 0%, rgba(139,92,246,0.03) 70%, transparent 100%);
          animation: orbMove3 20s ease-in-out infinite alternate;
        }
        
        @keyframes orbMove1 {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(12%, 10%) scale(1.15); }
        }
        @keyframes orbMove2 {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(-10%, -12%) scale(0.9); }
        }
        @keyframes orbMove3 {
          0% { transform: translate(0, 0) scale(1); }
          100% { transform: translate(-8%, 15%) scale(1.1); }
        }

        /* Floating Pin Elements */
        .welcome-pin-container {
          position: fixed;
          pointer-events: none;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          animation: wlFloat 4s ease-in-out infinite;
        }
        
        .welcome-pin-balloon {
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid #ffffff;
          position: relative;
          z-index: 2;
        }
        
        .welcome-pin-tail {
          position: absolute;
          bottom: -3px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 6px solid #6366F1;
        }
        
        .welcome-pin-shadow {
          height: 5px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.08);
          margin-top: 8px;
          animation: wlShadow 4s ease-in-out infinite;
          filter: blur(1.5px);
          z-index: 1;
        }
        
        @keyframes wlFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-15px); }
        }
        @keyframes wlShadow {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50%       { transform: scale(0.65); opacity: 0.25; }
        }

        /* Glassmorphic Container Layout */
        .welcome-layout {
          position: relative;
          z-index: 10;
          height: 100%;
          max-width: 440px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          justify-content: center; /* Center-aligns top and bottom closer to reduce the gap */
          gap: 20px; /* Reduced controlled gap between logo-feature section and action buttons */
          padding: 30px 28px;
          padding-top: max(env(safe-area-inset-top), 24px);
          padding-bottom: max(env(safe-area-inset-bottom), 24px);
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }
        
        .welcome-layout.ready {
          opacity: 1;
          transform: translateY(0);
        }

        /* Top Section */
        .welcome-top {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        /* Circular Map Illustration Styles */
        .circular-map-container {
          position: relative;
          width: 190px;
          height: 190px;
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 5;
        }

        .circular-map-circle {
          position: absolute;
          width: 146px;
          height: 146px;
          border: 1.5px dashed rgba(124, 58, 237, 0.25);
          border-radius: 50%;
          animation: spinCircle 60s linear infinite;
        }
        
        @keyframes spinCircle {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .circular-map-logo {
          position: relative;
          z-index: 5;
          width: 80px;
          height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .welcome-logo-glow {
          position: absolute;
          width: 95px;
          height: 95px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(124,58,237,0.3) 0%, rgba(249,115,22,0.1) 70%, transparent 100%);
          filter: blur(10px);
          animation: logoGlowPulse 4s ease-in-out infinite alternate;
        }
        
        @keyframes logoGlowPulse {
          0% { transform: scale(0.9); opacity: 0.7; }
          100% { transform: scale(1.15); opacity: 1; }
        }

        .welcome-logo-img {
          position: relative;
          z-index: 2;
          object-fit: contain;
        }

        .welcome-app-name {
          font-family: 'Outfit', sans-serif;
          font-size: 3.5rem;
          font-weight: 700;
          letter-spacing: -0.5px;
          line-height: 1.1;
          margin-bottom: 20px;
          padding: 2px 8px;
          background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 40%, #EC4899 80%, #F97316 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .welcome-headline {
          font-family: 'Outfit', sans-serif;
          font-size: clamp(2.4rem, 9vw, 3.1rem);
          font-weight: 800;
          color: #0F172A;
          letter-spacing: -0.8px;
          line-height: 1.1;
          margin-bottom: 12px;
        }

        .welcome-accent {
          background: linear-gradient(90deg, #7C3AED 0%, #EC4899 50%, #F97316 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .welcome-sub {
          font-family: 'Inter', sans-serif;
          font-size: 1rem;
          color: #64748B;
          line-height: 1.5;
          font-weight: 500;
          margin-bottom: 24px;
          max-width: 320px;
        }

        /* Feature Pills */
        .welcome-pills-row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .welcome-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 100px;
          background: rgba(255, 255, 255, 0.65);
          border: 1px solid rgba(255, 255, 255, 0.6);
          box-shadow: 0 4px 14px rgba(124, 58, 237, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .welcome-pill:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 18px rgba(124, 58, 237, 0.08);
        }

        .welcome-pill-icon {
          font-size: 0.9rem;
        }

        .welcome-pill-text {
          font-family: 'Inter', sans-serif;
          font-size: 0.8rem;
          font-weight: 700;
          color: #334155;
          letter-spacing: 0.1px;
        }

        /* Bottom Section Actions */
        .welcome-bottom {
          display: flex;
          flex-direction: column;
          gap: 14px;
          width: 100%;
        }

        .welcome-btn-primary {
          width: 100%;
          padding: 16px;
          border: none;
          border-radius: 16px;
          background: linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%);
          color: white;
          font-family: 'Outfit', sans-serif;
          font-size: 1.05rem;
          font-weight: 600; /* Matching weight with login */
          letter-spacing: 0.2px;
          box-shadow: 0 8px 24px rgba(124, 58, 237, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.2);
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          -webkit-tap-highlight-color: transparent;
          position: relative;
          overflow: hidden;
        }
        
        .welcome-btn-primary::after {
          content: '';
          position: absolute;
          top: 0; left: -50%;
          width: 25%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.25), transparent);
          transform: skewX(-25deg);
          transition: 0.75s;
        }
        
        .welcome-btn-primary:hover::after {
          left: 125%;
        }

        .welcome-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 30px rgba(124, 58, 237, 0.38);
        }
        
        .welcome-btn-primary:active {
          transform: translateY(1px);
        }

        .welcome-btn-outline {
          width: 100%;
          padding: 15px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.6);
          border: 1.5px solid rgba(124, 58, 237, 0.2);
          color: #6D28D9;
          font-family: 'Outfit', sans-serif;
          font-size: 1.05rem;
          font-weight: 600; /* Matching weight */
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          -webkit-tap-highlight-color: transparent;
        }

        .welcome-btn-outline:hover {
          background: rgba(124, 58, 237, 0.05);
          border-color: rgba(124, 58, 237, 0.45);
          transform: translateY(-2px);
        }
        
        .welcome-btn-outline:active {
          transform: translateY(1px);
        }

        /* Divider */
        .welcome-divider {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-top: 4px;
          margin-bottom: 4px;
        }

        .welcome-div-line {
          flex: 1;
          height: 1px;
          background: rgba(148, 163, 184, 0.18);
        }

        .welcome-div-text {
          font-family: 'Inter', sans-serif;
          font-size: 0.8rem;
          color: #94A3B8;
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        /* Google Button */
        .welcome-google-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 15px 20px;
          border-radius: 16px;
          background: #ffffff;
          border: 1.5px solid #E2E8F0;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.9);
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          -webkit-tap-highlight-color: transparent;
        }

        .welcome-google-btn:hover {
          background: #f8fafc;
          border-color: #CBD5E1;
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.05);
        }
        
        .welcome-google-btn:active {
          transform: translateY(1px);
        }

        .welcome-google-label {
          color: #334155;
          font-family: 'Inter', sans-serif;
          font-size: 0.95rem;
          font-weight: 600;
        }

        /* Terms & Privacy links */
        .welcome-terms {
          font-family: 'Inter', sans-serif;
          font-size: 0.75rem;
          color: #94A3B8;
          text-align: center;
          line-height: 1.5;
          margin-top: 8px;
        }

        .welcome-link {
          color: #7C3AED;
          cursor: pointer;
          font-weight: 600;
          text-decoration: underline;
          text-decoration-color: rgba(124, 58, 237, 0.25);
          transition: color 0.2s;
        }
        
        .welcome-link:hover {
          color: #4F46E5;
          text-decoration-color: rgba(79, 70, 229, 0.5);
        }
      `}</style>
    </div>
  );
}
