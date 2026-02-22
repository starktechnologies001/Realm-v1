import React, { useState } from 'react';
import { formatFileSize } from '../utils/fileUpload';
import './AttachmentPreview.css';

const AttachmentPreview = ({ files, onRemove, onSend, onCancel, uploadProgress }) => {
    const [caption, setCaption] = useState('');

    if (!files || files.length === 0) return null;

    // We assume the first file is the one driving the preview for now.
    const file = files[0];
    const isImage = file.type.startsWith('image/');
    const previewUrl = isImage ? URL.createObjectURL(file) : null;

    return (
        <div className="attachment-preview-overlay fullscreen">
            <div className="preview-top-bar">
                <button className="preview-close-btn" onClick={onCancel}>✕</button>
            </div>

            <div className="preview-content-area">
                {isImage ? (
                    <img 
                        src={previewUrl} 
                        alt="Preview"
                        className="fullscreen-image-preview"
                    />
                ) : (
                    <div className="preview-file-icon-large">
                        {file.type.startsWith('video/') ? '🎥' : '📄'}
                        <div className="file-name-large">{file.name}</div>
                        <div className="file-size-large">{formatFileSize(file.size)}</div>
                    </div>
                )}
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
