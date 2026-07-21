import React, { useState, useEffect } from 'react';
import { formatFileSize } from '../utils/fileUpload';
import './AttachmentPreview.css';

const AttachmentPreview = ({ files, onRemove, onSend, onCancel, uploadProgress }) => {
    const [caption, setCaption] = useState('');
    const [previewUrls, setPreviewUrls] = useState({});

    useEffect(() => {
        const urls = {};
        files.forEach((file, index) => {
            if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
                urls[index] = URL.createObjectURL(file);
            }
        });
        setPreviewUrls(urls);

        return () => {
            Object.values(urls).forEach(url => {
                try {
                    URL.revokeObjectURL(url);
                } catch (e) {
                    console.error("Error revoking URL:", e);
                }
            });
        };
    }, [files]);

    if (!files || files.length === 0) return null;

    const isMultiple = files.length > 1;

    return (
        <div className="attachment-preview-overlay fullscreen">
            <div className="preview-top-bar">
                <button className="preview-close-btn" onClick={onCancel}>✕</button>
                {isMultiple && <span className="preview-file-count">{files.length} selected</span>}
            </div>

            <div className="preview-content-area">
                <div className="preview-gallery-container">
                    {files.map((file, index) => {
                        const isImage = file.type.startsWith('image/');
                        const isVideo = file.type.startsWith('video/');
                        const previewUrl = previewUrls[index];
                        
                        return (
                            <div key={index} className={`preview-thumbnail-wrapper ${isMultiple ? 'multiple' : ''}`}>
                                {isImage && previewUrl ? (
                                    <img 
                                        src={previewUrl} 
                                        alt={`Preview ${index + 1}`}
                                        width="300"
                                        height="300"
                                        style={{ width: '100%', height: '100%', objectFit: 'contain', aspectRatio: '1/1' }}
                                    />
                                ) : isVideo && previewUrl ? (
                                    <video
                                        src={previewUrl}
                                        muted
                                        playsInline
                                        autoPlay
                                        loop
                                        style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '8px', objectFit: 'contain' }}
                                    />
                                ) : (
                                    <div className="preview-file-icon-large">
                                        📄
                                        <div className="file-name-large">{file.name}</div>
                                        <div className="file-size-large">{formatFileSize(file.size)}</div>
                                    </div>
                                )}
                                <button className="remove-file-badge" onClick={() => onRemove(index)}>
                                    ✕
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="preview-bottom-bar">
                <div className="preview-caption-input">
                    <input 
                        type="text" 
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        placeholder="Add a caption..."
                    />
                </div>

                {uploadProgress !== null && (
                    <div className="upload-progress-overlay">
                        <div className="progress-bar">
                            <div 
                                className="progress-fill" 
                                style={{ width: `${uploadProgress}%` }}
                            />
                        </div>
                        <span className="progress-text">{Math.round(uploadProgress)}%</span>
                    </div>
                )}

                <div className="preview-actions-row">
                    <button 
                        className="preview-send-btn-round" 
                        onClick={() => onSend(caption)}
                        disabled={uploadProgress !== null}
                    >
                        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AttachmentPreview;
