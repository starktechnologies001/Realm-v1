import React from 'react';
import './LocationOnboarding.css';
import locationIllustration from '../assets/location_onboarding.png';
import nearoLogo from '../assets/logo.png';

export default function LocationOnboarding({ onEnable, isDarkMode }) {
    return (
        <div className={`premium-onboarding-container ${isDarkMode ? 'dark' : 'light'}`}>
            {/* Elegant Background Dot Grid */}
            <div className="bg-dot-grid"></div>

            {/* Ambient Background Lights */}
            <div className="ambient-glow glow-1"></div>
            <div className="ambient-glow glow-2"></div>
            <div className="ambient-glow glow-3"></div>

            <div className="premium-onboarding-content">
                
                {/* Top Section */}
                <div className="premium-onboarding-top">
                    <div className="logo-container">
                        <img src={nearoLogo} alt="Nearo Logo" className="premium-logo-image" />
                    </div>
                    <h1 className="onboarding-title">Discover people around you</h1>
                </div>

                {/* Middle Section: Floating Illustration with Floating Badges */}
                <div className="premium-onboarding-middle">
                    <div className="premium-illustration-wrapper">
                        {/* Interactive dynamic glows */}
                        <div className="premium-illustration-glow base-glow"></div>
                        <div className="premium-illustration-glow overlay-glow"></div>
                        
                        {/* Floating elements to add premium depth */}
                        <div className="floating-badge badge-chat">💬</div>
                        <div className="floating-badge badge-heart">💖</div>
                        <div className="floating-badge badge-pin">📍</div>
                        
                        <img 
                            src={locationIllustration} 
                            alt="Map with avatars and pins" 
                            className="premium-floating-illustration" 
                        />
                    </div>
                </div>

                {/* Feature Bullet Points */}
                <div className="features-container">
                    <div className="feature-card">
                        <div className="feature-badge">📍</div>
                        <div className="feature-details">
                            <h3 className="feature-headline">Real-time Connections</h3>
                            <p className="feature-description">See who is active near you and make real connections instantly.</p>
                        </div>
                    </div>
                    <div className="feature-card">
                        <div className="feature-badge">🔒</div>
                        <div className="feature-details">
                            <h3 className="feature-headline">Privacy by Design</h3>
                            <p className="feature-description">Control your presence. Toggle Ghost Mode or limit visibility anytime.</p>
                        </div>
                    </div>
                </div>

                {/* Bottom Section */}
                <div className="premium-onboarding-bottom">
                    <button className="premium-action-btn" onClick={onEnable}>
                        <span className="premium-btn-text">Enable Location</span>
                        <div className="premium-btn-shine"></div>
                    </button>
                    
                    <div className="privacy-badge">
                        <svg className="lock-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                        <span className="privacy-text">Your location is never shared exactly</span>
                    </div>
                </div>
                
            </div>
        </div>
    );
}
