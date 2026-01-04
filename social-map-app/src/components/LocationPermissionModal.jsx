import React from 'react';

const LocationPermissionModal = ({ onResponse }) => {
    return (
        <div className="location-permission-modal">
            <div className="permission-card glass-panel">
                <div className="icon-container">
                    <div className="pulse-ring"></div>
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="location-icon">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                </div>
                
                <h2>Enable Location</h2>
                <p>We need your location to show you nearby friends, cool spots, and your own position on the map.</p>

                <div className="permission-actions">
                    <button className="perm-btn primary" onClick={() => onResponse('granted')}>
                        Allow While Using App
                    </button>
                    <button className="perm-btn secondary" onClick={() => onResponse('once')}>
                        Allow Once
                    </button>
                    <button className="perm-btn text-only" onClick={() => onResponse('denied')}>
                        Don't Allow
                    </button>
                </div>
            </div>

            <style>{`
                .location-permission-modal {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.6);
                    backdrop-filter: blur(8px);
                    z-index: 99999;
                    display: flex; align-items: center; justify-content: center;
                    animation: fadeIn 0.3s ease-out;
                }

                .permission-card {
                    background: rgba(30, 30, 35, 0.85);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 24px;
                    padding: 40px 30px;
                    width: 90%;
                    max-width: 360px;
                    text-align: center;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
                    color: white;
                    display: flex; flex-direction: column; align-items: center; gap: 20px;
                    animation: scaleUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                }

                .icon-container {
                    position: relative;
                    width: 80px; height: 80px;
                    display: flex; align-items: center; justify-content: center;
                    margin-bottom: 10px;
                }

                .location-icon {
                    color: #00f0ff;
                    filter: drop-shadow(0 0 10px rgba(0, 240, 255, 0.5));
                    z-index: 2;
                }

                .pulse-ring {
                    position: absolute;
                    width: 100%; height: 100%;
                    border-radius: 50%;
                    background: rgba(0, 240, 255, 0.2);
                    animation: pulse 2s infinite;
                }

                h2 {
                    margin: 0; font-size: 1.5rem; font-weight: 700;
                    background: linear-gradient(135deg, #fff, #aaa);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }

                p {
                    margin: 0; font-size: 0.95rem; color: #ccc; line-height: 1.5;
                }

                .permission-actions {
                    display: flex; flex-direction: column; gap: 12px; width: 100%; margin-top: 10px;
                }

                .perm-btn {
                    padding: 14px; border-radius: 14px; border: none; font-size: 1rem;
                    font-weight: 600; cursor: pointer; transition: transform 0.2s, background 0.2s;
                    width: 100%;
                }
                .perm-btn:active { transform: scale(0.96); }

                .perm-btn.primary {
                    background: linear-gradient(135deg, #00C6FF, #0072FF);
                    color: white;
                    box-shadow: 0 4px 15px rgba(0, 114, 255, 0.3);
                }
                .perm-btn.primary:hover {
                    box-shadow: 0 6px 20px rgba(0, 114, 255, 0.4);
                    transform: translateY(-1px);
                }

                .perm-btn.secondary {
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                    border: 1px solid rgba(255, 255, 255, 0.05);
                }
                .perm-btn.secondary:hover {
                    background: rgba(255, 255, 255, 0.15);
                }

                .perm-btn.text-only {
                    background: transparent;
                    color: #888;
                    font-size: 0.9rem;
                    padding: 10px;
                }
                .perm-btn.text-only:hover {
                    color: #fff;
                }

                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes scaleUp { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                @keyframes pulse {
                    0% { transform: scale(0.8); opacity: 0.8; }
                    100% { transform: scale(1.5); opacity: 0; }
                }
            `}</style>
        </div>
    );
};

export default LocationPermissionModal;
