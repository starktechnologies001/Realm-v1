import React from 'react';
import { formatFileSize } from '../utils/fileUpload';
import './AttachmentPreview.css';

const AttachmentPreview = ({ files, onRemove, onSend, onCancel, uploadProgress }) => {
    if (!files || files.length === 0) return null;

    return (
        <div className="attachment-preview-overlay">
            <div className="attachment-preview-container">
                <div className="preview-header">
                    <h3>Preview Attachments</h3>
                    <button className="preview-close" onClick={onCancel}>✕</button>
                </div>

                <div className="preview-files">
                    {files.map((file, index) => (
                        <div key={index} className="preview-file-item">
                            {file.type.startsWith('image/') ? (
                                <img 
                                    src={URL.createObjectURL(file)} 
                                    alt={file.name}
                                    className="preview-image"
                                />
                            ) : (
                                <div className="preview-file-icon">
                                    {file.type.startsWith('video/') ? '🎥' : '📄'}
                                </div>
                            )}
                            
                            <div className="preview-file-info">
                                <span className="file-name">{file.name}</span>
                                <span className="file-size">{formatFileSize(file.size)}</span>
                            </div>

                            <button 
                                className="remove-file-btn" 
                                onClick={() => onRemove(index)}
                                disabled={uploadProgress !== null}
                            >
                                🗑️
                            </button>
                        </div>
                    ))}
                </div>

                {uploadProgress !== null && (
                    <div className="upload-progress">
                        <div className="progress-bar">
                            <div 
                                className="progress-fill" 
                                style={{ width: `${uploadProgress}%` }}
                            />
                        </div>
                        <span className="progress-text">{Math.round(uploadProgress)}%</span>
                    </div>
                )}

                <div className="preview-actions">
                    <button 
                        className="preview-cancel-btn" 
                        onClick={onCancel}
                        disabled={uploadProgress !== null}
                    >
                        Cancel
                    </button>
                    <button 
                        className="preview-send-btn" 
                        onClick={onSend}
                        disabled={uploadProgress !== null}
                    >
                        {uploadProgress !== null ? 'Uploading...' : `Send (${files.length})`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AttachmentPreview;
