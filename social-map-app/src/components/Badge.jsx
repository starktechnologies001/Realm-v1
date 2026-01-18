import React from 'react';

export default function Badge({ count, variant = 'primary', size = 'default' }) {
    if (!count || count === 0) return null;
    
    const displayCount = count > 99 ? '99+' : count;
    
    return (
        <span className={`notification-badge badge-${variant} badge-${size}`}>
            {displayCount}
            <style>{`
                .notification-badge {
                    position: absolute;
                    top: -6px;
                    right: -6px;
                    min-width: 20px;
                    height: 20px;
                    padding: 0 6px;
                    background: linear-gradient(135deg, #ff453a 0%, #e63946 100%);
                    color: white;
                    border-radius: 10px;
                    font-size: 0.7rem;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 2px 8px rgba(255, 69, 58, 0.4);
                    border: 2px solid var(--bg-color, #000);
                    animation: badgePop 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
                    z-index: 10;
                }

                @keyframes badgePop {
                    0% {
                        transform: scale(0);
                        opacity: 0;
                    }
                    50% {
                        transform: scale(1.2);
                    }
                    100% {
                        transform: scale(1);
                        opacity: 1;
                    }
                }

                .badge-primary {
                    background: linear-gradient(135deg, #ff453a 0%, #e63946 100%);
                }

                .badge-secondary {
                    background: linear-gradient(135deg, #00d4ff 0%, #0084ff 100%);
                    box-shadow: 0 2px 8px rgba(0, 132, 255, 0.4);
                }

                .badge-small {
                    min-width: 16px;
                    height: 16px;
                    font-size: 0.65rem;
                    padding: 0 4px;
                    top: -4px;
                    right: -4px;
                }

                .badge-large {
                    min-width: 24px;
                    height: 24px;
                    font-size: 0.75rem;
                    padding: 0 8px;
                    top: -8px;
                    right: -8px;
                }

                /* Pulse animation for new notifications */
                .notification-badge::before {
                    content: '';
                    position: absolute;
                    top: -2px;
                    left: -2px;
                    right: -2px;
                    bottom: -2px;
                    border-radius: 12px;
                    background: inherit;
                    opacity: 0;
                    animation: badgePulse 2s ease-out infinite;
                }

                @keyframes badgePulse {
                    0% {
                        transform: scale(1);
                        opacity: 0.8;
                    }
                    100% {
                        transform: scale(1.5);
                        opacity: 0;
                    }
                }
            `}</style>
        </span>
    );
}
