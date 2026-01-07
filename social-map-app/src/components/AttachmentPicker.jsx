import React from 'react';
import './AttachmentPicker.css';

const AttachmentPicker = ({ isOpen, onClose, onSelectCamera, onSelectGallery, onSelectDocument }) => {
    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div className="attachment-backdrop" onClick={onClose} />
            
            {/* Bottom Sheet */}
            <div className="attachment-picker">
                <div className="attachment-header">
                    <h3>Send Attachment</h3>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="attachment-options">
                    <button className="attachment-option camera" onClick={onSelectCamera}>
                        <div className="option-icon">📷</div>
                        <span>Camera</span>
                    </button>

                    <button className="attachment-option gallery" onClick={onSelectGallery}>
                        <div className="option-icon">🖼️</div>
                        <span>Gallery</span>
                    </button>

                    <button className="attachment-option document" onClick={onSelectDocument}>
                        <div className="option-icon">📄</div>
                        <span>Document</span>
                    </button>
                </div>
            </div>
        </>
    );
};

export default AttachmentPicker;
