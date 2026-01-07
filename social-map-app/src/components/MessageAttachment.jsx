import React, { useState } from 'react';
import { formatFileSize } from '../utils/fileUpload';
import './MessageAttachment.css';

const MessageAttachment = ({ attachment }) => {
    const [lightboxOpen, setLightboxOpen] = useState(false);

    const handleDownload = () => {
        window.open(attachment.file_url, '_blank');
    };

    if (attachment.file_type === 'image') {
        return (
            <>
                <div className="message-attachment image-attachment" onClick={() => setLightboxOpen(true)}>
                    <img src={attachment.file_url} alt={attachment.file_name} />
                </div>

                {lightboxOpen && (
                    <div className="lightbox-overlay" onClick={() => setLightboxOpen(false)}>
                        <div className="lightbox-content">
                            <button className="lightbox-close" onClick={() => setLightboxOpen(false)}>✕</button>
                            <img src={attachment.file_url} alt={attachment.file_name} />
                            <div className="lightbox-info">
                                <span>{attachment.file_name}</span>
                                <button className="lightbox-download" onClick={handleDownload}>
                                    Download
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </>
        );
    }

    if (attachment.file_type === 'video') {
        return (
            <div className="message-attachment video-attachment">
                <video controls>
                    <source src={attachment.file_url} type={attachment.mime_type} />
                    Your browser does not support the video tag.
                </video>
            </div>
        );
    }

    // Document attachment
    return (
        <div className="message-attachment document-attachment" onClick={handleDownload}>
            <div className="document-icon">📄</div>
            <div className="document-info">
                <span className="document-name">{attachment.file_name}</span>
                <span className="document-size">{formatFileSize(attachment.file_size)}</span>
            </div>
            <button className="document-download">⬇️</button>
        </div>
    );
};

export default MessageAttachment;
