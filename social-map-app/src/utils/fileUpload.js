/**
 * File Upload Utilities for Chat Attachments
 * Handles validation, compression, and upload to Supabase Storage
 */

import { supabase } from '../supabaseClient';

// File size limits (in bytes)
const MAX_IMAGE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024; // 50MB

// Allowed file types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
const ALLOWED_DOCUMENT_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/x-zip-compressed',
    'text/plain'
];

/**
 * Determine file type category
 */
export const getFileCategory = (mimeType) => {
    if (ALLOWED_IMAGE_TYPES.includes(mimeType)) return 'image';
    if (ALLOWED_VIDEO_TYPES.includes(mimeType)) return 'video';
    if (ALLOWED_DOCUMENT_TYPES.includes(mimeType)) return 'document';
    return null;
};

/**
 * Validate file before upload
 */
export const validateFile = (file) => {
    const category = getFileCategory(file.type);
    
    if (!category) {
        return {
            valid: false,
            error: `File type ${file.type} is not supported`
        };
    }

    let maxSize;
    switch (category) {
        case 'image':
            maxSize = MAX_IMAGE_SIZE;
            break;
        case 'video':
            maxSize = MAX_VIDEO_SIZE;
            break;
        case 'document':
            maxSize = MAX_DOCUMENT_SIZE;
            break;
        default:
            maxSize = MAX_DOCUMENT_SIZE;
    }

    if (file.size > maxSize) {
        return {
            valid: false,
            error: `File size exceeds ${maxSize / (1024 * 1024)}MB limit`
        };
    }

    return { valid: true, category };
};

/**
 * Compress image before upload
 */
export const compressImage = async (file, maxWidth = 1920, quality = 0.8) => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Resize if needed
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        resolve(new File([blob], file.name, { type: 'image/jpeg' }));
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
};

/**
 * Upload file to Supabase Storage
 */
export const uploadToStorage = async (file, userId, onProgress) => {
    try {
        const validation = validateFile(file);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        // Compress images before upload
        let fileToUpload = file;
        if (validation.category === 'image' && file.size > 1024 * 1024) {
            // Only compress if > 1MB
            fileToUpload = await compressImage(file);
        }

        // Generate unique filename
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(7);
        const extension = file.name.split('.').pop();
        const fileName = `${timestamp}_${randomStr}.${extension}`;
        const filePath = `${userId}/${fileName}`;

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
            .from('chat-attachments')
            .upload(filePath, fileToUpload, {
                cacheControl: '3600',
                upsert: false,
                onUploadProgress: (progress) => {
                    if (onProgress) {
                        const percentage = (progress.loaded / progress.total) * 100;
                        onProgress(percentage);
                    }
                }
            });

        if (error) throw error;

        // Get public URL
        const { data: urlData } = supabase.storage
            .from('chat-attachments')
            .getPublicUrl(filePath);

        return {
            success: true,
            fileUrl: urlData.publicUrl,
            fileName: file.name,
            fileType: validation.category,
            fileSize: fileToUpload.size,
            mimeType: fileToUpload.type
        };
    } catch (error) {
        console.error('Upload error:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Generate thumbnail for video (using canvas)
 */
export const generateVideoThumbnail = (file) => {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
            video.currentTime = 1; // Seek to 1 second
        };
        video.onseeked = () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/jpeg', 0.7);
        };
        video.src = URL.createObjectURL(file);
    });
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};
