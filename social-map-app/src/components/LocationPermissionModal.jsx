import React from 'react';
import { motion } from 'framer-motion';

export default function LocationPermissionModal({ onSelect }) {
    return (
        <div className="location-modal-overlay">
            <motion.div 
                className="location-modal-card"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
            >
                <div className="permission-header">
                    <div className="permission-icon-wrapper">
                        <span className="permission-icon">📍</span>
                        <div className="permission-pulse"></div>
                    </div>
                    <h3>Enable Location</h3>
                </div>
                
                <p className="permission-desc">
                    Allow <strong>Realm</strong> to access your location to show you on the map and find friends nearby.
                </p>
                
                <div className="permission-actions">
                    <button onClick={() => onSelect('while-using')} className="perm-btn primary">
                        Allow While Using App
                    </button>
                    <button onClick={() => onSelect('once')} className="perm-btn secondary">
                        Allow This Time
                    </button>
                    <button onClick={() => onSelect('deny')} className="perm-btn danger">
                        Don't Allow
                    </button>
                </div>
            </motion.div>

            <style>{`
                .location-modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.75);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    z-index: 9999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }

                .location-modal-card {
                    background: rgba(28, 28, 30, 0.95);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 24px;
                    padding: 32px 24px;
                    width: 100%;
                    max-width: 340px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.5);
                }

                .permission-header {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 16px;
                    margin-bottom: 16px;
                }

                .permission-icon-wrapper {
                    width: 64px;
                    height: 64px;
                    background: rgba(10, 132, 255, 0.2);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                }

                .permission-icon {
                    font-size: 32px;
                }

                .permission-pulse {
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    background: inherit;
                    border-radius: 50%;
                    animation: perm-pulse 2s infinite;
                    z-index: -1;
                }

                @keyframes perm-pulse {
                    0% { transform: scale(1); opacity: 0.8; }
                    100% { transform: scale(1.6); opacity: 0; }
                }

                h3 {
                    margin: 0;
                    color: white;
                    font-size: 20px;
                    font-weight: 600;
                }

                .permission-desc {
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 15px;
                    line-height: 1.5;
                    margin: 0 0 32px 0;
                }

                .permission-actions {
                    display: flex;
                    flex-direction: column;
                    width: 100%;
                    gap: 12px;
                }

                .perm-btn {
                    padding: 14px;
                    border-radius: 14px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: transform 0.2s, opacity 0.2s;
                    border: none;
                    outline: none;
                }

                .perm-btn:active {
                    transform: scale(0.98);
                }

                .perm-btn.primary {
                    background: #0A84FF;
                    color: white;
                }

                .perm-btn.secondary {
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                }

                .perm-btn.danger {
                    background: transparent;
                    color: #FF453A;
                }

                .perm-btn.danger:hover {
                    background: rgba(255, 69, 58, 0.1);
                }
            `}</style>
        </div>
    );
}
