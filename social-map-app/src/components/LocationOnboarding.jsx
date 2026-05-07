import React from 'react';
import './LocationOnboarding.css';
import locationIllustration from '../assets/location_onboarding.png';

import nearoLogo from '../assets/logo.png';

export default function LocationOnboarding({ onEnable, isDarkMode }) {
    return (
        <div className={`premium-onboarding-container ${isDarkMode ? 'dark' : 'light'}`}>
            <div className="premium-onboarding-content">
                
                {/* Top Section */}
                <div className="premium-onboarding-top">
                    <img src={nearoLogo} alt="Nearo Logo" className="premium-logo-image" />
                    <h1 className="premium-logo-text">Nearo</h1>
                    <p className="premium-tagline">Meet people nearby</p>
                </div>

                {/* Middle Section: Illustration */}
                <div className="premium-onboarding-middle">
                    <div className="premium-illustration-wrapper">
                        {/* Interactive dynamic glows */}
                        <div className="premium-illustration-glow base-glow"></div>
                        
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
                        We use your location to show nearby people
                    </p>
                </div>
                
            </div>
        </div>
    );
}
