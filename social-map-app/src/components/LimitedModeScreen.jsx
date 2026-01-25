import React from 'react';
import { motion } from 'framer-motion';

export default function LimitedModeScreen({ onEnableLocation }) {
    return (
        <div className="limited-mode-container">
            <motion.div 
                className="limited-content"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <div className="ghost-icon-wrapper">
                    <span className="ghost-icon">👻</span>
                    <div className="pulse-ring"></div>
                </div>
                
                <h2>Ghost Mode Active</h2>
                <p>
                    We can't show the map without your location. 
                    <br />
                    But don't worry! You can still chat with friends and update your profile.
                </p>

                <button onClick={onEnableLocation} className="enable-btn">
                    📍 Enable Location
                </button>
            </motion.div>

            <style>{`
                .limited-mode-container {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    width: 100%;
                    background: linear-gradient(135deg, #1c1c1e 0%, #2c2c2e 100%);
                    color: white;
                    text-align: center;
                    padding: 20px;
                }

                .limited-content {
                    max-width: 320px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 20px;
                }

                .ghost-icon-wrapper {
                    position: relative;
                    width: 100px;
                    height: 100px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 50%;
                    margin-bottom: 10px;
                }

                .ghost-icon {
                    font-size: 48px;
                    z-index: 2;
                }

                .pulse-ring {
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    border: 2px solid rgba(255, 255, 255, 0.1);
                    animation: pulse-ring 3s infinite;
                }

                @keyframes pulse-ring {
                    0% { transform: scale(0.8); opacity: 0.5; }
                    50% { transform: scale(1.2); opacity: 0; }
                    100% { transform: scale(0.8); opacity: 0; }
                }

                h2 {
                    margin: 0;
                    font-size: 24px;
                    font-weight: 700;
                    background: linear-gradient(90deg, #fff, #bbb);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }

                p {
                    margin: 0;
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 15px;
                    line-height: 1.5;
                }

                .enable-btn {
                    margin-top: 10px;
                    padding: 12px 24px;
                    background: #0A84FF;
                    color: white;
                    border: none;
                    border-radius: 20px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: transform 0.2s, background 0.2s;
                    box-shadow: 0 4px 12px rgba(10, 132, 255, 0.3);
                }

                .enable-btn:active {
                    transform: scale(0.95);
                    background: #0070e0;
                }
            `}</style>
        </div>
    );
}
