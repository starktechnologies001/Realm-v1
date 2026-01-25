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
                        <div className="option-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                        </div>
                        <span>Camera</span>
                    </button>

                    <button className="attachment-option gallery" onClick={onSelectGallery}>
                        <div className="option-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        </div>
                        <span>Gallery</span>
                    </button>

                    <button className="attachment-option document" onClick={onSelectDocument}>
                        <div className="option-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                        </div>
                        <span>Document</span>
                    </button>
                </div>
            </div>
        </>
    );
};

export default AttachmentPicker;
