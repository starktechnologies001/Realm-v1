import React from 'react';

export default function LocationPermissionModal({ onAllow, onDeny }) {
    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
        }}>
            <div style={{
                width: '85%',
                maxWidth: '320px',
                backgroundColor: '#1c1c1e',
                borderRadius: '20px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
                {/* Map Pin Icon Circle */}
                <div style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(66, 133, 244, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '16px',
                    border: '1px solid rgba(66, 133, 244, 0.3)'
                }}>
                    <span style={{ fontSize: '30px' }}>📍</span>
                </div>

                <h2 style={{
                    color: 'white',
                    fontSize: '1.25rem',
                    fontWeight: '600',
                    margin: '0 0 8px 0',
                    textAlign: 'center'
                }}>
                    Enable Location
                </h2>

                <p style={{
                    color: '#9CA3AF',
                    fontSize: '0.9rem',
                    textAlign: 'center',
                    margin: '0 0 24px 0',
                    lineHeight: '1.5'
                }}>
                    Allow <strong>Nearo</strong> to access your location to show you on the map and find friends nearby.
                </p>

                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%',
                    gap: '12px'
                }}>
                    <button
                        onClick={() => onAllow(true)}
                        style={{
                            width: '100%',
                            padding: '14px',
                            backgroundColor: '#007AFF', // System Blue
                            color: 'white',
                            border: 'none',
                            borderRadius: '12px',
                            fontSize: '1rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >
                        Allow While Using App
                    </button>

                    <button
                        onClick={() => onAllow(false)} 
                        style={{
                            width: '100%',
                            padding: '14px',
                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '12px',
                            fontSize: '1rem',
                            fontWeight: '600',
                            cursor: 'pointer'
                        }}
                    >
                        Allow This Time
                    </button>

                    <button
                        onClick={onDeny}
                        style={{
                            width: '100%',
                            padding: '12px',
                            backgroundColor: 'transparent',
                            color: '#FF3B30', // System Red
                            border: 'none',
                            fontSize: '1rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            marginTop: '4px'
                        }}
                    >
                        Don't Allow
                    </button>
                </div>
            </div>
        </div>
    );
}
