import React from 'react';
import './LocationOnboarding.css';
import locationIllustration from '../assets/location_onboarding.png';

export default function LocationOnboarding({ onEnable, isDarkMode }) {
    return (
        <div className={`premium-onboarding-container ${isDarkMode ? 'dark' : 'light'}`}>
            {/* Ambient Background Gradient blobs */}
            <div className="ambient-blob top-left"></div>
            <div className="ambient-blob bottom-right"></div>
            
            <div className="premium-onboarding-content">
                
                {/* Top Section */}
                <div className="premium-onboarding-top">
                    <img src="/nearo-logo.png" alt="Nearo Logo" className="official-nearo-logo" />
                    <p className="premium-tagline">Make your map come alive.</p>
                    <p className="premium-subtagline">Discover friends, trending events, and hangouts happening around you right now.</p>
                </div>

                {/* Middle Section: Illustration */}
                <div className="premium-onboarding-middle">
                    <div className="premium-illustration-wrapper">
                        {/* Interactive dynamic glows */}
                        <div className="premium-illustration-glow base-glow"></div>
                        <div className="premium-illustration-glow accent-glow"></div>
                        
                        <img 
                            src={locationIllustration} 
                            alt="Map with avatars and pins" 
                            className="premium-floating-illustration" 
                        />
                    </div>
                </div>

                {/* Bottom Section */}
                <div className="premium-onboarding-bottom">
                    <button className="premium-action-btn" onClick={onEnable}>
                        <span className="premium-btn-text">Enable Location</span>
                        <div className="premium-btn-shine"></div>
                    </button>
                    <p className="premium-microcopy">
                        <span className="premium-lock-icon">🔒</span> Your location is never shared exactly
                    </p>
                </div>
                
            </div>
        </div>
    );
}
