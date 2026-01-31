import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import getCroppedImg from '../utils/cropUtils';

const ImageCropper = ({ imageSrc, onCropComplete, onCancel, zIndex = 1000 }) => {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
    const [loading, setLoading] = useState(false);

    const onCropChange = (crop) => {
        setCrop(crop);
    };

    const onZoomChange = (zoom) => {
        setZoom(zoom);
    };

    const onCropCompleteHandler = useCallback((croppedArea, croppedAreaPixels) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const handleSave = async () => {
        if (!croppedAreaPixels) return;
        setLoading(true);
        try {
            const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels);
            onCropComplete(croppedImage);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: zIndex,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
        }}>
            {/* Modal Card */}
            <div style={{
                position: 'relative',
                width: '100%',
                maxWidth: '480px', /* Increased width */
                background: '#1c1c1e', /* Dark iOS-like background */
                borderRadius: '24px',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                display: 'flex',
                flexDirection: 'column',
                animation: 'scaleIn 0.2s ease-out'
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    textAlign: 'center',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    color: 'white',
                    fontWeight: '600',
                    fontSize: '16px'
                }}>
                    Adjust Photo
                </div>

                {/* Cropper Area - Fixed Shorter Height */}
                <div style={{
                    position: 'relative',
                    width: '100%',
                    height: '400px', /* Increased height */
                    background: '#000'
                }}>
                    <Cropper
                        image={imageSrc}
                        crop={crop}
                        zoom={zoom}
                        aspect={1}
                        onCropChange={onCropChange}
                        onCropComplete={onCropCompleteHandler}
                        onZoomChange={onZoomChange}
                        cropShape="round" 
                        showGrid={false}
                    />
                </div>

                {/* Controls Area */}
                <div style={{
                    padding: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '24px'
                }}>
                    {/* Slider */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: '#8e8e93' }}>
                        <span style={{ fontSize: '18px' }}>－</span>
                        <input
                            type="range"
                            value={zoom}
                            min={1}
                            max={3}
                            step={0.1}
                            aria-labelledby="Zoom"
                            onChange={(e) => setZoom(e.target.value)}
                            style={{ 
                                flex: 1, 
                                accentColor: '#34C759', 
                                height: '4px',
                                background: 'rgba(255,255,255,0.2)',
                                borderRadius: '2px',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        />
                         <span style={{ fontSize: '18px' }}>＋</span>
                    </div>

                    {/* Buttons */}
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            onClick={onCancel}
                            style={{
                                flex: 1,
                                padding: '14px',
                                borderRadius: '16px',
                                border: 'none',
                                background: 'rgba(255,255,255,0.1)',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '15px',
                                fontWeight: '600',
                                transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={loading}
                            style={{
                                flex: 1,
                                padding: '14px',
                                borderRadius: '16px',
                                border: 'none',
                                background: '#34C759',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '15px',
                                fontWeight: '600',
                                opacity: loading ? 0.7 : 1,
                                transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => !loading && (e.currentTarget.style.background = '#32D74B')}
                            onMouseLeave={(e) => !loading && (e.currentTarget.style.background = '#34C759')}
                        >
                            {loading ? 'Processing...' : 'Apply'}
                        </button>
                    </div>
                </div>
            </div>
            
            <style>{`
                @keyframes scaleIn {
                    from { transform: scale(0.95); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default ImageCropper;
